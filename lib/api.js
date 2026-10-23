/**
 * 侧栏面板的 Host 侧 API：给同源浏览器请求用的最小 JSON 接口。
 *
 * 动作：list / save / settings / probe / fingerprint / acceptHostKey /
 * forgetHostKey / audit / importSshConfig / doctor。
 * 密钥内容永远不经过这里；acceptHostKey 只写入公开的主机公钥。
 */
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expandHome } from './paths.js'
import { DEFAULT_DANGER_PATTERNS } from './policy.js'

const MAX_BODY_BYTES = 256 * 1024

function sendJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': String(payload.length) })
  response.end(payload)
}

async function readJsonBody(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

function sameOrigin(request) {
  const origin = request.headers.origin
  if (typeof origin !== 'string' || origin.length === 0) return true
  const host = request.headers.host
  if (typeof host !== 'string' || host.length === 0) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** 解析 ~/.ssh/config 的 Host 块，返回可导入的候选（不做任何写入）。 */
export function parseSshConfig(text) {
  const lines = String(text).split(/\r?\n/u)
  const candidates = []
  let current = null
  const flush = () => {
    if (current === null) return
    if (current.alias.length > 0 && current.host.length > 0 && current.alias !== '*') candidates.push(current)
    current = null
  }
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/u, '').trim()
    if (line.length === 0) continue
    const match = line.match(/^(\w+)(?:\s+|=)\s*(.+)$/u)
    if (match === null) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim().replace(/^"|"$/gu, '')
    if (key === 'host') {
      flush()
      current = { alias: (value.split(/\s+/u)[0] ?? '').slice(0, 64), host: '', port: 22, user: 'root', keyPath: undefined, shell: 'posix', mode: 'default', group: '', enabled: true }
      continue
    }
    if (current === null) continue
    if (key === 'hostname') current.host = value
    else if (key === 'user') current.user = value
    else if (key === 'port') {
      const port = Number(value)
      if (Number.isInteger(port) && port > 0 && port < 65536) current.port = port
    } else if (key === 'identityfile') current.keyPath = expandHome(value)
  }
  flush()
  return candidates
}

export function createPanelHandler({ settingsStore, transport, readHosts, writeHosts, audit, storeSecret, probeDraft, secretsAvailable }) {
  const settings = () => settingsStore.get()
  const hostFile = () => path.join(settings().dataDir, 'hosts.json')

  const snapshot = async () => {
    const current = settings()
    const capabilities = await transport.capabilities()
    const hosts = []
    for (const host of readHosts().values()) {
      hosts.push({
        alias: host.alias,
        host: host.host,
        port: host.port,
        user: host.user,
        auth: host.keyEnv !== undefined ? 'key:env'
          : host.keyPath !== undefined ? 'key:file'
            : host.keyCred !== undefined ? 'key:cred'
              : host.agent === true ? 'agent'
                : host.passwordCred !== undefined ? 'password:cred'
                  : 'password:env',
        authDetail: host.keyEnv ?? host.keyPath ?? host.keyCred ?? host.passwordEnv ?? host.passwordCred ?? '',
        shell: host.shell,
        mode: host.mode ?? 'default',
        group: host.group ?? '',
        enabled: host.enabled !== false,
        defaultCwd: host.defaultCwd ?? '',
        source: host.source ?? 'config',
        fingerprint: await transport.hostKeys.known(host.host, host.port),
        // 认证引用（变量名 / 路径 / 凭据名）用于表单回填与整表保存；密钥内容不在其中
        keyEnv: host.keyEnv,
        keyPath: host.keyPath,
        keyCred: host.keyCred,
        passphraseEnv: host.passphraseEnv,
        passwordEnv: host.passwordEnv,
        passwordCred: host.passwordCred,
        agent: host.agent === true,
      })
    }
    return {
      hosts,
      settings: {
        transport: current.transport,
        hostKeyPolicy: current.hostKeyPolicy,
        dangerPolicy: current.dangerPolicy,
        multiplex: current.multiplex === true,
        audit: current.audit !== false,
        dangerPatterns: current.dangerPatterns ?? DEFAULT_DANGER_PATTERNS,
      },
      dangerDefaults: DEFAULT_DANGER_PATTERNS,
      capabilities: {
        platform: capabilities.platform,
        active: capabilities.active,
        ssh2: capabilities.transports.ssh2,
        openssh: capabilities.transports.openssh,
        password: capabilities.password,
        sftp: capabilities.sftp,
        hostKeyScan: capabilities.hostKeyScan,
        multiplexSupported: capabilities.transports.openssh.multiplex === true,
        secrets: typeof secretsAvailable === 'function' ? secretsAvailable() === true : false,
      },
      hostFile: hostFile(),
      transport: transport.name,
    }
  }

  const handle = async (request, response) => {
    if (sameOrigin(request) === false) {
      sendJson(response, 403, { ok: false, error: '跨源请求被拒绝' })
      return
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { allow: 'GET, POST, OPTIONS' })
      response.end()
      return
    }
    if (request.method === 'GET') {
      sendJson(response, 200, { ok: true, ...(await snapshot()), audit: await audit.tail(50) })
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'GET, POST, OPTIONS' })
      response.end()
      return
    }
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : '请求无效' })
      return
    }
    const action = typeof body?.action === 'string' ? body.action : ''
    try {
      if (action === 'list') {
        sendJson(response, 200, { ok: true, ...(await snapshot()), audit: await audit.tail(50) })
        return
      }
      if (action === 'save') {
        const entries = Array.isArray(body?.hosts) ? body.hosts : null
        if (entries === null) throw new Error('hosts 必须是数组')
        await writeHosts(entries)
        sendJson(response, 200, { ok: true, ...(await snapshot()) })
        return
      }
      if (action === 'settings') {
        settingsStore.set(body?.patch ?? {})
        sendJson(response, 200, { ok: true, ...(await snapshot()) })
        return
      }
      if (action === 'probe') {
        const alias = typeof body?.alias === 'string' ? body.alias : ''
        if (alias.length === 0) throw new Error('缺少 alias')
        const probe = await transport.probe(alias)
        await audit.append({ action: 'probe', alias, ok: true, note: `${probe.fingerprint} via ${probe.transport}` })
        sendJson(response, 200, {
          ok: true,
          alias,
          fingerprint: probe.fingerprint,
          transport: probe.transport,
          auth: probe.auth,
          durationMs: probe.durationMs ?? null,
          log: probe.log ?? [],
        })
        return
      }
      if (action === 'probeDraft') {
        if (typeof probeDraft !== 'function') throw new Error('当前环境不支持草稿测试')
        const result = await probeDraft(body?.host)
        await audit.append({ action: 'probe-draft', alias: String(body?.host?.alias ?? ''), ok: true, note: `${result.fingerprint} via ${result.transport}` })
        sendJson(response, 200, { ok: true, ...result })
        return
      }
      if (action === 'setSecret') {
        if (typeof storeSecret !== 'function') throw new Error('当前环境没有凭据服务')
        const alias = typeof body?.alias === 'string' ? body.alias : ''
        const kind = body?.kind === 'key' ? 'key' : 'password'
        const ref = await storeSecret(alias, kind, typeof body?.value === 'string' ? body.value : '')
        await audit.append({ action: 'set-secret', alias, ok: true, note: kind })
        sendJson(response, 200, { ok: true, alias, kind, ref })
        return
      }
      if (action === 'fingerprint') {
        const alias = typeof body?.alias === 'string' ? body.alias : ''
        if (alias.length === 0) throw new Error('缺少 alias')
        const scanned = await transport.scanHostKey(alias)
        sendJson(response, 200, { ok: true, alias, fingerprint: scanned.fingerprint, known: scanned.known, matches: scanned.matches })
        return
      }
      if (action === 'acceptHostKey') {
        const alias = typeof body?.alias === 'string' ? body.alias : ''
        if (alias.length === 0) throw new Error('缺少 alias')
        const accepted = await transport.acceptHostKey(alias)
        await audit.append({ action: 'accept-host-key', alias, ok: true, note: accepted.fingerprint })
        sendJson(response, 200, { ok: true, ...accepted, ...(await snapshot()) })
        return
      }
      if (action === 'forgetHostKey') {
        const alias = typeof body?.alias === 'string' ? body.alias : ''
        if (alias.length === 0) throw new Error('缺少 alias')
        const forgotten = await transport.forgetHostKey(alias)
        await audit.append({ action: 'forget-host-key', alias, ok: forgotten.removed })
        sendJson(response, 200, { ok: true, ...forgotten, ...(await snapshot()) })
        return
      }
      if (action === 'audit') {
        sendJson(response, 200, { ok: true, audit: await audit.tail(Number(body?.limit) || 50) })
        return
      }
      if (action === 'doctor') {
        sendJson(response, 200, { ok: true, doctor: await transport.doctor() })
        return
      }
      if (action === 'importSshConfig') {
        const file = path.join(os.homedir(), '.ssh', 'config')
        let text = ''
        try {
          text = readFileSync(file, 'utf8')
        } catch {
          throw new Error('没有找到 ~/.ssh/config')
        }
        sendJson(response, 200, { ok: true, candidates: parseSshConfig(text) })
        return
      }
      sendJson(response, 400, { ok: false, error: `未知动作 ${action}` })
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : '操作失败' })
    }
  }

  return handle
}

/** 原子写 hosts.json（0600），覆盖前留一份 .bak。 */
export async function writeHostsFile(settings, entries) {
  await mkdir(settings.dataDir, { recursive: true })
  const file = path.join(settings.dataDir, 'hosts.json')
  const body = `${JSON.stringify(entries, null, 2)}\n`
  try {
    await copyFile(file, `${file}.bak`)
  } catch {
    // 首次写入没有可备份的旧文件
  }
  const tmp = `${file}.tmp`
  await writeFile(tmp, body, { encoding: 'utf8', mode: 0o600 })
  await rename(tmp, file)
}

export async function readHostsFile(settings) {
  try {
    const raw = await readFile(path.join(settings.dataDir, 'hosts.json'), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}
