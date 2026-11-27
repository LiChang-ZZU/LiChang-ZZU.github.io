import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import sharp from 'sharp';
import { encodePhoto, maxPhotoEdge } from './photo-encoding.mjs';

const outputDir = 'public/uploads/optimized';
const manifestFile = '.photo-manifest.json';

async function readCollection(directory) {
  const entries = await readdir(directory, { recursive: true });
  return Promise.all(entries.filter((name) => name.endsWith('.md')).sort().map(async (entry) => {
    const raw = await readFile(path.join(directory, entry), 'utf8');
    const frontmatter = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    return { entry, data: frontmatter ? parse(frontmatter[1]) : undefined };
  }));
}

const site = JSON.parse(await readFile('src/data/site.json', 'utf8'));
const [photos, publications] = await Promise.all([
  readCollection('src/content/photos'),
  readCollection('src/content/publications'),
]);
const candidates = [
  ...photos.flatMap(({ entry, data }) => data && data.draft !== true
    ? [{ entry, image: data.image, maxSize: Number(data.maxSize) || 1, compress: data.compress !== false, gallery: true }]
    : []),
  ...publications.flatMap(({ entry, data }) => data?.draft === false
    ? [{ entry, image: data.thumbnail, maxSize: 1, compress: false, gallery: false }]
    : []),
  ...[site.aboutPortrait, site.avatar].filter((image, index) =>
    index === 0 || !photos.some(({ data }) => data?.image === image && data.draft !== true)
  ).map((image) => ({ entry: 'site.json', image, maxSize: 1, compress: false, gallery: false })),
];

const manifest = {};
let previous = {};
try {
  previous = JSON.parse(await readFile(manifestFile, 'utf8'));
} catch {}
await mkdir(outputDir, { recursive: true });
const existing = new Set(await readdir(outputDir));
const widths = (choices, max) => [...choices.filter((width) => width < max), max];

for (const { entry, image, maxSize, compress, gallery } of candidates) {
  if (typeof image !== 'string' || !image.startsWith('/uploads/')) continue;
  try {
    const filename = decodeURIComponent(image.slice('/uploads/'.length));
    const uploads = path.resolve('public/uploads');
    const source = path.resolve(uploads, filename);
    const relative = path.relative(uploads, source);
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('图片路径必须在 uploads 内。');
    }
    const key = JSON.stringify([image, maxSize, compress]);
    if (manifest[key]) continue;
    const input = await readFile(source);
    const hero = image === site.avatar;
    const signature = createHash('sha256').update(`gallery-3:${gallery}:${hero}`).update(input).update(key).digest('hex').slice(0, 18);
    const cached = previous[key];
    if (cached?.signature === signature &&
        [cached.full, ...cached.thumbnails, ...cached.webp, ...cached.avif].every(({ src }) => src === image || existing.has(path.posix.basename(src)))) {
      manifest[key] = cached;
      continue;
    }

    const save = async ({ data: buffer, info }, label, extension = 'jpg') => {
      const name = `${signature}-${label}.${extension}`;
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
    if (gallery) {
      for (const [edge, budget] of [[480, 105], [960, 245], [1440, 440]]) {
        if (edge >= longEdge) break;
        thumbnails.push(await save(await encodePhoto(input, budget * 1024, edge), edge));
      }
    }
    const maxWidth = Math.max(1, Math.round(full.width * Math.min(1, maxPhotoEdge / longEdge)));
    const resize = (width) => sharp(input).autoOrient().resize({ width, withoutEnlargement: true });
    const webp = [];
    for (const width of widths([320, 480, 640, 800, 960, 1200, 1440, 1920], maxWidth)) {
      const quality = metadata.format === 'png' ? 87 : width <= 960 ? 78 : 83;
      const variant = await resize(width).webp({ quality, effort: 4 }).toBuffer({ resolveWithObject: true });
      webp.push(await save(variant, width, 'webp'));
    }
    const avif = [];
    if (hero || gallery) {
      for (const width of widths([320, 480, 640, 800, 1024, 1200, 1440, 1920], maxWidth)) {
        const variant = await resize(width).avif({ quality: hero ? 53 : 50, effort: 3, chromaSubsampling: '4:2:0' }).toBuffer({ resolveWithObject: true });
        avif.push(await save(variant, width, 'avif'));
      }
    }
    manifest[key] = { signature, full, thumbnails, webp, avif };
    console.log(`[photos] ${entry}: ${webp.length} WebP${avif.length ? `, ${avif.length} AVIF` : ''}`);
  } catch (error) {
    console.warn(`[photos] ${entry}: ${error.message}`);
  }
}

await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
