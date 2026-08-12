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
  const lines: string[] = [];
  for (const node of json.content) {
    const content = inlineMarkdown(node);
    switch (node.type) {
      case 'heading': lines.push(`${'#'.repeat(Math.min(6, Number(node.attrs?.level ?? 1)))} ${content}`); break;
      case 'bulletList':
        for (const item of node.content ?? []) for (const child of item.content ?? []) lines.push(`- ${inlineMarkdown(child)}`);
        lines.push(''); break;
      case 'orderedList':
        (node.content ?? []).forEach((item, i) => { for (const child of item.content ?? []) lines.push(`${i + 1}. ${inlineMarkdown(child)}`); });
        lines.push(''); break;
      case 'blockquote': lines.push(...content.split('\n').map((line) => `> ${line}`)); break;
      case 'codeBlock': lines.push(`\`\`\`\n${node.content?.map((child) => child.text ?? '').join('') ?? ''}\n\`\`\``); break;
      case 'horizontalRule': lines.push('---'); break;
      default: lines.push(content);
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
  let list: 'bullet' | 'ordered' | null = null;
  const closeList = () => { if (list) output.push(`</${list === 'bullet' ? 'ul' : 'ol'}>`); list = null; };
  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      if (inCode) { output.push(`<pre><code>${codeLines.join('\n').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`); codeLines = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }
    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { closeList(); const level = heading[1].length; output.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`); continue; }
    const bullet = raw.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) { if (list !== 'bullet') { closeList(); output.push('<ul>'); list = 'bullet'; } output.push(`<li>${inlineHtml(bullet[1])}</li>`); continue; }
    const ordered = raw.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) { if (list !== 'ordered') { closeList(); output.push('<ol>'); list = 'ordered'; } output.push(`<li>${inlineHtml(ordered[1])}</li>`); continue; }
    if (/^>\s?/.test(raw)) { closeList(); output.push(`<blockquote><p>${inlineHtml(raw.replace(/^>\s?/, ''))}</p></blockquote>`); continue; }
    if (!raw.trim()) { closeList(); continue; }
    closeList(); output.push(`<p>${inlineHtml(raw)}</p>`);
  }
  if (inCode) output.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  closeList();
  return output.join('');
}

export function sanitizeFilename(value: string) { return (value || 'flownote').replace(/[^a-zA-Z0-9一-龠ぁ-んァ-ヶ_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'flownote'; }

export function escapeHtml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
