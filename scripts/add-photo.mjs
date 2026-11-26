// 本地照片入库：压缩到目标体积后写入 public/uploads 并生成 photos 条目，
// 绕开 Pages CMS 网页上传的大小限制（413）。
// 用法：node scripts/add-photo.mjs <图片路径> [--title 标题] [--date YYYY-MM-DD]
//       [--location 地点] [--caption 描述] [--max 1] [--tags a,b] [--no-commit]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = process.cwd();
const MAX_EDGE = 2560;

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i].startsWith('--')) {
    if (args[i] === '--no-commit') flags['no-commit'] = true;
    else { flags[args[i].slice(2)] = args[i + 1]; i += 1; }
  } else positional.push(args[i]);
}
const source = positional[0];
if (!source || !fs.existsSync(source)) {
  console.error('用法：node scripts/add-photo.mjs <图片路径> [--title 标题] [--max 1] ...');
  process.exit(1);
}

const maxMb = Math.min(5, Math.max(0.1, Number(flags.max) || 1));
const targetBytes = Math.round(maxMb * 1024 * 1024);

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

const image = await sharp(source, { failOn: 'none' }).rotate();
const meta = await sharp(source, { failOn: 'none' }).metadata();
let pipeline = () => {
  let p = sharp(source, { failOn: 'none' }).rotate();
  if ((meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE) {
    p = p.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  }
  return p.flatten({ background: '#ffffff' });
};
void image;

let quality = 82;
let buffer = await pipeline().jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
for (let i = 0; i < 8 && buffer.length > targetBytes && quality > 40; i += 1) {
  quality = Math.max(40, quality - 6);
  buffer = await pipeline().jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
}
const outMeta = await sharp(buffer).metadata();

const outName = `${stamp}.jpg`;
fs.mkdirSync(path.join(ROOT, 'public/uploads'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/uploads', outName), buffer);

const title = flags.title ?? path.parse(source).name;
const date = flags.date ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const tags = flags.tags ? flags.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const md = `---
title: "${esc(title)}"
image: /uploads/${outName}
date: ${date}
location: "${esc(flags.location ?? '')}"
caption: "${esc(flags.caption ?? '')}"
tags: [${tags.map((t) => `"${esc(t)}"`).join(', ')}]
compress: false
featured: false
draft: false
---
`;
fs.mkdirSync(path.join(ROOT, 'src/content/photos'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/content/photos', `${stamp}.md`), md);

console.log(`已入库：${title}`);
console.log(`  图片 public/uploads/${outName}（${(buffer.length / 1024).toFixed(0)} KB，${outMeta.width}×${outMeta.height}，质量 ${quality}）`);
console.log(`  条目 src/content/photos/${stamp}.md`);

if (!flags['no-commit']) {
  try {
    execFileSync('git', ['add', `public/uploads/${outName}`, `src/content/photos/${stamp}.md`], { cwd: ROOT, stdio: 'inherit' });
    execFileSync('git', ['-c', 'user.name=LiChang-ZZU', '-c', 'user.email=lichang@zzu.edu.cn', 'commit', '-m', `photo: ${title}`], { cwd: ROOT, stdio: 'inherit' });
    console.log('已提交。运行 git push（或让我推送）后约 1-2 分钟上线。');
  } catch {
    console.log('Git 提交失败，请手动提交这两个文件。');
  }
} else {
  console.log('（--no-commit：未自动提交）');
}
