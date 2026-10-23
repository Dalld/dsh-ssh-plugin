# 部署到另一台电脑

插件本体是 `dsh-ssh-plugin`（Host 半区 + Client 半区 + 可选的 `ssh2` 依赖）。
三种装法按「能不能联网」「想不想动构建脚本」区分。

## 方式 A：拷贝自带依赖的目录（推荐，离线可用，不碰构建审批）

先生成发布目录（有网络的一侧做一次即可）：

```bash
git clone https://github.com/Dalld/dsh-ssh-plugin.git
cd dsh-ssh-plugin
npm run prepare:dist      # 产出 dist/dsh-ssh-plugin（含 node_modules/ssh2）
```

也可以手工来：`npm install --omit=dev --ignore-scripts`，然后把
`index.js client.js lib locale cordis.patch.yml icon.svg package.json node_modules` 一起拷进一个目录。

1. 把整个 `dist/dsh-ssh-plugin` 目录拷到目标机器，例如 `D:\dsh-plugins\dsh-ssh-plugin`
2. 打开目标机 DSH → 设置 → 插件 → 安装（本地目录），或在插件管理里执行：
   `plugin_manager install_bundle D:\dsh-plugins\dsh-ssh-plugin`
3. **刷新一次页面**，左侧栏出现 SSH 图标
4. 面板 → 新增主机 → 认证方式选「直接粘贴私钥」或「直接输入密码」→ 测试连接 → 保存

为什么推荐这条：目录安装是 `link:` 方式，pnpm 不重装依赖，也就不会触发 `ssh2` / `cpu-features`
那两个可选原生模块的构建审批；`node_modules/ssh2` 已经躺在目录里，纯 JS 就能跑。

## 方式 B：tarball / npm 包（需要联网 + 一次性批准构建）

`dsh-ssh-plugin-0.7.1.tgz`（约 44 KB，不含依赖）。

1. `plugin_manager install_bundle <路径>\dsh-ssh-plugin-0.7.1.tgz`
2. 首次会返回 `pendingBuilds: ["cpu-features@0.0.10", "ssh2@1.17.0"]`，属于可选原生加速模块；
   在插件页允许这些构建脚本后重试即可。
3. 不批准也并非不能用：此时 `ssh2` 装不上，插件会**自动降级到系统 OpenSSH 后端**
   （Windows 10+ 自带 OpenSSH 客户端；注意 OpenSSH 后端在 Windows 不支持连接复用与口令认证）。

## 方式 C：npm 一条命令

```bash
plugin_manager install_bundle dsh-ssh-plugin
```

依赖由 pnpm 自动安装，同样会遇到一次构建审批。

## 目标机环境要求

| 项 | 要求 |
|---|---|
| DSH | ≥ `0.2.1-rc.2`（`package.json` 的 `engines.dsh`） |
| Node | ≥ 20（DSH 自带运行时，无需另装） |
| 系统 | Windows 10+ / macOS / Linux；方式 B、C 需要联网 |
| 无 ssh2 时 | 自动用系统 `ssh`/`scp`（POSIX 更完整；Windows 功能受限） |

## 配置与数据迁移

`<profile>/ssh/` 下的文件**可以整目录拷贝**：

| 文件 | 内容 | 可迁移 |
|---|---|---|
| `hosts.json` | 别名、地址、端口、用户、认证引用名 | ✅ |
| `known_hosts` | 主机指纹（TOFU 记录） | ✅ |
| `settings.json` | 传输后端、危险命令策略、黑名单、审计开关 | ✅ |
| `audit.jsonl` | 执行历史 | 可选 |

**不能迁移的**：粘贴进面板的私钥 / 密码 —— 它们存在目标机自己的 DSH 凭据库里。
到新机器要重填一次（或改用 `keyPath` / `keyEnv`，这两种本来就是本机本地资源）。

## 验证清单（装完自检）

```bash
# 1. 能力矩阵：应显示 ssh2 或 openssh 至少一个 available
#    在对话里直接说：跑一下 ssh_doctor

# 2. 面板：侧栏 SSH → 新增主机 → 测试连接，日志最后一行应为「完成」
```

常见问题：

| 现象 | 原因 | 处理 |
|---|---|---|
| 面板顶部 `HTTP 404 / 405` | 客户端模块没刷新 | 刷新页面；再不行重启一次 DSH |
| `ssh2 缺失`，后端显示 openssh | 方式 B/C 没批准构建 | 批准构建，或改用方式 A 的目录 |
| `没有凭据服务` | 目标机没挂 credentials 服务 | 改用 `keyPath` / `keyEnv` |
| 连接被拒且提示指纹不一致 | 服务器换过主机密钥 | 删除 `known_hosts` 中该主机那行再连 |