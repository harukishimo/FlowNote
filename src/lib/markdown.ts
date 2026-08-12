type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> };

function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_{}\[\]()#+.!|>~-])/g, '\\$1');
}

function inlineMarkdown(node: JsonNode): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'text') {
    let text = node.text ?? '';
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') text = `**${text}**`;
      else if (mark.type === 'italic') text = `*${text}*`;
      else if (mark.type === 'strike') text = `~~${text}~~`;
      else if (mark.type === 'code') text = `\`${text}\``;
      else if (mark.type === 'link') text = `[${text}](${String(mark.attrs?.href ?? '')})`;
    }
    return text;
  }
  return (node.content ?? []).map(inlineMarkdown).join('');
}

export function editorJsonToMarkdown(json: { content?: JsonNode[] } | null | undefined) {
  if (!json?.content) return '';
  const lines = serializeBlocks(json.content);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function serializeBlocks(nodes: JsonNode[], indent = ''): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    const content = inlineMarkdown(node);
    switch (node.type) {
      case 'heading': lines.push(`${indent}${'#'.repeat(Math.min(6, Number(node.attrs?.level ?? 1)))} ${content}`); break;
      case 'bulletList': lines.push(...serializeList(node, 'bullet', indent), ''); break;
      case 'orderedList': lines.push(...serializeList(node, 'ordered', indent), ''); break;
      case 'blockquote': lines.push(...content.split('\n').map((line) => `${indent}> ${line}`)); break;
      case 'codeBlock': lines.push(`${indent}\`\`\`\n${node.content?.map((child) => child.text ?? '').join('') ?? ''}\n${indent}\`\`\``); break;
      case 'horizontalRule': lines.push(`${indent}---`); break;
      default: lines.push(`${indent}${content}`);
    }
  }
  return lines;
}

function serializeList(node: JsonNode, kind: 'bullet' | 'ordered', indent: string): string[] {
  const lines: string[] = [];
  const start = kind === 'ordered' ? Number(node.attrs?.start ?? 1) : 1;
  (node.content ?? []).forEach((item, itemIndex) => {
    const children = item.content ?? [];
    const firstTextBlock = children.find((child) => child.type !== 'bulletList' && child.type !== 'orderedList');
    const marker = kind === 'bullet' ? '-' : `${start + itemIndex}.`;
    lines.push(`${indent}${marker} ${firstTextBlock ? inlineMarkdown(firstTextBlock) : ''}`.trimEnd());
    let skippedFirstTextBlock = false;
    for (const child of children) {
      if (child === firstTextBlock && !skippedFirstTextBlock) {
        skippedFirstTextBlock = true;
        continue;
      }
      if (child.type === 'bulletList') lines.push(...serializeList(child, 'bullet', `${indent}  `));
      else if (child.type === 'orderedList') lines.push(...serializeList(child, 'ordered', `${indent}  `));
      else lines.push(...serializeBlocks([child], `${indent}  `));
    }
  });
  return lines;
}

function inlineHtml(value: string) {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r/g, '').split('\n');
  const output: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (raw.trim().startsWith('```')) {
      if (inCode) { output.push(`<pre><code>${codeLines.join('\n').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`); codeLines = []; inCode = false; }
      else { inCode = true; }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }
    const listLine = parseListLine(raw);
    if (listLine) {
      const rendered = renderMarkdownList(lines, index, listLine.indent, listLine.kind);
      output.push(rendered.html);
      index = rendered.nextIndex - 1;
      continue;
    }
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { const level = heading[1].length; output.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`); continue; }
    if (/^>\s?/.test(raw)) { output.push(`<blockquote><p>${inlineHtml(raw.replace(/^>\s?/, ''))}</p></blockquote>`); continue; }
    if (!raw.trim()) continue;
    output.push(`<p>${inlineHtml(raw)}</p>`);
  }
  if (inCode) output.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  return output.join('');
}

type ParsedListLine = { indent: number; kind: 'bullet' | 'ordered'; content: string; start: number };

function parseListLine(raw: string): ParsedListLine | null {
  const match = raw.match(/^(\s*)(?:(- |\* )|(\d+)\.\s+)(.*)$/);
  if (!match) return null;
  const indent = [...match[1]].reduce((width, character) => width + (character === '\t' ? 2 : 1), 0);
  return {
    indent,
    kind: match[2] ? 'bullet' : 'ordered',
    content: match[4],
    start: match[3] ? Number(match[3]) : 1,
  };
}

function renderMarkdownList(
  lines: string[],
  startIndex: number,
  baseIndent: number,
  kind: 'bullet' | 'ordered',
): { html: string; nextIndex: number } {
  const tag = kind === 'bullet' ? 'ul' : 'ol';
  const first = parseListLine(lines[startIndex]);
  const startAttribute = kind === 'ordered' && first && first.start !== 1 ? ` start="${first.start}"` : '';
  let html = `<${tag}${startAttribute}>`;
  let index = startIndex;

  while (index < lines.length) {
    const current = parseListLine(lines[index]);
    if (!current || current.indent !== baseIndent || current.kind !== kind) break;
    html += `<li>${inlineHtml(current.content)}`;
    index += 1;

    while (index < lines.length) {
      const nested = parseListLine(lines[index]);
      if (!nested || nested.indent <= baseIndent) break;
      const rendered = renderMarkdownList(lines, index, nested.indent, nested.kind);
      html += rendered.html;
      index = rendered.nextIndex;
    }
    html += '</li>';
  }

  return { html: `${html}</${tag}>`, nextIndex: index };
}

export function sanitizeFilename(value: string) { return (value || 'flownote').replace(/[^a-zA-Z0-9一-龠ぁ-んァ-ヶ_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'flownote'; }

export function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
