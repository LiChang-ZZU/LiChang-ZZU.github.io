// 构建前自动压缩摄影作品：读取 src/content/photos 的 frontmatter，
// 按 compress / maxSize 生成优化后的图片到 public/uploads/optimized/，
// 并输出 manifest 供兴趣页引用。原图保留不动。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from 'yaml';
import sharp from 'sharp';

const ROOT = process.cwd();
const PHOTO_DIR = path.join(ROOT, 'src/content/photos');
const OUT_DIR = path.join(ROOT, 'public/uploads/optimized');
const MANIFEST = path.join(ROOT, '.photo-manifest.json');
const MAX_EDGE = 2560;
const DEFAULT_MAX_MB = 1;

const readFrontmatter = (file) => {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  try { return parse(match[1]) ?? {}; } catch { return null; }
};

const listMarkdown = (dir) => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listMarkdown(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
};

const encodeToTarget = async (input, targetBytes) => {
  const meta = await sharp(input).metadata();
  const base = () => {
    let image = sharp(input).rotate();
    if ((meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE) {
      image = image.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
    }
    return image.flatten({ background: '#ffffff' });
  };
  let quality = 82;
  let buffer = await base().jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
  for (let i = 0; i < 6 && buffer.length > targetBytes && quality > 45; i += 1) {
    quality = Math.max(45, quality - 8);
    buffer = await base().jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
  }
  const outMeta = await sharp(buffer).metadata();
  return { buffer, quality, width: outMeta.width ?? 0, height: outMeta.height ?? 0 };
};

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {};
  const used = new Set();
  let optimized = 0;
  let kept = 0;

  for (const file of listMarkdown(PHOTO_DIR)) {
    const data = readFrontmatter(file);
    const image = typeof data?.image === 'string' ? data.image : '';
    if (!data || !image.startsWith('/uploads/') || data.draft === true) continue;
    const source = path.join(ROOT, 'public', decodeURIComponent(image));
    if (!fs.existsSync(source)) { console.warn(`[photos] 找不到图片：${image}`); continue; }

    const maxMb = Math.min(5, Math.max(0.1, Number(data.maxSize) || DEFAULT_MAX_MB));
    const targetBytes = Math.round(maxMb * 1024 * 1024);
    const compress = data.compress !== false;
    const stat = fs.statSync(source);

    try {
      if (!compress) { kept += 1; continue; }
      const meta = await sharp(source).metadata();
      const withinSize = stat.size <= targetBytes && (meta.width ?? 0) <= MAX_EDGE && (meta.height ?? 0) <= MAX_EDGE;
      if (withinSize) {
        manifest[image] = { src: image, width: meta.width ?? 0, height: meta.height ?? 0, bytes: stat.size };
        kept += 1;
        continue;
      }
      const hash = crypto.createHash('sha1').update(path.relative(ROOT, source)).digest('hex').slice(0, 8);
      const name = `${path.parse(source).name.replace(/[^\w.-]+/g, '-')}-${hash}.jpg`;
      const outFile = path.join(OUT_DIR, name);
      const { buffer, width, height } = await encodeToTarget(source, targetBytes);
      fs.writeFileSync(outFile, buffer);
      used.add(name);
      manifest[image] = { src: `/uploads/optimized/${name}`, width, height, bytes: buffer.length };
      optimized += 1;
      console.log(`[photos] ${image} → ${(buffer.length / 1024).toFixed(0)} KB (${width}×${height})`);
    } catch (error) {
      console.warn(`[photos] 处理失败，保留原图：${image}（${error.message}）`);
    }
  }

  for (const file of fs.readdirSync(OUT_DIR)) {
    if (!used.has(file)) fs.unlinkSync(path.join(OUT_DIR, file));
  }

  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  const prev = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, 'utf8') : '';
  if (next !== prev) fs.writeFileSync(MANIFEST, next);
  console.log(`[photos] 完成：压缩 ${optimized} 张，无需处理 ${kept} 张`);
};

main().catch((error) => { console.error('[photos] 失败：', error); process.exit(1); });
