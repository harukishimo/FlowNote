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
});
