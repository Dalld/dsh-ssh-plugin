/**
 * OpenSSH 传输层（可选后端）：spawn 系统 ssh / scp。
 *
 * 优点：算法与特性跟系统走（FIDO、Certificate、ProxyJump、POSIX 上的 ControlMaster）；
 * 缺点：Windows 无 multiplexing、askpass 不可靠、每条命令一次握手。
 * 只在 ssh2 不可用、或用户显式选择时启用。
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { resolveAuth } from './auth.js'
import { fingerprintOfBase64, parseKnownHosts, hostField } from './hostkey.js'
import { assertRemotePath, commonOptions, quotePosix, runBinary, wrapCommand } from './shell.js'

export class OpenSshTransport {
  constructor({ getHost, getSettings, resolveSecret, resolveExecutable, hostKeys }) {
    this.getHost = getHost
    this.getSettings = getSettings
    this.resolveSecret = resolveSecret
    this.resolveExecutable = resolveExecutable
    this.hostKeys = hostKeys
    this.binaries = new Map()
    this.knownSecrets = new Set()
    this.knownPaths = new Set()
  }

  get name() {
    return 'openssh'
  }

  async binary(kind) {
    const override = this.getSettings().binaries?.[kind]
    if (Array.isArray(override) && override.length > 0) return override
    if (typeof override === 'string' && override.length > 0) return [override]
    if (this.binaries.has(kind)) return this.binaries.get(kind)
    let resolved = kind
    try {
      resolved = await this.resolveExecutable(kind)
    } catch {
      // 回落到 PATH 名称，让 spawn 自己报错
    }
    this.binaries.set(kind, [resolved])
    return [resolved]
  }

  async version() {
    try {
      const binary = await this.binary('ssh')
      const result = await runBinary({ argv: [...binary, '-V'], env: process.env, cwd: os.tmpdir(), timeoutMs: 5000, maxBytes: 4096 })
      const text = `${result.stdout}${result.stderr}`
      const match = text.match(/(OpenSSH[^\s,]*)/u)
      return match === null ? 'unknown' : match[1]
    } catch {
      return undefined
    }
  }

  async #tempKey(pem) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-ssh-key-'))
    const file = path.join(dir, 'id_key')
    await writeFile(file, pem, { encoding: 'utf8', mode: 0o600 })
    this.knownPaths.add(dir)
    this.knownPaths.add(file)
    return { dir, file }
  }

  async #askpass() {
    const dir = path.join(this.getSettings().dataDir, 'bin')
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, 'askpass.sh')
    await writeFile(file, '#!/bin/sh\nprintf \'%s\' "$DSH_SSH_ASKPASS_VALUE"\n', { encoding: 'utf8', mode: 0o700 })
    return file
  }

  /** 组装 -i / 认证参数；返回 argv 片段、环境与需要清理的临时文件。 */
  async #authArgs(host) {
    const auth = await resolveAuth(host, { resolveSecret: this.resolveSecret })
    for (const secret of auth.secrets) this.knownSecrets.add(secret)
    const args = []
    const env = {}
    const temp = []
    if (auth.privateKey !== undefined) {
      let keyFile = auth.keyPath
      if (keyFile === undefined) {
        const created = await this.#tempKey(auth.privateKey)
        temp.push(created)
        keyFile = created.file
      }
      args.push('-i', keyFile)
      if (auth.passphrase !== undefined && process.platform !== 'win32') {
        env.SSH_ASKPASS = await this.#askpass()
        env.SSH_ASKPASS_REQUIRE = 'force'
        env.DSH_SSH_ASKPASS_VALUE = auth.passphrase
        env.DISPLAY = process.env.DISPLAY ?? ':0'
      } else {
        args.push('-o', 'BatchMode=yes')
      }
      args.push('-o', 'IdentitiesOnly=yes', '-o', 'PreferredAuthentications=publickey')
      return { args, env, temp, authKind: auth.kind }
    }
    if (auth.agent === true) {
      args.push('-o', 'BatchMode=yes', '-o', 'PreferredAuthentications=publickey')
      return { args, env, temp, authKind: auth.kind }
    }
    if (auth.password !== undefined) {
      if (process.platform === 'win32') throw new Error('Windows 上的 OpenSSH 后端不支持口令认证；请用 ssh2 后端或改用密钥')
      env.SSH_ASKPASS = await this.#askpass()
      env.SSH_ASKPASS_REQUIRE = 'force'
      env.DSH_SSH_ASKPASS_VALUE = auth.password
      env.DISPLAY = process.env.DISPLAY ?? ':0'
      args.push('-o', 'PreferredAuthentications=password,keyboard-interactive', '-o', 'NumberOfPasswordPrompts=1')
      return { args, env, temp, authKind: auth.kind }
    }
    return { args, env, temp, authKind: auth.kind }
  }

  async #cleanup(temp) {
    for (const entry of temp) {
      try {
        await rm(entry.dir, { recursive: true, force: true })
      } catch {
        // 忽略
      }
    }
  }

  async #sshArgv(host) {
    const settings = this.getSettings()
    const auth = await this.#authArgs(host)
    if (settings.multiplex === true && process.platform !== 'win32') {
      await mkdir(path.join(settings.dataDir, 'cm'), { recursive: true })
    }
    return {
      argv: [...(await this.binary('ssh')), ...commonOptions(settings, host, 'ssh'), ...auth.args, `${host.user}@${host.host}`],
      env: { ...process.env, ...auth.env },
      temp: auth.temp,
      authKind: auth.authKind,
    }
  }

  async exec(alias, options) {
    const host = this.getHost(alias)
    const settings = this.getSettings()
    const command = wrapCommand(host, options.command, options.cwd ?? host.defaultCwd)
    const connection = await this.#sshArgv(host)
    try {
      const result = await runBinary({
        argv: [...connection.argv, command],
        env: connection.env,
        cwd: settings.dataDir,
        timeoutMs: options.timeoutMs ?? host.timeoutMs ?? settings.defaultTimeoutMs,
        maxBytes: options.maxBytes ?? host.maxOutputBytes ?? settings.maxOutputBytes,
        signal: options.signal,
        stdinData: options.stdin,
      })
      return {
        host: alias,
        command,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
        durationMs: result.durationMs,
      }
    } finally {
      await this.#cleanup(connection.temp)
    }
  }

  async put(alias, options) {
    const host = this.getHost(alias)
    const remotePath = assertRemotePath(options.remotePath, 'remotePath')
    const info = await stat(options.localPath).catch(() => undefined)
    if (info === undefined) throw new Error('本地文件不可用')
    const settings = this.getSettings()
    const connection = await this.#sshArgv(host)
    const flags = ['-p', '-q']
    if (options.recursive === true) flags.push('-r')
    try {
      const result = await runBinary({
        argv: [...(await this.binary('scp')), ...commonOptions(settings, host, 'scp'), ...connection.argv.slice((await this.binary('ssh')).length + commonOptions(settings, host, 'ssh').length), ...flags, options.localPath, `${host.user}@${host.host}:${remotePath}`],
        env: connection.env,
        cwd: settings.dataDir,
        timeoutMs: options.timeoutMs ?? host.timeoutMs ?? settings.defaultTimeoutMs,
        maxBytes: settings.maxOutputBytes,
        signal: options.signal,
      })
      if (result.exitCode !== 0) throw new Error(`上传失败（scp exit ${result.exitCode}）：${result.stderr.trim()}`)
      let verified
      if (options.verify === true && info.isFile()) {
        const local = createHash('sha256').update(await readFile(options.localPath)).digest('hex')
        const remote = await this.#remoteHash(alias, remotePath, options.signal)
        verified = { local, remote, match: remote === local }
      }
      return { host: alias, localPath: options.localPath, remotePath, bytes: info.size, verified }
    } finally {
      await this.#cleanup(connection.temp)
    }
  }

  async get(alias, options) {
    const host = this.getHost(alias)
    const remotePath = assertRemotePath(options.remotePath, 'remotePath')
    const settings = this.getSettings()
    const connection = await this.#sshArgv(host)
    const flags = ['-p', '-q']
    if (options.recursive === true) flags.push('-r')
    try {
      const result = await runBinary({
        argv: [...(await this.binary('scp')), ...commonOptions(settings, host, 'scp'), ...connection.argv.slice((await this.binary('ssh')).length + commonOptions(settings, host, 'ssh').length), ...flags, `${host.user}@${host.host}:${remotePath}`, options.localPath],
        env: connection.env,
        cwd: settings.dataDir,
        timeoutMs: options.timeoutMs ?? host.timeoutMs ?? settings.defaultTimeoutMs,
        maxBytes: settings.maxOutputBytes,
        signal: options.signal,
      })
      if (result.exitCode !== 0) throw new Error(`下载失败（scp exit ${result.exitCode}）：${result.stderr.trim()}`)
      const info = await stat(options.localPath)
      let verified
      if (options.verify === true && info.isFile()) {
        const local = createHash('sha256').update(await readFile(options.localPath)).digest('hex')
        const remote = await this.#remoteHash(alias, remotePath, options.signal)
        verified = { local, remote, match: remote === local }
      }
      return { host: alias, localPath: options.localPath, remotePath, bytes: info.size, verified }
    } finally {
      await this.#cleanup(connection.temp)
    }
  }

  async #remoteHash(alias, remotePath, signal) {
    const result = await this.exec(alias, {
      command: `(command -v sha256sum >/dev/null && sha256sum -- ${quotePosix(remotePath)}) || (command -v shasum >/dev/null && shasum -a 256 -- ${quotePosix(remotePath)})`,
      timeoutMs: 20000,
      signal,
    })
    return result.stdout.trim().split(/\s+/u)[0] ?? ''
  }

  async probe(alias, signal) {
    const host = this.getHost(alias)
    const started = Date.now()
    const log = []
    const mark = (text) => log.push(`[${String(Date.now() - started).padStart(5, ' ')}ms] ${text}`)
    mark(`后端 openssh · 目标 ${host.user}@${host.host}:${host.port}`)
    const connection = await this.#sshArgv(host)
    mark(`认证方式 ${connection.authKind} · 参数 ${connection.argv.length} 项`)
    try {
      const result = await runBinary({
        argv: [...connection.argv, 'echo dsh-ssh-probe'],
        env: connection.env,
        cwd: this.getSettings().dataDir,
        timeoutMs: 15000,
        maxBytes: 8192,
        signal,
      })
      mark(`ssh 退出码 ${result.exitCode} · ${result.durationMs}ms`)
      for (const line of result.stderr.split(/\r?\n/u).map((entry) => entry.trim()).filter((entry) => entry.length > 0).slice(0, 6)) {
        mark(`stderr: ${line}`)
      }
      if (result.exitCode !== 0) throw new Error(`连接探测失败（ssh exit ${result.exitCode}）：${result.stderr.trim()}`)
      const fingerprint = await this.hostKeys.known(host.host, host.port)
      mark(`完成 · 已记录指纹 ${fingerprint.length > 0 ? fingerprint : '无'}`)
      return { alias, fingerprint, auth: connection.authKind, transport: 'openssh', ready: true, durationMs: Date.now() - started, log }
    } finally {
      await this.#cleanup(connection.temp)
    }
  }

  /** 用 ssh-keyscan 取主机公钥（ssh2 不可用时的兜底）。 */
  async scanHostKey(alias) {
    const host = this.getHost(alias)
    const scanner = await this.binary('ssh-keyscan')
    const result = await runBinary({
      argv: [...scanner, '-T', '5', '-p', String(host.port), host.host],
      env: process.env,
      cwd: this.getSettings().dataDir,
      timeoutMs: 15000,
      maxBytes: 65536,
    })
    const entries = parseKnownHosts(result.stdout)
    if (entries.length === 0) throw new Error(`无法从 ${host.host}:${host.port} 读取主机公钥：${result.stderr.trim() || '无输出'}`)
    const wanted = hostField(host.host, host.port)
    const match = entries.find((entry) => entry.hosts.includes(wanted)) ?? entries[0]
    return {
      alias,
      fingerprint: fingerprintOfBase64(match.base64),
      known: await this.hostKeys.known(host.host, host.port),
      entry: match,
    }
  }

  dispose() {
    this.knownSecrets.clear()
    this.knownPaths.clear()
  }
}
