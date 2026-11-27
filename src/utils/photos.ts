import { readFileSync } from 'node:fs';
import { getCollection } from 'astro:content';
import type { Locale } from '@/types';
import { assetUrl } from './urls';

type PhotoImage = { src: string; width: number; height: number };
type PhotoVariants = { full: PhotoImage; thumbnails: PhotoImage[]; webp?: PhotoImage[]; avif?: PhotoImage[] };
export type ResponsiveImage = PhotoImage & {
  full: string;
  srcset?: string;
  webpSrcset?: string;
  avifSrcset?: string;
};
let manifest: Record<string, PhotoVariants> = {};
try {
  manifest = JSON.parse(readFileSync('.photo-manifest.json', 'utf8'));
} catch {}

export async function getPhotos() {
  const photos = await getCollection('photos', ({ data }) => !data.draft);
  return photos.sort((a, b) =>
    Number(b.data.featured) - Number(a.data.featured) ||
    (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0) ||
    a.id.localeCompare(b.id));
}

function toSrcset(images: PhotoImage[] = []) {
  const byWidth = new Map<number, PhotoImage>();
  for (const image of images) {
    if (!byWidth.has(image.width)) byWidth.set(image.width, image);
  }
  return [...byWidth.values()].sort((a, b) => a.width - b.width)
    .map((variant) => `${assetUrl(variant.src)} ${variant.width}w`).join(', ') || undefined;
}

export function photoImage(image: string, maxSize = 1, compress = false): ResponsiveImage {
  const variants = manifest[JSON.stringify([image, maxSize, compress])];
  if (!variants) return { src: image, full: image, width: 0, height: 0 };
  const { full, thumbnails, webp, avif } = variants;
  return {
    src: thumbnails.at(1)?.src ?? thumbnails[0]?.src ?? full.src,
    full: full.src,
    width: full.width,
    height: full.height,
    srcset: thumbnails.length ? toSrcset([...thumbnails, full]) : undefined,
    webpSrcset: toSrcset(webp),
    avifSrcset: toSrcset(avif),
  };
}

type PhotoCopy = {
  title: string; titleEn: string;
  alt: string; altEn: string;
  location: string; locationEn: string;
  caption: string; captionEn: string;
};

export function photoText(data: PhotoCopy, locale: Locale) {
  const en = locale === 'en';
  const title = (en && data.titleEn) || data.title;
  return {
    title,
    alt: (en && data.altEn) || data.alt || title,
    location: (en && data.locationEn) || data.location,
    caption: (en && data.captionEn) || data.caption,
  };
}
