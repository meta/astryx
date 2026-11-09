// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TouchDateToday.ssr.test.tsx
 * @input DateInput and DateTimeInput sheet markup from a UTC server, hydrated
 *   in a browser whose local date is already the next month
 * @output Proves hydration matches the server markup
 * @position SSR acceptance test for the sheet date fields' reading of today
 */

import {act, useState} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent} from '@testing-library/react';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {DateInput} from './DateInput';
import {DateTimeInput} from '../DateTimeInput/DateTimeInput';

const originalTZ = process.env.TZ;

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  // 23:30 UTC on 30 November: still November in UTC, already 1 December in a
  // zone 14 hours ahead.
  vi.setSystemTime(new Date('2026-11-30T23:30:00Z'));
  // jsdom has no ResizeObserver; the month scroller measures with one.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  process.env.TZ = originalTZ;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function hydrationErrors(tree: React.ReactElement) {
  process.env.TZ = 'UTC';
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);

  process.env.TZ = 'Pacific/Kiritimati';
  const consoleErrors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const recoverableErrors: unknown[] = [];
  let root!: ReturnType<typeof hydrateRoot>;
  await act(async () => {
    root = hydrateRoot(container, tree, {
      onRecoverableError: error => recoverableErrors.push(error),
    });
  });
  const errors = [...recoverableErrors, ...consoleErrors.mock.calls];
  act(() => root.unmount());
  return errors;
}

describe('sheet date fields across a server and a browser in different zones', () => {
  it('hydrates a sheet DateInput without a mismatch', async () => {
    expect(
      await hydrationErrors(
        <DateInput
          label="Due"
          presentation="bottom-sheet"
          onChange={() => {}}
        />,
      ),
    ).toEqual([]);
  });

  it('hydrates a sheet DateTimeInput without a mismatch', async () => {
    expect(
      await hydrationErrors(
        <DateTimeInput
          label="Starts"
          presentation="bottom-sheet"
          onChange={() => {}}
        />,
      ),
    ).toEqual([]);
  });
});

// The sheet opens on today's month. After hydration that month is stored in
// the first render that knows today, so an open sheet keeps its month when a
// later render runs past midnight at a month end.
describe('sheet date fields after hydration, across a month-end midnight', () => {
  const SCROLLPORT_WIDTH = 360;

  // jsdom lays nothing out, so the month scrollport reports its CSS width
  // only while the test renders and opens the sheet.
  function withLayout<T>(fn: () => T): T {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset?.scroller === 'months' ? SCROLLPORT_WIDTH : 0;
      },
    });
    try {
      return fn();
    } finally {
      delete (HTMLElement.prototype as {clientWidth?: unknown}).clientWidth;
    }
  }

  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    HTMLDialogElement.prototype.showModal = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    });
    HTMLDialogElement.prototype.close = vi.fn(function (
      this: HTMLDialogElement,
    ) {
      this.open = false;
    });
  });

  // The heading button in the open sheet names the shown month.
  const monthTitle = () =>
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        'dialog[open] button[aria-expanded]',
      ),
    ]
      .map(button => button.textContent)
      .join(' | ');

  async function openThenCrossMidnight(
    opener: string,
    field: (renderCount: number) => React.ReactElement,
  ) {
    process.env.TZ = 'UTC';
    let rerender!: () => void;
    function Host() {
      const [renderCount, setRenderCount] = useState(0);
      rerender = () => setRenderCount(count => count + 1);
      return field(renderCount);
    }
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Host />);
    document.body.appendChild(container);
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Host />);
    });
    withLayout(() => fireEvent.click(container.querySelector(opener)!));
    const before = monthTitle();
    // 00:30 UTC on 1 December: the next render reads a new today.
    vi.setSystemTime(new Date('2026-12-01T00:30:00Z'));
    withLayout(() => act(() => rerender()));
    const after = monthTitle();
    act(() => root.unmount());
    return {before, after};
  }

  it('keeps an open sheet DateInput on its month', async () => {
    const {before, after} = await openThenCrossMidnight(
      '[role="combobox"]',
      renderCount => (
        <DateInput
          label={renderCount > 0 ? 'Due date' : 'Due'}
          presentation="bottom-sheet"
          onChange={() => {}}
        />
      ),
    );
    expect(before).toContain('November 2026');
    expect(after).toContain('November 2026');
  });

  it('keeps an open sheet DateTimeInput on its month', async () => {
    const {before, after} = await openThenCrossMidnight(
      'input[inputmode="none"]',
      renderCount => (
        <DateTimeInput
          label={renderCount > 0 ? 'Start time' : 'Starts'}
          presentation="bottom-sheet"
          onChange={() => {}}
        />
      ),
    );
    expect(before).toContain('November 2026');
    expect(after).toContain('November 2026');
  });
});
