import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Some IMEs report the physical Tab key as key="Process" while retaining
 * code="Tab". Check both values so indentation is not keyboard-layout
 * dependent.
 */
export function isTabKeyEvent(event: Pick<KeyboardEvent, 'key' | 'code'>): boolean {
  return event.key === 'Tab' || event.code === 'Tab';
}

/**
 * React's capture listener can run before ProseMirror has synchronized a very
 * recent DOM selection (notably immediately after confirming Japanese IME
 * input). Copy the browser selection into the editor state before applying a
 * structural list command.
 */
export function syncEditorSelectionFromDOM(view: EditorView): boolean {
  const domSelection = view.dom.ownerDocument.getSelection();
  const { anchorNode, focusNode } = domSelection ?? {};
  if (
    !domSelection
    || domSelection.rangeCount === 0
    || !anchorNode
    || !focusNode
    || !view.dom.contains(anchorNode)
    || !view.dom.contains(focusNode)
  ) return false;

  try {
    const anchor = view.posAtDOM(anchorNode, domSelection.anchorOffset, 1);
    const head = view.posAtDOM(focusNode, domSelection.focusOffset, 1);
    const nextSelection = TextSelection.between(
      view.state.doc.resolve(anchor),
      view.state.doc.resolve(head),
    );
    if (!nextSelection.eq(view.state.selection)) {
      view.dispatch(view.state.tr.setSelection(nextSelection));
    }
    return true;
  } catch {
    // A DOM mutation between keydown and position lookup is harmless. The
    // caller can still use ProseMirror's last known selection.
    return false;
  }
}

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
