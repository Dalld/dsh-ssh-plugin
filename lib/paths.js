/** 路径小工具：`~` 展开与绝对化，两个传输层共用。 */
import os from 'node:os'
import path from 'node:path'

export function expandHome(value) {
  if (typeof value !== 'string' || value.length === 0) return value
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(os.homedir(), value.slice(2))
  return value
}

export function resolveLocalPath(base, value) {
  return path.isAbsolute(value) ? value : path.resolve(base, value)
}
