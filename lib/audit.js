/**
 * 审计日志：<dataDir>/audit.jsonl（0600）。
 * 只记录动作、目标、退出码、耗时与（脱敏后的）命令，绝不记录密钥或口令。
 * 文件超过上限时保留最近 N 条（重写自己的日志文件）。
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const MAX_BYTES = 2 * 1024 * 1024
const KEEP_ENTRIES = 500

export function createAudit({ getSettings, redact }) {
  const fileOf = () => path.join(getSettings().dataDir, 'audit.jsonl')

  async function append(record) {
    if (getSettings().audit === false) return
    const settings = getSettings()
    await mkdir(settings.dataDir, { recursive: true })
    const entry = {
      ts: new Date().toISOString(),
      action: record.action,
      alias: record.alias,
      target: record.target,
      exitCode: record.exitCode ?? null,
      ok: record.ok !== false,
      durationMs: record.durationMs ?? null,
      note: record.note === undefined ? undefined : redact(record.note),
    }
    const line = `${JSON.stringify(entry)}\n`
    await appendFile(fileOf(), line, { encoding: 'utf8', mode: 0o600 })
    await trim()
  }

  async function trim() {
    try {
      const info = await readFile(fileOf(), 'utf8')
      if (info.length <= MAX_BYTES) return
      const lines = info.split(/\r?\n/u).filter((line) => line.trim().length > 0)
      const kept = lines.slice(-KEEP_ENTRIES)
      await writeFile(fileOf(), `${kept.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 })
    } catch {
      // 日志问题不影响主流程
    }
  }

  async function tail(limit = 50) {
    try {
      const raw = await readFile(fileOf(), 'utf8')
      const lines = raw.split(/\r?\n/u).filter((line) => line.trim().length > 0).slice(-Math.max(1, Math.min(limit, 500)))
      return lines.map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return { ts: '', action: 'parse-error', note: line.slice(0, 200) }
        }
      }).reverse()
    } catch {
      return []
    }
  }

  return { append, tail, fileOf }
}
