// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Toolbar} from './Toolbar';

/**
 * Every observer the page created. The shared observer lives as long as it
 * watches an element, so a test delivers through the one that watches its row.
 */
const observers: FakeResizeObserver[] = [];

class FakeResizeObserver {
  readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  /** Delivers one notification for each observed element, as after layout. */
  deliver() {
    const entries = [...this.targets].map(
      target => ({target}) as ResizeObserverEntry,
    );
    this.callback(entries, this);
  }
}

/** The lane boxes the toolbar reads: one row, or a row that wrapped. */
function stubLaneBoxes(row: HTMLElement, wrapped: boolean) {
  [...row.children].forEach((lane, index) => {
    const top = wrapped ? index * 40 : 0;
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
      top,
      bottom: top + 32,
      height: 32,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
  });
}

/** Counts box reads of the row's direct children: its lanes. */
function countLaneReads() {
  const read = vi.spyOn(Element.prototype, 'getBoundingClientRect');
  return () =>
    read.mock.contexts.filter(
      lane =>
        lane instanceof Element &&
        lane.parentElement?.getAttribute('role') === 'toolbar',
    ).length;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function DividedToolbar() {
  return (
    <Toolbar
      label="Record controls"
      dividers={['bottom']}
      startContent={<button type="button">Change owner</button>}
      centerContent={<span>Record actions</span>}
      endContent={<button type="button">Export record</button>}
    />
  );
}

/** Whether the row drops a tab indicator onto the bottom divider's rail. */
const dropsIndicatorOnRail = (row: HTMLElement) =>
  (row.getAttribute('style') ?? '').includes('calc(-1 *');

describe("Toolbar reads its lanes' boxes after layout (architecture:react-component-runtime INV18)", () => {
  it('does not read the lanes while it mounts with a bottom divider', () => {
    const laneReads = countLaneReads();
    render(<DividedToolbar />);
    expect(laneReads()).toBe(0);
  });

  it("reads the lanes at the browser's first resize notification, and keeps a wrapped row's indicator on its tab", () => {
    render(<DividedToolbar />);
    const row = screen.getByRole('toolbar');
    expect(dropsIndicatorOnRail(row)).toBe(true);

    stubLaneBoxes(row, true);
    act(() => {
      for (const observer of observers) {
        if (observer.targets.has(row)) {
          observer.deliver();
        }
      }
    });
    // The first three children are the lanes; the keyboard hint follows them.
    for (const lane of [...row.children].slice(0, 3)) {
      expect(lane.getBoundingClientRect).toHaveBeenCalled();
    }
    expect(dropsIndicatorOnRail(row)).toBe(false);
  });
});
