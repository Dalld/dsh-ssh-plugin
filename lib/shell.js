/**
 * CLI 后端的进程与选项拼装工具（OpenSSH 通道专用）。
 * ssh2 通道不使用这里的 runBinary，但共用 redactText / quotePosix / 路径校验。
 */
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const SECRET_MIN_LENGTH = 4

export function redactText(text, secrets = [], paths = []) {
  if (typeof text !== 'string' || text.length === 0) return ''
  let out = text
  for (const secret of secrets) {
    if (typeof secret !== 'string' || secret.length < SECRET_MIN_LENGTH) continue
    out = out.split(secret).join('[redacted:secret]')
  }
  for (const secretPath of paths) {
    if (typeof secretPath !== 'string' || secretPath.length < SECRET_MIN_LENGTH) continue
    out = out.split(secretPath).join('[redacted:path]')
  }
  return out.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu,
    '[redacted:private-key]',
  )
}

export function quotePosix(value) {
  return `'${String(value).replace(/'/gu, `'\\''`)}'`
}

export function wrapCommand(host, command, cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return command
  if (host.shell === 'cmd') {
    if (/["%]/u.test(cwd)) throw new Error(`cmd 目标的 cwd 不能包含引号或 %：${cwd}`)
    return `cd /d "${cwd}" && ${command}`
  }
  if (host.shell === 'powershell') return `Set-Location -LiteralPath '${cwd.replace(/'/gu, "''")}'; ${command}`
  return `cd ${quotePosix(cwd)} && ${command}`
}

export function assertRemotePath(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} 不能为空`)
  if (/['"`$\\\u0000-\u001f]/u.test(value)) {
    throw new Error(`${label} 含有不安全字符（引号 / 反引号 / $ / 反斜杠 / 控制字符）：${value}`)
  }
  return value
}

export function clampNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** 供测试与诊断：CLI 后端的通用 -o 选项。scp 的端口参数是 -P。 */
export function commonOptions(settings, host, kind = 'ssh') {
  const strict = settings.hostKeyPolicy === 'accept-new' ? 'accept-new' : settings.hostKeyPolicy === 'strict' ? 'yes' : 'no'
  const options = [
    '-o', `StrictHostKeyChecking=${strict}`,
    '-o', `UserKnownHostsFile=${path.join(settings.dataDir, 'known_hosts')}`,
    '-o', 'LogLevel=ERROR',
    '-o', `ConnectTimeout=${Math.max(1, Math.round((host.connectTimeoutMs ?? settings.connectTimeoutMs) / 1000))}`,
  ]
  if (settings.multiplex === true && process.platform !== 'win32') {
    options.push(
      '-o', 'ControlMaster=auto',
      '-o', `ControlPath=${path.join(settings.dataDir, 'cm', '%C')}`,
      '-o', `ControlPersist=${Math.max(1, Math.round((settings.multiplexPersistMs ?? 120000) / 1000))}`,
    )
  }
  if (host.port !== 22) options.push(kind === 'scp' ? '-P' : '-p', String(host.port))
  return options
}

export function runBinary({ argv, env, cwd, timeoutMs, signal, maxBytes, stdinData }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const cap = clampNumber(maxBytes, 200000, 1024, 4 * 1024 * 1024)
    const limit = clampNumber(timeoutMs, 30000, 1000, 30 * 60 * 1000)
    let stdout = ''
    let stderr = ''
    let outBytes = 0
    let errBytes = 0
    let truncated = false
    let settled = false
    let timer = null
    let child

    const cleanup = () => {
      if (timer !== null) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const finish = (error, value) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve(value)
    }
    const kill = (reason) => {
      try {
        child?.kill()
      } catch {
        // 进程已退出
      }
      finish(new Error(reason))
    }
    const onAbort = () => kill('SSH 命令已取消')

    if (signal?.aborted === true) {
      finish(new Error('SSH 命令已取消'))
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd: cwd ?? os.tmpdir(),
        env,
        windowsHide: true,
        stdio: [stdinData === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      finish(new Error(`无法启动 ${path.basename(argv[0])}：${error instanceof Error ? error.message : String(error)}`))
      return
    }

    if (stdinData !== undefined) {
      child.stdin.on('error', () => {})
      child.stdin.end(stdinData)
    }
    timer = setTimeout(() => kill(`SSH 命令在 ${limit}ms 后超时`), limit)
    timer.unref?.()

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (outBytes < cap) {
        stdout += chunk
        outBytes += Buffer.byteLength(chunk)
        if (outBytes > cap) truncated = true
      } else truncated = true
    })
    child.stderr.on('data', (chunk) => {
      if (errBytes < cap) {
        stderr += chunk
        errBytes += Buffer.byteLength(chunk)
        if (errBytes > cap) truncated = true
      } else truncated = true
    })
    child.on('error', (error) => finish(new Error(`无法执行 ${path.basename(argv[0])}：${error.message}`)))
    child.on('close', (code, signalName) => {
      finish(undefined, {
        exitCode: typeof code === 'number' ? code : null,
        signal: typeof signalName === 'string' && signalName.length > 0 ? signalName : null,
        stdout,
        stderr,
        truncated,
        durationMs: Date.now() - startedAt,
      })
    })
  })
}
