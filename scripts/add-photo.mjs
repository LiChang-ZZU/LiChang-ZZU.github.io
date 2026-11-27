import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { stringify } from 'yaml';
import { encodePhoto } from './photo-encoding.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' }, date: { type: 'string' }, location: { type: 'string' },
    caption: { type: 'string' }, alt: { type: 'string' }, tags: { type: 'string' },
    max: { type: 'string', default: '1' }, featured: { type: 'boolean' },
    draft: { type: 'boolean' }, 'no-commit': { type: 'boolean' },
  },
});

const maxSize = Number(values.max);
if (!positionals.length || !Number.isFinite(maxSize) || maxSize < 0.1 || maxSize > 5) {
  console.error('用法：npm run photos:add -- <图片…> [--max 0.1–5] [--title 标题] [--alt 画面描述] [--no-commit]');
  process.exit(1);
}

const date = values.date;
const parsedDate = new Date(date ?? '');
if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date)) {
  throw new Error('日期请填写有效的 YYYY-MM-DD。');
}
if (positionals.length > 1 && (values.title || values.alt || values.caption)) {
  throw new Error('批量导入使用文件名作为标题。要为单张照片填写标题或说明，请单独导入。');
}

const uploads = 'public/uploads';
const entries = 'src/content/photos';
await mkdir(uploads, { recursive: true });
await mkdir(entries, { recursive: true });

const imported = [];
for (const source of positionals) {
  try {
    const result = await encodePhoto(source, Math.round(maxSize * 1024 * 1024));
    const slug = `${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 12)}`;
    const image = `${uploads}/${slug}.jpg`;
    const entry = `${entries}/${slug}.md`;
    const data = {
      title: values.title || path.parse(source).name,
      image: `/uploads/${slug}.jpg`,
      ...(date && { date }),
      ...(values.location && { location: values.location }),
      ...(values.caption && { caption: values.caption }),
      ...(values.alt && { alt: values.alt }),
      ...(values.tags && { tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean) }),
      compress: false,
      maxSize,
      featured: values.featured ?? false,
      draft: values.draft ?? false,
    };
    await writeFile(image, result.data, { flag: 'wx' });
    try {
      await writeFile(entry, `---\n${stringify(data)}---\n`, { flag: 'wx' });
    } catch (error) {
      await unlink(image);
      throw error;
    }
    imported.push(image, entry);
    console.log(`已导入 ${data.title} · ${result.info.width} × ${result.info.height} · ${(result.data.length / 1024).toFixed(0)} KB`);
  } catch (error) {
    console.error(`未能导入 ${source}：${error.message}`);
    process.exitCode = 1;
  }
}

if (imported.length && !values['no-commit']) {
  try {
    execFileSync('git', ['add', '--', ...imported], { stdio: 'inherit' });
    execFileSync('git', ['-c', 'user.name=LiChang-ZZU', '-c', 'user.email=lichang@zzu.edu.cn',
      'commit', '-m', `photo: add ${imported.length / 2} photograph(s)`, '--only', '--', ...imported], { stdio: 'inherit' });
  } catch {
    console.error('照片和条目已写入仓库目录。Git 提交失败，请检查终端中的 Git 错误。');
    process.exitCode = 1;
  }
}
