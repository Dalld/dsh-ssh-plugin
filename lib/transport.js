/**
 * 传输层选择与能力探测（A 项的核心）。
 *
 * 语义：
 *  - transport: 'ssh2'（默认，主通道）| 'openssh' | 'auto'
 *  - auto / ssh2 在 ssh2 模块不可用时自动降级到 OpenSSH；两个都不可用则明确报错。
 *  - 主机密钥（TOFU）只走一份 <dataDir>/known_hosts，两个后端共用。
 */
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fingerprintOfBase64, fingerprintOfKeyBuffer, parseKnownHosts, hostField, HostKeyStore } from './hostkey.js'
import { Ssh2Transport, ssh2Available, loadSsh2 } from './transport-ssh2.js'
import { OpenSshTransport } from './transport-openssh.js'
import { runBinary } from './shell.js'

const require = createRequire(import.meta.url)
let ssh2Version

function ssh2PackageVersion() {
  if (ssh2Version !== undefined) return ssh2Version
  try {
    ssh2Version = JSON.parse(readFileSync(require.resolve('ssh2/package.json'), 'utf8')).version
  } catch {
    ssh2Version = undefined
  }
  return ssh2Version
}

export function createTransportLayer({ getHost, listHosts, getSettings, resolveSecret, resolveExecutable }) {
  const hostKeys = new HostKeyStore({ getSettings })
  const ssh2 = ssh2Available()
    ? new Ssh2Transport({ getHost, getSettings, resolveSecret, hostKeys })
    : undefined
  const openssh = new OpenSshTransport({ getHost, getSettings, resolveSecret, resolveExecutable, hostKeys })

  let opensshProbe
  const probeOpenSsh = async () => {
    if (opensshProbe !== undefined) return opensshProbe
    opensshProbe = await (async () => {
      try {
        const binary = await resolveExecutable('ssh')
        const result = await runBinary({ argv: [binary, '-V'], env: process.env, cwd: getSettings().dataDir, timeoutMs: 5000, maxBytes: 4096 })
        const text = `${result.stdout}${result.stderr}`
        const match = text.match(/OpenSSH[^\s,]*/u)
        return { available: true, binary, version: match === null ? 'unknown' : match[0] }
      } catch (error) {
        return { available: false, error: error instanceof Error ? error.message : String(error) }
      }
    })()
    return opensshProbe
  }

  const preference = () => {
    const value = getSettings().transport
    return value === 'openssh' || value === 'auto' ? value : 'ssh2'
  }

  const active = () => {
    const pref = preference()
    if (pref === 'openssh') return openssh
    return ssh2 ?? openssh
  }

  const requireBackend = () => {
    const backend = active()
    if (backend === undefined) {
      throw new Error('没有可用的 SSH 传输层：ssh2 模块缺失，且系统没有 OpenSSH 客户端。请安装 OpenSSH 客户端，或重新安装本插件以补齐 ssh2 依赖。')
    }
    return backend
  }

  /** 通过 ssh2 握手抓取主机公钥（不需要通过认证）。 */
  async function scanWithSsh2(host, signal) {
    const { Client, utils } = loadSsh2()
    const client = new Client()
    let captured
    await new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        try {
          client.end()
        } catch {
          // 忽略
        }
        resolve()
      }
      client.once('ready', finish)
      client.once('error', finish)
      client.once('close', finish)
      const onAbort = () => {
        try {
          client.destroy()
        } catch {
          // 忽略
        }
        finish()
      }
      if (signal !== undefined) {
        if (signal.aborted) {
          finish()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
      try {
        client.connect({
          host: host.host,
          port: host.port,
          username: 'dsh-ssh-probe',
          password: randomBytes(16).toString('hex'),
          readyTimeout: Math.min(getSettings().connectTimeoutMs, 10000),
          hostVerifier: (key) => {
            captured = key
            return true
          },
        })
      } catch {
        finish()
      }
    })
    if (captured === undefined) throw new Error(`无法从 ${host.host}:${host.port} 读取主机公钥（网络不可达或被拒绝）`)
    let type = 'ssh-ed25519'
    try {
      type = utils.parseKey(captured).type ?? type
    } catch {
      // 保底类型
    }
    return {
      fingerprint: fingerprintOfKeyBuffer(captured),
      entry: { hosts: [hostField(host.host, host.port)], type, base64: captured.toString('base64') },
    }
  }

  const layer = {
    get hostKeys() {
      return hostKeys
    },
    get name() {
      return active()?.name ?? 'none'
    },
    get knownSecrets() {
      const secrets = new Set([...(ssh2?.knownSecrets ?? []), ...(openssh.knownSecrets ?? [])])
      return secrets
    },
    get knownPaths() {
      return new Set([...(ssh2?.knownPaths ?? []), ...(openssh.knownPaths ?? [])])
    },
    async capabilities() {
      const opensshInfo = await probeOpenSsh()
      return {
        platform: process.platform,
        preference: preference(),
        active: active()?.name ?? 'none',
        transports: {
          ssh2: { available: ssh2 !== undefined, version: ssh2 !== undefined ? ssh2PackageVersion() : undefined },
          openssh: {
            available: opensshInfo.available,
            version: opensshInfo.version,
            binary: opensshInfo.binary,
            error: opensshInfo.error,
            multiplex: opensshInfo.available && process.platform !== 'win32',
          },
        },
        password: ssh2 !== undefined || process.platform !== 'win32',
        sftp: ssh2 !== undefined,
        hostKeyScan: ssh2 !== undefined || opensshInfo.available,
        keygenFree: true,
      }
    },
    async exec(alias, options) {
      return await requireBackend().exec(alias, options)
    },
    async put(alias, options) {
      return await requireBackend().put(alias, options)
    },
    async get(alias, options) {
      return await requireBackend().get(alias, options)
    },
    async probe(alias, signal) {
      return await requireBackend().probe(alias, signal)
    },
    async scanHostKey(alias, signal) {
      const host = getHost(alias)
      const known = await hostKeys.known(host.host, host.port)
      if (ssh2 !== undefined) {
        const scanned = await scanWithSsh2(host, signal)
        return { alias, fingerprint: scanned.fingerprint, known, matches: known.length > 0 && known === scanned.fingerprint, entry: scanned.entry }
      }
      const scanned = await openssh.scanHostKey(alias)
      return { alias, fingerprint: scanned.fingerprint, known: scanned.known, matches: scanned.known.length > 0 && scanned.known === scanned.fingerprint, entry: scanned.entry }
    },
    async acceptHostKey(alias, signal) {
      const host = getHost(alias)
      const scanned = await layer.scanHostKey(alias, signal)
      const fingerprint = await hostKeys.record(host.host, host.port, scanned.entry.type, scanned.entry.base64)
      return { alias, fingerprint, added: 1 }
    },
    async forgetHostKey(alias) {
      const host = getHost(alias)
      const removed = await hostKeys.forget(host.host, host.port)
      return { alias, removed: removed > 0 }
    },
    async doctor() {
      const capabilities = await layer.capabilities()
      const settings = getSettings()
      let knownHostsCount = 0
      try {
        knownHostsCount = parseKnownHosts(await readFile(path.join(settings.dataDir, 'known_hosts'), 'utf8')).length
      } catch {
        knownHostsCount = 0
      }
      const hosts = []
      for (const host of listHosts()) {
        const auth = host.keyEnv !== undefined ? 'key:env'
          : host.keyPath !== undefined ? 'key:file'
            : host.keyCred !== undefined ? 'key:cred'
              : host.agent === true ? 'agent'
                : host.passwordCred !== undefined ? 'password:cred'
                  : 'password:env'
        const notes = []
        if (auth === 'key:file') {
          try {
            await readFile(String(host.keyPath))
          } catch {
            notes.push('私钥文件不可读')
          }
        }
        if (auth === 'key:env' && (process.env[host.keyEnv] ?? '').length === 0 && settings.credentialsHint !== false) {
          notes.push('环境变量未设置（也可能来自 DSH 凭据库）')
        }
        if (auth === 'password:env' && capabilities.password === false) notes.push('当前平台不支持口令认证')
        if (auth === 'agent' && (process.env.SSH_AUTH_SOCK ?? '').length === 0 && process.platform !== 'win32') notes.push('没有 SSH_AUTH_SOCK')
        hosts.push({ alias: host.alias, auth, enabled: host.enabled !== false, fingerprint: await hostKeys.known(host.host, host.port), notes })
      }
      const hints = []
      if (capabilities.active === 'none') hints.push('没有任何可用传输层：装 OpenSSH 客户端或补齐 ssh2 依赖')
      if (capabilities.transports.ssh2.available === false) hints.push('ssh2 模块不可用，已降级到 OpenSSH')
      if (capabilities.transports.openssh.available === false) hints.push('系统没有 OpenSSH 客户端；若 ssh2 也不可用则无法连接')
      if (process.platform === 'win32') hints.push('Windows 上 OpenSSH 后端不支持连接复用与口令认证，建议保持 ssh2 为主通道')
      return {
        capabilities,
        dataDir: settings.dataDir,
        knownHosts: { file: path.join(settings.dataDir, 'known_hosts'), entries: knownHostsCount },
        hosts,
        hints,
      }
    },
    dispose() {
      ssh2?.dispose()
      openssh.dispose()
    },
  }

  return layer
}

export { fingerprintOfBase64 }
