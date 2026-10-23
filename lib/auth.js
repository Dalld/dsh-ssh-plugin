/**
 * 两个传输层共用的认证材料解析。
 * 返回的 secrets 会登记到脱敏表；密钥内容只在内存里存在。
 *
 * 六种认证来源：
 *  keyEnv / keyPath / keyCred（面板粘贴的私钥，存 DSH 凭据库）
 *  agent / passwordEnv / passwordCred（面板输入的口令，存 DSH 凭据库）
 */
import { readFile, access } from 'node:fs/promises'
import { expandHome } from './paths.js'

const PEM_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u

async function optionalPassphrase(host, resolveSecret) {
  if (typeof host.passphraseEnv !== 'string' || host.passphraseEnv.length === 0) return undefined
  const passphrase = await resolveSecret(host.passphraseEnv)
  if (passphrase === undefined) throw new Error(`主机 ${host.alias} 的私钥口令变量未配置或为空`)
  return passphrase
}

export async function resolveAuth(host, { resolveSecret }) {
  if (typeof host.keyEnv === 'string' && host.keyEnv.length > 0) {
    const pem = await resolveSecret(host.keyEnv)
    if (pem === undefined) throw new Error(`主机 ${host.alias} 的密钥变量未配置或为空`)
    if (!PEM_PATTERN.test(pem)) throw new Error(`主机 ${host.alias} 的密钥变量内容不像私钥 PEM，请检查该变量`)
    const passphrase = await optionalPassphrase(host, resolveSecret)
    return { kind: 'key:env', privateKey: pem, passphrase, secrets: [pem, ...(passphrase === undefined ? [] : [passphrase])], supportsPassword: false }
  }

  if (typeof host.keyPath === 'string' && host.keyPath.length > 0) {
    const file = expandHome(host.keyPath)
    try {
      await access(file)
    } catch {
      throw new Error(`主机 ${host.alias} 的私钥文件不存在或不可读`)
    }
    const pem = await readFile(file, 'utf8')
    const passphrase = await optionalPassphrase(host, resolveSecret)
    return { kind: 'key:file', privateKey: pem, passphrase, secrets: passphrase === undefined ? [] : [passphrase], keyPath: file, supportsPassword: false }
  }

  if (typeof host.keyCred === 'string' && host.keyCred.length > 0) {
    const pem = await resolveSecret(host.keyCred)
    if (pem === undefined) throw new Error(`主机 ${host.alias} 的凭据 ${host.keyCred} 里没有私钥`)
    if (!PEM_PATTERN.test(pem)) throw new Error(`主机 ${host.alias} 的凭据内容不像私钥 PEM`)
    const passphrase = await optionalPassphrase(host, resolveSecret)
    return { kind: 'key:cred', privateKey: pem, passphrase, secrets: [pem, ...(passphrase === undefined ? [] : [passphrase])], supportsPassword: false }
  }

  if (host.agent === true) {
    return { kind: 'agent', agent: true, secrets: [], supportsPassword: false }
  }

  if (typeof host.passwordEnv === 'string' && host.passwordEnv.length > 0) {
    const password = await resolveSecret(host.passwordEnv)
    if (password === undefined) throw new Error(`主机 ${host.alias} 的口令变量未配置或为空`)
    return { kind: 'password:env', password, secrets: [password], supportsPassword: true }
  }

  if (typeof host.passwordCred === 'string' && host.passwordCred.length > 0) {
    const password = await resolveSecret(host.passwordCred)
    if (password === undefined) throw new Error(`主机 ${host.alias} 的凭据 ${host.passwordCred} 里没有口令`)
    return { kind: 'password:cred', password, secrets: [password], supportsPassword: true }
  }

  throw new Error(`主机 ${host.alias} 没有可用的认证方式：请配置 keyEnv / keyPath / keyCred / agent / passwordEnv / passwordCred 之一`)
}

export { PEM_PATTERN }
