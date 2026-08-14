'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import { FlowNoteLogo } from '@/components/brand/FlowNoteLogo';
import { ActivityDiagram } from '@/components/diagram/ActivityDiagram';
import { NoteEditor } from '@/components/editor/NoteEditor';
import { GenerationSourceModal } from '@/components/editor/GenerationSourceModal';
import { PonchiPreview } from '@/components/export/PonchiPreview';
import { apiRequest, jsonBody } from '@/lib/api-client';
import { EMPTY_GRAPH, formatDate, normalizeGraph, normalizeNote, type ActivityGraph, type DiagramSnapshot, type NoteRecord } from '@/lib/flow-types';
import { createMemoSourceLines, selectMemoSource } from '@/lib/memo-selection';

type NotesResponse = { notes?: unknown[] } | unknown[];

function createLocalNote(): NoteRecord { return { id: `local-${Date.now()}`, title: '無題のメモ', contentMarkdown: '', version: 0 }; }

export function NotesWorkspace() {
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [note, setNote] = useState<NoteRecord>(createLocalNote);
  const [graph, setGraph] = useState<ActivityGraph>(EMPTY_GRAPH);
  const [query, setQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [diagramError, setDiagramError] = useState('');
  const [outputOpen, setOutputOpen] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<DiagramSnapshot | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [selectedSourceIndexes, setSelectedSourceIndexes] = useState<Set<number>>(new Set());
  const [lastGenerationSource, setLastGenerationSource] = useState('');

  const sourceLines = useMemo(() => createMemoSourceLines(note.contentMarkdown), [note.contentMarkdown]);
  const selectedSource = useMemo(() => selectMemoSource(note.contentMarkdown, selectedSourceIndexes), [note.contentMarkdown, selectedSourceIndexes]);

  const loadNotes = useCallback(async () => {
    try {
      const response = await apiRequest<NotesResponse>('/api/notes');
      const items = Array.isArray(response) ? response : response.notes ?? [];
      const normalized = items.map((item) => normalizeNote(item));
      setNotes(normalized);
      if (normalized.length) setNote(normalized[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'メモ一覧を読み込めませんでした。');
    }
  }, []);

  useEffect(() => { void loadNotes(); }, [loadNotes]);
  useEffect(() => { setSidebarCollapsed(window.localStorage.getItem('flownote-sidebar-collapsed') === 'true'); }, []);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);

  const filteredNotes = useMemo(() => notes.filter((item) => `${item.title} ${item.contentMarkdown}`.toLowerCase().includes(query.toLowerCase())), [notes, query]);

  function chooseNote(next: NoteRecord) {
    if (dirty && !window.confirm('未保存の変更があります。破棄してメモを切り替えますか？')) return;
    setNote(next); setDirty(false); setGraph(EMPTY_GRAPH); setDiagramError('');
    setSavedSnapshot(null);
    setSourceModalOpen(false); setSelectedSourceIndexes(new Set()); setLastGenerationSource('');
  }

  async function newNote() {
    if (dirty && !window.confirm('未保存の変更があります。破棄して新しいメモを作成しますか？')) return;
    try {
      const body = await apiRequest<unknown>('/api/notes', jsonBody({ title: '無題のメモ', contentMarkdown: '' }));
      const created = normalizeNote(body, `local-${Date.now()}`); setNotes((current) => [created, ...current]); setNote(created);
    } catch {
      const created = createLocalNote(); setNotes((current) => [created, ...current]); setNote(created);
    }
    setDirty(false); setGraph(EMPTY_GRAPH);
    setSavedSnapshot(null);
    setSourceModalOpen(false); setSelectedSourceIndexes(new Set()); setLastGenerationSource('');
  }

  async function saveNote() {
    if (saving || !dirty) return;
    setSaving(true); setError('');
    try {
      const payload = { title: note.title, contentMarkdown: note.contentMarkdown, content_markdown: note.contentMarkdown, version: note.version };
      const body = note.id.startsWith('local-') ? await apiRequest<unknown>('/api/notes', jsonBody(payload)) : await apiRequest<unknown>(`/api/notes/${encodeURIComponent(note.id)}`, { ...jsonBody(payload), method: 'PUT' });
      const saved = normalizeNote(body, note.id); setNote(saved); setNotes((current) => current.map((item) => item.id === note.id ? saved : item)); setDirty(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存できませんでした。入力内容は保持されています。'); }
    finally { setSaving(false); }
  }

  function openSourceModal() {
    if (generating || !note.contentMarkdown.trim()) return;
    setSelectedSourceIndexes(new Set(sourceLines.map(({ index }) => index)));
    setSourceModalOpen(true);
  }

  function toggleSourceLine(index: number) {
    setSelectedSourceIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  async function generateDiagram(sourceText = lastGenerationSource || note.contentMarkdown) {
    if (generating || !sourceText.trim()) return;
    setGenerating(true); setDiagramError('');
    try {
      const body = await apiRequest<unknown>('/api/diagrams/generate', jsonBody({ noteId: note.id, text: sourceText, contentMarkdown: sourceText, content_markdown: sourceText }));
      setGraph(normalizeGraph(body));
    } catch (reason) { setDiagramError(reason instanceof Error ? reason.message : '図を生成できませんでした。'); }
    finally { setGenerating(false); }
  }

  async function confirmSourceSelection() {
    if (!selectedSource.trim() || generating) return;
    setSourceModalOpen(false);
    setLastGenerationSource(selectedSource);
    await generateDiagram(selectedSource);
  }

  async function saveSnapshot(snapshot: DiagramSnapshot) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(note.id)) {
      throw new Error('先に「メモを保存」してから、ポンチ絵を保存してください。');
    }
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-snapshot`;
    const body = await apiRequest<{ id?: string; snapshotId?: string; savedAt?: string; snapshot?: { id?: string; savedAt?: string } }>('/api/diagram-snapshots', jsonBody({ noteId: note.id, graph: snapshot.graph, warnings: snapshot.graph.warnings ?? [], summary: snapshot.summary, layoutConfig: snapshot.config, requestId }));
    return { id: body.snapshot?.id ?? body.id ?? body.snapshotId, savedAt: body.snapshot?.savedAt ?? body.savedAt };
  }

  async function openOutput() {
    setOutputOpen(true);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(note.id)) return;
    try {
      const body = await apiRequest<{ snapshots?: unknown[] }>(`/api/diagram-snapshots?noteId=${encodeURIComponent(note.id)}`);
      const raw = body.snapshots?.[body.snapshots.length - 1];
      if (!raw || typeof raw !== 'object') return;
      const value = raw as Record<string, unknown>;
      const configValue = (value.layoutConfig ?? value.config ?? {}) as Record<string, unknown>;
      setSavedSnapshot({ id: typeof value.id === 'string' ? value.id : undefined, graph: normalizeGraph(value.graph), warnings: Array.isArray(value.warnings) ? value.warnings as ActivityGraph['warnings'] : undefined, summary: String(value.summary ?? ''), config: { title: String(configValue.title ?? note.title), summary: String(configValue.summary ?? value.summary ?? ''), accent: String(configValue.accent ?? configValue.accentColor ?? '#425C4A'), layout: configValue.layout === 'compact' ? 'compact' : 'wide', showCards: configValue.showCards !== false }, savedAt: typeof value.savedAt === 'string' ? value.savedAt : undefined });
    } catch { /* A preview remains useful even when listing snapshots is unavailable. */ }
  }

  async function logout() {
    if (dirty && !window.confirm('未保存の変更があります。ログアウトしますか？')) return;
    await signOut({ redirect: false }).catch(() => undefined);
    window.location.assign('/login');
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('flownote-sidebar-collapsed', String(next));
      return next;
    });
  }

  return <>
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}><div className="sidebar-brand"><FlowNoteLogo className="sidebar-logo" /><span className="sidebar-brand-text">FlowNote</span><button type="button" className="desktop-sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? 'サイドバーを展開' : 'サイドバーを縮小'} title={sidebarCollapsed ? 'サイドバーを展開' : 'サイドバーを縮小'}>{sidebarCollapsed ? '›' : '‹'}</button><button type="button" className="mobile-sidebar-close" onClick={() => setMobileSidebarOpen(false)} aria-label="メモ一覧を閉じる">×</button></div><button type="button" className="button button-primary new-note-button" onClick={newNote}><span aria-hidden="true">＋</span><span className="sidebar-control-text">新しいメモ</span></button><label className="search-field"><span aria-hidden="true">⌕</span><span className="sr-only">メモを検索</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="メモを検索…" /></label><div className="sidebar-label">最近のメモ <span>{filteredNotes.length}</span></div><nav className="note-list" aria-label="メモ一覧">{filteredNotes.map((item) => <button type="button" className={`note-list-item ${item.id === note.id ? 'selected' : ''}`} key={item.id} onClick={() => { chooseNote(item); setMobileSidebarOpen(false); }}><strong>{item.title || '無題のメモ'}</strong><span>{formatDate(item.updatedAt) || '新しいメモ'}</span><p>{item.contentMarkdown.replace(/[#>*`]/g, '').slice(0, 48) || '内容がありません'}</p></button>)}{!filteredNotes.length && <p className="sidebar-empty">まだメモがありません。<br />最初のメモを作りましょう。</p>}</nav><div className="sidebar-footer"><span className="avatar" aria-hidden="true">U</span><span className="sidebar-user">共有ワークスペース</span><button type="button" className="logout-button" onClick={logout}>ログアウト</button></div></aside>
      <main className="workspace"><header className="workspace-header"><button type="button" className="mobile-menu-button" onClick={() => setMobileSidebarOpen(true)} aria-label="メモ一覧を開く">☰</button><div className="mobile-brand"><FlowNoteLogo className="mobile-logo" />FlowNote</div><span className="workspace-context">メモ / {note.title || '無題のメモ'}</span><span className="toolbar-spacer" /><span className={`status-badge ${dirty ? 'status-dirty' : 'status-saved'}`} role="status"><i aria-hidden="true" />{saving ? '保存しています…' : dirty ? '未保存の変更' : '保存済み'}</span><button type="button" className="button button-secondary" onClick={saveNote} disabled={!dirty || saving}>{saving ? '保存中…' : 'メモを保存'}</button><button type="button" className="button button-primary" onClick={openSourceModal} disabled={generating || !note.contentMarkdown.trim()}>{generating ? '生成中…' : '図を生成する'} <kbd>⌘↵</kbd></button></header><div className="workspace-content">{error && <div className="global-error" role="alert">{error}</div>}<NoteEditor title={note.title} markdown={note.contentMarkdown} onTitleChange={(title) => { setNote((current) => ({ ...current, title })); setDirty(true); }} onMarkdownChange={(contentMarkdown) => { setNote((current) => ({ ...current, contentMarkdown })); setDirty(true); setLastGenerationSource(''); }} onGenerate={openSourceModal} onSave={saveNote} saving={saving} generating={generating} dirty={dirty} /><ActivityDiagram graph={graph} generating={generating} error={diagramError} onRetry={() => lastGenerationSource ? void generateDiagram(lastGenerationSource) : openSourceModal()} /></div></main>
      <button type="button" className="floating-output-button button button-primary" onClick={openOutput} disabled={!graph.nodes.length}>ポンチ絵をつくる <span aria-hidden="true">↗</span></button>
    </div>
    <PonchiPreview open={outputOpen} graph={graph} noteTitle={note.title} initialSnapshot={savedSnapshot} onClose={() => setOutputOpen(false)} onSave={saveSnapshot} />
    <GenerationSourceModal open={sourceModalOpen} lines={sourceLines} selectedIndexes={selectedSourceIndexes} selectedText={selectedSource} onToggle={toggleSourceLine} onSelectAll={() => setSelectedSourceIndexes(new Set(sourceLines.map(({ index }) => index)))} onClear={() => setSelectedSourceIndexes(new Set())} onCancel={() => setSourceModalOpen(false)} onConfirm={() => void confirmSourceSelection()} />
  </>;
}
