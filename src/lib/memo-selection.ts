export type MemoSourceLine = {
  index: number;
  text: string;
};

/** Return selectable, non-empty lines while retaining their original indexes. */
export function createMemoSourceLines(markdown: string): MemoSourceLine[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const visible = lines
    .map((text, index) => ({ index, text }))
    .filter(({ text }) => text.trim().length > 0);
  return visible.length ? visible : [{ index: 0, text: markdown }];
}

/** Compose only the selected source lines for diagram generation. */
export function selectMemoSource(markdown: string, selectedIndexes: ReadonlySet<number>): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  if (!selectedIndexes.size) return '';
  const selectableIndexes = lines.flatMap((text, index) => text.trim() ? [index] : []);
  if (selectableIndexes.length > 0 && selectableIndexes.every((index) => selectedIndexes.has(index))) return markdown.trim();
  return lines.filter((_, index) => selectedIndexes.has(index)).join('\n').trim();
}
