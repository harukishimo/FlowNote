import { describe, expect, it } from 'vitest';
import { editorJsonToMarkdown, markdownToHtml } from './markdown';

describe('Markdown list indentation', () => {
  it('serializes nested Tiptap list items with Markdown indentation', () => {
    const markdown = editorJsonToMarkdown({
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '親' }] }] },
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: '項目' }] },
              {
                type: 'bulletList',
                content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '子' }] }] }],
              },
            ],
          },
        ],
      }],
    });

    expect(markdown).toBe('- 親\n- 項目\n  - 子');
  });

  it('restores indented Markdown as nested HTML lists', () => {
    expect(markdownToHtml('- 親\n  - 子\n    1. 手順\n- 次')).toBe(
      '<ul><li>親<ul><li>子<ol><li>手順</li></ol></li></ul></li><li>次</li></ul>',
    );
  });
});
