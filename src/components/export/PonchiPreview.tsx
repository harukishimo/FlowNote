'use client';

import { useEffect, useMemo, useState } from 'react';
import { ActivityGraphSvg, activityGraphCanvasWidth } from '@/components/diagram/ActivityGraphSvg';
import type { ActivityGraph, DiagramSnapshot, SnapshotConfig } from '@/lib/flow-types';
import { buildStandaloneHtml as buildLocalHtml } from '@/lib/export/build-html';
import { sanitizeFilename } from '@/lib/markdown';

type Props = {
  open: boolean;
  graph: ActivityGraph;
  noteTitle: string;
  initialSnapshot?: DiagramSnapshot | null;
  onClose: () => void;
  onSave: (snapshot: DiagramSnapshot) => Promise<{ id?: string; savedAt?: string } | void>;
};

const defaultConfig = (title: string): SnapshotConfig => ({ title: title || '業務フロー', summary: 'このフローの要点を整理した説明資料です。', accent: '#425C4A', layout: 'wide', showCards: true });

export function PonchiPreview({ open, graph, noteTitle, initialSnapshot, onClose, onSave }: Props) {
  const [config, setConfig] = useState<SnapshotConfig>(() => initialSnapshot?.config ?? defaultConfig(noteTitle));
  const [savedSignature, setSavedSignature] = useState(() => initialSnapshot ? JSON.stringify({ graph: initialSnapshot.graph, config: initialSnapshot.config }) : '');
  const [snapshotId, setSnapshotId] = useState(initialSnapshot?.id);
  const [savedAt, setSavedAt] = useState(initialSnapshot?.savedAt);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  useEffect(() => {
    if (!open || !initialSnapshot) return;
    setConfig(initialSnapshot.config);
    setSnapshotId(initialSnapshot.id);
    setSavedAt(initialSnapshot.savedAt);
    setSavedSignature(JSON.stringify({ graph: initialSnapshot.graph, config: initialSnapshot.config }));
  }, [initialSnapshot, open]);
  const signature = JSON.stringify({ graph, config });
  const dirty = signature !== savedSignature;

  const snapshot = useMemo<DiagramSnapshot>(() => ({ id: snapshotId, graph, warnings: graph.warnings, summary: config.summary, config, savedAt }), [config, graph, savedAt, snapshotId]);
  if (!open) return null;

  async function save() {
    if (saving) return;
    setSaving(true); setSaveError('');
    try {
      const result = await onSave(snapshot);
      setSnapshotId(result?.id ?? snapshotId);
      setSavedAt(result?.savedAt ?? new Date().toISOString());
      setSavedSignature(JSON.stringify({ graph, config }));
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : '保存できませんでした。入力内容は保持されています。');
    } finally { setSaving(false); }
  }

  function close() {
    if (dirty && !window.confirm('このポンチ絵には未保存の変更があります。保存せずに閉じますか？')) return;
    onClose();
  }

  async function requestHtml() {
    try {
      const response = await fetch('/api/exports/html', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph: snapshot.graph, options: { title: config.title, summary: config.summary, orientation: config.layout === 'wide' ? 'horizontal' : 'vertical', accentColor: config.accent, showWarnings: true } }) });
      if (response.ok) return await response.text();
    } catch { /* Local deterministic fallback keeps export available during API outages. */ }
    return buildLocalHtml(snapshot.graph, { title: config.title, summary: config.summary, orientation: config.layout === 'wide' ? 'horizontal' : 'vertical', accentColor: config.accent, showWarnings: true });
  }

  async function download() {
    const html = await requestHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${sanitizeFilename(config.title)}.html`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function browserPreview() {
    const child = window.open('', '_blank', 'noopener,noreferrer');
    if (!child) return;
    child.document.write('<p style="font-family:system-ui;padding:24px">プレビューを準備しています…</p>');
    const html = await requestHtml();
    child.document.open(); child.document.write(html); child.document.close();
  }

  const set = (change: Partial<SnapshotConfig>) => setConfig((current) => ({ ...current, ...change }));
  return <div className="output-layer" role="dialog" aria-modal="true" aria-labelledby="output-heading">
    <header className="output-toolbar"><button type="button" className="button button-ghost" onClick={close}>← 編集に戻る</button><div className="output-title"><p className="eyebrow">OUTPUT</p><h1 id="output-heading">ポンチ絵プレビュー</h1></div><span className={`status-badge ${dirty ? 'status-dirty' : 'status-saved'}`}><i aria-hidden="true" />{saving ? '保存しています…' : dirty ? '未保存のポンチ絵' : `✓ 保存済み${savedAt ? ` ${new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(savedAt))}` : ''}`}</span><span className="toolbar-spacer" /><button type="button" className="button button-secondary" onClick={browserPreview}>ブラウザで確認</button><button type="button" className="button button-secondary" onClick={download}>HTMLをダウンロード</button><button type="button" className="button button-primary" onClick={save} disabled={saving || !dirty}>ポンチ絵を保存</button></header>
    <div className="output-layout"><div className="ponchi-stage"><PonchiCanvas graph={graph} config={config} noteTitle={noteTitle} /></div><aside className="output-settings" aria-label="出力設定"><p className="eyebrow">SETTINGS</p><h2>表示を整える</h2>{saveError && <p className="form-error" role="alert">{saveError}</p>}<label>タイトル<input value={config.title} onChange={(event) => set({ title: event.target.value })} /></label><label>概要文<textarea value={config.summary} onChange={(event) => set({ summary: event.target.value })} rows={5} /></label><label>アクセントカラー<div className="color-input"><input type="color" value={config.accent} onChange={(event) => set({ accent: event.target.value })} /><code>{config.accent}</code></div></label><fieldset><legend>レイアウト</legend><label className="radio-label"><input type="radio" checked={config.layout === 'wide'} onChange={() => set({ layout: 'wide' })} />ワイド</label><label className="radio-label"><input type="radio" checked={config.layout === 'compact'} onChange={() => set({ layout: 'compact' })} />コンパクト</label></fieldset><label className="checkbox-label"><input type="checkbox" checked={config.showCards} onChange={(event) => set({ showCards: event.target.checked })} />補足カードを表示</label><p className="settings-note">プレビューやHTMLのダウンロードは保存操作ではありません。「ポンチ絵を保存」を押した時だけスナップショットが保存されます。</p></aside></div>
  </div>;
}

function PonchiCanvas({ graph, config, noteTitle }: { graph: ActivityGraph; config: SnapshotConfig; noteTitle: string }) {
  const canvasWidth = activityGraphCanvasWidth(graph);
  const previewWidth = config.layout === 'compact' ? 620 : 820;
  const scale = Math.min(1, previewWidth / canvasWidth);
  return <article className={`ponchi-canvas ${config.layout}`} style={{ '--accent': config.accent } as React.CSSProperties}><div className="ponchi-intro"><p className="eyebrow">FLOWNOTE / PROCESS BRIEF</p><h2>{config.title || noteTitle}</h2><p>{config.summary}</p></div><div className="ponchi-diagram"><div className="ponchi-section-title">アクティビティ図</div>{graph.nodes.length ? <div className="ponchi-activity-scroll"><ActivityGraphSvg graph={graph} zoom={scale} accent={config.accent} className="ponchi-activity-svg" /></div> : <p className="muted-copy">図がまだ生成されていません。</p>}</div>{config.showCards && <div className="ponchi-cards"><section><span>判断ポイント</span><strong>{graph.nodes.filter((node) => node.type === 'decision').length || '—'}</strong><p>分岐を確認してください</p></section><section><span>関係する処理</span><strong>{graph.nodes.filter((node) => node.type === 'action' || node.type === 'step').length || '—'}</strong><p>担当者と手順を整理</p></section><section><span>確認事項</span><strong>{graph.warnings?.length || '0'}</strong><p>曖昧な箇所を表示</p></section></div>}</article>;
}
