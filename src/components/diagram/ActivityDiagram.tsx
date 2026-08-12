'use client';

import { useEffect, useRef, useState } from 'react';
import type { ActivityGraph } from '@/lib/flow-types';
import { ActivityGraphSvg, activityGraphCanvasWidth } from '@/components/diagram/ActivityGraphSvg';

type Props = { graph: ActivityGraph; generating?: boolean; error?: string; onRetry?: () => void; onSelectSource?: (start: number, end: number) => void };

export function ActivityDiagram({ graph, generating, error, onRetry, onSelectSource }: Props) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasWidth = activityGraphCanvasWidth(graph);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasWidth, graph, zoom]);

  return (
    <section className="diagram-panel" aria-labelledby="diagram-heading">
      <div className="panel-heading">
        <div><p className="eyebrow">ACTIVITY DIAGRAM</p><h2 id="diagram-heading">アクティビティ図</h2></div>
        {graph.nodes.length > 0 && <div className="zoom-controls" aria-label="図の拡大縮小"><button type="button" onClick={() => setZoom((value) => Math.max(0.7, +(value - 0.1).toFixed(1)))} aria-label="縮小">−</button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(1.5, +(value + 0.1).toFixed(1)))} aria-label="拡大">＋</button></div>}
      </div>
      <div className="diagram-canvas" aria-live="polite">
        {generating && <div className="diagram-overlay"><span className="spinner" aria-hidden="true" />図を整理しています…</div>}
        {error && !generating && <div className="diagram-message"><span className="message-icon">!</span><p>{error}</p>{onRetry && <button type="button" className="button button-secondary" onClick={onRetry}>もう一度生成</button>}</div>}
        {!error && !generating && !graph.nodes.length && <div className="diagram-empty"><div className="empty-glyph" aria-hidden="true">↗</div><h3>ここに流れが表示されます</h3><p>メモを書いて「図を生成する」を押してください。<br />入力途中の文章はそのまま保持されます。</p></div>}
        {!error && graph.nodes.length > 0 && <div className="svg-scroll" ref={scrollRef}><ActivityGraphSvg graph={graph} zoom={zoom} onSelectSource={onSelectSource} /></div>}
      </div>
      {graph.warnings && graph.warnings.length > 0 && <div className="warning-list" role="status"><div className="warning-title"><span aria-hidden="true">△</span>確認をおすすめします（{graph.warnings.length}件）</div>{graph.warnings.map((warning, index) => <button type="button" className="warning-item" key={`${warning.code ?? 'warning'}-${index}`} onClick={() => warning.sourceRange && onSelectSource?.(warning.sourceRange.start, warning.sourceRange.end)}>{formatWarningMessage(warning)}</button>)}</div>}
      {graph.nodes.length > 0 && <div className="diagram-legend"><span><i className="legend-dot start" />開始・終了</span><span><i className="legend-box" />処理</span><span><i className="legend-diamond" />判断</span></div>}
    </section>
  );
}

const warningMessages: Record<string, string> = {
  'missing-start': '開始点が見つかりません。',
  'multiple-start': '開始点が複数あります。',
  'missing-end': '終了点が見つかりません。',
  'multiple-end': '終了点が複数あります。',
  'unreachable-node': '開始点から到達できない処理があります。',
  'source-range-out-of-bounds': '元のメモとの対応位置を特定できない処理があります。',
  'termination': '終了点まで到達できない処理があります。',
  'decision-without-branches': '判断から分かれる経路が不足しています。',
  'missing-branch-label': '判断の経路に「はい」「いいえ」などの条件がありません。',
  'parallel-without-branches': '並行処理から分かれる経路が不足しています。',
  'merge-without-branches': '合流点へ入る経路が不足しています。',
  'loop-without-back-edge': '繰り返し処理の戻り先がありません。',
  'loop-without-exit': '繰り返し処理から抜ける経路がありません。',
  'self-loop': '処理が自分自身だけに戻っています。',
};

function formatWarningMessage(warning: { code?: string; message: string }): string {
  return (warning.code && warningMessages[warning.code]) || warning.message;
}
