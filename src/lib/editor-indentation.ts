import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import type { EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

function selectionIsInListItem(state: EditorState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type.name === 'listItem') return true;
  }
  return false;
}

function indentPlainSelection(view: EditorView, outdent: boolean): boolean {
  const { state } = view;
  const { from, to } = state.selection;
  const paragraphs: number[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'paragraph') paragraphs.push(pos + 1);
  });
  if (!paragraphs.length) {
    const resolved = state.doc.resolve(from);
    if (resolved.parent.type.name === 'paragraph') paragraphs.push(resolved.start(resolved.depth));
  }
  const tr = state.tr;
  [...new Set(paragraphs)].sort((a, b) => b - a).forEach((position) => {
    const node = state.doc.nodeAt(position - 1);
    if (!node) return;
    const text = node.textContent;
    if (outdent) {
      const match = text.match(/^(?:\t| {1,2})/);
      if (match) tr.delete(position, position + match[0].length);
    } else tr.insertText('\t', position);
  });
  if (!tr.docChanged) return false;
  view.dispatch(tr);
  return true;
}

/** Apply structural indentation to lists and text indentation elsewhere. */
export function changeEditorIndent(view: EditorView, outdent: boolean): boolean {
  const { state } = view;
  if (selectionIsInListItem(state)) {
    const listItem = state.schema.nodes.listItem;
    if (!listItem) return false;
    const command = outdent ? liftListItem(listItem) : sinkListItem(listItem);
    return command(state, view.dispatch.bind(view));
  }
  return indentPlainSelection(view, outdent);
}
