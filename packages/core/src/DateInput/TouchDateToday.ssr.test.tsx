// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file TouchDateToday.ssr.test.tsx
 * @input DateInput and DateTimeInput sheet markup from a UTC server, hydrated
 *   in a browser whose local date is already the next month
 * @output Proves hydration matches the server markup
 * @position SSR acceptance test for the sheet date fields' reading of today
 */

import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
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
