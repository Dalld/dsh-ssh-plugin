/**
 * 生成自带依赖的发布目录：dist/dsh-ssh-remote/
 *
 * 目标：拷到别的电脑后用 `plugin_manager install_bundle <目录>` 即可，
 * 不触发 pnpm 的构建脚本审批（ssh2 纯 JS 可用，不需要原生模块）。
 *
 * 用法：npm run prepare:dist
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dist = path.join(root, 'dist', 'dsh-ssh-remote')
const FILES = ['index.js', 'client.js', 'package.json', 'cordis.patch.yml', 'icon.svg', 'README.md', 'DEPLOY.md', 'LICENSE', 'lib', 'locale']

/** 只保留运行期需要的文件，避免把 test/ 和本地 node_modules 一起搬过去（覆盖写，不删目录）。 */
async function copySources() {
  await mkdir(dist, { recursive: true })
  for (const entry of FILES) {
    await cp(path.join(root, entry), path.join(dist, entry), { recursive: true, force: true })
  }
}

/** 用 npm 装生产依赖：--ignore-scripts 保证不跑 ssh2/cpu-features 的本地编译。 */
function installDependencies() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  execFileSync(npm, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: dist,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

async function stamp() {
  const file = path.join(dist, 'DEPLOY-HINT.txt')
  const pkg = JSON.parse(await readFile(path.join(dist, 'package.json'), 'utf8'))
  await writeFile(file, [
    `dsh-ssh-remote ${pkg.version}`,
    '',
    '在目标机器上执行：',
    `  plugin_manager install_bundle ${path.join(dist)}`,
    '',
    '或把整个目录拷到目标机后再指向它。',
    '安装后刷新 DSH 页面，左侧栏会出现 SSH 图标。',
    '',
  ].join('\n'), 'utf8')
}

await copySources()
installDependencies()
await stamp()
console.log(`dist 就绪：${dist}`)