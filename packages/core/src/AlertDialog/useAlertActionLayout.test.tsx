// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAlertActionLayout.test.tsx
 * @input resolveAlertActionLayout, and a component using useAlertActionLayout
 *   over two actions with stubbed widths. A test-fired observer replaces the
 *   shared resize observer and reports once on registration, as that one
 *   does. A stub font set fires a font load
 * @output The layout rule: two actions share a row when each label fits its
 *   own half, never by the sum. Three or more stack, and one fills the row.
 *   The hook stacks until it can measure. It decides again on a title resize,
 *   a label change or a font load. It watches only the title, and it reads
 *   nothing off the compact touch layout
 * @position jsdom tests of packages/core/src/AlertDialog/useAlertActionLayout.ts
 */

import {act, render} from '@testing-library/react';
import {StrictMode, useRef} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  resolveAlertActionLayout,
  useAlertActionLayout,
  type AlertActionLayout,
} from './useAlertActionLayout';

const {observers} = vi.hoisted(() => ({
  observers: new Map<Element, Set<() => void>>(),
}));

vi.mock('../utils/sharedResizeObserver', () => ({
  observeResize: (element: Element, callback: () => void) => {
    const set = observers.get(element) ?? new Set();
    set.add(callback);
    observers.set(element, set);
    // The shared observer reports once, synchronously, on registration.
    callback();
    return () => set.delete(callback);
  },
}));

/** Fires the resize callbacks registered for `element`, as the observer does. */
function resized(element: Element): void {
  act(() => {
    for (const callback of observers.get(element) ?? []) {
      callback();
    }
  });
}

// A 320 px alert's row: 288 wide with an 8 gap, so each action gets 140.
const ROW = 288;
const GAP = 8;
const PADDING = 12;
const BORDER = 1;

let latest: AlertActionLayout | null = null;
let rowWidth = ROW;
const labelWidths = new Map<string, number>();

function Actions({
  labels,
  isCompact = true,
  columnGap = `${GAP}px`,
  isLoading = false,
  isShown = true,
}: {
  labels: [string, string];
  isCompact?: boolean;
  columnGap?: string;
  isLoading?: boolean;
  isShown?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const {layout, watchRef} = useAlertActionLayout(rowRef, {
    isCompact,
    itemSelector: '[data-action]',
    labels,
  });
  latest = layout;
  // An inline alert renders nothing while it is closed.
  if (!isShown) {
    return null;
  }
  return (
    <div>
      <h2 ref={watchRef} data-testid="title">
        Delete item?
      </h2>
      <div ref={rowRef} data-testid="row" style={{columnGap}}>
        {labels.map(label => (
          <button
            key={label}
            type="button"
            data-action
            style={{
              paddingLeft: `${PADDING}px`,
              paddingRight: `${PADDING}px`,
              borderStyle: 'solid',
              borderLeftWidth: `${BORDER}px`,
              borderRightWidth: `${BORDER}px`,
            }}>
            <span data-testid={`wrap-${label}`}>
              <span data-testid={`label-${label}`}>{label}</span>
              {isLoading && label === labels[1] && <span>Loading</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

beforeEach(() => {
  observers.clear();
  latest = null;
  rowWidth = ROW;
  labelWidths.clear();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.dataset.testid === 'row' ? rowWidth : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      const id = this.dataset.testid ?? '';
      if (id.startsWith('wrap-')) {
        // The label and, while loading, the spinner's text, 100 px wide.
        const label = labelWidths.get(id.slice('wrap-'.length)) ?? 0;
        return label + (this.children.length > 1 ? 100 : 0);
      }
      return id.startsWith('label-')
        ? (labelWidths.get(id.slice('label-'.length)) ?? 0)
        : 0;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveAlertActionLayout', () => {
  const measure = (widths: number[]) =>
    resolveAlertActionLayout({available: ROW, gap: GAP, widths});

  it('puts two actions in a row when each fits its own half', () => {
    expect(measure([140, 140])).toBe('row');
    expect(measure([114 + 2 * PADDING, 111 + 2 * PADDING])).toBe('row');
  });

  it('stacks them when one does not, whatever the sum', () => {
    expect(measure([141, 40])).toBe('stack');
    // 137.6 + 53.7 sum to less than the row, and the actions still stack.
    expect(measure([137.6 + 2 * PADDING, 53.7 + 2 * PADDING])).toBe('stack');
  });

  it('always stacks three actions and lets one fill the row', () => {
    expect(measure([40, 40, 40])).toBe('stack');
    expect(measure([400])).toBe('row');
  });
});

describe('useAlertActionLayout', () => {
  it('shares the row when both labels fit their halves', () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 50);
    render(<Actions labels={['Cancel', 'Delete']} />);
    expect(latest).toBe('row');
  });

  it('stacks when one label is wider than its half', () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete everything', 140);
    render(<Actions labels={['Cancel', 'Delete everything']} />);
    expect(latest).toBe('stack');
  });

  it('stacks until the row can be measured, then decides when the title is shown', () => {
    rowWidth = 0;
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 50);
    const view = render(<Actions labels={['Cancel', 'Delete']} />);
    expect(latest).toBe('stack');
    // The dialog is shown: the title gets its size, and the row is laid out.
    rowWidth = ROW;
    resized(view.getByTestId('title'));
    expect(latest).toBe('row');
  });

  it('decides again when the watched title changes size: a rotation or a zoom', () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 50);
    const view = render(<Actions labels={['Cancel', 'Delete']} />);
    expect(latest).toBe('row');
    // A narrower alert leaves too little for the label.
    rowWidth = 120;
    resized(view.getByTestId('title'));
    expect(latest).toBe('stack');
    rowWidth = ROW;
    resized(view.getByTestId('title'));
    expect(latest).toBe('row');
    // A web font loads: the title and the label grow, and the label passes
    // its half.
    labelWidths.set('Delete', 130);
    resized(view.getByTestId('title'));
    expect(latest).toBe('stack');
  });

  it("decides again when a web font finishes loading, which can leave the title's size as it is", () => {
    const fonts = new EventTarget();
    const removed = vi.spyOn(fonts, 'removeEventListener');
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: fonts,
    });
    try {
      labelWidths.set('Cancel', 52);
      labelWidths.set('Delete', 50);
      const view = render(<Actions labels={['Cancel', 'Delete']} />);
      expect(latest).toBe('row');
      // The web font is wider than the fallback: the action outgrows its half.
      labelWidths.set('Delete', 130);
      act(() => {
        fonts.dispatchEvent(new Event('loadingdone'));
      });
      expect(latest).toBe('stack');
      view.unmount();
      expect(removed).toHaveBeenCalledWith('loadingdone', expect.any(Function));
    } finally {
      Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('decides once the title mounts, for an alert mounted closed and opened later', () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 50);
    const view = render(
      <Actions labels={['Cancel', 'Delete']} isShown={false} />,
    );
    expect(latest).toBe('stack');
    view.rerender(<Actions labels={['Cancel', 'Delete']} />);
    expect(latest).toBe('row');
  });

  it('decides again when a label changes while it is shown', () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 50);
    labelWidths.set('Delete every message in this thread', 260);
    const view = render(<Actions labels={['Cancel', 'Delete']} />);
    expect(latest).toBe('row');
    view.rerender(
      <Actions labels={['Cancel', 'Delete every message in this thread']} />,
    );
    expect(latest).toBe('stack');
    view.rerender(<Actions labels={['Cancel', 'Delete']} />);
    expect(latest).toBe('row');
  });

  it('watches only the title, whose size the layout never changes, so a decision starts no observer loop', () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 50);
    const view = render(<Actions labels={['Cancel', 'Delete']} />);
    expect([...observers.keys()]).toEqual([view.getByTestId('title')]);
  });

  it('logs no React error when the observer reports inside the effect, under StrictMode too', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 50);
    render(
      <StrictMode>
        <Actions labels={['Cancel', 'Delete']} />
      </StrictMode>,
    );
    expect(latest).toBe('row');
    expect(error).not.toHaveBeenCalled();
  });

  it("measures a loading action by its label, not by the spinner's text beside it", () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Revoke', 50);
    const view = render(<Actions labels={['Cancel', 'Revoke']} />);
    expect(latest).toBe('row');
    view.rerender(<Actions labels={['Cancel', 'Revoke']} isLoading />);
    resized(view.getByTestId('title'));
    expect(latest).toBe('row');
  });

  it("counts each action's padding and borders against its 140 half of the row", () => {
    // 114 + 2 × 12 of padding + 2 × 1 of border is 140: it fits.
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 114);
    const view = render(<Actions labels={['Cancel', 'Delete']} />);
    expect(latest).toBe('row');
    // One more pixel of label is 141: it stacks.
    labelWidths.set('Delete', 115);
    resized(view.getByTestId('title'));
    expect(latest).toBe('stack');
  });

  it('counts no gap for a row whose column gap computes to normal', () => {
    // Half of 288 is 144 with no gap, 140 with the 8 gap: 143 fits only the
    // first.
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete', 143 - 2 * PADDING - 2 * BORDER);
    render(<Actions labels={['Cancel', 'Delete']} columnGap="normal" />);
    expect(latest).toBe('row');
  });

  it('reads nothing off the compact touch layout and leaves the row as it is', () => {
    labelWidths.set('Cancel', 52);
    labelWidths.set('Delete everything', 300);
    render(
      <Actions labels={['Cancel', 'Delete everything']} isCompact={false} />,
    );
    expect(latest).toBe('row');
    expect(observers.size).toBe(0);
  });
});
