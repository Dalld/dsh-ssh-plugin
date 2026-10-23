// dsh-ssh 前端半区：侧栏图标 + 主机管理面板（列表 / 详情双栏）。
// 只与 Host 侧 /dsh-ssh/api 通信；密钥内容不经过浏览器存储。
window.__ModuleLoader__.load({
  id: 'dsh-ssh-remote',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const CSS = `
.ssh-page { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-size:13px; line-height:1.5; }
.ssh-top { display:flex; align-items:center; gap:10px; padding:14px 22px; border-bottom:1px solid var(--dsw-alias-border-l1); flex:0 0 auto; }
.ssh-brand { display:flex; align-items:center; gap:9px; min-width:0; }
.ssh-title { margin:0; font-size:14px; font-weight:600; }
.ssh-meta { color:var(--dsw-alias-label-secondary); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ssh-search { margin-left:auto; width:200px; }
.ssh-banner { margin:12px 22px 0; padding:8px 12px; border-radius:9px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); font-size:12px; white-space:pre-wrap; word-break:break-word; }
.ssh-banner-ok { border-color:var(--dsw-alias-state-success-primary); }
.ssh-banner-err { border-color:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-state-error-primary); }
.ssh-main { flex:1; min-height:0; display:grid; grid-template-columns:292px minmax(0,1fr); }
.ssh-aside { border-right:1px solid var(--dsw-alias-border-l1); overflow:auto; padding:12px 10px; display:flex; flex-direction:column; gap:8px; }
.ssh-pane { overflow:auto; padding:18px 22px 28px; display:flex; flex-direction:column; gap:14px; min-width:0; }
.ssh-chips { display:flex; gap:6px; flex-wrap:wrap; padding:2px 4px 6px; }
.ssh-chip { font-size:11px; padding:2px 9px; border-radius:999px; border:1px solid var(--dsw-alias-border-l1); background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; }
.ssh-chip:hover { border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); }
.ssh-chip-on { border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-brand-primary); }
.ssh-row { display:grid; grid-template-columns:7px minmax(0,1fr) auto; gap:9px; align-items:center; padding:8px 10px; border-radius:9px; border:1px solid transparent; background:transparent; cursor:pointer; text-align:left; font:inherit; color:inherit; width:100%; }
.ssh-row:hover { background:var(--dsw-alias-bg-layer-1); }
.ssh-row-on { background:var(--dsw-alias-bg-layer-1); border-color:var(--dsw-alias-border-l2); }
.ssh-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-state-idle-primary); }
.ssh-dot-ok { background:var(--dsw-alias-state-success-primary); }
.ssh-row-name { font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ssh-row-sub { color:var(--dsw-alias-label-secondary); font-size:11px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ssh-row-side { font-size:10px; color:var(--dsw-alias-label-secondary); }
.ssh-card { border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); padding:15px 16px; display:flex; flex-direction:column; gap:12px; }
.ssh-card-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ssh-card-title { font-size:13px; font-weight:600; }
.ssh-card-actions { margin-left:auto; display:flex; gap:7px; flex-wrap:wrap; }
.ssh-kv { display:grid; grid-template-columns:84px minmax(0,1fr); gap:7px 12px; align-items:center; font-size:12px; }
.ssh-kv-k { color:var(--dsw-alias-label-secondary); }
.ssh-kv-v { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11.5px; word-break:break-all; }
.ssh-tag { font-size:11px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:1px 8px; color:var(--dsw-alias-label-secondary); white-space:nowrap; }
.ssh-tag-ro { border-color:var(--dsw-alias-state-warn-primary); color:var(--dsw-alias-state-warn-primary); }
.ssh-tag-cfg { border-color:var(--dsw-alias-border-l2); color:var(--dsw-alias-label-primary); }
.ssh-btn { font:inherit; font-size:12px; padding:5px 11px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); cursor:pointer; white-space:nowrap; }
.ssh-btn:hover { border-color:var(--dsw-alias-border-l2); }
.ssh-btn:disabled { opacity:.45; cursor:default; }
.ssh-btn-primary { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); color:var(--dsw-alias-bg-base); }
.ssh-btn-danger { color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-border-l1); }
.ssh-btn-danger:hover { border-color:var(--dsw-alias-state-error-primary); }
.ssh-form { display:grid; grid-template-columns:92px minmax(0,1fr); gap:9px 12px; align-items:center; }
.ssh-form > label { font-size:12px; color:var(--dsw-alias-label-secondary); }
.ssh-input { font:inherit; font-size:12px; padding:6px 9px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); width:100%; box-sizing:border-box; }
.ssh-input:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
.ssh-hint { font-size:11px; color:var(--dsw-alias-label-secondary); }
.ssh-warn { color:var(--dsw-alias-state-warn-primary); }
.ssh-empty { padding:36px 8px; text-align:center; color:var(--dsw-alias-label-secondary); font-size:12px; }
.ssh-details { border:1px solid var(--dsw-alias-border-l1); border-radius:12px; background:var(--dsw-alias-bg-layer-1); }
.ssh-details > summary { cursor:pointer; padding:12px 16px; font-size:12.5px; list-style:none; display:flex; align-items:center; gap:8px; }
.ssh-details > summary::-webkit-details-marker { display:none; }
.ssh-details > summary::before { content:'›'; color:var(--dsw-alias-label-secondary); }
.ssh-details[open] > summary::before { content:'⌄'; }
.ssh-details-body { padding:2px 16px 16px; display:flex; flex-direction:column; gap:10px; }
.ssh-audit { display:flex; flex-direction:column; gap:3px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; color:var(--dsw-alias-label-secondary); }
.ssh-log { margin:0; padding:10px 12px; border-radius:9px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; line-height:1.55; color:var(--dsw-alias-label-secondary); max-height:220px; overflow:auto; white-space:pre-wrap; word-break:break-all; }
.ssh-inline { display:flex; gap:8px; align-items:center; }
.ssh-patterns { display:flex; flex-direction:column; gap:5px; max-height:300px; overflow:auto; }
.ssh-pattern { display:grid; grid-template-columns:minmax(0,1fr) 24px; gap:8px; align-items:center; padding:5px 9px; border-radius:8px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); }
.ssh-pattern code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; color:var(--dsw-alias-label-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ssh-pattern-x { border:none; background:transparent; color:var(--dsw-alias-label-secondary); cursor:pointer; font-size:12px; padding:0; }
.ssh-pattern-x:hover { color:var(--dsw-alias-state-error-primary); }
.ssh-foot { padding:0 22px 14px; color:var(--dsw-alias-label-secondary); font-size:11px; word-break:break-all; }
@media (max-width: 900px) { .ssh-main { grid-template-columns:1fr; } .ssh-aside { border-right:none; border-bottom:1px solid var(--dsw-alias-border-l1); max-height:38%; } }
`

    function api(path) {
      const relative = path.replace(/^\/+/, '')
      if (typeof document === 'undefined') return `/${relative}`
      return new URL(relative, document.baseURI).pathname
    }

    async function call(body) {
      const response = await fetch(api('/dsh-ssh/api'), {
        method: body === undefined ? 'GET' : 'POST',
        cache: 'no-store',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }))
      if (payload.ok !== true) throw new Error(typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`)
      return payload
    }

    function SshIcon({ size, active }) {
      const tint = active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)'
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { x: 2.5, y: 4.5, width: 19, height: 13, rx: 2.5, fill: 'none', stroke: tint, strokeWidth: 1.6 }),
        h('path', { d: 'M6 9.5l2.6 2.2L6 13.9', fill: 'none', stroke: tint, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M11 14h4', stroke: tint, strokeWidth: 1.6, strokeLinecap: 'round' }),
        h('circle', { cx: 17.5, cy: 19, r: 3, fill: 'none', stroke: tint, strokeWidth: 1.4 }),
        h('path', { d: 'M17.5 16v-1.6', stroke: tint, strokeWidth: 1.4 }))
    }

    const EMPTY_DRAFT = { alias: '', host: '', port: '22', user: 'root', mode: 'keyCred', value: '', shell: 'posix', hostMode: 'default', group: '', defaultCwd: '' }
    const SECRET_MODES = new Set(['keyCred', 'passwordCred'])
    const AUTH_LABEL = {
      'key:cred': '私钥（凭据库）',
      'password:cred': '密码（凭据库）',
      'key:env': '私钥（环境变量）',
      'key:file': '私钥（文件）',
      'password:env': '密码（环境变量）',
      agent: 'ssh-agent',
    }

    function authModeOf(host) {
      if (host.auth === 'key:env') return 'keyEnv'
      if (host.auth === 'key:file') return 'keyPath'
      if (host.auth === 'key:cred') return 'keyCred'
      if (host.auth === 'agent') return 'agent'
      if (host.auth === 'password:cred') return 'passwordCred'
      return 'passwordEnv'
    }

    function draftFromHost(host) {
      const mode = authModeOf(host)
      return {
        alias: host.alias, host: host.host, port: String(host.port), user: host.user, mode,
        value: SECRET_MODES.has(mode) ? '' : (host.authDetail ?? ''),
        existingRef: SECRET_MODES.has(mode) ? (host.authDetail ?? '') : '',
        shell: host.shell ?? 'posix', hostMode: host.mode ?? 'default',
        group: host.group ?? '', defaultCwd: host.defaultCwd ?? '', editing: host.alias,
      }
    }

    function draftToEntry(draft, secretRef) {
      const entry = {
        alias: draft.alias.trim(),
        host: draft.host.trim(),
        port: Number(draft.port) || 22,
        user: draft.user.trim(),
        ...(draft.shell === 'posix' ? {} : { shell: draft.shell }),
        ...(draft.hostMode === 'default' ? {} : { mode: draft.hostMode }),
        ...(draft.group.trim().length === 0 ? {} : { group: draft.group.trim() }),
        ...(draft.defaultCwd.trim().length === 0 ? {} : { defaultCwd: draft.defaultCwd.trim() }),
      }
      const value = draft.value.trim()
      if (draft.mode === 'keyEnv') entry.keyEnv = value
      else if (draft.mode === 'keyPath') entry.keyPath = value
      else if (draft.mode === 'passwordEnv') entry.passwordEnv = value
      else if (draft.mode === 'keyCred') entry.keyCred = secretRef ?? draft.existingRef ?? ''
      else if (draft.mode === 'passwordCred') entry.passwordCred = secretRef ?? draft.existingRef ?? ''
      else entry.agent = true
      return entry
    }

    function cleanForSave(host) {
      const copy = { ...host }
      for (const key of ['source', 'auth', 'authDetail', 'fingerprint']) delete copy[key]
      return copy
    }

    function Field({ label, children }) {
      return h(React.Fragment, null, h('label', null, label), children)
    }

    function SshPanel() {
      const [state, setState] = useState({ loading: true, error: '', data: null, audit: [] })
      const [notice, setNotice] = useState(null)
      const [draft, setDraft] = useState(null)
      const [busy, setBusy] = useState(false)
      const [search, setSearch] = useState('')
      const [group, setGroup] = useState('')
      const [selected, setSelected] = useState('')
      const [imports, setImports] = useState(null)
      const [probeLog, setProbeLog] = useState(null)
      const [patternDraft, setPatternDraft] = useState('')

      const applyPayload = useCallback((payload) => {
        setState((prev) => ({ loading: false, error: '', data: payload, audit: payload.audit ?? prev.audit }))
      }, [])

      const refresh = useCallback(async () => {
        setState((prev) => ({ ...prev, loading: true, error: '' }))
        try {
          applyPayload(await call())
        } catch (error) {
          setState({ loading: false, error: error instanceof Error ? error.message : String(error), data: null, audit: [] })
        }
      }, [applyPayload])

      useEffect(() => { refresh() }, [refresh])

      const data = state.data
      const hosts = data?.hosts ?? []
      const caps = data?.capabilities
      const settings = data?.settings
      const editable = hosts.filter((host) => host.source === 'file')
      const groups = useMemo(() => [...new Set(hosts.map((host) => host.group).filter((value) => value.length > 0))], [hosts])

      const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase()
        return hosts.filter((host) => {
          if (group.length > 0 && host.group !== group) return false
          if (needle.length === 0) return true
          return [host.alias, host.host, host.user, host.group, host.auth].join(' ').toLowerCase().includes(needle)
        })
      }, [hosts, search, group])

      const selectedHost = hosts.find((host) => host.alias === selected) ?? null

      const run = useCallback(async (body, okText) => {
        setBusy(true)
        try {
          const payload = await call(body)
          if (payload.hosts !== undefined) applyPayload({ ...data, ...payload, audit: state.audit })
          setNotice({ ok: true, text: typeof okText === 'function' ? okText(payload) : okText })
          return payload
        } catch (error) {
          setNotice({ ok: false, text: error instanceof Error ? error.message : String(error) })
          return null
        } finally {
          setBusy(false)
        }
      }, [applyPayload, data, state.audit])

      const save = useCallback(async (entries, okText) => {
        const payload = await run({ action: 'save', hosts: entries }, okText)
        if (payload !== null) setDraft(null)
        return payload
      }, [run])

      const patchSettings = useCallback(async (patch) => {
        await run({ action: 'settings', patch }, `已更新：${Object.keys(patch).join(', ')}`)
      }, [run])

      const onProbe = useCallback(async (alias) => {
        setBusy(true)
        try {
          const payload = await call({ action: 'probe', alias })
          setProbeLog({ alias, transport: payload.transport, durationMs: payload.durationMs ?? null, lines: payload.log ?? [] })
          setNotice({ ok: true, text: `${alias} 连接正常 · ${payload.transport} · ${payload.durationMs ?? '?'}ms` })
          await refresh()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          setProbeLog({ alias, transport: '-', durationMs: null, lines: [`连接失败：${message}`] })
          setNotice({ ok: false, text: `${alias} 连接失败：${message}` })
        } finally {
          setBusy(false)
        }
      }, [refresh])

      const patterns = settings?.dangerPatterns ?? []

      const savePatterns = useCallback(async (next, okText) => {
        await patchSettings({ dangerPatterns: next })
        if (okText !== undefined) setNotice({ ok: true, text: okText })
      }, [patchSettings])

      const addPattern = useCallback(async () => {
        const pattern = patternDraft.trim()
        if (pattern.length === 0) return
        try {
          new RegExp(pattern, 'u')
        } catch (error) {
          setNotice({ ok: false, text: `不是合法正则：${error instanceof Error ? error.message : 'syntax'}` })
          return
        }
        if (patterns.includes(pattern)) { setNotice({ ok: false, text: '这条规则已存在' }); return }
        setPatternDraft('')
        await savePatterns([...patterns, pattern], `已添加黑名单规则`)
      }, [patternDraft, patterns, savePatterns])

      const removePattern = useCallback(async (index) => {
        await savePatterns(patterns.filter((_, position) => position !== index), '已删除一条规则')
      }, [patterns, savePatterns])

      const secretMissing = (value) => draft !== null && SECRET_MODES.has(draft.mode)
        && String(value ?? '').trim().length === 0 && (draft.existingRef ?? '').length === 0

      const onTestDraft = useCallback(async () => {
        if (draft === null) return
        if (secretMissing(draft.value)) { setNotice({ ok: false, text: '请先填写私钥或密码，再测试' }); return }
        setBusy(true)
        try {
          const host = draftToEntry(draft, SECRET_MODES.has(draft.mode) ? (draft.existingRef || undefined) : undefined)
          const payload = await call({ action: 'probeDraft', host })
          setNotice({ ok: true, text: `测试成功：${payload.fingerprint.length > 0 ? payload.fingerprint : '未记录指纹'} · ${payload.transport} · ${payload.auth}` })
        } catch (error) {
          setNotice({ ok: false, text: `测试失败：${error instanceof Error ? error.message : String(error)}` })
        } finally {
          setBusy(false)
        }
      }, [draft])

      const onSaveDraft = useCallback(async () => {
        if (draft === null) return
        if (secretMissing(draft.value)) { setNotice({ ok: false, text: '请先填写私钥或密码，或改用 keyEnv / keyPath / agent' }); return }
        let secretRef
        if (SECRET_MODES.has(draft.mode) && draft.value.trim().length > 0) {
          setBusy(true)
          try {
            const stored = await call({ action: 'setSecret', alias: draft.alias.trim(), kind: draft.mode === 'keyCred' ? 'key' : 'password', value: draft.value })
            secretRef = stored.ref
          } catch (error) {
            setNotice({ ok: false, text: `保存密钥失败：${error instanceof Error ? error.message : String(error)}` })
            setBusy(false)
            return
          } finally {
            setBusy(false)
          }
        }
        const entry = draftToEntry(draft, secretRef)
        const others = editable.filter((host) => host.alias !== (draft.editing ?? entry.alias)).map(cleanForSave)
        const payload = await save([...others, entry], `已保存 ${entry.alias}`)
        if (payload !== null) setSelected(entry.alias)
      }, [draft, editable, save])

      const onRemove = useCallback(async (alias) => {
        const payload = await save(editable.filter((host) => host.alias !== alias).map(cleanForSave), `已删除 ${alias}`)
        if (payload !== null) setSelected('')
      }, [editable, save])

      const onImport = useCallback(async () => {
        const payload = await run({ action: 'importSshConfig' }, (result) => `发现 ${result.candidates.length} 个 Host 条目`)
        if (payload !== null) setImports(payload.candidates)
      }, [run])

      const applyImports = useCallback(async () => {
        if (imports === null || imports.length === 0) return
        const existing = new Set(editable.map((host) => host.alias))
        const additions = imports
          .filter((candidate) => !existing.has(candidate.alias) && candidate.keyPath !== undefined)
          .map((candidate) => ({
            alias: candidate.alias, host: candidate.host, port: candidate.port, user: candidate.user,
            keyPath: candidate.keyPath, ...(candidate.shell === 'posix' ? {} : { shell: candidate.shell }),
          }))
        await save([...editable.map(cleanForSave), ...additions], `已导入 ${additions.length} 台主机`)
        setImports(null)
      }, [imports, editable, save])

      const fieldInput = (key, options = {}) => h('input', {
        className: 'ssh-input',
        type: options.type ?? 'text',
        placeholder: options.placeholder ?? '',
        value: draft?.[key] ?? '',
        onChange: (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value })),
      })

      const draftSelect = (key, options) => h('select', {
        className: 'ssh-input',
        value: draft?.[key] ?? '',
        onChange: (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value })),
      }, options.map(([value, label]) => h('option', { key: value, value }, label)))

      const valueInput = () => {
        const shared = {
          className: 'ssh-input',
          value: draft?.value ?? '',
          onChange: (event) => setDraft((prev) => ({ ...prev, value: event.target.value })),
        }
        if (draft?.mode === 'keyCred') {
          return h('textarea', {
            ...shared, rows: 6, spellCheck: false,
            placeholder: '-----BEGIN OPENSSH PRIVATE KEY-----',
            style: { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', minHeight: '96px', resize: 'vertical' },
          })
        }
        if (draft?.mode === 'passwordCred') return h('input', { ...shared, type: 'password', autoComplete: 'new-password', placeholder: '服务器密码' })
        if (draft?.mode === 'keyPath') return h('input', { ...shared, placeholder: 'C:\\Users\\me\\.ssh\\id_ed25519' })
        return h('input', { ...shared, placeholder: draft?.mode === 'passwordEnv' ? 'SSH_PASS_PROD' : 'SSH_KEY_PROD' })
      }

      const capsChips = caps === undefined ? [] : [
        ['后端', caps.active],
        ['ssh2', caps.ssh2.available ? (caps.ssh2.version ?? 'ok') : '缺失'],
        ['OpenSSH', caps.openssh.available ? (caps.openssh.version ?? 'ok') : '缺失'],
        ['口令', caps.password ? '支持' : '不支持'],
        ['SFTP', caps.sftp ? '支持' : '降级 scp'],
      ].map(([k, v]) => h('span', { className: 'ssh-tag', key: k }, `${k} ${v}`))

      const detailCard = selectedHost === null ? null : h('div', { className: 'ssh-card' },
        h('div', { className: 'ssh-card-head' },
          h('span', { className: 'ssh-card-title' }, selectedHost.alias),
          h('span', { className: 'ssh-tag' }, AUTH_LABEL[selectedHost.auth] ?? selectedHost.auth),
          selectedHost.mode === 'readonly' ? h('span', { className: 'ssh-tag ssh-tag-ro' }, '只读') : null,
          selectedHost.group.length > 0 ? h('span', { className: 'ssh-tag' }, selectedHost.group) : null,
          h('span', { className: `ssh-tag ${selectedHost.source === 'config' ? 'ssh-tag-cfg' : ''}` }, selectedHost.source === 'config' ? '配置声明' : 'hosts.json'),
          h('div', { className: 'ssh-card-actions' },
            h('button', { className: 'ssh-btn', disabled: busy, onClick: () => onProbe(selectedHost.alias) }, '测试连接'),
            selectedHost.source === 'file' ? h('button', { className: 'ssh-btn', disabled: busy, onClick: () => { setDraft(draftFromHost(selectedHost)); setNotice(null) } }, '编辑') : null,
            selectedHost.source === 'file' ? h('button', { className: 'ssh-btn ssh-btn-danger', disabled: busy, onClick: () => onRemove(selectedHost.alias) }, '删除') : null)),
        h('div', { className: 'ssh-kv' },
          h('span', { className: 'ssh-kv-k' }, '地址'), h('span', { className: 'ssh-kv-v' }, `${selectedHost.user}@${selectedHost.host}:${selectedHost.port}`),
          h('span', { className: 'ssh-kv-k' }, '认证'), h('span', { className: 'ssh-kv-v' }, selectedHost.authDetail.length > 0 ? `${AUTH_LABEL[selectedHost.auth] ?? selectedHost.auth} · ${selectedHost.authDetail}` : (AUTH_LABEL[selectedHost.auth] ?? selectedHost.auth)),
          h('span', { className: 'ssh-kv-k' }, 'shell'), h('span', { className: 'ssh-kv-v' }, selectedHost.shell),
          h('span', { className: 'ssh-kv-k' }, '默认目录'), h('span', { className: 'ssh-kv-v' }, selectedHost.defaultCwd.length > 0 ? selectedHost.defaultCwd : '—'),
          h('span', { className: 'ssh-kv-k' }, '主机指纹'), h('span', { className: 'ssh-kv-v' }, selectedHost.fingerprint.length > 0 ? selectedHost.fingerprint : '首次连接后自动记录（TOFU）')),
        probeLog !== null && probeLog.alias === selectedHost.alias
          ? h('div', null,
            h('div', { className: 'ssh-hint' }, `连接日志 · ${probeLog.transport} · ${probeLog.durationMs ?? '?'}ms`),
            h('pre', { className: 'ssh-log' }, probeLog.lines.join('\n')))
          : null,
        h('div', { className: 'ssh-hint' }, `智能体用别名操作这台机器，例如：「连接 ${selectedHost.alias}，帮我部署这个服务 <github 链接>」。`))

      const formCard = draft === null ? null : h('div', { className: 'ssh-card' },
        h('div', { className: 'ssh-card-head' }, h('span', { className: 'ssh-card-title' }, draft.editing === undefined ? '新增主机' : `编辑 ${draft.editing}`)),
        h('div', { className: 'ssh-form' },
          h(Field, { label: '别名' }, fieldInput('alias', { placeholder: 'prod' })),
          h(Field, { label: '主机' }, fieldInput('host', { placeholder: 'TARGET_HOST 或 IP' })),
          h(Field, { label: '端口' }, fieldInput('port', { type: 'number', placeholder: '22' })),
          h(Field, { label: '用户' }, fieldInput('user', { placeholder: 'root' })),
          h(Field, { label: '认证方式' }, draftSelect('mode', [
            ['keyCred', '直接粘贴私钥（存凭据库）'],
            ['passwordCred', '直接输入密码（存凭据库）'],
            ['keyEnv', '私钥 PEM 的环境变量名'],
            ['keyPath', '本机私钥文件路径'],
            ['agent', 'ssh-agent'],
            ['passwordEnv', '口令的环境变量名'],
          ])),
          draft.mode === 'agent' ? null : h(Field, { label: draft.mode === 'keyCred' ? '私钥内容' : draft.mode === 'passwordCred' ? '密码' : draft.mode === 'keyPath' ? '私钥路径' : '变量名' }, valueInput()),
          h(Field, { label: '远端 shell' }, draftSelect('shell', [['posix', 'posix（bash/sh）'], ['powershell', 'powershell'], ['cmd', 'cmd']])),
          h(Field, { label: '权限模式' }, draftSelect('hostMode', [['default', '读写'], ['readonly', '只读（拒绝写操作）']])),
          h(Field, { label: '分组' }, fieldInput('group', { placeholder: 'prod' })),
          h(Field, { label: '默认目录' }, fieldInput('defaultCwd', { placeholder: '/root' }))),
        SECRET_MODES.has(draft.mode)
          ? h('div', { className: caps?.secrets === false ? 'ssh-hint ssh-warn' : 'ssh-hint' },
            caps?.secrets === false
              ? '当前环境没有凭据服务，无法保存粘贴的密钥；请改用 keyEnv / keyPath / agent。'
              : '密钥只提交给 Host 进程并存入凭据库，hosts.json 只留引用名；不回显，也不进模型上下文。')
          : null,
        h('div', { className: 'ssh-card-actions' },
          h('button', { className: 'ssh-btn', disabled: busy, onClick: () => setDraft(null) }, '取消'),
          h('button', { className: 'ssh-btn', disabled: busy, onClick: onTestDraft }, '测试连接'),
          h('button', { className: 'ssh-btn ssh-btn-primary', disabled: busy, onClick: onSaveDraft }, '保存')))

      const settingsCard = settings === undefined ? null : h('div', { className: 'ssh-card' },
        h('div', { className: 'ssh-card-head' }, h('span', { className: 'ssh-card-title' }, '策略与传输'), h('span', { className: 'ssh-hint' }, '立即生效，无需重启')),
        h('div', { className: 'ssh-form' },
          h(Field, { label: '传输后端' }, h('select', { className: 'ssh-input', value: settings.transport, disabled: busy, onChange: (event) => patchSettings({ transport: event.target.value }) },
            h('option', { value: 'ssh2' }, 'ssh2（推荐）'),
            h('option', { value: 'openssh' }, '系统 OpenSSH'),
            h('option', { value: 'auto' }, 'auto（ssh2 优先，缺失降级）'))),
          h(Field, { label: '危险命令' }, h('select', { className: 'ssh-input', value: settings.dangerPolicy, disabled: busy, onChange: (event) => patchSettings({ dangerPolicy: event.target.value }) },
            h('option', { value: 'deny' }, '拒绝（默认）'),
            h('option', { value: 'ask' }, '转审批'),
            h('option', { value: 'allow' }, '放行（不推荐）'))),
          h(Field, { label: '主机指纹' }, h('select', { className: 'ssh-input', value: settings.hostKeyPolicy, disabled: busy, onChange: (event) => patchSettings({ hostKeyPolicy: event.target.value }) },
            h('option', { value: 'accept-new' }, 'accept-new（首次记录）'),
            h('option', { value: 'strict' }, 'strict（只接受已记录）'),
            h('option', { value: 'off' }, 'off（不校验）'))),
          h(Field, { label: '连接复用' }, h('label', { className: 'ssh-hint' },
            h('input', { type: 'checkbox', checked: settings.multiplex, disabled: busy || caps?.multiplexSupported === false, onChange: (event) => patchSettings({ multiplex: event.target.checked }) }),
            ' ControlMaster（仅 OpenSSH 后端；ssh2 自己复用连接）'))),
        h('div', { className: 'ssh-hint' }, '超时、输出上限、危险模式正则等在插件配置里；这里改的是运行期策略。'))

      const auditCard = state.audit.length === 0 ? null : h('details', { className: 'ssh-details' },
        h('summary', null, `最近活动（${state.audit.length}）`),
        h('div', { className: 'ssh-details-body' },
          h('div', { className: 'ssh-audit' }, state.audit.slice(0, 12).map((entry, index) => h('span', { key: `${entry.ts}-${index}` },
            `${entry.ts.slice(5, 19).replace('T', ' ')}  ${entry.action.padEnd(14, ' ')} ${entry.alias}${entry.exitCode === null || entry.exitCode === undefined ? '' : `  exit ${entry.exitCode}`}${entry.ok === false ? '  ✗' : ''}`)))))

      const importsCard = imports === null ? null : h('div', { className: 'ssh-card' },
        h('div', { className: 'ssh-card-head' }, h('span', { className: 'ssh-card-title' }, `可导入 ${imports.length} 条`)),
        h('div', { className: 'ssh-audit' }, imports.slice(0, 8).map((candidate) => h('span', { key: candidate.alias },
          `${candidate.alias.padEnd(14, ' ')} ${candidate.user}@${candidate.host}:${candidate.port}${candidate.keyPath === undefined ? '  （无 IdentityFile，跳过）' : ''}`))),
        h('div', { className: 'ssh-card-actions' },
          h('button', { className: 'ssh-btn', disabled: busy, onClick: () => setImports(null) }, '取消'),
          h('button', { className: 'ssh-btn ssh-btn-primary', disabled: busy, onClick: applyImports }, '导入有 IdentityFile 的条目')))

      const blacklistCard = settings === undefined ? null : h('div', { className: 'ssh-card' },
        h('div', { className: 'ssh-card-head' },
          h('span', { className: 'ssh-card-title' }, '命令黑名单'),
          h('span', { className: 'ssh-hint' }, `${patterns.length} 条正则`),
          h('div', { className: 'ssh-card-actions' },
            h('button', { className: 'ssh-btn', disabled: busy, onClick: () => savePatterns(null, '已恢复默认黑名单') }, '恢复默认'))),
        patterns.length === 0
          ? h('div', { className: 'ssh-hint' }, '黑名单为空：不会拦截任何命令。')
          : h('div', { className: 'ssh-patterns' }, patterns.map((pattern, index) => h('div', { className: 'ssh-pattern', key: `${index}-${pattern}` },
            h('code', null, pattern),
            h('button', { className: 'ssh-pattern-x', title: '删除这条规则', disabled: busy, onClick: () => removePattern(index) }, '✕')))),
        h('div', { className: 'ssh-inline' },
          h('input', {
            className: 'ssh-input',
            placeholder: '新增正则，例如 \\brm\\s+-rf\\b',
            value: patternDraft,
            onChange: (event) => setPatternDraft(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter') addPattern() },
          }),
          h('button', { className: 'ssh-btn ssh-btn-primary', disabled: busy || patternDraft.trim().length === 0, onClick: addPattern }, '添加')),
        h('div', { className: 'ssh-hint' }, '命中后按「危险命令」策略处理（拒绝 / 审批 / 放行）。这不是沙箱：规则能被绕过，作用只是挡住误操作。'))

      const startCard = h('div', { className: 'ssh-card' },
        h('div', { className: 'ssh-card-head' }, h('span', { className: 'ssh-card-title' }, '选择一台主机')),
        h('div', { className: 'ssh-chips' }, capsChips),
        h('div', { className: 'ssh-hint' }, '智能体用别名操作主机，例如：「连接 9929，帮我部署这个服务 <github 链接>」。密钥与口令不会进入对话。'))

      return h('div', { className: 'ssh-page' },
        h('style', null, CSS),
        h('div', { className: 'ssh-top' },
          h('div', { className: 'ssh-brand' },
            SshIcon({ size: 18, active: false }),
            h('h2', { className: 'ssh-title' }, 'SSH'),
            h('span', { className: 'ssh-meta' }, hosts.length === 0 ? '还没有主机' : `${hosts.length} 台主机 · ${data?.transport ?? ''}`)),
          h('input', { className: 'ssh-input ssh-search', placeholder: '搜索别名 / 主机 / 用户', value: search, onChange: (event) => setSearch(event.target.value) }),
          h('button', { className: 'ssh-btn', onClick: refresh, disabled: state.loading }, '刷新'),
          h('button', { className: 'ssh-btn', onClick: onImport, disabled: busy }, '导入'),
          h('button', { className: 'ssh-btn ssh-btn-primary', disabled: busy, onClick: () => { setDraft({ ...EMPTY_DRAFT }); setSelected(''); setNotice(null) } }, '新增')),

        state.error.length > 0 ? h('div', { className: 'ssh-banner ssh-banner-err' }, state.error) : null,
        notice !== null ? h('div', { className: `ssh-banner ${notice.ok ? 'ssh-banner-ok' : 'ssh-banner-err'}` }, notice.text) : null,

        h('div', { className: 'ssh-main' },
          h('aside', { className: 'ssh-aside' },
            groups.length > 0 ? h('div', { className: 'ssh-chips' },
              h('button', { className: `ssh-chip ${group === '' ? 'ssh-chip-on' : ''}`, onClick: () => setGroup('') }, '全部'),
              groups.map((value) => h('button', { key: value, className: `ssh-chip ${group === value ? 'ssh-chip-on' : ''}`, onClick: () => setGroup(value) }, value))) : null,
            filtered.length === 0
              ? h('div', { className: 'ssh-empty' }, hosts.length === 0 ? '点右上角「新增」，或「导入」~/.ssh/config' : '没有匹配的主机')
              : filtered.map((host) => h('button', {
                key: host.alias,
                className: `ssh-row ${selected === host.alias && draft === null ? 'ssh-row-on' : ''}`,
                onClick: () => { setSelected(host.alias); setDraft(null) },
              },
              h('span', { className: `ssh-dot ${host.fingerprint.length > 0 ? 'ssh-dot-ok' : ''}` }),
              h('span', { style: { minWidth: 0 } },
                h('div', { className: 'ssh-row-name' }, host.alias),
                h('div', { className: 'ssh-row-sub' }, `${host.user}@${host.host}:${host.port}`)),
              h('span', { className: 'ssh-row-side' }, host.mode === 'readonly' ? '只读' : '')))),

          h('section', { className: 'ssh-pane' },
            importsCard,
            draft !== null ? formCard : (detailCard ?? startCard),
            settingsCard,
            blacklistCard,
            auditCard)),

        data?.hostFile !== undefined ? h('div', { className: 'ssh-foot' }, data.hostFile) : null)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.slots
        ctx.effect(() => slots.inject('sidebar.panellist', () => slots.register({
          name: 'sidebar.panellist', id: 'ssh', order: 20, label: 'SSH',
        }, SshIcon)))
        ctx.effect(() => slots.inject('main', () => slots.register({
          name: 'main', key: 'ssh',
        }, SshPanel)))
      },
    }
  },
})
