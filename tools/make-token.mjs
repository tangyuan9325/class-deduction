#!/usr/bin/env node
/**
 * 生成 docs/gh-token.js 的写入令牌保管库。
 *
 *   node tools/make-token.mjs <token> <passphrase> [outfile]
 *
 * 令牌用 AES-256-GCM 加密，密钥由 passphrase 经 PBKDF2-SHA256 600000 次派生。
 * 仓库里只有密文；没有口令无法还原令牌。
 */
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const [,, token, pass, out = 'docs/gh-token.js'] = process.argv;
if (!token || !pass) {
  console.error('用法: node tools/make-token.mjs <github_token> <passphrase> [outfile]');
  process.exit(1);
}
if (!/^github_pat_[A-Za-z0-9_]+$|^ghp_[A-Za-z0-9]+$/.test(token)) {
  console.error('令牌格式不正确');
  process.exit(1);
}
if (pass.length < 8) {
  console.error('口令至少 8 位');
  process.exit(1);
}
if (pass.length < 12) {
  console.warn('提示：口令短于 12 位，建议改用更长的随机串');
}

const ITER = 600000;
const enc = new TextEncoder();
const b64 = buf => Buffer.from(buf).toString('base64');

const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const km = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
  km, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(token));

const blob = {
  v: 1, alg: 'AES-GCM', iter: ITER,
  salt: b64(salt), iv: b64(iv), ct: b64(ct),
  created: new Date().toISOString()
};
const body = `/* 写入令牌保管库：AES-GCM 密文，密钥由写入口令派生，请勿在此处放明文。 */\nvar GH_VAULT = ${JSON.stringify(blob)};\n`;
writeFileSync(out, body, 'utf8');
console.log('已写入', out);
