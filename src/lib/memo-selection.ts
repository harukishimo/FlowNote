export type MemoSourceLine = {
  index: number;
  text: string;
};

export type MemoSourceSelection = {
  text: string;
  includedIndexes: Set<number>;
  contextIndexes: Set<number>;
};

/** Return selectable, non-empty lines while retaining their original indexes. */
export function createMemoSourceLines(markdown: string): MemoSourceLine[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const visible = lines
    .map((text, index) => ({ index, text }))
    .filter(({ text }) => text.trim().length > 0);
  return visible.length ? visible : [{ index: 0, text: markdown }];
}

type ParsedListLine = { indent: number };

function parseListLine(raw: string): ParsedListLine | null {
  const match = raw.match(/^(\s*)(?:(?:- |\* )|(?:\d+)\.\s+)(.*)$/);
  if (!match) return null;
  return { indent: [...match[1]].reduce((width, character) => width + (character === '\t' ? 2 : 1), 0) };
}

function trimBoundaryNewlines(value: string): string {
  return value.replace(/^(?:\n)+|(?:\n)+$/g, '');
}

function addListAncestors(lines: string[], selectedIndexes: ReadonlySet<number>, includedIndexes: Set<number>, contextIndexes: Set<number>): void {
  const explicitIndexes = [...includedIndexes];
  for (const selectedIndex of explicitIndexes) {
    const selectedLine = parseListLine(lines[selectedIndex]);
    if (!selectedLine || selectedLine.indent === 0) continue;
    let childIndent = selectedLine.indent;
    for (let index = selectedIndex - 1; index >= 0 && childIndent > 0; index -= 1) {
      const candidate = parseListLine(lines[index]);
      if (!candidate) {
        if (lines[index].trim()) break;
        continue;
      }
      if (candidate.indent < childIndent) {
        includedIndexes.add(index);
        if (!selectedIndexes.has(index)) contextIndexes.add(index);
        childIndent = candidate.indent;
      }
    }
  }
}

/** Resolve selected lines and add list parents needed to retain hierarchy. */
export function resolveMemoSourceSelection(markdown: string, selectedIndexes: ReadonlySet<number>): MemoSourceSelection {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const includedIndexes = new Set([...selectedIndexes].filter((index) => index >= 0 && index < lines.length && lines[index].trim()));
  const contextIndexes = new Set<number>();
  if (!includedIndexes.size) return { text: '', includedIndexes, contextIndexes };

  addListAncestors(lines, selectedIndexes, includedIndexes, contextIndexes);

  // Keep blank separators between included lines without reintroducing any
  // unselected memo content.
  const sortedIndexes = [...includedIndexes].sort((a, b) => a - b);
  for (let index = sortedIndexes[0]; index <= sortedIndexes[sortedIndexes.length - 1]; index += 1) {
    if (!lines[index].trim()) includedIndexes.add(index);
  }
  const text = trimBoundaryNewlines(lines.filter((_, index) => includedIndexes.has(index)).join('\n'));
  return { text, includedIndexes, contextIndexes };
}

/** Compose only the selected source lines for diagram generation. */
export function selectMemoSource(markdown: string, selectedIndexes: ReadonlySet<number>): string {
  return resolveMemoSourceSelection(markdown, selectedIndexes).text;
}
