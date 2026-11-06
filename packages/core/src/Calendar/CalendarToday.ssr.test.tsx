// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CalendarToday.ssr.test.tsx
 * @input Calendar server markup from a UTC server, hydrated in a browser whose
 *   local date is already the next day
 * @output Proves hydration matches the server markup, and that today's marker
 *   and the default month follow the browser's own date right after
 * @position SSR acceptance test for Calendar's reading of today
 */

import {act} from 'react';
import {fireEvent, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Calendar} from './Calendar';

const originalTZ = process.env.TZ;

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  // 23:30 UTC on 30 November: still November in UTC, already 1 December
  // in a zone 14 hours ahead.
  vi.setSystemTime(new Date('2026-11-30T23:30:00Z'));
});

afterEach(() => {
  process.env.TZ = originalTZ;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function serverThenHydrate(tree: React.ReactElement) {
  process.env.TZ = 'UTC';
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  const serverMarkup = container.innerHTML;
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
  return {
    container,
    serverMarkup,
    errors,
    unmount: () => act(() => root.unmount()),
  };
}

describe('Calendar today across a server and a browser in different zones', () => {
  it('hydrates without a mismatch and then shows the browser’s month and today', async () => {
    const {container, serverMarkup, errors, unmount} = await serverThenHydrate(
      <Calendar />,
    );
    // The server knows no today: no day is marked, and the month grid keeps
    // its space but is hidden from everyone.
    expect(serverMarkup).not.toContain('aria-current');
    expect(serverMarkup).toContain('aria-hidden="true"');
    // The month label is empty and both month buttons are unavailable.
    const server = document.createElement('div');
    server.innerHTML = serverMarkup;
    const previous = within(server).getByRole('button', {
      name: 'Previous month',
    });
    const next = within(server).getByRole('button', {name: 'Next month'});
    for (const button of [previous, next]) {
      expect(button.matches(':disabled, [aria-disabled="true"]')).toBe(true);
    }
    const header = previous.parentElement!;
    expect(header.contains(next)).toBe(true);
    const headerText = [...header.childNodes]
      .filter(node => !node.contains(previous) && !node.contains(next))
      .map(node => node.textContent)
      .join('');
    expect(headerText).toBe('');
    expect(errors).toEqual([]);
    expect(
      container.querySelector('[role="grid"]')?.getAttribute('aria-label'),
    ).toBe('December 2026');
    expect(
      container
        .querySelector('[aria-current="date"]')
        ?.getAttribute('data-date'),
    ).toBe('2026-12-01');
    // The first month to appear is not a change, so nothing is announced.
    expect(
      document.querySelector('[data-astryx-live-region="polite"]'),
    ).toBeNull();
    unmount();
  });

  it('keeps both shown months when a day in the second month is picked after hydration', async () => {
    const {container, errors, unmount} = await serverThenHydrate(
      <Calendar numberOfMonths={2} />,
    );
    expect(errors).toEqual([]);
    const labels = () =>
      [...container.querySelectorAll('[role="grid"]')].map(grid =>
        grid.getAttribute('aria-label'),
      );
    expect(labels()).toEqual(['December 2026', 'January 2027']);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-date="2027-01-15"]')!);
    });
    expect(labels()).toEqual(['December 2026', 'January 2027']);
    unmount();
  });

  it('hydrates without a mismatch on a shown month that holds both dates', async () => {
    const {container, errors, unmount} = await serverThenHydrate(
      <Calendar focusDate="2026-11-15" />,
    );
    expect(errors).toEqual([]);
    expect(
      container.querySelector('[role="grid"]')?.getAttribute('aria-label'),
    ).toBe('November 2026');
    // 1 December is an outside day here: no November day is today.
    expect(
      container.querySelector('[aria-current="date"][data-date^="2026-11"]'),
    ).toBeNull();
    unmount();
  });
});
