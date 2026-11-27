import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import sharp from 'sharp';
import { encodePhoto } from './photo-encoding.mjs';

const photoDir = 'src/content/photos';
const outputDir = 'public/uploads/optimized';
const manifestFile = '.photo-manifest.json';

const manifest = {};
let previous = {};
try {
  previous = JSON.parse(await readFile(manifestFile, 'utf8'));
} catch {}
await mkdir(outputDir, { recursive: true });
const existing = new Set(await readdir(outputDir));
const entries = await readdir(photoDir, { recursive: true });

for (const entry of entries.filter((name) => name.endsWith('.md')).sort()) {
  const raw = await readFile(path.join(photoDir, entry), 'utf8');
  const frontmatter = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!frontmatter) continue;
  const data = parse(frontmatter[1]);
  const image = data?.image;
  if (data?.draft === true || typeof image !== 'string' || !image.startsWith('/uploads/')) continue;

  try {
    const filename = decodeURIComponent(image.slice('/uploads/'.length));
    const uploads = path.resolve('public/uploads');
    const source = path.resolve(uploads, filename);
    const relative = path.relative(uploads, source);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('图片路径必须在 uploads 内。');
    }
    const maxSize = Number(data.maxSize) || 1;
    const compress = data.compress !== false;
    const key = JSON.stringify([image, maxSize, compress]);
    if (manifest[key]) continue;
    const input = await readFile(source);
    const signature = createHash('sha256').update('gallery-1').update(input).update(key).digest('hex').slice(0, 18);
    const cached = previous[key];
    if (cached?.signature === signature &&
        [cached.full, ...cached.thumbnails].every(({ src }) => src === image || existing.has(path.posix.basename(src)))) {
      manifest[key] = cached;
      continue;
    }

    const save = async ({ data: buffer, info }, label) => {
      const name = `${signature}-${label}.jpg`;
      await writeFile(path.join(outputDir, name), buffer);
      return { src: `/uploads/optimized/${name}`, width: info.width, height: info.height };
    };

    const metadata = await sharp(input).metadata();
    const targetBytes = Math.round(maxSize * 1024 * 1024);
    const full = compress
      ? await save(await encodePhoto(input, targetBytes), 'full')
      : { src: image, ...metadata.autoOrient };
    const thumbnails = [];
    const longEdge = Math.max(full.width, full.height);
    for (const [edge, budget] of [[480, 105], [960, 245], [1440, 440]]) {
      if (edge >= longEdge) break;
      thumbnails.push(await save(await encodePhoto(input, budget * 1024, edge), edge));
    }
    manifest[key] = { signature, full, thumbnails };
    console.log(`[photos] ${entry}: ${full.width}×${full.height}, ${thumbnails.length} 个预览尺寸`);
  } catch (error) {
    console.warn(`[photos] ${entry}: ${error.message}`);
  }
}

await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
