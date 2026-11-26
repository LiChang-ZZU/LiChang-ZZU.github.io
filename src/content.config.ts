import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const locale = z.enum(['zh', 'en']);
const optionalUrl = z.string().optional().default('');
const optionalDate = z.preprocess((value) => value === '' || value == null ? undefined : value, z.coerce.date().optional());

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(), slug: z.string(), description: z.string(), date: z.coerce.date(), updated: optionalDate,
    author: z.string().default('Your Name'), cover: optionalUrl, coverAlt: z.string().default(''), tags: z.array(z.string()).default([]),
    category: z.string().default('Notes'), locale, translationKey: z.string().optional(), featured: z.boolean().default(false),
    draft: z.boolean().default(true), readingTime: z.number().positive().optional(), canonical: optionalUrl, ogImage: optionalUrl
  })
});

// frontmatter 的 slug 会被自动翻译脚本按原文复制，中英文条目会撞 ID 而互相覆盖；改用文件路径作为 ID。
const pathId = ({ entry }: { entry: string }) => entry.replace(/\.(md|mdx)$/i, '');

const publications = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/publications', generateId: pathId }),
  schema: z.object({
    title: z.string(), slug: z.string(), authors: z.array(z.string()), venue: z.string().default(''), year: z.number().int(),
    volume: z.string().default(''), issue: z.string().default(''), pages: z.string().default(''), doi: optionalUrl, pdf: optionalUrl,
    code: optionalUrl, video: optionalUrl, project: optionalUrl, bibtex: z.string().default(''), award: z.string().default(''),
    abstract: z.string().default(''), thumbnail: optionalUrl, type: z.enum(['journal','conference','preprint','book','chapter','other']),
    featured: z.boolean().default(false), locale, translationKey: z.string().optional(), draft: z.boolean().default(true)
  })
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(), slug: z.string(), description: z.string(), date: z.coerce.date(), endDate: optionalDate,
    image: optionalUrl, imageAlt: z.string().default(''), video: optionalUrl, role: z.string().default(''), collaborators: z.array(z.string()).default([]),
    links: z.array(z.object({ label: z.string(), url: z.string() })).default([]), tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false), draft: z.boolean().default(true), locale, translationKey: z.string().optional()
  })
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news', generateId: pathId }),
  schema: z.object({
    title: z.string(), slug: z.string(), date: z.coerce.date(), description: z.string(), link: optionalUrl,
    type: z.enum(['publication','conference','project','visit','personal','other']).default('other'),
    featured: z.boolean().default(false), locale, draft: z.boolean().default(true)
  })
});

const photos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/photos', generateId: pathId }),
  schema: z.object({
    title: z.string(), date: z.coerce.date(), image: z.string(), location: z.string().default(''),
    caption: z.string().default(''), tags: z.array(z.string()).default([]),
    featured: z.boolean().default(false), draft: z.boolean().default(false),
    compress: z.boolean().default(true), maxSize: z.coerce.number().min(0.1).max(5).default(1)
  })
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/pages' }),
  schema: z.object({ title: z.string(), description: z.string(), locale, page: z.enum(['about','research']), updated: optionalDate })
});

export const collections = { blog, publications, projects, news, photos, pages };
