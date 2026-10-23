/**
 * ssh2 传输层（主通道）：连接池、exec、SFTP、主机密钥验证。
 *
 * 为什么主通道是 ssh2：跨平台一致（Windows 也有真正的连接复用与密码认证）、
 * 能在同一进程里做 SFTP 与端口转发、不需要目标机装 OpenSSH 客户端。
 * 代价是算法面跟 libssh2 走，FIDO/新 KEX 落后于系统 OpenSSH —— 所以 OpenSSH 保留为可选后端。
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveAuth } from './auth.js'
import { fingerprintOfKeyBuffer } from './hostkey.js'

const require = createRequire(import.meta.url)

let ssh2Module = null
export function loadSsh2() {
  if (ssh2Module === null) ssh2Module = require('ssh2')
  return ssh2Module
}

export function ssh2Available() {
  try {
    const module = loadSsh2()
    return typeof module.Client === 'function'
  } catch {
    return false
  }
}

function normalizeError(error, fallback) {
  if (error instanceof Error) return error
  return new Error(typeof error === 'string' && error.length > 0 ? error : fallback)
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

export function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/** 递归遍历本地目录，产出 [绝对路径, 相对路径] 对。 */
async function walkLocal(root) {
  const output = []
  const queue = [['', root]]
  while (queue.length > 0) {
    const [prefix, dir] = queue.shift()
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name)
      const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) queue.push([relative, absolute])
      else if (entry.isFile()) output.push([absolute, relative])
    }
  }
  return output
}

export class Ssh2Transport {
  constructor({ getHost, getSettings, resolveSecret, hostKeys }) {
    this.getHost = getHost
    this.getSettings = getSettings
    this.resolveSecret = resolveSecret
    this.hostKeys = hostKeys
    this.pool = new Map()
    this.knownSecrets = new Set()
    this.knownPaths = new Set()
  }

  get name() {
    return 'ssh2'
  }

  #remember(auth) {
    for (const secret of auth.secrets) this.knownSecrets.add(secret)
    if (auth.keyPath !== undefined) this.knownPaths.add(auth.keyPath)
  }

  #connectOptions(host, auth) {
    const options = {
      host: host.host,
      port: host.port,
      username: host.user,
      readyTimeout: host.connectTimeoutMs ?? this.getSettings().connectTimeoutMs,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      tryKeyboard: false,
    }
    if (auth.privateKey !== undefined) {
      options.privateKey = Buffer.isBuffer(auth.privateKey) ? auth.privateKey : Buffer.from(auth.privateKey, 'utf8')
      if (auth.passphrase !== undefined) options.passphrase = auth.passphrase
    }
    if (auth.password !== undefined) options.password = auth.password
    if (auth.agent === true) {
      const sock = process.env.SSH_AUTH_SOCK
      if (sock !== undefined && sock.length > 0) options.agent = sock
      else if (process.platform === 'win32') options.agent = 'pageant'
      else throw new Error(`主机 ${host.alias} 配置了 agent，但没有 SSH_AUTH_SOCK`)
    }
    return options
  }

  async #open(host, signal) {
    const settings = this.getSettings()
    const auth = await resolveAuth(host, { resolveSecret: this.resolveSecret })
    this.#remember(auth)
    const { Client, utils } = loadSsh2()
    const client = new Client()
    let captured = ''
    let capturedKey
    let rejection = ''
    const expected = await this.hostKeys.known(host.host, host.port)

    const verifier = (keyBuffer) => {
      captured = fingerprintOfKeyBuffer(keyBuffer)
      capturedKey = keyBuffer
      if (settings.hostKeyPolicy === 'off') return true
      if (expected.length > 0) {
        if (expected === captured) return true
        rejection = `主机 ${host.alias} 的主机密钥与已记录指纹不一致（期望 ${expected}，实际 ${captured}）。确认是本机换过密钥后，删除数据目录 known_hosts 里该主机条目再连。`
        return false
      }
      if (settings.hostKeyPolicy === 'strict') {
        rejection = `主机 ${host.alias} 没有已记录的主机密钥指纹（实际 ${captured}）；strict 模式拒绝首次连接。`
        return false
      }
      return true
    }

    await new Promise((resolve, reject) => {
      let settled = false
      const finish = (error) => {
        if (settled) return
        settled = true
        client.removeListener('ready', onReady)
        client.removeListener('error', onError)
        if (error) {
          try {
            client.end()
          } catch {
            // 已断开
          }
          reject(error)
        } else resolve()
      }
      const onReady = () => finish(undefined)
      const onError = (error) => {
        const message = normalizeError(error, 'SSH 连接失败').message
        finish(new Error(rejection.length > 0 ? rejection : `SSH 连接 ${host.alias} 失败：${message}`))
      }
      client.once('ready', onReady)
      client.once('error', onError)
      const onAbort = () => {
        try {
          client.destroy()
        } catch {
          // 已断开
        }
        finish(new Error('SSH 连接已取消'))
      }
      if (signal !== undefined) {
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
        client.once('close', () => signal.removeEventListener('abort', onAbort))
      }
      try {
        client.connect({ ...this.#connectOptions(host, auth), hostVerifier: verifier })
      } catch (error) {
        finish(new Error(`SSH 连接 ${host.alias} 失败：${normalizeError(error, 'unknown').message}`))
      }
    })

    // TOFU：accept-new 且此前没有记录时，连接成功即记录指纹（无需人工点按钮）
    if (settings.hostKeyPolicy === 'accept-new' && expected.length === 0 && capturedKey !== undefined) {
      try {
        const type = utils.parseKey(capturedKey)?.type ?? 'ssh-ed25519'
        await this.hostKeys.record(host.host, host.port, type, Buffer.from(capturedKey).toString('base64'))
      } catch {
        // 记录失败不影响连接
      }
    }

    const entry = { client, auth, ready: true, fingerprint: captured, lastUsed: Date.now() }
    return entry
  }

  async #connection(alias, signal) {
    const host = this.getHost(alias)
    const existing = this.pool.get(alias)
    if (existing?.ready === true) {
      existing.lastUsed = Date.now()
      return existing
    }
    if (existing?.pending !== undefined) return await existing.pending
    const pending = this.#open(host, signal)
    const record = { pending, ready: false, client: undefined, fingerprint: '' }
    this.pool.set(alias, record)
    try {
      const entry = await pending
      Object.assign(record, entry, { pending: undefined })
      return record
    } catch (error) {
      if (this.pool.get(alias) === record) this.pool.delete(alias)
      throw error
    }
  }

  #drop(alias) {
    const record = this.pool.get(alias)
    if (record === undefined) return
    this.pool.delete(alias)
    try {
      record.client?.end()
    } catch {
      // 忽略
    }
  }

  async exec(alias, options) {
    const host = this.getHost(alias)
    const settings = this.getSettings()
    const command = options.cwd === undefined || options.cwd.length === 0
      ? options.command
      : `cd ${quotePosix(options.cwd)} && ${options.command}`
    const timeoutMs = clampNumber(options.timeoutMs ?? host.timeoutMs ?? settings.defaultTimeoutMs, 30000, 1000, 30 * 60 * 1000)
    const cap = clampNumber(options.maxBytes ?? host.maxOutputBytes ?? settings.maxOutputBytes, 200000, 1024, 4 * 1024 * 1024)
    const record = await this.#connection(alias, options.signal)
    const startedAt = Date.now()

    return await new Promise((resolve, reject) => {
      let settled = false
      let timer = null
      let stream = null
      const out = []
      const err = []
      let outBytes = 0
      let errBytes = 0
      let truncated = false
      const cleanup = () => {
        if (timer !== null) clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
      }
      const fail = (error) => {
        if (settled) return
        settled = true
        cleanup()
        try {
          stream?.close()
        } catch {
          // 忽略
        }
        this.#drop(alias)
        reject(error)
      }
      const onAbort = () => fail(new Error('SSH 命令已取消'))
      if (options.signal?.aborted === true) {
        fail(new Error('SSH 命令已取消'))
        return
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => fail(new Error(`SSH 命令在 ${timeoutMs}ms 后超时，连接已断开`)), timeoutMs)
      timer.unref?.()

      record.client.exec(command, (error, channel) => {
        if (error !== undefined && error !== null) {
          fail(new Error(`SSH 命令下发失败：${error.message}`))
          return
        }
        stream = channel
        if (typeof options.stdin === 'string') channel.end(options.stdin)
        channel.on('data', (chunk) => {
          if (outBytes < cap) {
            const text = chunk.toString('utf8')
            out.push(text)
            outBytes += Buffer.byteLength(text)
            if (outBytes > cap) truncated = true
          } else truncated = true
        })
        channel.stderr.on('data', (chunk) => {
          if (errBytes < cap) {
            const text = chunk.toString('utf8')
            err.push(text)
            errBytes += Buffer.byteLength(text)
            if (errBytes > cap) truncated = true
          } else truncated = true
        })
        channel.on('close', (code, signalName) => {
          if (settled) return
          settled = true
          cleanup()
          resolve({
            host: alias,
            command,
            exitCode: typeof code === 'number' ? code : null,
            signal: typeof signalName === 'string' && signalName.length > 0 ? signalName : null,
            stdout: out.join(''),
            stderr: err.join(''),
            truncated,
            durationMs: Date.now() - startedAt,
          })
        })
        channel.on('error', (channelError) => fail(new Error(`SSH 通道错误：${normalizeError(channelError, 'unknown').message}`)))
      })
    })
  }

  async #sftp(alias, signal) {
    const record = await this.#connection(alias, signal)
    return await new Promise((resolve, reject) => {
      record.client.sftp((error, handle) => {
        if (error !== undefined && error !== null) {
          reject(new Error(`SFTP 会话建立失败：${error.message}`))
          return
        }
        resolve(handle)
      })
    })
  }

  async put(alias, options) {
    const host = this.getHost(alias)
    const info = await stat(options.localPath).catch(() => undefined)
    if (info === undefined) throw new Error('本地文件不可用')
    const sftp = await this.#sftp(alias, options.signal)
    try {
      if (info.isDirectory()) {
        if (options.recursive !== true) throw new Error('本地路径是目录，需要 recursive: true')
        const files = await walkLocal(options.localPath)
        await this.#mkdirRemote(sftp, options.remotePath)
        for (const [absolute, relative] of files) {
          const target = `${options.remotePath.replace(/\/$/u, '')}/${relative}`
          await this.#mkdirRemote(sftp, path.posix.dirname(target))
          await fastPut(sftp, absolute, target)
        }
      } else {
        // 单文件上传也补建父目录，否则 SFTP 直接报 No such file
        const parent = path.posix.dirname(options.remotePath)
        if (parent !== '.' && parent !== '/') await this.#mkdirRemote(sftp, parent)
        await fastPut(sftp, options.localPath, options.remotePath)
      }
    } finally {
      try {
        sftp.end()
      } catch {
        // 忽略
      }
    }
    let verified
    if (options.verify === true && info.isFile()) {
      const local = hashBuffer(await readFile(options.localPath))
      const remote = await this.#remoteHash(alias, options.remotePath, options.signal)
      verified = { local, remote, match: remote === local }
    }
    return { host: alias, localPath: options.localPath, remotePath: options.remotePath, bytes: info.size, verified }
  }

  async get(alias, options) {
    const sftp = await this.#sftp(alias, options.signal)
    try {
      if (options.recursive === true) {
        await mkdir(options.localPath, { recursive: true })
        await this.#downloadTree(sftp, options.remotePath, options.localPath)
      } else {
        await fastGet(sftp, options.remotePath, options.localPath)
      }
    } finally {
      try {
        sftp.end()
      } catch {
        // 忽略
      }
    }
    const info = await stat(options.localPath)
    let verified
    if (options.verify === true && info.isFile()) {
      const local = hashBuffer(await readFile(options.localPath))
      const remote = await this.#remoteHash(alias, options.remotePath, options.signal)
      verified = { local, remote, match: remote === local }
    }
    return { host: alias, localPath: options.localPath, remotePath: options.remotePath, bytes: info.size, verified }
  }

  async #mkdirRemote(sftp, remoteDir) {
    const parts = remoteDir.split('/').filter((part) => part.length > 0)
    let current = remoteDir.startsWith('/') ? '' : '.'
    for (const part of parts) {
      current = current === '' ? `/${part}` : `${current}/${part}`
      await new Promise((resolve) => sftp.mkdir(current, () => resolve()))
    }
  }

  async #downloadTree(sftp, remoteDir, localDir) {
    const entries = await new Promise((resolve, reject) => {
      sftp.readdir(remoteDir, (error, list) => {
        if (error !== undefined && error !== null) reject(new Error(`读取远端目录失败：${error.message}`))
        else resolve(list)
      })
    })
    for (const entry of entries) {
      const remotePath = `${remoteDir.replace(/\/$/u, '')}/${entry.filename}`
      const localPath = path.join(localDir, entry.filename)
      if (entry.longname.startsWith('d')) {
        await mkdir(localPath, { recursive: true })
        await this.#downloadTree(sftp, remotePath, localPath)
      } else {
        await fastGet(sftp, remotePath, localPath)
      }
    }
  }

  async #remoteHash(alias, remotePath, signal) {
    const quoted = quotePosix(remotePath)
    const result = await this.exec(alias, {
      command: `(command -v sha256sum >/dev/null && sha256sum -- ${quoted}) || (command -v shasum >/dev/null && shasum -a 256 -- ${quoted})`,
      timeoutMs: 20000,
      signal,
    })
    return result.stdout.trim().split(/\s+/u)[0] ?? ''
  }

  async probe(alias, signal) {
    const host = this.getHost(alias)
    const settings = this.getSettings()
    const started = Date.now()
    const log = []
    const mark = (text) => log.push(`[${String(Date.now() - started).padStart(5, ' ')}ms] ${text}`)

    mark(`后端 ssh2 · 目标 ${host.user}@${host.host}:${host.port}`)
    mark(`策略：指纹 ${settings.hostKeyPolicy} · 超时 ${host.connectTimeoutMs ?? settings.connectTimeoutMs}ms`)
    const expected = await this.hostKeys.known(host.host, host.port)
    if (expected.length > 0) mark(`已记录主机指纹 ${expected}`)

    const record = await this.#connection(alias, signal)
    mark(`握手完成 · 主机密钥 ${record.fingerprint.length > 0 ? record.fingerprint : '未知'}`)
    if (expected.length > 0 && record.fingerprint.length > 0) {
      mark(expected === record.fingerprint ? '主机指纹与记录一致' : '主机指纹与记录不一致（已按策略处理）')
    } else if (expected.length === 0 && settings.hostKeyPolicy === 'accept-new') {
      mark('首次连接：已在本次连接后记录指纹（TOFU）')
    }
    mark(`认证成功 · 方式 ${record.auth.kind}`)

    const result = await this.exec(alias, { command: 'echo dsh-ssh-probe', timeoutMs: 15000, signal })
    mark(`远端回显 exit ${result.exitCode} · ${result.durationMs}ms`)
    if (result.exitCode !== 0) throw new Error(`连接探测失败（exit ${result.exitCode}）：${result.stderr.trim()}`)
    mark('完成')

    return {
      alias,
      fingerprint: record.fingerprint.length > 0 ? record.fingerprint : expected,
      auth: record.auth.kind,
      transport: 'ssh2',
      ready: true,
      durationMs: Date.now() - started,
      log,
    }
  }

  dispose() {
    for (const alias of [...this.pool.keys()]) this.#drop(alias)
    this.knownSecrets.clear()
    this.knownPaths.clear()
  }
}

export function quotePosix(value) {
  return `'${String(value).replace(/'/gu, `'\\''`)}'`
}

function fastPut(sftp, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(localPath, remotePath, { concurrency: 16 }, (error) => {
      if (error !== undefined && error !== null) reject(new Error(`上传失败：${error.message}`))
      else resolve()
    })
  })
}

function fastGet(sftp, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    sftp.fastGet(remotePath, localPath, { concurrency: 16 }, (error) => {
      if (error !== undefined && error !== null) reject(new Error(`下载失败：${error.message}`))
      else resolve()
    })
  })
}
