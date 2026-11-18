// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.ssr.test.tsx
 * @input DateRangeInput server markup from a UTC server, hydrated in a browser
 *   whose local date is already in the next year
 * @output Proves the trigger's range text hydrates without a mismatch, and
 *   drops the current year right after
 * @position SSR acceptance test for DateRangeInput's reading of today
 */

import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {DateRangeInput} from './DateRangeInput';

const originalTZ = process.env.TZ;

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  // 23:30 UTC on 31 December 2026: still 2026 in UTC, already 2027 in a zone
  // 14 hours ahead.
  vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
});

afterEach(() => {
  process.env.TZ = originalTZ;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('DateRangeInput range text across a server and a browser in different zones', () => {
  it('hydrates without a mismatch and then drops the browser’s current year', async () => {
    const tree = (
      <DateRangeInput
        label="Trip"
        value={{start: '2027-01-04', end: '2027-01-08'}}
        onChange={() => {}}
      />
    );
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree);
    document.body.appendChild(container);

    process.env.TZ = 'Pacific/Kiritimati';
    const consoleErrors = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });
    expect([...recoverableErrors, ...consoleErrors.mock.calls]).toEqual([]);
    expect(container.textContent).toContain('Jan 4 – Jan 8');
    expect(container.textContent).not.toContain('2027');
    act(() => root.unmount());
  });
});
