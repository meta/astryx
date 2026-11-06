// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {render, screen, act} from '@testing-library/react';
import {SankeyChart} from './SankeyChart';
import {SankeyNode} from './SankeyNode';

const nodes = [
  {id: 'a', label: 'A', value: 10},
  {id: 'b', label: 'B', value: 10},
  {id: 'c', label: 'C', value: 10},
];
const links = [
  {source: 'a', target: 'b', value: 5},
  {source: 'b', target: 'c', value: 5},
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

describe('SankeyChart scroll container', () => {
  it('is keyboard-focusable when the chart needs horizontal scrolling', () => {
    render(
      <SankeyChart nodes={nodes} links={links} minColumnWidth={400}>
        <SankeyNode />
      </SankeyChart>,
    );

    // Container narrower than the minimum column width forces scrolling.
    reportWidth(300);

    const scrollRegion = screen.getByRole('group', {name: 'Sankey chart'});
    expect(scrollRegion).toHaveAttribute('tabindex', '0');
  });

  it('does not add a focusable scroll region when everything fits', () => {
    render(
      <SankeyChart nodes={nodes} links={links} minColumnWidth={50}>
        <SankeyNode />
      </SankeyChart>,
    );

    reportWidth(1000);

    expect(
      screen.queryByRole('group', {name: 'Sankey chart'}),
    ).not.toBeInTheDocument();
  });
});

describe('SankeyChart container observation', () => {
  it('observes its container while mounted and stops on unmount', () => {
    const observed = new Set<Element>();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(element: Element) {
          observed.add(element);
        }
        unobserve(element: Element) {
          observed.delete(element);
        }
        disconnect() {
          observed.clear();
        }
      },
    );
    const {container, unmount} = render(
      <SankeyChart nodes={nodes} links={links}>
        <SankeyNode />
      </SankeyChart>,
    );
    const chartContainer = container.firstElementChild;
    expect(chartContainer).not.toBeNull();
    expect(observed.has(chartContainer!)).toBe(true);

    unmount();
    expect(observed.size).toBe(0);
  });
});

describe('SankeyChart accessible name', () => {
  it('names the svg when the chart does not scroll', () => {
    render(
      <SankeyChart nodes={nodes} links={links} minColumnWidth={50}>
        <SankeyNode />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(screen.getByRole('img', {name: 'Sankey chart'})).toBeInTheDocument();
  });

  it('names the svg when the chart scrolls', () => {
    render(
      <SankeyChart nodes={nodes} links={links} minColumnWidth={400}>
        <SankeyNode />
      </SankeyChart>,
    );
    reportWidth(300);

    expect(screen.getByRole('img', {name: 'Sankey chart'})).toBeInTheDocument();
  });

  it('applies a custom label to both the svg and the scroll region', () => {
    render(
      <SankeyChart
        nodes={nodes}
        links={links}
        minColumnWidth={400}
        label="Traffic flow">
        <SankeyNode />
      </SankeyChart>,
    );
    reportWidth(300);

    expect(screen.getByRole('img', {name: 'Traffic flow'})).toBeInTheDocument();
    expect(
      screen.getByRole('group', {name: 'Traffic flow'}),
    ).toBeInTheDocument();
  });
});

describe('SankeyChart data table fallback', () => {
  it('renders a visually hidden table of flows', () => {
    render(
      <SankeyChart nodes={nodes} links={links} minColumnWidth={50}>
        <SankeyNode />
      </SankeyChart>,
    );
    reportWidth(1000);

    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    expect(
      screen.getByRole('columnheader', {name: 'From'}),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', {name: 'To'})).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', {name: 'Value'}),
    ).toBeInTheDocument();

    // Link a → b (value 5), labels resolved from node definitions.
    expect(screen.getByRole('rowheader', {name: 'A'})).toBeInTheDocument();
    expect(screen.getByRole('rowheader', {name: 'B'})).toBeInTheDocument();
    expect(screen.getAllByRole('cell', {name: '5'})).toHaveLength(2);

    // Visually hidden, but still in the a11y tree.
    const wrapper = table.parentElement as HTMLElement;
    expect(wrapper.getAttribute('class')).toBeTruthy();
    expect(wrapper).not.toHaveAttribute('hidden');
  });

  it('skips the table when there are too many links', () => {
    const manyNodes = Array.from({length: 102}, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
      value: 1,
    }));
    const manyLinks = Array.from({length: 101}, (_, i) => ({
      source: `n${i}`,
      target: `n${i + 1}`,
      value: 1,
    }));
    render(
      <SankeyChart nodes={manyNodes} links={manyLinks} minColumnWidth={5}>
        <SankeyNode />
      </SankeyChart>,
    );
    reportWidth(1000);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
