/**
 * 运行期设置：基础设置来自插件 config（YAML），可写覆盖来自 <dataDir>/settings.json。
 * 面板改的是覆盖层，所以不用改 YAML、不用重启插件。
 *
 * dangerPatterns 支持三种写入：
 *  - 字符串数组：整体替换黑名单；
 *  - null：删掉覆盖层，回落到 config / 内置默认；
 *  - 缺省：不动。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const POLICY_VALUES = new Set(['allow', 'ask', 'deny'])
export const HOST_KEY_POLICIES = new Set(['accept-new', 'strict', 'off'])
export const TRANSPORTS = new Set(['ssh2', 'openssh', 'auto'])

function validatePatterns(value) {
  if (value === null) return null
  if (!Array.isArray(value)) throw new Error('dangerPatterns 必须是字符串数组，或 null 表示恢复默认')
  if (value.length > 200) throw new Error('dangerPatterns 最多 200 条')
  const out = []
  for (const pattern of value) {
    if (typeof pattern !== 'string' || pattern.length === 0) throw new Error('黑名单规则必须是非空字符串')
    if (pattern.length > 500) throw new Error('单条黑名单规则最长 500 字符')
    try {
      new RegExp(pattern, 'u')
    } catch (error) {
      throw new Error(`规则不是合法正则：${pattern}（${error instanceof Error ? error.message : 'syntax'}）`)
    }
    out.push(pattern)
  }
  return out
}

function validatePatch(patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置必须是对象')
  const out = {}
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'hostKeyPolicy') {
      if (!HOST_KEY_POLICIES.has(value)) throw new Error('hostKeyPolicy 只支持 accept-new / strict / off')
      out[key] = value
    } else if (key === 'dangerPolicy') {
      if (!POLICY_VALUES.has(value)) throw new Error('dangerPolicy 只支持 allow / ask / deny')
      out[key] = value
    } else if (key === 'transport') {
      if (!TRANSPORTS.has(value)) throw new Error('transport 只支持 ssh2 / openssh / auto')
      out[key] = value
    } else if (key === 'dangerPatterns') {
      out[key] = validatePatterns(value)
    } else if (key === 'multiplex' || key === 'audit') {
      if (typeof value !== 'boolean') throw new Error(`${key} 必须是布尔值`)
      out[key] = value
    } else {
      throw new Error(`设置项 ${key} 不可在面板里修改`)
    }
  }
  return out
}

export function createSettingsStore(base) {
  const file = path.join(base.dataDir, 'settings.json')
  let overlay = {}
  try {
    const raw = readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) overlay = parsed
  } catch {
    overlay = {}
  }

  const get = () => ({ ...base, ...overlay })

  const set = (patch) => {
    const clean = validatePatch(patch)
    const next = { ...overlay }
    for (const [key, value] of Object.entries(clean)) {
      if (value === null) delete next[key]
      else next[key] = value
    }
    overlay = next
    mkdirSync(base.dataDir, { recursive: true })
    writeFileSync(file, `${JSON.stringify(overlay, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    return get()
  }

  return { get, set, file, overlay: () => ({ ...overlay }) }
}
