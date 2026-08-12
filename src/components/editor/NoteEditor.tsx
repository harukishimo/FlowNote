'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor } from '@tiptap/core';
import { editorJsonToMarkdown, markdownToHtml } from '@/lib/markdown';

type Props = {
  title: string;
  markdown: string;
  onTitleChange: (title: string) => void;
  onMarkdownChange: (markdown: string) => void;
  onGenerate: () => void;
  onSave: () => void;
  saving?: boolean;
  generating?: boolean;
  dirty?: boolean;
};

function indentSelection(editor: Editor, outdent: boolean) {
  if (editor.isActive('listItem')) {
    const chain = editor.chain().focus();
    if (outdent) chain.liftListItem('listItem').run();
    else chain.sinkListItem('listItem').run();
    return;
  }

  const { from, to } = editor.state.selection;
  const paragraphs: number[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph') paragraphs.push(pos + 1);
  });
  if (!paragraphs.length) {
    const resolved = editor.state.doc.resolve(from);
    if (resolved.parent.type.name === 'paragraph') paragraphs.push(resolved.start(resolved.depth));
  }
  const tr = editor.state.tr;
  [...new Set(paragraphs)].sort((a, b) => b - a).forEach((position) => {
    const node = editor.state.doc.nodeAt(position - 1);
    if (!node) return;
    const text = node.textContent;
    if (outdent) {
      const match = text.match(/^(?:\t| {1,2})/);
      if (match) tr.delete(position, position + match[0].length);
    } else tr.insertText('\t', position);
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

export function NoteEditor({ title, markdown, onTitleChange, onMarkdownChange, onGenerate, onSave, saving, generating, dirty }: Props) {
  const composing = useRef(false);
  const initialMarkdown = useRef(markdown);
  const lastEmittedMarkdown = useRef(markdown);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Placeholder.configure({ placeholder: '業務の流れを自由に書いてください。\n\n例：申請を受け付けたら内容を確認し、不備があれば申請者へ差し戻します。' })],
    content: markdownToHtml(initialMarkdown.current),
    editorProps: {
      attributes: { class: 'note-editor-content', role: 'textbox', 'aria-label': 'メモ本文', 'aria-multiline': 'true' },
      handleDOMEvents: {
        compositionstart: () => { composing.current = true; return false; },
        compositionend: () => { window.setTimeout(() => { composing.current = false; }, 0); return false; },
        keydown: (_view, event) => {
          if (event.isComposing || composing.current) return false;
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); onSave(); return true; }
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (!generating) onGenerate(); return true; }
          if (event.key === 'Tab') { event.preventDefault(); indentSelection(editor!, event.shiftKey); return true; }
          // Enter intentionally falls through to ProseMirror's normal newline command.
          return false;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      const nextMarkdown = editorJsonToMarkdown(current.getJSON() as { content?: Array<Record<string, unknown>> });
      lastEmittedMarkdown.current = nextMarkdown;
      onMarkdownChange(nextMarkdown);
    },
  });

  // Tiptap keeps its own document after mount; synchronize it when the user
  // selects another saved note without echoing every keystroke back into the editor.
  useEffect(() => {
    if (!editor || markdown === lastEmittedMarkdown.current) return;
    editor.commands.setContent(markdownToHtml(markdown), false);
    lastEmittedMarkdown.current = markdown;
  }, [editor, markdown]);

  useEffect(() => {
    if (!editor) return;
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') event.preventDefault();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [editor]);

  function toggle(command: () => boolean) { editor?.chain().focus().run(); command(); }

  return (
    <section className="editor-panel" aria-labelledby="editor-heading">
      <div className="document-header">
        <label className="sr-only" htmlFor="note-title">メモのタイトル</label>
        <input id="note-title" className="document-title" value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="無題のメモ" />
        <span className={`status-badge ${dirty ? 'status-dirty' : 'status-saved'}`} role="status"><i aria-hidden="true" />{saving ? '保存しています…' : dirty ? '未保存' : '保存済み'}</span>
      </div>
      <div className="editor-toolbar" aria-label="書式ツールバー">
        <button type="button" className={editor?.isActive('bold') ? 'toolbar-button active' : 'toolbar-button'} onClick={() => toggle(() => editor?.chain().toggleBold().run() ?? false)} aria-label="太字" aria-pressed={editor?.isActive('bold')}>B</button>
        <button type="button" className={editor?.isActive('italic') ? 'toolbar-button active' : 'toolbar-button'} onClick={() => toggle(() => editor?.chain().toggleItalic().run() ?? false)} aria-label="斜体" aria-pressed={editor?.isActive('italic')}>I</button>
        <button type="button" className={editor?.isActive('strike') ? 'toolbar-button active' : 'toolbar-button'} onClick={() => toggle(() => editor?.chain().toggleStrike().run() ?? false)} aria-label="取り消し線" aria-pressed={editor?.isActive('strike')}>S</button>
        <span className="toolbar-divider" aria-hidden="true" />
        <button type="button" className="toolbar-button" onClick={() => toggle(() => editor?.chain().toggleHeading({ level: 2 }).run() ?? false)} aria-label="見出し">H</button>
        <button type="button" className="toolbar-button" onClick={() => toggle(() => editor?.chain().toggleBulletList().run() ?? false)} aria-label="箇条書き">•</button>
        <button type="button" className="toolbar-button" onClick={() => toggle(() => editor?.chain().toggleOrderedList().run() ?? false)} aria-label="番号付きリスト">1.</button>
        <button type="button" className="toolbar-button" onClick={() => toggle(() => editor?.chain().toggleBlockquote().run() ?? false)} aria-label="引用">❞</button>
        <span className="toolbar-spacer" />
        <button type="button" className="toolbar-button" onClick={() => editor && indentSelection(editor, true)} aria-label="アウトデント">⇤</button>
        <button type="button" className="toolbar-button" onClick={() => editor && indentSelection(editor, false)} aria-label="インデント">⇥</button>
      </div>
      <div className="editor-frame"><EditorContent editor={editor} /></div>
      <div className="editor-footer">
        <span>{markdown.length.toLocaleString('ja-JP')} 文字</span>
        <span className="editor-hint"><kbd>Enter</kbd> 改行　·　<kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> 図を生成　·　<kbd>Tab</kbd> インデント</span>
      </div>
    </section>
  );
}
