import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { changeEditorIndent } from './editor-indentation';

let editor: Editor | undefined;

afterEach(() => editor?.destroy());

function selectSecondParagraph(current: Editor) {
  const paragraphPositions: number[] = [];
  current.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') paragraphPositions.push(pos + 1);
  });
  current.commands.setTextSelection(paragraphPositions[1]);
}

describe('changeEditorIndent', () => {
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
});
