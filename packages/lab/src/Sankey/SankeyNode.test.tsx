// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SankeyNode.test.tsx
 * @input Renders SankeyNode inside SankeyChart with a stubbed ResizeObserver
 * @output Render-smoke coverage for node bars: glow + bar geometry, per-node
 *   oklch colors, the glow toggle, and the nodeColor override (#4295)
 * @position Colocated test for SankeyNode.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {SankeyChart} from './SankeyChart';
import {SankeyNode} from './SankeyNode';
import type {SankeyNodeDatum, SankeyLinkDatum} from './types';

// Explicit oklch colors so assertions don't couple to the default palette.
// values of 8 with height=300 give an exact valueScale of 32, so bars sit
// at y=28 with height 256 and columns at x = 0 / 490 / 980.
const nodes: SankeyNodeDatum[] = [
  {id: 'a', label: 'A', value: 8, color: [0.5, 0.1, 100]},
  {id: 'b', label: 'B', value: 8, color: [0.6, 0.2, 200]},
  {id: 'c', label: 'C', value: 8, color: [0.7, 0.3, 300]},
];
const links: SankeyLinkDatum[] = [
  {source: 'a', target: 'b', value: 4},
  {source: 'b', target: 'c', value: 4},
];

// Capture the ResizeObserver callback so tests can drive the reported width.
let resizeCallback: ResizeObserverCallback | undefined;

beforeEach(() => {
  resizeCallback = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallback = cb;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function reportWidth(width: number) {
  act(() => {
    resizeCallback?.(
      [{contentRect: {width}} as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

describe('SankeyNode', () => {
  it('renders a glow rect and a bar rect per node with layout geometry', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} height={300}>
        <SankeyNode />
      </SankeyChart>,
    );
    reportWidth(1000);

    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(6);

    // Glow halo: bar inflated by 3px inline / 1px block, faint node color.
    expect(rects[0]).toHaveAttribute('x', '-3');
    expect(rects[0]).toHaveAttribute('y', '27');
    expect(rects[0]).toHaveAttribute('width', '26');
    expect(rects[0]).toHaveAttribute('height', '258');
    expect(rects[0]).toHaveAttribute('rx', '4');
    expect(rects[0]).toHaveAttribute('fill', 'oklch(0.5 0.1 100 / 0.12)');
    expect(rects[0]).toHaveAttribute('opacity', '1');

    // Bar: exact layout position, near-opaque node color.
    expect(rects[1]).toHaveAttribute('x', '0');
    expect(rects[1]).toHaveAttribute('y', '28');
    expect(rects[1]).toHaveAttribute('width', '20');
    expect(rects[1]).toHaveAttribute('height', '256');
    expect(rects[1]).toHaveAttribute('rx', '1.5');
    expect(rects[1]).toHaveAttribute('fill', 'oklch(0.5 0.1 100 / 0.9)');

    // Remaining bars land on their column x positions with their own colors.
    expect(rects[3]).toHaveAttribute('x', '490');
    expect(rects[3]).toHaveAttribute('fill', 'oklch(0.6 0.2 200 / 0.9)');
    expect(rects[5]).toHaveAttribute('x', '980');
    expect(rects[5]).toHaveAttribute('fill', 'oklch(0.7 0.3 300 / 0.9)');
  });

  it('renders only the bar rects when glow is off', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} height={300}>
        <SankeyNode glow={false} />
      </SankeyChart>,
    );
    reportWidth(1000);

    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(3);
    expect(rects[0]).toHaveAttribute('x', '0');
    expect(rects[0]).toHaveAttribute('rx', '1.5');
  });

  it('paints every node with the chart-level nodeColor override', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} height={300} nodeColor="#334455">
        <SankeyNode />
      </SankeyChart>,
    );
    reportWidth(1000);

    const rects = container.querySelectorAll('rect');
    expect(rects).toHaveLength(6);
    for (const rect of rects) {
      expect(rect).toHaveAttribute('fill', '#334455');
    }
    // The glow drops to 0.12 opacity so the flat override still reads as a halo.
    expect(rects[0]).toHaveAttribute('opacity', '0.12');
  });

  it('renders no rects before the container reports a width', () => {
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} height={300}>
        <SankeyNode />
      </SankeyChart>,
    );

    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });
});
