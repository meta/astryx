// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file OverflowList.test.tsx
 * @input Uses vitest, @testing-library/react, OverflowList component
 * @output Characterization coverage for OverflowList's fit/overflow behavior
 * @position Testing; validates OverflowList.tsx
 *
 * jsdom reports every element as 0px wide and lacks ResizeObserver, so these
 * tests install a minimal ResizeObserver stub and drive layout math through a
 * `data-w` attribute read by a mocked `offsetWidth`. Each item declares its
 * pixel width via `data-w`; the visible container's available width is the
 * `data-w` passed straight through to it. This lets the real fit algorithm run
 * deterministically instead of collapsing to the trivial all-fit case.
 *
 * SYNC: When OverflowList.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, beforeAll, afterAll, vi} from 'vitest';
import {render, screen, within, act, waitFor} from '@testing-library/react';
import {useState} from 'react';
import {OverflowList} from './OverflowList';
import type {OverflowItem} from './OverflowList';

const originalOffsetWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetWidth',
);
const originalResizeObserver = (
  globalThis as unknown as {ResizeObserver?: unknown}
).ResizeObserver;

const resizeObservers = new Set<StubResizeObserver>();

/** ResizeObserver stub with an explicit trigger for resize-path tests. */
class StubResizeObserver {
  constructor(private callback: ResizeObserverCallback) {
    resizeObservers.add(this);
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {
    resizeObservers.delete(this);
  }

  takeRecords(): ResizeObserverEntry[] {
    return [];
  }

  trigger(target: Element): void {
    this.callback([{target} as ResizeObserverEntry], this);
  }
}

beforeAll(() => {
  (globalThis as unknown as {ResizeObserver: unknown}).ResizeObserver =
    StubResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement): number {
      const own = this.getAttribute('data-w');
      if (own != null) {
        return Number(own);
      }
      // The overflow indicator is wrapped in a measurement <div>; read the
      // width off its child so the reserved indicator space is measurable.
      const child = this.firstElementChild;
      if (child) {
        return Number(child.getAttribute('data-w') ?? 0);
      }
      return 0;
    },
  });
});

afterAll(() => {
  if (originalOffsetWidth) {
    Object.defineProperty(
      HTMLElement.prototype,
      'offsetWidth',
      originalOffsetWidth,
    );
  }
  (globalThis as unknown as {ResizeObserver?: unknown}).ResizeObserver =
    originalResizeObserver;
});

/** The visible (non-measurement) container, identified by its stable class. */
function visibleContainer(): HTMLElement {
  return screen.getByTestId('ov');
}

/** The hidden measurement container (the only inert element rendered). */
function measureContainer(): HTMLElement {
  return document.querySelector('[inert]') as HTMLElement;
}

const indicator =
  (label: string, width = 40) =>
  (items: {index: number}[]) => (
    <span data-w={width}>
      {label}
      {items.map(i => i.index).join(',')}
    </span>
  );

/**
 * Notify the shared observer that an element's size changed. The list
 * measures again in a microtask before paint, so this awaits it.
 */
async function triggerResize(target: Element): Promise<void> {
  await act(async () => {
    for (const observer of resizeObservers) {
      observer.trigger(target);
    }
  });
}

/** The indices the most recent onOverflowChange call reported. */
function indicesOf(spy: {mock: {calls: unknown[][]}}): number[] {
  const last = spy.mock.calls[spy.mock.calls.length - 1];
  return (last[0] as {index: number}[]).map(i => i.index);
}

/** The labels the most recent onOverflowChange call reported. */
function labelsOf(spy: {mock: {calls: unknown[][]}}): string[] {
  const last = spy.mock.calls[spy.mock.calls.length - 1];
  return (last[0] as OverflowItem[]).map(item =>
    String((item.child.props as {children?: unknown}).children),
  );
}

describe('OverflowList', () => {
  describe('when all items fit', () => {
    it('renders every item and no overflow indicator', () => {
      render(
        <OverflowList
          gap={0}
          data-w="1000"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).getByText('B')).toBeInTheDocument();
      expect(within(vis).getByText('C')).toBeInTheDocument();
      // No overflow indicator when nothing is hidden.
      expect(within(vis).queryByText(/^more:/)).not.toBeInTheDocument();
    });
  });

  describe('when items overflow (collapseFrom="end", default)', () => {
    it('hides trailing items and shows an indicator for them', () => {
      render(
        <OverflowList
          gap={0}
          data-w="100"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      // 100px fits one 40px item once 40px is reserved for the indicator.
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).queryByText('B')).not.toBeInTheDocument();
      expect(within(vis).queryByText('C')).not.toBeInTheDocument();
      // Indicator lists the hidden items by their original index (1 and 2).
      expect(within(vis).getByText('more:1,2')).toBeInTheDocument();
    });

    it('fits more items as the available width grows', () => {
      render(
        <OverflowList
          gap={0}
          data-w="110"
          data-testid="ov"
          overflowRenderer={indicator('more:', 20)}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      // 110px fits two 40px items plus the 20px indicator reservation (100px),
      // but not a third (120px) — so C collapses.
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).getByText('B')).toBeInTheDocument();
      expect(within(vis).queryByText('C')).not.toBeInTheDocument();
      expect(within(vis).getByText('more:2')).toBeInTheDocument();
    });

    it('places the indicator after the visible items', () => {
      render(
        <OverflowList
          gap={0}
          data-w="100"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      expect(vis.textContent).toBe('Amore:1,2');
    });
  });

  describe('when items overflow (collapseFrom="start")', () => {
    it('hides leading items and renders the indicator first', () => {
      render(
        <OverflowList
          gap={0}
          collapseFrom="start"
          data-w="100"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      // The trailing item stays; the leading two collapse.
      expect(within(vis).getByText('C')).toBeInTheDocument();
      expect(within(vis).queryByText('A')).not.toBeInTheDocument();
      expect(within(vis).queryByText('B')).not.toBeInTheDocument();
      // Indicator carries the hidden indices 0 and 1, and comes first.
      expect(within(vis).getByText('more:0,1')).toBeInTheDocument();
      expect(vis.textContent).toBe('more:0,1C');
    });
  });

  describe('minVisibleItems', () => {
    it('keeps at least the requested number of items visible', () => {
      render(
        <OverflowList
          gap={0}
          minVisibleItems={2}
          data-w="100"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      // Without the floor only one item would fit; the floor forces two.
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).getByText('B')).toBeInTheDocument();
      expect(within(vis).queryByText('C')).not.toBeInTheDocument();
      expect(within(vis).getByText('more:2')).toBeInTheDocument();
    });
  });

  describe('without an overflow renderer', () => {
    it('drops overflowing items but renders no indicator', () => {
      render(
        <OverflowList gap={0} data-w="100" data-testid="ov">
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      // With no indicator to reserve space for, two 40px items fit in 100px.
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).getByText('B')).toBeInTheDocument();
      expect(within(vis).queryByText('C')).not.toBeInTheDocument();
    });
  });

  describe('measurement container', () => {
    it('renders a hidden, inert measurement copy of all children', () => {
      render(
        <OverflowList
          gap={0}
          data-w="100"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const measure = measureContainer();
      expect(measure).toHaveAttribute('aria-hidden', 'true');
      expect(measure).toHaveAttribute('inert');
      // Measures against every item, even the ones hidden from the visible row.
      expect(within(measure).getByText('A')).toBeInTheDocument();
      expect(within(measure).getByText('B')).toBeInTheDocument();
      expect(within(measure).getByText('C')).toBeInTheDocument();
    });

    it('measures the indicator against all items (max width)', () => {
      render(
        <OverflowList
          gap={0}
          data-w="100"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      // The measurement indicator reflects every index (0,1,2), reserving the
      // widest possible indicator; the visible one only lists hidden indices.
      const measure = measureContainer();
      expect(within(measure).getByText('more:0,1,2')).toBeInTheDocument();
    });
  });

  describe('rendering contract', () => {
    it('renders the stable astryx-overflow-list class on the visible container', () => {
      render(
        <OverflowList data-w="1000" data-testid="ov">
          <button type="button" data-w="10">
            A
          </button>
        </OverflowList>,
      );
      expect(visibleContainer()).toHaveClass('astryx-overflow-list');
    });

    it('forwards a ref to the visible container', () => {
      const ref = vi.fn();
      render(
        <OverflowList ref={ref} data-w="1000" data-testid="ov">
          <button type="button" data-w="10">
            A
          </button>
        </OverflowList>,
      );
      expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement));
      const el = ref.mock.calls[0][0] as HTMLElement;
      expect(el).toHaveClass('astryx-overflow-list');
    });

    it('applies a different gap class as the gap prop changes', () => {
      const {rerender} = render(
        <OverflowList gap={0} data-w="1000" data-testid="ov">
          <button type="button" data-w="10">
            A
          </button>
        </OverflowList>,
      );
      const gap0 = visibleContainer().getAttribute('class');

      rerender(
        <OverflowList gap={4} data-w="1000" data-testid="ov">
          <button type="button" data-w="10">
            A
          </button>
        </OverflowList>,
      );
      const gap4 = visibleContainer().getAttribute('class');
      expect(gap4).not.toEqual(gap0);
    });

    it('renders nothing extra for an empty child list', () => {
      render(
        <OverflowList
          data-w="1000"
          data-testid="ov"
          overflowRenderer={indicator('more:')}>
          {null}
        </OverflowList>,
      );
      const vis = visibleContainer();
      expect(vis).toBeInTheDocument();
      expect(vis).toBeEmptyDOMElement();
    });

    it('passes arbitrary DOM props through to the visible container', () => {
      render(
        <OverflowList
          data-w="1000"
          data-testid="ov"
          aria-label="Toolbar actions">
          <button type="button" data-w="10">
            A
          </button>
        </OverflowList>,
      );
      expect(visibleContainer()).toHaveAttribute(
        'aria-label',
        'Toolbar actions',
      );
    });

    it('exposes a displayName for devtools', () => {
      expect(OverflowList.displayName).toBe('OverflowList');
    });
  });

  describe('maxVisibleItems (cap)', () => {
    it('caps visible items even when they all fit', () => {
      render(
        <OverflowList
          gap={0}
          data-w="1000"
          data-testid="ov"
          maxVisibleItems={2}
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
          <button type="button" data-w="40">
            D
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).getByText('B')).toBeInTheDocument();
      expect(within(vis).queryByText('C')).not.toBeInTheDocument();
      expect(within(vis).getByText('more:2,3')).toBeInTheDocument();
    });

    it('min wins over a smaller cap (D1)', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(
        <OverflowList
          gap={0}
          data-w="1000"
          data-testid="ov"
          minVisibleItems={3}
          maxVisibleItems={1}
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
          <button type="button" data-w="40">
            D
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).getByText('B')).toBeInTheDocument();
      expect(within(vis).getByText('C')).toBeInTheDocument();
      expect(within(vis).queryByText('D')).not.toBeInTheDocument();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('maxRows (multi-row)', () => {
    it('applies a different container class when maxRows enables wrapping', () => {
      const {rerender} = render(
        <OverflowList gap={0} data-w="1000" data-testid="ov">
          <button type="button" data-w="40">
            A
          </button>
        </OverflowList>,
      );
      const singleLine = visibleContainer().getAttribute('class');

      rerender(
        <OverflowList gap={0} data-w="1000" data-testid="ov" maxRows={2}>
          <button type="button" data-w="40">
            A
          </button>
        </OverflowList>,
      );
      const multiRow = visibleContainer().getAttribute('class');
      expect(multiRow).not.toEqual(singleLine);
    });

    it('keeps single-line behavior with maxRows={1}', () => {
      render(
        <OverflowList
          gap={0}
          data-w="100"
          data-testid="ov"
          maxRows={1}
          overflowRenderer={indicator('more:')}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      const vis = visibleContainer();
      expect(within(vis).getByText('A')).toBeInTheDocument();
      expect(within(vis).queryByText('B')).not.toBeInTheDocument();
    });
  });

  describe('onOverflowChange', () => {
    it('stays silent when nothing overflows', () => {
      const onOverflowChange = vi.fn();
      render(
        <OverflowList
          gap={0}
          data-w="1000"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
        </OverflowList>,
      );
      expect(onOverflowChange).not.toHaveBeenCalled();
    });

    it('fires once on mount while overflowing, with the measured set', () => {
      const onOverflowChange = vi.fn();
      render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      expect(onOverflowChange).toHaveBeenCalledTimes(1);
      expect(indicesOf(onOverflowChange)).toEqual([1, 2]);
    });

    it('reports the collapsed items by original index', () => {
      const onOverflowChange = vi.fn();
      render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      expect(indicesOf(onOverflowChange)).toEqual([1, 2]);
    });

    it('reports an empty set again once the container fits everything', async () => {
      const onOverflowChange = vi.fn();
      const items = [
        <button type="button" data-w="40" key="a">
          A
        </button>,
        <button type="button" data-w="40" key="b">
          B
        </button>,
        <button type="button" data-w="40" key="c">
          C
        </button>,
      ];
      const {rerender} = render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {items}
        </OverflowList>,
      );
      expect(indicesOf(onOverflowChange)).toEqual([1, 2]);

      rerender(
        <OverflowList
          gap={0}
          data-w="1000"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {items}
        </OverflowList>,
      );
      await triggerResize(visibleContainer());
      expect(onOverflowChange).toHaveBeenCalledTimes(2);
      expect(indicesOf(onOverflowChange)).toEqual([]);
    });

    it('does not re-fire when the collapsed set is unchanged', () => {
      const spy = vi.fn();
      const items = [
        <button type="button" data-w="40" key="a">
          A
        </button>,
        <button type="button" data-w="40" key="b">
          B
        </button>,
      ];
      // A fresh inline callback each render — the guard is the collapsed set,
      // not the callback's identity.
      const {rerender} = render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={o => {
            spy(o);
          }}>
          {items}
        </OverflowList>,
      );
      expect(spy).toHaveBeenCalledTimes(1);
      rerender(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={o => {
            spy(o);
          }}>
          {items}
        </OverflowList>,
      );
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('reports same-count membership and order changes', () => {
      const onOverflowChange = vi.fn();
      const renderItems = (labels: string[]) =>
        labels.map(label => (
          <button type="button" data-w="40" key={label}>
            {label}
          </button>
        ));
      const {rerender} = render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems(['A', 'B', 'C'])}
        </OverflowList>,
      );
      expect(labelsOf(onOverflowChange)).toEqual(['B', 'C']);

      rerender(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems(['A', 'C', 'B'])}
        </OverflowList>,
      );
      expect(labelsOf(onOverflowChange)).toEqual(['C', 'B']);

      rerender(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems(['A', 'D', 'B'])}
        </OverflowList>,
      );
      expect(onOverflowChange).toHaveBeenCalledTimes(3);
      expect(labelsOf(onOverflowChange)).toEqual(['D', 'B']);
    });

    it('reports one measured set when unequal-width items reorder', async () => {
      const onOverflowChange = vi.fn();
      const items = {
        wide: (
          <button type="button" data-w="200" key="wide">
            Wide
          </button>
        ),
        a: (
          <button type="button" data-w="50" key="a">
            A
          </button>
        ),
        b: (
          <button type="button" data-w="50" key="b">
            B
          </button>
        ),
      };
      const {rerender} = render(
        <OverflowList
          gap={0}
          data-w="150"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {items.wide}
          {items.a}
          {items.b}
        </OverflowList>,
      );
      expect(indicesOf(onOverflowChange)).toEqual([0, 1, 2]);

      rerender(
        <OverflowList
          gap={0}
          data-w="150"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {items.a}
          {items.b}
          {items.wide}
        </OverflowList>,
      );

      await waitFor(() => {
        expect(visibleContainer()).toHaveTextContent('AB');
      });
      expect(onOverflowChange).toHaveBeenCalledTimes(2);
      expect(indicesOf(onOverflowChange)).toEqual([2]);
    });

    it('re-measures same-count content changes with stable keys', async () => {
      const onOverflowChange = vi.fn();
      const renderItems = (
        items: {key: string; label: string; width: number}[],
      ) =>
        items.map(item => (
          <button type="button" data-w={item.width} key={item.key}>
            {item.label}
          </button>
        ));
      const {rerender} = render(
        <OverflowList
          gap={0}
          data-w="300"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems([
            {key: 'a', label: 'A', width: 60},
            {key: 'b', label: 'B', width: 60},
            {key: 'c', label: 'C', width: 60},
            {key: 'd', label: 'D', width: 60},
          ])}
        </OverflowList>,
      );
      expect(onOverflowChange).not.toHaveBeenCalled();

      rerender(
        <OverflowList
          gap={0}
          data-w="300"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems([
            {key: 'a', label: 'A', width: 60},
            {key: 'b', label: 'B', width: 60},
            {key: 'c', label: 'Wide', width: 200},
            {key: 'd', label: 'D', width: 60},
          ])}
        </OverflowList>,
      );
      await triggerResize(measureContainer());

      expect(onOverflowChange).toHaveBeenCalledTimes(1);
      expect(indicesOf(onOverflowChange)).toEqual([2, 3]);
      expect(visibleContainer()).toHaveTextContent('AB');
      expect(visibleContainer()).not.toHaveTextContent('Wide');
    });

    it('reports only the measured set when the number of children changes', () => {
      const onOverflowChange = vi.fn();
      const renderItems = (labels: string[], width: number) =>
        labels.map(label => (
          <button type="button" data-w={width} key={label}>
            {label}
          </button>
        ));
      const {rerender} = render(
        <OverflowList
          gap={0}
          data-w="220"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems(['A', 'B', 'C', 'D', 'E'], 100)}
        </OverflowList>,
      );
      expect(indicesOf(onOverflowChange)).toEqual([2, 3, 4]);

      rerender(
        <OverflowList
          gap={0}
          data-w="220"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems(['Go', 'Up'], 40)}
        </OverflowList>,
      );
      expect(onOverflowChange).toHaveBeenCalledTimes(2);
      expect(indicesOf(onOverflowChange)).toEqual([]);

      rerender(
        <OverflowList
          gap={0}
          data-w="220"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          {renderItems(['A', 'B', 'C', 'D', 'E'], 100)}
        </OverflowList>,
      );
      expect(onOverflowChange).toHaveBeenCalledTimes(3);
      expect(indicesOf(onOverflowChange)).toEqual([2, 3, 4]);
    });

    it('uses a replacement callback only for the next set change', async () => {
      const first = vi.fn();
      const second = vi.fn();
      const items = [
        <button type="button" data-w="40" key="a">
          A
        </button>,
        <button type="button" data-w="40" key="b">
          B
        </button>,
      ];
      const {rerender} = render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={first}>
          {items}
        </OverflowList>,
      );
      expect(first).toHaveBeenCalledTimes(1);

      rerender(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={second}>
          {items}
        </OverflowList>,
      );
      expect(second).not.toHaveBeenCalled();

      rerender(
        <OverflowList
          gap={0}
          data-w="1000"
          data-testid="ov"
          onOverflowChange={second}>
          {items}
        </OverflowList>,
      );
      await triggerResize(visibleContainer());
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(indicesOf(second)).toEqual([]);
    });

    it('settles when the callback stores the collapsed set in state', () => {
      const onReport = vi.fn();

      function Harness() {
        const [hidden, setHidden] = useState<OverflowItem[]>([]);
        return (
          <>
            <output data-testid="hidden-count">{hidden.length}</output>
            <OverflowList
              gap={0}
              data-w="60"
              data-testid="ov"
              onOverflowChange={items => {
                onReport(items);
                setHidden(items);
              }}>
              <button type="button" data-w="40">
                A
              </button>
              <button type="button" data-w="40">
                B
              </button>
            </OverflowList>
          </>
        );
      }

      render(<Harness />);
      expect(onReport).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('hidden-count')).toHaveTextContent('1');
    });

    it('does not report after unmount', async () => {
      const onOverflowChange = vi.fn();
      const {unmount} = render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
        </OverflowList>,
      );
      const container = visibleContainer();
      const measure = measureContainer();
      expect(onOverflowChange).toHaveBeenCalledTimes(1);

      unmount();
      await triggerResize(container);
      await triggerResize(measure);
      expect(onOverflowChange).toHaveBeenCalledTimes(1);
    });

    it('reports the leading items with collapseFrom="start"', () => {
      const onOverflowChange = vi.fn();
      render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          collapseFrom="start"
          onOverflowChange={onOverflowChange}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      expect(indicesOf(onOverflowChange)).toEqual([0, 1]);
    });

    it('adds no indicator of its own, so an outside anchor stands alone', () => {
      const onOverflowChange = vi.fn();
      render(
        <OverflowList
          gap={0}
          data-w="60"
          data-testid="ov"
          onOverflowChange={onOverflowChange}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      expect(indicesOf(onOverflowChange)).toEqual([1, 2]);
      expect(visibleContainer().textContent).toBe('A');
      // Nothing beyond the items themselves is measured either.
      expect(measureContainer().children).toHaveLength(3);
    });

    it('reports alongside an overflowRenderer without disturbing it', () => {
      const onOverflowChange = vi.fn();
      render(
        <OverflowList
          gap={0}
          data-w="100"
          data-testid="ov"
          overflowRenderer={indicator('more:')}
          onOverflowChange={onOverflowChange}>
          <button type="button" data-w="40">
            A
          </button>
          <button type="button" data-w="40">
            B
          </button>
          <button type="button" data-w="40">
            C
          </button>
        </OverflowList>,
      );
      expect(indicesOf(onOverflowChange)).toEqual([1, 2]);
      expect(visibleContainer().textContent).toBe('Amore:1,2');
    });
  });
});
