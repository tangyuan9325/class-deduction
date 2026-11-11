#!/usr/bin/env node
/**
 * 发布前统一替换静态资源版本串，避免浏览器继续用旧的 app.js / views.js。
 *
 *   node tools/release.mjs            # 自动取 提交数 作为后缀
 *   node tools/release.mjs 20261111c  # 手动指定
 *
 * GitHub Pages 对 .js 返回 cache-control: max-age=600，版本串不变时
 * 浏览器最长 10 分钟仍会命中旧文件，改完代码必须同步改这里。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const file = 'docs/index.html';
const arg = process.argv[2];
let tag = arg;
if (!tag) {
  const count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
  const ver = /APP_VERSION\s*=\s*'([^']+)'/.exec(readFileSync('docs/app.js', 'utf8'))?.[1] || 'dev';
  tag = `${ver}-r${count}`;
}
const html = readFileSync(file, 'utf8');
const next = html.replace(/(\?v=)[^"']+/g, `$1${tag}`);
if (next === html) {
  console.log('版本串已是', tag, '，无改动');
} else {
  writeFileSync(file, next, 'utf8');
  console.log('资源版本串 ->', tag);
}
