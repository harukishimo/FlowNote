'use client';

import { useEffect } from 'react';
import type { MemoSourceLine } from '@/lib/memo-selection';

type Props = {
  open: boolean;
  lines: MemoSourceLine[];
  selectedIndexes: ReadonlySet<number>;
  selectedText: string;
  onToggle: (index: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function GenerationSourceModal({ open, lines, selectedIndexes, selectedText, onToggle, onSelectAll, onClear, onCancel, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, open]);

  if (!open) return null;
  const selectedCount = lines.filter(({ index }) => selectedIndexes.has(index)).length;

  return <div className="source-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-modal-heading">
      <header className="source-modal-header">
        <div><p className="eyebrow">SOURCE RANGE</p><h2 id="source-modal-heading">図に使うメモの範囲</h2><p>選択した行だけをAIに渡してアクティビティ図を作成します。</p></div>
        <button type="button" className="source-modal-close" onClick={onCancel} aria-label="選択を閉じる">×</button>
      </header>
      <div className="source-modal-toolbar"><span>{selectedCount} / {lines.length} 行を選択中</span><span className="toolbar-spacer" /><button type="button" className="text-button" onClick={onSelectAll}>全選択</button><button type="button" className="text-button" onClick={onClear}>全解除</button></div>
      <div className="source-modal-body">
        <div className="source-line-list" aria-label="図に使うメモの行">
          {lines.map(({ index, text }) => <label className={`source-line ${selectedIndexes.has(index) ? 'selected' : ''}`} key={index}>
            <input type="checkbox" checked={selectedIndexes.has(index)} onChange={() => onToggle(index)} />
            <span className="source-line-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="source-line-text">{text}</span>
          </label>)}
        </div>
        <div className="source-selection-preview"><p className="source-preview-label">AIへ渡す内容</p><pre>{selectedText || '行を1つ以上選択してください。'}</pre></div>
      </div>
      <footer className="source-modal-footer"><button type="button" className="button button-secondary" onClick={onCancel}>キャンセル</button><button type="button" className="button button-primary" onClick={onConfirm} disabled={!selectedText.trim()}>この範囲で図を生成</button></footer>
    </section>
  </div>;
}
