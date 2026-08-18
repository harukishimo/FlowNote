import { describe, expect, it } from 'vitest';
import { applyMarkdownHierarchy } from './hierarchy';
import { layoutActivityGraph } from './layout';

describe('applyMarkdownHierarchy', () => {
  it('replaces a sibling chain with one-to-many branch edges', () => {
    const source = '- 親の目的\n  - 子A\n  - 子B\n  - 子C';
    const graph = {
      schemaVersion: 1 as const,
      title: 'test',
      nodes: [
        { id: 'start', type: 'start' as const, label: '開始', actor: null, sourceRange: null, confidence: 1 },
        { id: 'parent', type: 'step' as const, label: '親の目的', actor: null, sourceRange: null, confidence: 1 },
        { id: 'a', type: 'step' as const, label: '子A', actor: null, sourceRange: null, confidence: 1 },
        { id: 'b', type: 'step' as const, label: '子B', actor: null, sourceRange: null, confidence: 1 },
        { id: 'c', type: 'step' as const, label: '子C', actor: null, sourceRange: null, confidence: 1 },
        { id: 'end', type: 'end' as const, label: '終了', actor: null, sourceRange: null, confidence: 1 },
      ],
      edges: [
        { id: 'e1', from: 'start', to: 'parent', label: null, kind: 'normal' as const },
        { id: 'e2', from: 'parent', to: 'a', label: null, kind: 'normal' as const },
        { id: 'e3', from: 'a', to: 'b', label: null, kind: 'normal' as const },
        { id: 'e4', from: 'b', to: 'c', label: null, kind: 'normal' as const },
        { id: 'e5', from: 'c', to: 'end', label: null, kind: 'normal' as const },
      ],
      warnings: [],
    };

    const normalized = applyMarkdownHierarchy(graph, source);
    expect(normalized.edges.filter((edge) => edge.from === 'parent').map((edge) => edge.to)).toEqual(['a', 'b', 'c']);
    expect(normalized.edges.filter((edge) => edge.from === 'parent').every((edge) => edge.kind === 'branch')).toBe(true);
    expect(normalized.edges.some((edge) => edge.from === 'a' && edge.to === 'b')).toBe(false);

    const layout = layoutActivityGraph(normalized);
    const children = ['a', 'b', 'c'].map((id) => layout.positions.get(id));
    expect(new Set(children.map((node) => node?.rank)).size).toBe(1);
    expect(new Set(children.map((node) => node?.x)).size).toBe(3);
  });

  it('adds a missing parent item so selected children do not lose their context', () => {
    const normalized = applyMarkdownHierarchy({
      schemaVersion: 1,
      title: 'test',
      nodes: [
        { id: 'start', type: 'start', label: '開始', actor: null, sourceRange: null, confidence: 1 },
        { id: 'a', type: 'step', label: '子A', actor: null, sourceRange: null, confidence: 1 },
        { id: 'b', type: 'step', label: '子B', actor: null, sourceRange: null, confidence: 1 },
        { id: 'end', type: 'end', label: '終了', actor: null, sourceRange: null, confidence: 1 },
      ],
      edges: [
        { id: 'e1', from: 'start', to: 'a', label: null, kind: 'normal' },
        { id: 'e2', from: 'a', to: 'b', label: null, kind: 'normal' },
        { id: 'e3', from: 'b', to: 'end', label: null, kind: 'normal' },
      ],
      warnings: [],
    }, '- 共通の親\n  - 子A\n  - 子B');

    const synthetic = normalized.nodes.find((node) => node.label === '共通の親');
    expect(synthetic?.id).toMatch(/^memo-line-/);
    expect(normalized.edges.filter((edge) => edge.from === synthetic?.id).map((edge) => edge.to)).toEqual(['a', 'b']);
  });
});

