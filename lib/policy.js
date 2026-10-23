/**
 * 命令策略：危险命令拦截 + 只读主机的尽力而为写操作拦截。
 *
 * 这里不是沙箱。远端命令最终由远端 shell 解释，任何模式匹配都能被绕过
 * （`rm -r -f`、`$(echo cm0gLXJm)`、脚本文件）。它的作用是挡住误操作和
 * 模型最常见的破坏性命令，并在策略为 ask 时把决定权交回用户。
 */

export const DEFAULT_DANGER_PATTERNS = [
  // —— POSIX / 通用
  String.raw`\brm\s+(-[A-Za-z]*[rf][A-Za-z]*\s+)+`,
  String.raw`\bmkfs(\.\w+)?\b`,
  String.raw`\bdd\b[^\n]*\bof=\/dev\/`,
  String.raw`\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b`,
  String.raw`:\s*\(\s*\)\s*\{[^}]*\}\s*;\s*:`,
  String.raw`\bchmod\s+(-[A-Za-z]*R[A-Za-z]*|--recursive)\s+777\s+\/`,
  String.raw`>\s*\/dev\/sd[a-z]`,
  String.raw`>\s*\/etc\/`,
  String.raw`\bmv\s+\/\s*$`,
  String.raw`\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b`,
  String.raw`\bbase64\b[^\n|]*\|\s*(ba)?sh\b`,
  String.raw`\b(drop|truncate)\s+(database|table)\b`,
  String.raw`\btruncate\s+-s\s*0\b`,
  String.raw`\b(iptables|nft)\s+-F\b`,
  String.raw`\buserdel\b|\bgroupdel\b`,
  // —— Windows / PowerShell（远端可能是 Windows 主机）
  String.raw`\b(Remove-Item|del|erase|rd|rmdir)\b[^;&|]*-(Rec[a-z]*|Force)\b`,
  String.raw`\b(iex|Invoke-Expression)\b`,
  String.raw`\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^;&|]*\|\s*(iex|Invoke-Expression)\b`,
  String.raw`\bSet-ExecutionPolicy\b[^;&|]*\b(Bypass|Unrestricted)\b`,
  String.raw`\b(Format-Volume|Clear-Disk|Initialize-Disk|Stop-Computer|Restart-Computer)\b`,
]

/**
 * 面板里「恢复默认」用的快照。刻意不收录两类规则：
 *  - `.*`：会拦掉一切命令；
 *  - `\$\(`：会拦掉所有命令替换（`echo $(date)` 也被打）。
 * 需要更严的人可以在面板里自己加。
 */
export const DANGER_PATTERN_HINTS = [
  String.raw`\bmv\s+\/\s*$`,
  String.raw`>\s*\/etc\/`,
  String.raw`\bRemove-Item\b[^;&|]*-Recurse`,
]

/** 只读主机上视为"写操作"的模式。同样是尽力而为，不是安全边界。 */
export const DEFAULT_WRITE_PATTERNS = [
  String.raw`(^|[^>])>(?!>)\s*[^\s&]`,
  String.raw`>>\s*[^\s&]`,
  String.raw`\b(rm|mv|cp|dd|touch|mkdir|rmdir|chmod|chown|ln|tee|truncate)\b`,
  String.raw`\bsed\s+-i\b|\bperl\s+-i\b`,
  String.raw`\b(apt|apt-get|yum|dnf|apk|pacman|brew|choco)\b`,
  String.raw`\b(systemctl|service|launchctl)\b`,
  String.raw`\b(kill|pkill|killall)\b`,
  String.raw`\b(pip|npm|yarn|pnpm)\s+(install|add|remove|uninstall)\b`,
  String.raw`\bgit\s+(push|reset|clean|checkout)\b`,
]

function compile(patterns) {
  const compiled = []
  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern, 'u'))
    } catch {
      // 面板里写坏的正则直接忽略，避免整块策略失效
    }
  }
  return compiled
}

const cache = new Map()

function compiledFor(kind, patterns) {
  const key = `${kind}:${patterns.join('\u0000')}`
  if (!cache.has(key)) cache.set(key, compile(patterns))
  return cache.get(key)
}

/**
 * 判定一条命令。
 * @returns {{ level: 'ok' | 'danger' | 'write', pattern?: string }}
 */
export function classifyCommand(command, settings, host) {
  if (typeof command !== 'string' || command.length === 0) return { level: 'ok' }
  const danger = compiledFor('danger', settings.dangerPatterns ?? DEFAULT_DANGER_PATTERNS)
  for (const pattern of danger) {
    if (pattern.test(command)) return { level: 'danger', pattern: pattern.source }
  }
  if (host?.mode === 'readonly') {
    const write = compiledFor('write', settings.writePatterns ?? DEFAULT_WRITE_PATTERNS)
    for (const pattern of write) {
      if (pattern.test(command)) return { level: 'write', pattern: pattern.source }
    }
  }
  return { level: 'ok' }
}
