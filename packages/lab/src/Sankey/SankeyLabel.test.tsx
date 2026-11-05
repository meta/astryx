// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SankeyLabel.test.tsx
 * @input Renders SankeyLabel inside SankeyChart with a stubbed ResizeObserver
 * @output Render-smoke coverage for labels: rotated vs beside placement,
 *   percent rows, formatValue, on-dark/on-light text color (#4295)
 * @position Colocated test for SankeyLabel.tsx
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, act} from '@testing-library/react';
import {SankeyChart} from './SankeyChart';
import {SankeyLabel} from './SankeyLabel';
import type {SankeyNodeDatum, SankeyLinkDatum} from './types';

// Tall bars: values of 8 with height=300 give valueScale 32, so every bar is
// 256 tall — far taller than "A = 8" needs (5 chars × 6.5 + 8 = 40.5) —
// which forces the rotated-label strategy for all three nodes.
const tallNodes: SankeyNodeDatum[] = [
  {id: 'a', label: 'A', value: 8, color: [0.5, 0.1, 100]},
  {id: 'b', label: 'B', value: 8, color: [0.6, 0.2, 200]},
  {id: 'c', label: 'C', value: 8, color: [0.7, 0.3, 300]},
];
const tallLinks: SankeyLinkDatum[] = [
  {source: 'a', target: 'b', value: 4},
  {source: 'b', target: 'c', value: 4},
];

// Short bars: height=100 gives valueScale 7, so bars are 56 tall while
// "Alpha = 8" needs 9 chars × 6.5 + 8 = 66.5 — forcing beside labels.
const shortNodes: SankeyNodeDatum[] = [
  {id: 'a', label: 'Alpha', value: 8, color: [0.5, 0.1, 100]},
  {id: 'b', label: 'Bravo', value: 8, color: [0.6, 0.2, 200]},
  {id: 'c', label: 'Gamma', value: 8, color: [0.7, 0.3, 300]},
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

function textContents(container: HTMLElement): Array<string | null> {
  return Array.from(container.querySelectorAll('text')).map(t => t.textContent);
}

describe('SankeyLabel rotated placement (tall bars)', () => {
  it('rotates labels -90° onto the bar center when the text fits the bar', () => {
    const {container} = render(
      <SankeyChart nodes={tallNodes} links={tallLinks} height={300}>
        <SankeyLabel />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(textContents(container)).toEqual([
      'A = 8',
      'B = 8',
      '100%',
      'C = 8',
      '100%',
    ]);

    // Bar centers: cx = x + nodeWidth/2, cy = 28 + 256/2 = 156.
    const labelA = Array.from(container.querySelectorAll('text')).find(
      t => t.textContent === 'A = 8',
    );
    expect(labelA?.closest('g[transform]')).toHaveAttribute(
      'transform',
      'translate(10, 156) rotate(-90)',
    );
    expect(labelA).toHaveAttribute('text-anchor', 'middle');
  });

  it('shows a percent of maxValue below downstream nodes only', () => {
    const {container} = render(
      <SankeyChart nodes={tallNodes} links={tallLinks} height={300}>
        <SankeyLabel />
      </SankeyChart>,
    );
    reportWidth(1000);

    // Column 0 gets no percent; b and c are 8/8 = 100%.
    const pcts = Array.from(container.querySelectorAll('text')).filter(
      t => t.textContent === '100%',
    );
    expect(pcts).toHaveLength(2);
    expect(pcts[0]).toHaveAttribute('x', '500');
    expect(pcts[1]).toHaveAttribute('x', '990');
    // y clamps to the chart: min(300 - 2, 28 + 256 + 12) = 296.
    expect(pcts[0]).toHaveAttribute('y', '296');
  });

  it('hides the percent row when showPercent is off', () => {
    const {container} = render(
      <SankeyChart nodes={tallNodes} links={tallLinks} height={300}>
        <SankeyLabel showPercent={false} />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(textContents(container)).toEqual(['A = 8', 'B = 8', 'C = 8']);
  });

  it('formats values through a custom formatValue function', () => {
    const {container} = render(
      <SankeyChart nodes={tallNodes} links={tallLinks} height={300}>
        <SankeyLabel showPercent={false} formatValue={v => `${v}pts`} />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(textContents(container)).toEqual([
      'A = 8pts',
      'B = 8pts',
      'C = 8pts',
    ]);
  });

  it('picks on-dark text for dark bars and on-light for light bars', () => {
    const {container} = render(
      <SankeyChart nodes={tallNodes} links={tallLinks} height={300}>
        <SankeyLabel showPercent={false} />
      </SankeyChart>,
    );
    reportWidth(1000);

    const texts = Array.from(container.querySelectorAll('text'));
    // Node a has oklch lightness 0.5 (< 0.6) → on-dark text.
    expect(texts[0].getAttribute('style')).toMatch(/var\(--color-on-dark/);
    // Node c has lightness 0.7 → on-light text.
    expect(texts[2].getAttribute('style')).toMatch(/var\(--color-on-light/);
  });
});

describe('SankeyLabel beside placement (short bars)', () => {
  it('places short-bar labels beside the node on a surface pill', () => {
    const {container} = render(
      <SankeyChart nodes={shortNodes} links={tallLinks} height={100}>
        <SankeyLabel showPercent={false} />
      </SankeyChart>,
    );
    reportWidth(1000);

    const labelAlpha = Array.from(container.querySelectorAll('text')).find(
      t => t.textContent === 'Alpha = 8',
    );
    // First column: label starts 6px right of the bar (0 + 20 + 6).
    expect(labelAlpha).toHaveAttribute('x', '26');
    expect(labelAlpha).toHaveAttribute('y', '56');
    expect(labelAlpha).toHaveAttribute('text-anchor', 'start');

    // The pill sits behind the text: 9 chars × 6 + 10 = 64 wide, 16 tall.
    const pill = labelAlpha?.previousElementSibling;
    expect(pill?.tagName).toBe('rect');
    expect(pill).toHaveAttribute('x', '22');
    expect(pill).toHaveAttribute('y', '48');
    expect(pill).toHaveAttribute('width', '64');
    expect(pill).toHaveAttribute('height', '16');
    expect(pill).toHaveAttribute('rx', '3');
    expect(pill).toHaveAttribute(
      'fill',
      'var(--color-background-surface, #fff)',
    );
    expect(pill).toHaveAttribute('fill-opacity', '0.9');
  });

  it('anchors last-column labels to the left to avoid edge clipping', () => {
    const {container} = render(
      <SankeyChart nodes={shortNodes} links={tallLinks} height={100}>
        <SankeyLabel showPercent={false} />
      </SankeyChart>,
    );
    reportWidth(1000);

    const labelGamma = Array.from(container.querySelectorAll('text')).find(
      t => t.textContent === 'Gamma = 8',
    );
    // Last column: label ends 6px left of the bar (980 - 6).
    expect(labelGamma).toHaveAttribute('x', '974');
    expect(labelGamma).toHaveAttribute('text-anchor', 'end');
    // Pill extends leftward from the label: 974 - 64 + 4 = 914.
    expect(labelGamma?.previousElementSibling).toHaveAttribute('x', '914');
  });
});

describe('SankeyLabel default value format', () => {
  it('compacts thousands and gives small percents one decimal', () => {
    // b = 1500/12000 = 12.5% (rounds to 13%), c = 600/12000 = 5.0%.
    const nodes: SankeyNodeDatum[] = [
      {id: 'a', label: 'A', value: 12000, color: [0.5, 0.1, 100]},
      {id: 'b', label: 'B', value: 1500, color: [0.6, 0.2, 200]},
      {id: 'c', label: 'C', value: 600, color: [0.7, 0.3, 300]},
    ];
    const links: SankeyLinkDatum[] = [
      {source: 'a', target: 'b', value: 1500},
      {source: 'a', target: 'c', value: 600},
    ];
    const {container} = render(
      <SankeyChart nodes={nodes} links={links} height={300}>
        <SankeyLabel />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(textContents(container)).toEqual([
      'A = 12k',
      'B = 1.5k',
      '13%',
      'C = 600',
      '5.0%',
    ]);
  });

  it('renders no labels before the container reports a width', () => {
    const {container} = render(
      <SankeyChart nodes={tallNodes} links={tallLinks} height={300}>
        <SankeyLabel />
      </SankeyChart>,
    );

    expect(container.querySelectorAll('text')).toHaveLength(0);
  });
});
