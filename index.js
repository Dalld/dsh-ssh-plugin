/**
 * dsh-ssh — 给智能体用的 SSH 能力，密钥不进模型上下文。
 *
 * 传输：ssh2 为主通道（跨平台一致、连接复用、SFTP），系统 OpenSSH 为可选后端。
 * 安全：工具参数里没有密钥字段；认证材料只在 Host 进程解析；所有返给模型的字符串先脱敏。
 */
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, readFileSync } from 'node:fs'
import { createTransportLayer } from './lib/transport.js'
import { createSettingsStore } from './lib/settings.js'
import { createAudit } from './lib/audit.js'
import { classifyCommand, DEFAULT_DANGER_PATTERNS, DEFAULT_WRITE_PATTERNS } from './lib/policy.js'
import { redactText } from './lib/shell.js'
import { createPanelHandler, writeHostsFile } from './lib/api.js'
import { expandHome } from './lib/paths.js'

export const name = 'ssh-remote'
export const inject = ['tools']

const DEFAULTS = {
  transport: 'ssh2',
  hostKeyPolicy: 'accept-new',
  dangerPolicy: 'deny',
  audit: true,
  multiplex: false,
  multiplexPersistMs: 120000,
  defaultTimeoutMs: 30000,
  connectTimeoutMs: 20000,
  maxOutputBytes: 200000,
}

const SHELLS = new Set(['posix', 'cmd', 'powershell'])
const HOST_MODES = new Set(['default', 'readonly'])
const CORE_MODES = new Set(['default', 'readonly'])
const ALIAS_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u
const HOST_PATTERN = /^[A-Za-z0-9._:\[\]-]{1,255}$/u
const USER_PATTERN = /^[A-Za-z_][A-Za-z0-9._-]{0,63}$/u
const GROUP_PATTERN = /^[\p{L}\p{N} ._-]{0,32}$/u
const CONFIG_KEYS = new Set([
  'transport', 'hostKeyPolicy', 'dangerPolicy', 'audit', 'multiplex', 'multiplexPersistMs',
  'defaultTimeoutMs', 'connectTimeoutMs', 'maxOutputBytes', 'dataDir', 'binaries',
  'dangerPatterns', 'writePatterns', 'hosts',
])
const BINARIES_KEYS = new Set(['ssh', 'scp', 'sshKeyscan'])
const HOST_KEYS = new Set([
  'alias', 'host', 'port', 'user', 'shell', 'defaultCwd', 'mode', 'group', 'enabled',
  'keyEnv', 'keyPath', 'keyCred', 'passphraseEnv', 'passwordEnv', 'passwordCred', 'agent',
  'timeoutMs', 'connectTimeoutMs', 'maxOutputBytes',
])

function profileDir() {
  if (typeof process.env.DSH_PROFILE_DIR === 'string' && process.env.DSH_PROFILE_DIR.length > 0) return process.env.DSH_PROFILE_DIR
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : path.join(os.homedir(), '.dsh')
  return path.join(home, 'profiles', process.env.DSH_PROFILE ?? 'desktop')
}

function positiveNumber(value, fallback, label) {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`配置项 ${label} 必须是正数`)
  return n
}

function binaryOverride(value, label) {
  if (typeof value === 'string' && value.length > 0) return [value]
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.length > 0)) return [...value]
  if (value === undefined || value === null) return undefined
  throw new Error(`配置项 ${label} 必须是字符串或非空字符串数组`)
}

function rejectUnknownKeys(value, allowed, label) {
  if (value === null || typeof value !== 'object') return
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`配置项 ${label} 里出现未知字段 ${key}，可用字段：${[...allowed].join(', ')}`)
  }
}

function normalizeHost(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`hosts[${index}] 必须是对象`)
  const entry = raw
  rejectUnknownKeys(entry, HOST_KEYS, `hosts[${index}]`)
  const alias = typeof entry.alias === 'string' ? entry.alias.trim() : ''
  if (!ALIAS_PATTERN.test(alias)) throw new Error(`hosts[${index}].alias 非法：只允许字母数字与 ._-, 长度 1-64`)
  const host = typeof entry.host === 'string' ? entry.host.trim() : ''
  if (host.length === 0) throw new Error(`主机 ${alias} 缺少 host`)
  if (!HOST_PATTERN.test(host)) throw new Error(`主机 ${alias} 的 host 含非法字符：${host}`)
  const user = typeof entry.user === 'string' && entry.user.length > 0 ? entry.user : 'root'
  if (!USER_PATTERN.test(user)) throw new Error(`主机 ${alias} 的 user 非法：只允许字母数字与 ._-, 且不能以 - 开头`)
  const shell = typeof entry.shell === 'string' ? entry.shell.toLowerCase() : 'posix'
  if (!SHELLS.has(shell)) throw new Error(`主机 ${alias} 的 shell 只支持 posix / cmd / powershell`)
  const mode = typeof entry.mode === 'string' ? entry.mode.toLowerCase() : 'default'
  if (!CORE_MODES.has(mode)) throw new Error(`主机 ${alias} 的 mode 只支持 default / readonly`)
  const group = typeof entry.group === 'string' ? entry.group : ''
  if (!GROUP_PATTERN.test(group)) throw new Error(`主机 ${alias} 的 group 非法`)
  let port = 22
  if (entry.port !== undefined && entry.port !== null) {
    if (!Number.isInteger(Number(entry.port)) || Number(entry.port) < 1 || Number(entry.port) > 65535) {
      throw new Error(`主机 ${alias} 的 port 必须是 1-65535 的整数`)
    }
    port = Number(entry.port)
  }
  const normalized = {
    alias,
    host,
    port,
    user,
    shell,
    mode,
    group,
    enabled: entry.enabled !== false,
    defaultCwd: typeof entry.defaultCwd === 'string' && entry.defaultCwd.length > 0 ? entry.defaultCwd : undefined,
    keyEnv: typeof entry.keyEnv === 'string' && entry.keyEnv.length > 0 ? entry.keyEnv : undefined,
    keyPath: typeof entry.keyPath === 'string' && entry.keyPath.length > 0 ? entry.keyPath : undefined,
    keyCred: typeof entry.keyCred === 'string' && entry.keyCred.length > 0 ? entry.keyCred : undefined,
    passphraseEnv: typeof entry.passphraseEnv === 'string' && entry.passphraseEnv.length > 0 ? entry.passphraseEnv : undefined,
    passwordEnv: typeof entry.passwordEnv === 'string' && entry.passwordEnv.length > 0 ? entry.passwordEnv : undefined,
    passwordCred: typeof entry.passwordCred === 'string' && entry.passwordCred.length > 0 ? entry.passwordCred : undefined,
    agent: entry.agent === true,
    timeoutMs: entry.timeoutMs === undefined ? undefined : positiveNumber(entry.timeoutMs, undefined, `hosts[${index}].timeoutMs`),
    connectTimeoutMs: entry.connectTimeoutMs === undefined ? undefined : positiveNumber(entry.connectTimeoutMs, undefined, `hosts[${index}].connectTimeoutMs`),
    maxOutputBytes: entry.maxOutputBytes === undefined ? undefined : positiveNumber(entry.maxOutputBytes, undefined, `hosts[${index}].maxOutputBytes`),
  }
  if (normalized.keyEnv === undefined && normalized.keyPath === undefined && normalized.keyCred === undefined
    && normalized.passwordEnv === undefined && normalized.passwordCred === undefined && normalized.agent !== true) {
    throw new Error(`主机 ${alias} 必须配置 keyEnv / keyPath / keyCred / passwordEnv / passwordCred / agent 之一`)
  }
  return normalized
}

function patternList(value, fallback, label) {
  if (value === undefined || value === null) return fallback
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`配置项 ${label} 必须是非空字符串数组`)
  }
  return [...value]
}

function resolveSettings(raw) {
  const config = raw !== null && typeof raw === 'object' ? raw : {}
  rejectUnknownKeys(config, CONFIG_KEYS, 'config')
  const hostKeyPolicy = typeof config.hostKeyPolicy === 'string' ? config.hostKeyPolicy : DEFAULTS.hostKeyPolicy
  if (!['accept-new', 'strict', 'off'].includes(hostKeyPolicy)) throw new Error('hostKeyPolicy 只支持 accept-new / strict / off')
  const dangerPolicy = typeof config.dangerPolicy === 'string' ? config.dangerPolicy : DEFAULTS.dangerPolicy
  if (!['allow', 'ask', 'deny'].includes(dangerPolicy)) throw new Error('dangerPolicy 只支持 allow / ask / deny')
  const transport = typeof config.transport === 'string' ? config.transport : DEFAULTS.transport
  if (!['ssh2', 'openssh', 'auto'].includes(transport)) throw new Error('transport 只支持 ssh2 / openssh / auto')
  const binariesConfig = config.binaries !== null && typeof config.binaries === 'object' ? config.binaries : {}
  rejectUnknownKeys(binariesConfig, BINARIES_KEYS, 'binaries')
  return {
    transport,
    hostKeyPolicy,
    dangerPolicy,
    audit: config.audit !== false,
    multiplex: config.multiplex === true,
    multiplexPersistMs: positiveNumber(config.multiplexPersistMs, DEFAULTS.multiplexPersistMs, 'multiplexPersistMs'),
    defaultTimeoutMs: positiveNumber(config.defaultTimeoutMs, DEFAULTS.defaultTimeoutMs, 'defaultTimeoutMs'),
    connectTimeoutMs: positiveNumber(config.connectTimeoutMs, DEFAULTS.connectTimeoutMs, 'connectTimeoutMs'),
    maxOutputBytes: positiveNumber(config.maxOutputBytes, DEFAULTS.maxOutputBytes, 'maxOutputBytes'),
    dangerPatterns: patternList(config.dangerPatterns, DEFAULT_DANGER_PATTERNS, 'dangerPatterns'),
    writePatterns: patternList(config.writePatterns, DEFAULT_WRITE_PATTERNS, 'writePatterns'),
    dataDir: typeof config.dataDir === 'string' && config.dataDir.length > 0 ? expandHome(config.dataDir) : path.join(profileDir(), 'ssh'),
    binaries: {
      ssh: binaryOverride(binariesConfig.ssh, 'binaries.ssh'),
      scp: binaryOverride(binariesConfig.scp, 'binaries.scp'),
      sshKeyscan: binaryOverride(binariesConfig.sshKeyscan, 'binaries.sshKeyscan'),
    },
  }
}

/** config.hosts 优先，<dataDir>/hosts.json 补充；每次调用重读，改文件不用重启。 */
function loadHosts(config, settings) {
  const byAlias = new Map()
  const declared = Array.isArray(config.hosts) ? config.hosts : []
  declared.forEach((raw, index) => {
    const host = normalizeHost(raw, index)
    host.source = 'config'
    if (host.enabled) byAlias.set(host.alias, host)
  })
  const file = path.join(settings.dataDir, 'hosts.json')
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('读取 hosts.json 失败，请检查该文件权限')
  }
  if (raw !== undefined) {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new Error(`hosts.json 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
    }
    if (!Array.isArray(parsed)) throw new Error('hosts.json 顶层必须是主机对象数组')
    parsed.forEach((entry, index) => {
      const host = normalizeHost(entry, index)
      if (!byAlias.has(host.alias) && host.enabled) {
        host.source = 'file'
        byAlias.set(host.alias, host)
      }
    })
  }
  return byAlias
}

function describeAuth(host) {
  if (host.keyEnv !== undefined) return 'key:env'
  if (host.keyPath !== undefined) return 'key:file'
  if (host.keyCred !== undefined) return 'key:cred'
  if (host.agent === true) return 'agent'
  if (host.passwordCred !== undefined) return 'password:cred'
  return 'password:env'
}

function text(value) {
  return [{ type: 'text', text: value }]
}

function truncateNotice(value) {
  return value ? '\n[输出已截断，超出 maxOutputBytes]' : ''
}

function optionalNumber(value, label) {
  if (value === undefined || value === null) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} 必须是正数`)
  return n
}

function assertOutsideDataDir(settings, target) {
  const resolved = path.resolve(target)
  const root = path.resolve(settings.dataDir)
  const relative = path.relative(root, resolved)
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('插件数据目录不允许作为传输的本地路径')
  }
}

async function sessionDirectory(ctx, exec) {
  const workingDirectory = ctx.get('workingDirectory')
  if (workingDirectory !== undefined) {
    if (exec.agent !== undefined) {
      try {
        return await workingDirectory.ensure(exec.agent, exec.signal)
      } catch {
        // 回落到默认目录
      }
    }
    if (typeof workingDirectory.defaultDirectory === 'string' && workingDirectory.defaultDirectory.length > 0) return workingDirectory.defaultDirectory
  }
  return process.cwd()
}

export function apply(ctx, config) {
  const baseSettings = resolveSettings(config)
  loadHosts(config ?? {}, baseSettings)

  const store = createSettingsStore(baseSettings)
  const getSettings = () => store.get()
  const currentHosts = () => loadHosts(config ?? {}, getSettings())

  // 面板「测试连接」用的临时主机：不进 hosts.json，测完即丢
  const ephemeral = new Map()

  const getHost = (alias) => {
    const draft = ephemeral.get(alias)
    if (draft !== undefined) return draft
    const hosts = currentHosts()
    const host = hosts.get(alias)
    if (host === undefined) {
      const known = [...hosts.keys()]
      throw new Error(known.length === 0
        ? `未知主机 ${alias}：当前没有配置任何 SSH 主机。请在侧栏 SSH 面板或 <dataDir>/hosts.json 里添加`
        : `未知主机 ${alias}，可用别名：${known.join(', ')}`)
    }
    return host
  }

  const listHosts = () => [...currentHosts().values()]

  const resolveSecret = async (secretName) => {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      try {
        const resolved = await credentials.resolve(secretName)
        if (resolved !== undefined && typeof resolved.value === 'string' && resolved.value.length > 0) return resolved.value
      } catch {
        // 凭据库不可用时回落到环境变量
      }
    }
    const fromEnv = process.env[secretName]
    return typeof fromEnv === 'string' && fromEnv.length > 0 ? fromEnv : undefined
  }

  const resolveExecutable = async (command) => {
    const subprocess = ctx.get('subprocess')
    if (subprocess !== undefined) return await subprocess.resolveExecutable(command)
    return command
  }

  try {
    mkdirSync(baseSettings.dataDir, { recursive: true })
  } catch (error) {
    throw new Error(`无法创建 SSH 数据目录 ${baseSettings.dataDir}：${error instanceof Error ? error.message : String(error)}`)
  }

  const transport = createTransportLayer({ getHost, listHosts, getSettings, resolveSecret, resolveExecutable })
  ctx.effect(() => () => transport.dispose())

  const scrub = (message) => redactText(String(message), [...transport.knownSecrets], [...transport.knownPaths])
  const fail = (error, fallback) => {
    const message = error instanceof Error && error.message.length > 0 ? error.message : fallback
    throw new Error(scrub(message))
  }

  const audit = createAudit({ getSettings, redact: (note) => scrub(note) })

  const approvalFor = async (exec, reason) => {
    const policy = getSettings().dangerPolicy
    if (policy === 'allow') return
    if (policy === 'deny') throw new Error(`危险命令被策略拒绝（dangerPolicy=deny）：${reason}`)
    const approval = ctx.get('approval')
    if (approval === undefined || exec.agent === undefined) {
      throw new Error(`危险命令需要审批，但当前环境没有可用的审批服务，已按拒绝处理：${reason}`)
    }
    let outcome
    try {
      outcome = await approval.request({
        agent: exec.agent,
        toolName: 'ssh_exec',
        callId: exec.callId,
        reason: `SSH 远程命令命中危险模式：${reason}`,
        displayReason: { en: `Runs a dangerous remote command: ${reason}`, zh: `将执行危险远程命令：${reason}` },
        signal: exec.signal,
      })
    } catch (error) {
      throw new Error(`审批请求失败，已按拒绝处理：${error instanceof Error ? error.message : String(error)}`)
    }
    if (outcome !== 'allowed-once') throw new Error(`危险命令未获批准（${outcome}）`)
  }

  // —— 面板接口：路由服务可能在 apply 之后才就绪，所以用 ctx.inject 等它。
  ctx.inject(['webServer'], (routeCtx) => {
    const toFileEntry = (entry, index) => {
      const { source: _source, auth: _auth, authDetail: _authDetail, fingerprint: _fingerprint, ...rest } = entry !== null && typeof entry === 'object' ? entry : {}
      const host = normalizeHost(rest, index)
      return {
        alias: host.alias,
        host: host.host,
        port: host.port,
        user: host.user,
        ...(host.shell === 'posix' ? {} : { shell: host.shell }),
        ...(host.mode === 'default' ? {} : { mode: host.mode }),
        ...(host.group.length === 0 ? {} : { group: host.group }),
        ...(host.enabled ? {} : { enabled: false }),
        ...(host.defaultCwd === undefined ? {} : { defaultCwd: host.defaultCwd }),
        ...(host.keyEnv === undefined ? {} : { keyEnv: host.keyEnv }),
        ...(host.keyPath === undefined ? {} : { keyPath: host.keyPath }),
        ...(host.keyCred === undefined ? {} : { keyCred: host.keyCred }),
        ...(host.passphraseEnv === undefined ? {} : { passphraseEnv: host.passphraseEnv }),
        ...(host.passwordEnv === undefined ? {} : { passwordEnv: host.passwordEnv }),
        ...(host.passwordCred === undefined ? {} : { passwordCred: host.passwordCred }),
        ...(host.agent === true ? { agent: true } : {}),
      }
    }

    /** 面板里直接粘贴的私钥/口令写入 DSH 凭据库，hosts.json 只留引用名。 */
    const storeSecret = async (alias, kind, value) => {
      if (typeof value !== 'string' || value.length === 0) throw new Error('密钥内容为空')
      if (ALIAS_PATTERN.test(alias) === false) throw new Error('别名非法，无法生成凭据名')
      const suffix = String(alias).toUpperCase().replace(/[^A-Z0-9]/gu, '_')
      const ref = kind === 'key' ? `DSH_SSH_${suffix}_KEY` : `DSH_SSH_${suffix}_PASSWORD`
      const credentials = ctx.get('credentials')
      if (credentials === undefined) throw new Error('当前环境没有凭据服务，无法保存密钥；请改用 keyEnv / keyPath')
      await credentials.set(ref, value)
      return ref
    }

    const probeDraft = async (draft) => {
      const host = normalizeHost(draft, 'draft')
      ephemeral.set('draft-probe', { ...host, alias: 'draft-probe' })
      try {
        const probe = await transport.probe('draft-probe')
        return {
          fingerprint: probe.fingerprint,
          transport: probe.transport,
          auth: probe.auth,
          durationMs: probe.durationMs ?? null,
          log: probe.log ?? [],
        }
      } finally {
        ephemeral.delete('draft-probe')
      }
    }

    const handler = createPanelHandler({
      settingsStore: store,
      transport,
      readHosts: currentHosts,
      audit,
      storeSecret,
      probeDraft,
      secretsAvailable: () => ctx.get('credentials') !== undefined,
      writeHosts: async (entries) => {
        const cleaned = entries.map((entry, index) => toFileEntry(entry, index))
        const seen = new Set()
        for (const entry of cleaned) {
          if (seen.has(entry.alias)) throw new Error(`别名重复：${entry.alias}`)
          seen.add(entry.alias)
        }
        await writeHostsFile(getSettings(), cleaned)
      },
    })
    const server = routeCtx.webServer ?? routeCtx.get('webServer')
    routeCtx.effect(() => server.register({ kind: 'prefix', path: '/dsh-ssh/api', handler }))
  })

  const hostRow = {
    type: 'object',
    additionalProperties: false,
    properties: {
      alias: { type: 'string' },
      host: { type: 'string' },
      port: { type: 'integer' },
      user: { type: 'string' },
      auth: { type: 'string' },
      shell: { type: 'string' },
      mode: { type: 'string' },
      group: { type: 'string' },
      defaultCwd: { type: 'string' },
      fingerprint: { type: 'string' },
      probe: {
        type: 'object',
        additionalProperties: true,
        properties: {
          fingerprint: { type: 'string' },
          transport: { type: 'string' },
          error: { type: 'string' },
        },
      },
    },
    required: ['alias', 'host', 'port', 'user', 'auth'],
  }

  const execOutput = {
    type: 'object',
    additionalProperties: false,
    properties: {
      host: { type: 'string' },
      command: { type: 'string' },
      exitCode: { type: 'integer' },
      signal: { type: 'string' },
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      truncated: { type: 'boolean' },
      durationMs: { type: 'integer' },
      transport: { type: 'string' },
    },
    required: ['host', 'command', 'exitCode', 'stdout', 'stderr', 'truncated', 'durationMs'],
  }

  const transferOutput = {
    type: 'object',
    additionalProperties: false,
    properties: {
      host: { type: 'string' },
      localPath: { type: 'string' },
      remotePath: { type: 'string' },
      bytes: { type: 'integer' },
      verified: { type: 'boolean' },
      transport: { type: 'string' },
    },
    required: ['host', 'localPath', 'remotePath'],
  }

  const definitions = [
    {
      name: 'ssh_hosts',
      description: '列出可用的 SSH 主机别名与连接方式摘要（含只读/分组/已记录指纹）。传 probe:true 会真实连接并返回主机指纹。不返回任何密钥或口令。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { probe: { type: 'boolean', description: '是否真实连接探测（默认 false）' } },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hosts: { type: 'array', items: hostRow },
            activeTransport: { type: 'string' },
            hostKeyPolicy: { type: 'string' },
            dangerPolicy: { type: 'string' },
          },
          required: ['hosts', 'activeTransport', 'hostKeyPolicy', 'dangerPolicy'],
        },
        render: (_args, value) => {
          if (value.hosts.length === 0) return text('没有配置任何 SSH 主机。在侧栏 SSH 面板里添加，或写 <dataDir>/hosts.json。')
          const lines = value.hosts.map((entry) => {
            const probe = entry.probe
            const tail = probe === undefined
              ? ''
              : probe.error !== undefined ? ` | 探测失败：${probe.error}` : ` | ${probe.fingerprint.length > 0 ? probe.fingerprint : '（无已记录指纹）'} via ${probe.transport}`
            return `${entry.alias} → ${entry.user}@${entry.host}:${entry.port} (${entry.auth}, ${entry.shell}${entry.mode === 'readonly' ? ', readonly' : ''}${entry.group.length > 0 ? `, ${entry.group}` : ''})${tail}`
          })
          return text(`${lines.join('\n')}\n传输：${value.activeTransport} · 指纹策略 ${value.hostKeyPolicy} · 危险命令 ${value.dangerPolicy}`)
        },
      },
      async execute(args) {
        const settings = getSettings()
        const wantProbe = args?.probe === true
        const rows = []
        for (const host of listHosts()) {
          const row = {
            alias: host.alias,
            host: host.host,
            port: host.port,
            user: host.user,
            auth: describeAuth(host),
            shell: host.shell,
            mode: host.mode,
            group: host.group,
            defaultCwd: host.defaultCwd ?? '',
            fingerprint: await transport.hostKeys.known(host.host, host.port),
          }
          if (wantProbe) {
            try {
              const probe = await transport.probe(host.alias)
              row.probe = { fingerprint: probe.fingerprint, transport: probe.transport }
            } catch (error) {
              row.probe = { error: scrub(error instanceof Error ? error.message : String(error)) }
            }
          }
          rows.push(row)
        }
        return {
          hosts: rows,
          activeTransport: transport.name,
          hostKeyPolicy: settings.hostKeyPolicy,
          dangerPolicy: settings.dangerPolicy,
        }
      },
    },
    {
      name: 'ssh_exec',
      description: '在已配置的 SSH 主机别名上执行一条命令，返回退出码、stdout、stderr。只能提交别名；密钥由 Host 进程保管。危险命令按 dangerPolicy 拒绝或转审批，只读主机会拒绝写操作。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          host: { type: 'string', description: 'SSH 主机别名（见 ssh_hosts）' },
          command: { type: 'string', description: '要执行的命令（可含换行，作为同一远端 shell 会话执行）' },
          cwd: { type: 'string', description: '可选：执行前切换到的远端目录' },
          stdin: { type: 'string', description: '可选：写入远端命令 stdin 的文本' },
          timeoutMs: { type: 'number' },
          maxBytes: { type: 'number' },
        },
        required: ['host', 'command'],
      },
      output: {
        schema: execOutput,
        render: (_args, value) => {
          const head = `[${value.host}] exit ${value.exitCode} · ${value.durationMs}ms${value.signal.length === 0 ? '' : ` · ${value.signal}`}${value.transport === undefined ? '' : ` · ${value.transport}`}`
          const body = [
            value.stdout.length > 0 ? value.stdout.replace(/\s+$/u, '') : '',
            value.stderr.length > 0 ? `--- stderr ---\n${value.stderr.replace(/\s+$/u, '')}` : '',
          ].filter((part) => part.length > 0).join('\n')
          return text(`${head}\n${body}${truncateNotice(value.truncated)}`)
        },
      },
      async execute(args, exec) {
        if (typeof args?.host !== 'string' || typeof args?.command !== 'string' || args.command.trim().length === 0) {
          throw new Error('ssh_exec 需要非空的 host 与 command')
        }
        const timeoutMs = optionalNumber(args.timeoutMs, 'timeoutMs')
        const maxBytes = optionalNumber(args.maxBytes, 'maxBytes')
        const cwd = args.cwd === undefined || args.cwd === null ? undefined : String(args.cwd)
        const stdin = typeof args.stdin === 'string' ? args.stdin : undefined
        const host = getHost(args.host)
        const verdict = classifyCommand(args.command, getSettings(), host)
        if (verdict.level === 'write') {
          throw new Error(`主机 ${host.alias} 是只读模式，命令命中写操作模式：${verdict.pattern}`)
        }
        if (verdict.level === 'danger') await approvalFor(exec, verdict.pattern ?? 'danger-pattern')
        const startedAt = Date.now()
        try {
          const result = await transport.exec(args.host, {
            command: args.command,
            cwd: cwd !== undefined && cwd.length > 0 ? cwd : undefined,
            stdin,
            timeoutMs,
            maxBytes,
            signal: exec.signal,
          })
          await audit.append({
            action: 'exec', alias: args.host, target: `${host.user}@${host.host}:${host.port}`,
            exitCode: result.exitCode, durationMs: result.durationMs, ok: result.exitCode === 0,
            note: result.command,
          })
          return {
            host: result.host,
            command: scrub(result.command),
            exitCode: result.exitCode ?? -1,
            signal: result.signal ?? '',
            stdout: scrub(result.stdout),
            stderr: scrub(result.stderr),
            truncated: result.truncated,
            durationMs: result.durationMs,
            transport: transport.name,
          }
        } catch (error) {
          await audit.append({ action: 'exec', alias: args.host, ok: false, durationMs: Date.now() - startedAt, note: args.command })
          fail(error, 'SSH 命令执行失败')
        }
      },
    },
    {
      name: 'ssh_put',
      description: '本机（Host 机器）→ 远端上传。ssh2 后端走 SFTP（支持递归目录），OpenSSH 后端走 scp。verify:true 时比对远端与本地 sha256。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          host: { type: 'string' },
          localPath: { type: 'string', description: '本机路径（相对会话工作目录）' },
          remotePath: { type: 'string', description: '远端目标路径（不接受引号 / 反引号 / $ / 反斜杠）' },
          recursive: { type: 'boolean', description: '本地是目录时置 true' },
          verify: { type: 'boolean', description: '传输后比对 sha256' },
        },
        required: ['host', 'localPath', 'remotePath'],
      },
      output: {
        schema: transferOutput,
        render: (_args, value) => text(`[${value.host}] 上传 ${value.localPath} → ${value.remotePath}${value.bytes === undefined ? '' : ` (${value.bytes} B)`}${value.verified === true ? ' · sha256 一致' : value.verified === false ? ' · sha256 不一致' : ''}`),
      },
      async execute(args, exec) {
        if (typeof args?.host !== 'string' || typeof args?.localPath !== 'string' || typeof args?.remotePath !== 'string') {
          throw new Error('ssh_put 需要 host / localPath / remotePath')
        }
        const base = await sessionDirectory(ctx, exec)
        const localPath = path.isAbsolute(args.localPath) ? args.localPath : path.resolve(base, args.localPath)
        assertOutsideDataDir(getSettings(), localPath)
        const startedAt = Date.now()
        try {
          const result = await transport.put(args.host, {
            localPath,
            remotePath: args.remotePath,
            recursive: args.recursive === true,
            verify: args.verify === true,
            signal: exec.signal,
          })
          await audit.append({ action: 'put', alias: args.host, ok: true, durationMs: Date.now() - startedAt, note: `${localPath} → ${result.remotePath}` })
          return {
            host: result.host,
            localPath: result.localPath,
            remotePath: result.remotePath,
            bytes: result.bytes ?? 0,
            verified: result.verified === undefined ? undefined : result.verified.match === true,
            transport: transport.name,
          }
        } catch (error) {
          await audit.append({ action: 'put', alias: args.host, ok: false, durationMs: Date.now() - startedAt })
          fail(error, 'SSH 上传失败')
        }
      },
    },
    {
      name: 'ssh_get',
      description: '远端 → 本机（Host 机器）下载。ssh2 后端走 SFTP（支持递归目录），OpenSSH 后端走 scp。verify:true 时比对 sha256。',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          host: { type: 'string' },
          remotePath: { type: 'string' },
          localPath: { type: 'string', description: '本机目标路径（相对会话工作目录）' },
          recursive: { type: 'boolean' },
          verify: { type: 'boolean' },
        },
        required: ['host', 'remotePath', 'localPath'],
      },
      output: {
        schema: transferOutput,
        render: (_args, value) => text(`[${value.host}] 下载 ${value.remotePath} → ${value.localPath}${value.bytes === undefined ? '' : ` (${value.bytes} B)`}${value.verified === true ? ' · sha256 一致' : value.verified === false ? ' · sha256 不一致' : ''}`),
      },
      async execute(args, exec) {
        if (typeof args?.host !== 'string' || typeof args?.remotePath !== 'string' || typeof args?.localPath !== 'string') {
          throw new Error('ssh_get 需要 host / remotePath / localPath')
        }
        const base = await sessionDirectory(ctx, exec)
        const localPath = path.isAbsolute(args.localPath) ? args.localPath : path.resolve(base, args.localPath)
        assertOutsideDataDir(getSettings(), localPath)
        const startedAt = Date.now()
        try {
          const result = await transport.get(args.host, {
            remotePath: args.remotePath,
            localPath,
            recursive: args.recursive === true,
            verify: args.verify === true,
            signal: exec.signal,
          })
          await audit.append({ action: 'get', alias: args.host, ok: true, durationMs: Date.now() - startedAt, note: `${result.remotePath} → ${localPath}` })
          return {
            host: result.host,
            localPath: result.localPath,
            remotePath: result.remotePath,
            bytes: result.bytes ?? 0,
            verified: result.verified === undefined ? undefined : result.verified.match === true,
            transport: transport.name,
          }
        } catch (error) {
          await audit.append({ action: 'get', alias: args.host, ok: false, durationMs: Date.now() - startedAt })
          fail(error, 'SSH 下载失败')
        }
      },
    },
    {
      name: 'ssh_doctor',
      description: '诊断本机 SSH 能力：可用传输层（ssh2 / OpenSSH 版本）、当前生效后端、数据目录、known_hosts 数量、每台主机的认证材料就绪情况与提示。不返回任何密钥内容。',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            active: { type: 'string' },
            platform: { type: 'string' },
            ssh2Available: { type: 'boolean' },
            ssh2Version: { type: 'string' },
            opensshAvailable: { type: 'boolean' },
            opensshVersion: { type: 'string' },
            multiplex: { type: 'boolean' },
            password: { type: 'boolean' },
            knownHostEntries: { type: 'integer' },
            dataDir: { type: 'string' },
            hosts: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  alias: { type: 'string' },
                  auth: { type: 'string' },
                  fingerprint: { type: 'string' },
                  notes: { type: 'array', items: { type: 'string' } },
                },
                required: ['alias', 'auth'],
              },
            },
            hints: { type: 'array', items: { type: 'string' } },
          },
          required: ['active', 'platform', 'ssh2Available', 'opensshAvailable', 'dataDir', 'hints'],
        },
        render: (_args, value) => {
          const lines = [
            `活跃后端：${value.active}（ssh2 ${value.ssh2Available ? `可用 ${value.ssh2Version ?? ''}` : '不可用'}；OpenSSH ${value.opensshAvailable ? `${value.opensshVersion ?? ''} 可用` : '不可用'}）`,
            `平台：${value.platform} · 连接复用：${value.multiplex ? '支持' : '不支持'} · 口令认证：${value.password ? '支持' : '不支持'}`,
            `数据目录：${value.dataDir} · known_hosts 条目：${value.knownHostEntries}`,
            ...value.hosts.map((host) => `  ${host.alias} (${host.auth})${host.fingerprint.length > 0 ? ` 指纹 ${host.fingerprint}` : ' 未记录指纹'}${host.notes.length > 0 ? ` — ${host.notes.join('；')}` : ''}`),
            ...value.hints.map((hint) => `! ${hint}`),
          ]
          return text(lines.join('\n'))
        },
      },
      async execute() {
        const doctor = await transport.doctor()
        return {
          active: doctor.capabilities.active,
          platform: doctor.capabilities.platform,
          ssh2Available: doctor.capabilities.transports.ssh2.available,
          ssh2Version: doctor.capabilities.transports.ssh2.version,
          opensshAvailable: doctor.capabilities.transports.openssh.available,
          opensshVersion: doctor.capabilities.transports.openssh.version,
          multiplex: doctor.capabilities.transports.openssh.multiplex === true,
          password: doctor.capabilities.password,
          knownHostEntries: doctor.knownHosts.entries,
          dataDir: doctor.dataDir,
          hosts: doctor.hosts.map((host) => ({
            alias: host.alias,
            auth: host.auth,
            fingerprint: host.fingerprint ?? '',
            notes: host.notes,
          })),
          hints: doctor.hints,
        }
      },
    },
  ]

  for (const definition of definitions) ctx.effect(() => ctx.tools.register(definition))
}
