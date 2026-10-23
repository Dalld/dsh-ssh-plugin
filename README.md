# dsh-ssh-plugin

给 **DeepSeek Harness（DSH）** 智能体用的 SSH 能力：执行命令、上传下载文件，**私钥/口令不进入模型上下文**。
自带侧栏面板：主机管理、连接测试与连接日志、命令黑名单、危险命令策略、审计记录。

- 传输层：`ssh2`（默认，跨平台一致、连接复用、原生 SFTP）+ 系统 OpenSSH（可选后端）
- 形态：DSH bundle（Host 半区 + Client 半区），一个包同时提供工具与 UI
- 依赖：仅 `ssh2`；缺失时自动降级到系统 OpenSSH 客户端

---

## 1. 它解决什么问题

让智能体能直接操作服务器（部署、排障、传文件），但**模型永远看不到密钥**：

| 角色 | 能看到什么 |
|---|---|
| 模型 / 对话 | 只有主机别名（如 `9929`）和命令输出 |
| 浏览器面板 | 别名、地址、认证**引用名**（环境变量名 / 凭据名 / 私钥路径），不回显密钥内容 |
| Host 进程 | 真正的私钥与口令；只在本机内存里用于握手 |

---

## 2. 快速开始（3 步）

1. **安装**（见 §3）→ 刷新 DSH 页面 → 左侧栏出现 `SSH` 图标
2. **加主机**：面板「新增」→ 填别名/地址/用户 → 认证方式选「直接粘贴私钥」或「直接输入密码」→ **测试连接** → 保存
3. **让智能体干活**：在对话里说

   > 连接 9929，帮我部署这个服务 https://github.com/xxx/yyy

   模型会自己调用 `ssh_hosts` / `ssh_exec` / `ssh_put`，全程只用别名。

---

## 3. 安装与部署

三种方式，按「能否联网」「是否愿意批构建脚本」选。完整版见 **[DEPLOY.md](./DEPLOY.md)**。

### 方式 A：拷贝自带依赖的目录（推荐，离线可用）

```bash
# 在有网络的机器上先构建一次（会生成 dist/dsh-ssh-plugin，含 node_modules）
git clone https://github.com/Dalld/dsh-ssh-plugin.git
cd dsh-ssh-plugin
npm install --omit=dev --ignore-scripts
npm run prepare:dist        # 产物：dist/dsh-ssh-plugin
```

把 `dist/dsh-ssh-plugin` 整个目录拷到目标机，然后在目标机 DSH 里：

```
plugin_manager install_bundle D:\dsh-plugins\dsh-ssh-plugin
```

目录安装走 `link:`，不会重装依赖，**不会触发构建审批**，适合离线/内网。

### 方式 B：直接指向源码目录（开发用）

```bash
git clone https://github.com/Dalld/dsh-ssh-plugin.git
cd dsh-ssh-plugin
npm install --omit=dev --ignore-scripts   # ssh2 纯 JS 即可，不需要编译
```

```
plugin_manager install_bundle <仓库绝对路径>
```

### 方式 C：npm 一条命令

```bash
plugin_manager install_bundle dsh-ssh-plugin
```

目标机安装时 pnpm 会自动装 `ssh2`，首次可能提示 `pendingBuilds: cpu-features, ssh2`
（可选原生加速模块）。允许即可；不允许也能用，插件自动退回 OpenSSH 后端。

### 环境要求

| 项 | 要求 |
|---|---|
| DSH | ≥ `0.2.1-rc.2` |
| Node | ≥ 20（DSH 自带） |
| 系统 | Windows 10+ / macOS / Linux |
| 可选 | 系统 OpenSSH 客户端（没有 ssh2 时使用） |

---

## 4. 面板

| 区域 | 内容 |
|---|---|
| 顶栏 | 搜索、刷新、导入 `~/.ssh/config`、新增 |
| 左栏 | 主机列表（指纹是否已记录、只读标记、分组过滤） |
| 右栏 | 主机详情 + **测试连接**（含连接日志）+ 编辑/删除 |
| 策略卡 | 传输后端、危险命令策略、主机指纹策略、连接复用 |
| 黑名单卡 | 正则可增删、可恢复默认（内置 20 条，含 PowerShell 规则） |
| 最近活动 | 折叠的审计摘要 |

**测试连接**会真的连一次并输出日志，例如：

```
[    0ms] 后端 ssh2 · 目标 root@1.2.3.4:22
[    0ms] 策略：指纹 accept-new · 超时 20000ms
[    0ms] 已记录主机指纹 SHA256:s2OgX2EON...
[ 1729ms] 握手完成 · 主机密钥 SHA256:s2OgX2EON...
[ 1729ms] 主机指纹与记录一致
[ 1729ms] 认证成功 · 方式 password:cred
[ 3317ms] 远端回显 exit 0 · 1588ms
[ 3317ms] 完成
```

---

## 5. 工具（模型可见）

| 工具 | 作用 |
|---|---|
| `ssh_hosts` | 列出别名、认证方式、只读/分组、已记录指纹；`probe: true` 真实连接 |
| `ssh_exec` | 执行命令（支持 `stdin`、`cwd`、超时、输出上限） |
| `ssh_put` / `ssh_get` | 上下传；`recursive` 传目录，`verify` 比对 sha256 |
| `ssh_doctor` | 诊断：可用传输层与版本、数据目录、known_hosts、逐主机就绪情况 |

参数 schema 里**没有任何密钥字段** —— 模型能给的最敏感情报只是一个别名。

---

## 6. 安全模型

1. **认证材料只在 Host 进程解析**，共六种来源：
   `keyCred`（面板粘贴私钥 → DSH 凭据库）、`passwordCred`（面板输入密码 → 凭据库）、
   `keyEnv` / `passwordEnv`（环境变量名）、`keyPath`（本机私钥文件）、`agent`（ssh-agent）。
2. **出口统一脱敏**：秘密值 → `[redacted:secret]`，`dataDir`/私钥路径/临时路径 → `[redacted:path]`，
   PEM 块 → `[redacted:private-key]`。工具结果、错误信息、连接日志都过这一层。
3. **TOFU 指纹**：`accept-new` 下首次连接成功即记录指纹，之后每次比对；不一致直接拒绝连接。
4. **审计**：`<dataDir>/audit.jsonl`（0600）记录 exec/put/get/probe 的时间、退出码、耗时、脱敏命令。
5. **命令策略**：`dangerPolicy: deny | ask | allow`，命中黑名单时拒绝 / 转 DSH 审批 / 放行；
   主机可设 `mode: readonly` 拒绝写操作。

> 边界：智能体自己有文件读写工具，磁盘上存在的私钥它本来就能读。本插件保证的是
> 「不新增副本、不打印位置、不把密钥塞进结果」。黑名单与只读模式是模式匹配，**不是沙箱**。

---

## 7. 配置参考

写在插件行的 `config`（YAML），或让面板写 `<dataDir>/settings.json`（面板优先级更高，即时生效）。

```yaml
config:
  transport: ssh2            # ssh2 | openssh | auto
  hostKeyPolicy: accept-new  # accept-new | strict | off
  dangerPolicy: deny         # allow | ask | deny
  audit: true
  multiplex: false           # 仅 OpenSSH 后端（POSIX）
  defaultTimeoutMs: 30000
  connectTimeoutMs: 20000
  maxOutputBytes: 200000
  hosts:
    - alias: prod
      host: 1.2.3.4
      port: 22
      user: root
      keyCred: DSH_SSH_PROD_KEY   # 面板粘贴私钥后自动生成的引用名
      mode: readonly              # default | readonly
      group: prod
    - alias: winbox
      host: 10.0.0.12
      user: Administrator
      keyPath: C:\Users\me\.ssh\id_ed25519
      shell: powershell           # posix | powershell | cmd
```

单主机可选：`keyEnv` `keyPath` `keyCred` `passphraseEnv` `passwordEnv` `passwordCred` `agent`
`timeoutMs` `connectTimeoutMs` `maxOutputBytes` `defaultCwd` `shell` `mode` `group` `enabled`。

配置是**严格**的：未知字段、非法 host/user/port、坏 JSON 都会明确报错，不静默忽略。

### 数据目录

`<profile>/ssh/`：`hosts.json`、`known_hosts`、`settings.json`、`audit.jsonl`、`cm/`（OpenSSH 复用套接字）。

迁移到新机器时，前三个文件可整目录拷贝；**凭据库里的密钥/密码不可迁移**，需要重填，
或改用 `keyPath` / `keyEnv`。

---

## 8. 与同类方案的比较

| | 本插件（ssh2 默认） | 纯 OpenSSH CLI | 桌面终端（WezTerm/Tabby） |
|---|---|---|---|
| 模型可用 | ✅ 工具化 | ✅ 但需自己拼命令 | ❌ |
| 连接复用 | ✅ 进程内连接池 | 仅 POSIX | ✅ |
| SFTP | ✅ 原生 | scp | ✅ |
| 密钥隔离 | ✅ 不落盘、脱敏 | ✅ 文件 | — |
| 算法面 | libssh2（FIDO/新 KEX 滞后） | 跟系统 | 两者皆有 |

`transport: auto` 会在 ssh2 缺失时自动降到 OpenSSH。

---

## 9. 已知限制

- 黑名单/只读是模式匹配，能被绕过；不要当作安全边界。
- `known_hosts` 只处理本插件写入的明文条目（哈希化 `|1|…` 条目匹配不到）。
- Windows 上 OpenSSH 后端没有连接复用与可靠口令认证（用 ssh2 即可）。
- 目录递归传输、断点续传、端口转发工具尚未实现。
- 面板文案目前为中文，未走 Client locale 服务。

---

## 10. 开发

```bash
npm install --omit=dev --ignore-scripts
node test/smoke.mjs     # 离线测试：工具注册、策略、指纹库、设置、面板 API、脱敏
```

真机验证记录见 [DEPLOY.md](./DEPLOY.md#验证清单装完自检)。

## License

MIT