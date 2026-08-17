import { describe, expect, it } from 'vitest';
import { createMemoSourceLines, resolveMemoSourceSelection, selectMemoSource } from './memo-selection';

describe('memo source selection', () => {
  it('keeps original line indexes while hiding blank lines', () => {
    expect(createMemoSourceLines('開始\n\n確認\n終了')).toEqual([
      { index: 0, text: '開始' },
      { index: 2, text: '確認' },
      { index: 3, text: '終了' },
    ]);
  });

  it('returns only selected lines for generation', () => {
    expect(selectMemoSource('開始\n確認\n終了', new Set([1]))).toBe('確認');
    expect(selectMemoSource('開始\n確認\n終了', new Set([0, 2]))).toBe('開始\n終了');
  });

  it('preserves indentation and adds the parent context for a nested selection', () => {
    const markdown = '- 受付\n  - 内容を確認\n    - 不備なら差し戻し\n  - 問題なければ承認';
    const selection = resolveMemoSourceSelection(markdown, new Set([1]));
    expect(selection.text).toBe('- 受付\n  - 内容を確認');
    expect(selection.contextIndexes).toEqual(new Set([0]));
  });

  it('keeps selected siblings as siblings and includes their shared parent once', () => {
    const markdown = '- 受付\n  - 内容を確認\n  - 問題なければ承認\n- 終了処理';
    const selection = resolveMemoSourceSelection(markdown, new Set([1, 2]));
    expect(selection.text).toBe('- 受付\n  - 内容を確認\n  - 問題なければ承認');
    expect(selection.contextIndexes).toEqual(new Set([0]));
  });

  it('keeps leading indentation when a non-list fragment has no parent context', () => {
    expect(selectMemoSource('  補足情報', new Set([0]))).toBe('  補足情報');
  });

  it('preserves the complete markdown when all lines are selected', () => {
    const markdown = '# 手順\n\n- 受付\n- 確認\n';
    expect(selectMemoSource(markdown, new Set([0, 1, 2, 3, 4]))).toBe(markdown.trim());
  });
});
