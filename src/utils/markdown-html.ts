// 渲染后的正文中，没有任何正文内容（或只有占位提示）的二级标题小节直接隐藏，
// 避免页面上出现只剩标题的空小节。
const PLACEHOLDER = /^(?:尚未填写|待补充|暂未填写|暂无内容|稍后补充|敬请期待|待完善|tbd|to be added|coming soon|not available yet)[。.!！?？\s]*$/i;

export const plainText = (html: string): string => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const hasMedia = (block: string) => /<(img|table|iframe|video|blockquote)\b/i.test(block);

export const hideEmptySections = (markup: string): string => markup
  .split(/(?=<h2\b)/i)
  .filter((block) => {
    if (!/^\s*<h2\b/i.test(block)) return block.trim().length > 0;
    const body = plainText(block.replace(/<h2\b[\s\S]*?<\/h2>/i, ''));
    return (body.length > 0 && !PLACEHOLDER.test(body)) || hasMedia(block);
  })
  .join('');

export const sectionedBody = (rendered?: { html?: string }): string | undefined =>
  rendered?.html ? hideEmptySections(rendered.html) : undefined;

export interface DocSection { title: string; html: string }

// 按二级标题切分正文，便于不同页面采用各自的版式渲染。
export const splitSections = (markup: string): DocSection[] => {
  const sections: DocSection[] = [];
  for (const block of markup.split(/(?=<h2\b)/i)) {
    const match = block.match(/^\s*<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (!match) continue;
    const html = block.slice(match[0].length).trim();
    const text = plainText(match[1] ?? '');
    if (!html && !hasMedia(block)) continue;
    sections.push({ title: text, html });
  }
  return sections;
};
