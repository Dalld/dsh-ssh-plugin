/**
 * OpenSSH known_hosts 格式的读写（不依赖 ssh-keygen / ssh-keyscan）。
 *
 * 只处理本插件自己写入的明文条目：`host keytype base64`。
 * 哈希化条目（|1|...）读得到但匹配不到，属已知限制。
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function fingerprintOfKeyBuffer(keyBuffer) {
  const digest = createHash('sha256').update(keyBuffer).digest('base64').replace(/=+$/u, '')
  return `SHA256:${digest}`
}

export function fingerprintOfBase64(base64) {
  return fingerprintOfKeyBuffer(Buffer.from(base64, 'base64'))
}

export function hostField(host, port) {
  return port === 22 ? host : `[${host}]:${port}`
}

function hostMatches(field, wanted) {
  if (field === wanted) return true
  if (!field.includes('*') && !field.includes('?')) return false
  const pattern = `^${field.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*').replace(/\?/gu, '.')}$`
  try {
    return new RegExp(pattern, 'u').test(wanted)
  } catch {
    return false
  }
}

export function parseKnownHosts(text) {
  const entries = []
  for (const rawLine of String(text).split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith('#')) continue
    if (line.startsWith('|1|') || line.startsWith('@')) continue
    const parts = line.split(/\s+/u)
    if (parts.length < 3) continue
    entries.push({ hosts: parts[0].split(','), type: parts[1], base64: parts[2] })
  }
  return entries
}

export class HostKeyStore {
  constructor({ getSettings }) {
    this.getSettings = getSettings
  }

  get file() {
    return path.join(this.getSettings().dataDir, 'known_hosts')
  }

  async read() {
    try {
      return parseKnownHosts(await readFile(this.file, 'utf8'))
    } catch {
      return []
    }
  }

  async known(host, port) {
    const wanted = hostField(host, port)
    const entries = await this.read()
    for (const entry of entries) {
      if (entry.hosts.some((field) => hostMatches(field, wanted))) return fingerprintOfBase64(entry.base64)
    }
    return ''
  }

  async record(host, port, type, base64) {
    const field = hostField(host, port)
    const entries = await this.read()
    const lines = entries.map((entry) => `${entry.hosts.join(',')} ${entry.type} ${entry.base64}`)
    const line = `${field} ${type} ${base64}`
    const filtered = lines.filter((existing) => {
      const [fields, existingType] = existing.split(/\s+/u)
      return !(existingType === type && fields.split(',').some((candidate) => hostMatches(candidate, field)))
    })
    filtered.push(line)
    await mkdir(this.getSettings().dataDir, { recursive: true })
    await writeFile(this.file, `${filtered.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
    return fingerprintOfBase64(base64)
  }

  async forget(host, port) {
    const field = hostField(host, port)
    const entries = await this.read()
    const kept = entries.filter((entry) => !entry.hosts.some((candidate) => hostMatches(candidate, field)))
    const removed = entries.length - kept.length
    if (removed > 0) {
      await mkdir(this.getSettings().dataDir, { recursive: true })
      const body = kept.length === 0 ? '' : `${kept.map((entry) => `${entry.hosts.join(',')} ${entry.type} ${entry.base64}`).join('\n')}\n`
      await writeFile(this.file, body, { encoding: 'utf8', mode: 0o600 })
    }
    return removed
  }
}
