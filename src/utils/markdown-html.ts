// 渲染后的正文中，没有任何正文内容的二级标题小节（如暂无奖项、链接等）直接隐藏，
// 避免页面上出现只剩标题的空小节。
export const hideEmptySections = (markup: string): string => markup
  .split(/(?=<h2\b)/i)
  .filter((block) => {
    if (!/^\s*<h2\b/i.test(block)) return block.trim().length > 0;
    const body = block.replace(/<h2\b[\s\S]*?<\/h2>/i, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').trim();
    return body.length > 0 || /<(img|table|iframe|video|blockquote)\b/i.test(block);
  })
  .join('');

export const sectionedBody = (rendered?: { html?: string }): string | undefined =>
  rendered?.html ? hideEmptySections(rendered.html) : undefined;
