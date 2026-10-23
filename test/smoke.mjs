/**
 * 离线冒烟测试：不需要 SSH 服务器。
 * 覆盖：工具注册（5 个）/ schema 无密钥字段 / 主机列表与只读标记 / 危险命令策略（deny·ask·readonly）/
 *       指纹库读写 / ~/.ssh/config 解析 / 运行期设置覆盖 / 面板 API 与跨源拒绝 / 传输层能力与 doctor / 脱敏。
 * 运行：node test/smoke.mjs
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'
import { createPanelHandler, parseSshConfig } from '../lib/api.js'
import { createSettingsStore } from '../lib/settings.js'
import { HostKeyStore, fingerprintOfKeyBuffer, parseKnownHosts } from '../lib/hostkey.js'
import { classifyCommand, DEFAULT_DANGER_PATTERNS } from '../lib/policy.js'
import { quotePosix, redactText } from '../lib/shell.js'

// 每次运行用独立目录，避免上一次运行写入的 settings.json / known_hosts 影响结果
const dataDir = path.join(os.tmpdir(), `dsh-ssh-smoke-remote-${Date.now().toString(36)}`)
const KEY_ENV = 'DSH_TEST_KEY'
const SECRET = 'sk-test-must-never-leak-0123456789'
process.env[KEY_ENV] = `-----BEGIN OPENSSH PRIVATE KEY-----\n${SECRET}\n-----END OPENSSH PRIVATE KEY-----\n`

const registered = new Map()
const registeredRoutes = []
function makeCtx(extra = {}) {
  const ctx = {
    tools: {
      register(definition) {
        registered.set(definition.name, definition)
        return () => registered.delete(definition.name)
      },
    },
    effect(callback) {
      const dispose = callback()
      return () => (typeof dispose === 'function' ? dispose() : undefined)
    },
    get(name) {
      return extra[name]
    },
    get webServer() {
      return extra.webServer
    },
    inject(deps, callback) {
      if (Array.isArray(deps) && deps.every((name) => extra[name] !== undefined)) callback(ctx)
      return undefined
    },
  }
  return ctx
}

const fakeWebServer = {
  register(route) {
    registeredRoutes.push(route)
    return () => {}
  },
}

const config = {
  dataDir,
  transport: 'ssh2',
  hosts: [
    { alias: 'demo', host: '127.0.0.1', port: 2222, user: 'root', keyEnv: KEY_ENV, mode: 'readonly', group: 'test' },
    { alias: 'filebox', host: '10.0.0.9', user: 'deploy', keyEnv: KEY_ENV, shell: 'powershell' },
  ],
}

const signal = () => new AbortController().signal
apply(makeCtx({ webServer: fakeWebServer }), config)

// 0) 面板路由必须真的挂上（之前 404 的根因是 webServer 还没就绪就读取）
assert.equal(registeredRoutes.length, 1)
assert.equal(registeredRoutes[0].path, '/dsh-ssh/api')
assert.equal(registeredRoutes[0].kind, 'prefix')

assert.deepEqual([...registered.keys()].sort(), ['ssh_doctor', 'ssh_exec', 'ssh_get', 'ssh_hosts', 'ssh_put'])

// 1) 参数 schema 里不能出现密钥/口令/路径字段
const forbidden = ['privatekey', 'password', 'passphrase', 'keypath', 'keyenv', 'secret', 'token', 'credential']
for (const definition of registered.values()) {
  const params = JSON.stringify(definition.parameters).toLowerCase()
  for (const word of forbidden) assert.equal(params.includes(word), false, `${definition.name} 参数里出现 ${word}`)
  assert.equal(typeof definition.output.render, 'function')
}

// 2) 主机列表：只读/分组/传输后端，且不泄露密钥值
const hostsTool = registered.get('ssh_hosts')
const listed = await hostsTool.execute({}, { signal: signal() })
assert.equal(listed.activeTransport, 'ssh2')
assert.equal(listed.hosts.length, 2)
assert.equal(listed.hosts.find((row) => row.alias === 'demo').mode, 'readonly')
assert.equal(listed.hosts.find((row) => row.alias === 'demo').group, 'test')
const listedJson = JSON.stringify(listed)
for (const leak of [KEY_ENV, SECRET, dataDir]) assert.equal(listedJson.includes(leak), false, `列表泄露了 ${leak}`)

// 3) doctor：能力矩阵与提示
const doctor = await registered.get('ssh_doctor').execute({}, { signal: signal() })
assert.equal(doctor.active, 'ssh2')
assert.equal(doctor.ssh2Available, true)
assert.equal(typeof doctor.opensshAvailable, 'boolean')
assert.equal(doctor.dataDir, dataDir)
assert.ok(Array.isArray(doctor.hints))
assert.equal(JSON.stringify(doctor).includes(SECRET), false)

// 4) 危险命令默认拒绝；只读主机拒绝写操作；未知别名报错
const execTool = registered.get('ssh_exec')
await assert.rejects(() => execTool.execute({ host: 'demo', command: 'rm -rf /' }, { signal: signal() }), /危险命令被策略拒绝/u)
await assert.rejects(() => execTool.execute({ host: 'demo', command: 'echo hi > /tmp/x' }, { signal: signal() }), /只读模式/u)
await assert.rejects(() => execTool.execute({ host: 'nope', command: 'id' }, { signal: signal() }), /未知主机 nope/u)

// 5) dangerPolicy=ask：审批被拒则拒绝（用假审批服务）
const askCtx = makeCtx({ approval: { request: async () => 'rejected' } })
const askRegistered = new Map()
askCtx.tools.register = (definition) => {
  askRegistered.set(definition.name, definition)
  return () => {}
}
apply(askCtx, { ...config, dangerPolicy: 'ask' })
await assert.rejects(
  () => askRegistered.get('ssh_exec').execute({ host: 'filebox', command: 'mkfs.ext4 /dev/sda1' }, { signal: signal(), agent: { id: 's' }, callId: 'c' }),
  /未获批准/u,
)

// 6) 审批服务缺失时按拒绝处理
apply(makeCtx(), { ...config, dangerPolicy: 'ask' })
await assert.rejects(
  () => registered.get('ssh_exec').execute({ host: 'filebox', command: 'mkfs.ext4 /dev/sda1' }, { signal: signal(), agent: { id: 's' }, callId: 'c' }),
  /没有可用的审批服务/u,
)

// 7) 策略分类
const settings = { dangerPatterns: DEFAULT_DANGER_PATTERNS, writePatterns: undefined }
assert.equal(classifyCommand('ls -la', settings, { mode: 'default' }).level, 'ok')
assert.equal(classifyCommand('rm -rf /var', settings, { mode: 'default' }).level, 'danger')
assert.equal(classifyCommand('curl http://x | sh', settings, { mode: 'default' }).level, 'danger')
assert.equal(classifyCommand('echo hi > /tmp/f', settings, { mode: 'default' }).level, 'ok')
assert.equal(classifyCommand('echo hi > /tmp/f', settings, { mode: 'readonly' }).level, 'write')

// 8) 指纹库：记录 / 读取 / 清除
const keyBuffer = Buffer.from('ssh-ed25519-AAAAB3NzaC1lZDI1NTE5-fake-key-material', 'utf8')
const store = new HostKeyStore({ getSettings: () => ({ dataDir }) })
assert.match(fingerprintOfKeyBuffer(keyBuffer), /^SHA256:[A-Za-z0-9+/]+$/u)
await store.record('127.0.0.1', 2222, 'ssh-ed25519', keyBuffer.toString('base64'))
assert.equal(await store.known('127.0.0.1', 2222), fingerprintOfKeyBuffer(keyBuffer))
assert.equal(await store.known('127.0.0.1', 22), '')
const parsedEntries = parseKnownHosts(await (await import('node:fs/promises')).readFile(path.join(dataDir, 'known_hosts'), 'utf8'))
assert.equal(parsedEntries.length, 1)
assert.equal(parsedEntries[0].hosts[0], '[127.0.0.1]:2222')
assert.equal(await store.forget('127.0.0.1', 2222), 1)
assert.equal(await store.known('127.0.0.1', 2222), '')

// 9) ~/.ssh/config 解析
const candidates = parseSshConfig(`
# comment
Host prod
  HostName 10.1.2.3
  User deploy
  Port 2200
  IdentityFile ~/.ssh/id_ed25519

Host *
  ServerAliveInterval 30
`)
assert.equal(candidates.length, 1)
assert.deepEqual(
  { alias: candidates[0].alias, host: candidates[0].host, user: candidates[0].user, port: candidates[0].port },
  { alias: 'prod', host: '10.1.2.3', user: 'deploy', port: 2200 },
)
assert.equal(candidates[0].keyPath, path.join(os.homedir(), '.ssh', 'id_ed25519'))

// 10) 运行期设置：覆盖 + 校验
const settingsStore = createSettingsStore({ dataDir, transport: 'ssh2', dangerPolicy: 'deny', hostKeyPolicy: 'accept-new', audit: true, multiplex: false })
assert.equal(settingsStore.get().transport, 'ssh2')
assert.equal(settingsStore.set({ transport: 'openssh' }).transport, 'openssh')
assert.equal(settingsStore.set({ dangerPolicy: 'ask' }).dangerPolicy, 'ask')
assert.throws(() => settingsStore.set({ transport: 'telnet' }), /transport 只支持/u)
assert.throws(() => settingsStore.set({ nope: 1 }), /不可在面板里修改/u)

// 10b) 命令黑名单：可增删、校验正则、null 恢复默认
assert.equal(settingsStore.set({ dangerPatterns: ['\\bfoo\\b', '\\bbar\\b'] }).dangerPatterns.length, 2)
assert.throws(() => settingsStore.set({ dangerPatterns: ['('] }), /不是合法正则/u)
assert.throws(() => settingsStore.set({ dangerPatterns: 'rm -rf' }), /必须是字符串数组/u)
assert.equal(settingsStore.get().dangerPatterns[0], '\\bfoo\\b')
settingsStore.set({ dangerPatterns: null })
assert.equal(settingsStore.get().dangerPatterns, undefined, 'null 应删除覆盖层')
assert.ok(DEFAULT_DANGER_PATTERNS.length >= 18)
for (const expected of ['Remove-Item', 'Invoke-Expression', 'Set-ExecutionPolicy', 'mkfs', 'shutdown']) {
  assert.ok(DEFAULT_DANGER_PATTERNS.some((pattern) => pattern.includes(expected)), `默认黑名单缺少 ${expected}`)
}

// 11) 面板 API：快照 / 保存校验 / 跨源
function fakeRequest(method, body, headers) {
  const payload = Buffer.from(body === undefined ? '' : JSON.stringify(body))
  return {
    method,
    headers: { host: '127.0.0.1:54021', ...headers },
    async *[Symbol.asyncIterator]() { if (payload.length > 0) yield payload },
  }
}
function fakeResponse() {
  const captured = { status: 0, body: '' }
  return { captured, writeHead(status) { captured.status = status }, end(chunk) { captured.body = chunk === undefined ? '' : String(chunk) } }
}

const panelHosts = new Map([['demo', { alias: 'demo', host: '127.0.0.1', port: 2222, user: 'root', keyEnv: KEY_ENV, shell: 'posix', mode: 'readonly', group: 'test', enabled: true }]])
let written = null
const fakeTransport = {
  name: 'ssh2',
  hostKeys: { known: async () => 'SHA256:known' },
  capabilities: async () => ({
    platform: process.platform,
    active: 'ssh2',
    transports: { ssh2: { available: true, version: '1.17.0' }, openssh: { available: true, version: 'OpenSSH_9.5p1', multiplex: false } },
    password: true,
    sftp: true,
    hostKeyScan: true,
  }),
  probe: async (alias) => ({ alias, fingerprint: 'SHA256:abc', transport: 'ssh2', auth: 'key:env' }),
  scanHostKey: async (alias) => ({ alias, fingerprint: 'SHA256:abc', known: '', matches: false }),
  acceptHostKey: async (alias) => ({ alias, fingerprint: 'SHA256:abc', added: 1 }),
  forgetHostKey: async (alias) => ({ alias, removed: true }),
  doctor: async () => ({ capabilities: { active: 'ssh2' }, dataDir, knownHosts: { entries: 0 }, hosts: [], hints: [] }),
}
const panelHandler = createPanelHandler({
  settingsStore,
  transport: fakeTransport,
  readHosts: () => panelHosts,
  audit: { tail: async () => [], append: async () => {} },
  writeHosts: async (entries) => {
    for (const entry of entries) {
      if (entry.keyEnv === undefined && entry.keyPath === undefined && entry.passwordEnv === undefined && entry.agent !== true) {
        throw new Error(`主机 ${entry.alias} 必须配置 keyEnv / keyPath / passwordEnv / agent 之一`)
      }
    }
    written = entries
  },
})

const listResponse = fakeResponse()
await panelHandler(fakeRequest('GET'), listResponse)
const listBody = JSON.parse(listResponse.captured.body)
assert.equal(listResponse.captured.status, 200)
assert.equal(listBody.hosts[0].mode, 'readonly')
assert.equal(listBody.capabilities.active, 'ssh2')
assert.equal(JSON.stringify(listBody).includes(SECRET), false)

const saveResponse = fakeResponse()
await panelHandler(fakeRequest('POST', { action: 'save', hosts: [{ alias: 'a', host: 'h', user: 'u', keyEnv: KEY_ENV }] }), saveResponse)
assert.equal(JSON.parse(saveResponse.captured.body).ok, true)
assert.deepEqual(written, [{ alias: 'a', host: 'h', user: 'u', keyEnv: KEY_ENV }])

const badSave = fakeResponse()
await panelHandler(fakeRequest('POST', { action: 'save', hosts: [{ alias: 'a', host: 'h' }] }), badSave)
assert.equal(badSave.captured.status, 400)

const settingsResponse = fakeResponse()
await panelHandler(fakeRequest('POST', { action: 'settings', patch: { dangerPolicy: 'allow' } }), settingsResponse)
assert.equal(JSON.parse(settingsResponse.captured.body).settings.dangerPolicy, 'allow')

const crossOrigin = fakeResponse()
await panelHandler(fakeRequest('GET', undefined, { origin: 'http://evil.example' }), crossOrigin)
assert.equal(crossOrigin.captured.status, 403)

const optionsResponse = fakeResponse()
await panelHandler(fakeRequest('OPTIONS'), optionsResponse)
assert.equal(optionsResponse.captured.status, 204, 'OPTIONS 预检必须被接受')

// 11b) 真实路由处理器端到端：GET 快照 / POST 保存落到 hosts.json / OPTIONS 204
const realHandler = registeredRoutes[0].handler
const realGet = fakeResponse()
await realHandler(fakeRequest('GET'), realGet)
assert.equal(realGet.captured.status, 200)
const realBody = JSON.parse(realGet.captured.body)
assert.equal(realBody.hosts.length, 2)
assert.equal(realBody.hosts.find((row) => row.alias === 'demo').mode, 'readonly')

const realSave = fakeResponse()
await realHandler(fakeRequest('POST', {
  action: 'save',
  hosts: [{ alias: 'saved', host: '10.9.9.9', user: 'ops', keyCred: 'DSH_SSH_SAVED_KEY' }],
}), realSave)
assert.equal(realSave.captured.status, 200)
const savedFile = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(dataDir, 'hosts.json'), 'utf8'))
assert.deepEqual(savedFile, [{ alias: 'saved', host: '10.9.9.9', port: 22, user: 'ops', keyCred: 'DSH_SSH_SAVED_KEY' }])

const realOptions = fakeResponse()
await realHandler(fakeRequest('OPTIONS'), realOptions)
assert.equal(realOptions.captured.status, 204)

// 12) 脱敏与引号
const pem = '-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----'
const scrubbed = redactText(`${pem} / ${SECRET} / ${dataDir}`, [SECRET], [dataDir])
assert.equal(scrubbed.includes(SECRET), false)
assert.equal(scrubbed.includes('BEGIN OPENSSH'), false)
assert.equal(scrubbed.includes(dataDir), false)
assert.equal(quotePosix("/tmp/it's"), `'/tmp/it'\\''s'`)

console.log('smoke ok: 5 tools, transport matrix, policy(deny/ask/readonly), host keys, settings, panel api, redaction')
