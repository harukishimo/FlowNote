import { describe, expect, it } from 'vitest';
import { layoutActivityGraph } from './layout';

const branchingGraph = {
  nodes: [
    { id: 'start', type: 'start' },
    { id: 'decision', type: 'decision' },
    { id: 'yes', type: 'step' },
    { id: 'no', type: 'step' },
    { id: 'merge', type: 'merge' },
    { id: 'end', type: 'end' },
  ],
  edges: [
    { from: 'start', to: 'decision', kind: 'normal' },
    { from: 'decision', to: 'yes', kind: 'branch' },
    { from: 'decision', to: 'no', kind: 'branch' },
    { from: 'yes', to: 'merge', kind: 'normal' },
    { from: 'no', to: 'merge', kind: 'normal' },
    { from: 'merge', to: 'end', kind: 'normal' },
  ],
};

describe('layoutActivityGraph', () => {
  it('places decision alternatives side by side and the merge below them', () => {
    const layout = layoutActivityGraph(branchingGraph);
    const yes = layout.positions.get('yes');
    const no = layout.positions.get('no');
    const merge = layout.positions.get('merge');
    expect(yes?.rank).toBe(no?.rank);
    expect(yes?.x).not.toBe(no?.x);
    expect(merge?.rank).toBeGreaterThan(yes?.rank ?? -1);
    expect(merge?.x).toBe(layout.width / 2);
  });

  it('ignores loop-back edges while calculating forward ranks', () => {
    const layout = layoutActivityGraph({
      nodes: branchingGraph.nodes,
      edges: [...branchingGraph.edges, { from: 'no', to: 'decision', kind: 'loop' }],
    });
    expect(layout.positions.get('decision')?.rank).toBe(1);
    expect(layout.positions.get('no')?.rank).toBe(2);
  });

  it('lays out a one-to-many parent decomposition horizontally', () => {
    const layout = layoutActivityGraph({
      nodes: [
        { id: 'parent', type: 'step' },
        { id: 'child-a', type: 'step' },
        { id: 'child-b', type: 'step' },
        { id: 'child-c', type: 'step' },
        { id: 'child-d', type: 'step' },
      ],
      edges: [
        { from: 'parent', to: 'child-a', kind: 'branch' },
        { from: 'parent', to: 'child-b', kind: 'branch' },
        { from: 'parent', to: 'child-c', kind: 'branch' },
        { from: 'parent', to: 'child-d', kind: 'branch' },
      ],
    });
    const children = ['child-a', 'child-b', 'child-c', 'child-d'].map((id) => layout.positions.get(id)!);
    expect(new Set(children.map((item) => item.rank)).size).toBe(1);
    expect(new Set(children.map((item) => item.x)).size).toBe(4);
    expect(layout.width).toBeGreaterThan(720);
  });
});
