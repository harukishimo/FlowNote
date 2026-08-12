import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { changeEditorIndent, isTabKeyEvent, syncEditorSelectionFromDOM } from './editor-indentation';

let editor: Editor | undefined;

afterEach(() => {
  editor?.destroy();
  document.body.innerHTML = '';
});

function selectSecondParagraph(current: Editor) {
  const paragraphPositions: number[] = [];
  current.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') paragraphPositions.push(pos + 1);
  });
  current.commands.setTextSelection(paragraphPositions[1]);
}

describe('changeEditorIndent', () => {
  it('recognizes Tab by physical key code when an IME masks event.key', () => {
    expect(isTabKeyEvent({ key: 'Process', code: 'Tab' })).toBe(true);
    expect(isTabKeyEvent({ key: 'Unidentified', code: 'Tab' })).toBe(true);
    expect(isTabKeyEvent({ key: 'Enter', code: 'Enter' })).toBe(false);
  });

  it('indents an empty second list item and outdents it again', () => {
    editor = new Editor({
      extensions: [StarterKit],
      content: '<ul><li><p>テスト</p></li><li><p></p></li></ul>',
    });
    selectSecondParagraph(editor);

    expect(changeEditorIndent(editor.view, false)).toBe(true);
    expect(editor.getJSON()).toMatchObject({
      content: [{
        type: 'bulletList',
        content: [{
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'テスト' }] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
          ],
        }],
      }],
    });

    expect(changeEditorIndent(editor.view, true)).toBe(true);
    expect(editor.getJSON().content?.[0].content).toHaveLength(2);
  });

  it('uses the live DOM cursor when ProseMirror still has the previous list item selected', () => {
    editor = new Editor({
      extensions: [StarterKit],
      content: '<ul><li><p>テスト</p></li><li><p></p></li></ul>',
    });
    document.body.appendChild(editor.view.dom);

    const paragraphPositions: number[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') paragraphPositions.push(pos + 1);
    });
    editor.commands.setTextSelection(paragraphPositions[0]);

    const emptyParagraph = editor.view.dom.querySelectorAll('li > p')[1];
    const range = document.createRange();
    range.selectNodeContents(emptyParagraph);
    range.collapse(true);
    const domSelection = window.getSelection();
    domSelection?.removeAllRanges();
    domSelection?.addRange(range);

    expect(syncEditorSelectionFromDOM(editor.view)).toBe(true);
    expect(editor.state.selection.from).toBe(paragraphPositions[1]);
    expect(changeEditorIndent(editor.view, false)).toBe(true);
    expect(editor.getJSON().content?.[0].content).toHaveLength(1);
  });
});
