// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file Tests when the docsite link lets the Next.js link prefetch.
 *
 * Run: pnpm -F @astryxdesign/docsite test intent-prefetch-link
 */

import {createElement, type ComponentProps} from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  INTENT_REST_MS,
  IntentPrefetchLink,
} from '../components/IntentPrefetchLink';

// The stub shows the `prefetch` value that the Next.js link receives.
vi.mock('next/link', () => ({
  default: ({
    prefetch,
    ...anchorProps
  }: ComponentProps<'a'> & {prefetch?: unknown}) =>
    createElement('a', {...anchorProps, 'data-prefetch': String(prefetch)}),
}));

const HELD = 'false';
const NEXT_DEFAULT = 'null';

function setConnection(connection: unknown) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: connection,
  });
}

function renderLink(
  props: Partial<ComponentProps<typeof IntentPrefetchLink>> = {},
) {
  render(
    <IntentPrefetchLink href="/docs/theme" {...props}>
      Theming
    </IntentPrefetchLink>,
  );
  return screen.getByRole('link', {name: 'Theming'});
}

function rest(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/**
 * Moves the focus to `link`. jsdom does not model `:focus-visible`, so the
 * test gives the browser's answer: true for keyboard focus, false for the
 * focus that a press gives.
 */
function focus(link: HTMLElement, from: 'keyboard' | 'press') {
  const realMatches = link.matches.bind(link);
  vi.spyOn(link, 'matches').mockImplementation(selector =>
    selector === ':focus-visible' ? from === 'keyboard' : realMatches(selector),
  );
  fireEvent.focus(link);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setConnection(undefined);
});

describe('IntentPrefetchLink', () => {
  it('renders a real link that does not prefetch', () => {
    const link = renderLink();
    expect(link.getAttribute('href')).toBe('/docs/theme');
    expect(link.dataset.prefetch).toBe(HELD);
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('prefetches when the pointer has rested on the link', () => {
    const link = renderLink();
    fireEvent.pointerEnter(link);
    rest(INTENT_REST_MS - 1);
    expect(link.dataset.prefetch).toBe(HELD);
    rest(1);
    expect(link.dataset.prefetch).toBe(NEXT_DEFAULT);
  });

  it('does not prefetch for a pointer that only crosses the link', () => {
    const link = renderLink();
    fireEvent.pointerEnter(link);
    rest(INTENT_REST_MS - 1);
    fireEvent.pointerLeave(link);
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('prefetches when the keyboard focus has rested on the link', () => {
    const link = renderLink();
    focus(link, 'keyboard');
    rest(INTENT_REST_MS - 1);
    expect(link.dataset.prefetch).toBe(HELD);
    rest(1);
    expect(link.dataset.prefetch).toBe(NEXT_DEFAULT);
  });

  it('does not prefetch for a focus that only passes the link', () => {
    const link = renderLink();
    focus(link, 'keyboard');
    rest(INTENT_REST_MS - 1);
    fireEvent.blur(link);
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('does not prefetch for the focus that a press gives', () => {
    const link = renderLink();
    focus(link, 'press');
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('starts the rest again when the pointer comes back', () => {
    const link = renderLink();
    fireEvent.pointerEnter(link);
    rest(INTENT_REST_MS - 1);
    fireEvent.pointerLeave(link);
    fireEvent.pointerEnter(link);
    rest(INTENT_REST_MS - 1);
    expect(link.dataset.prefetch).toBe(HELD);
    rest(1);
    expect(link.dataset.prefetch).toBe(NEXT_DEFAULT);
  });

  it.each(['mouse', 'pen'])(
    'prefetches at a %s press, with no rest',
    pointerType => {
      const link = renderLink();
      fireEvent.pointerEnter(link, {pointerType});
      fireEvent.pointerDown(link, {pointerType});
      expect(link.dataset.prefetch).toBe(NEXT_DEFAULT);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not prefetch at a touch press', () => {
    const link = renderLink();
    fireEvent.pointerDown(link, {pointerType: 'touch'});
    expect(link.dataset.prefetch).toBe(HELD);
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('does not prefetch for a touch that stays on the link', () => {
    const link = renderLink();
    fireEvent.pointerEnter(link, {pointerType: 'touch'});
    expect(vi.getTimerCount()).toBe(0);
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('does not prefetch after the pointer and the focus both leave', () => {
    const link = renderLink();
    fireEvent.pointerEnter(link);
    focus(link, 'keyboard');
    fireEvent.pointerLeave(link);
    fireEvent.blur(link);
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('keeps the prefetch after the pointer and the focus leave', () => {
    const link = renderLink();
    fireEvent.pointerDown(link);
    fireEvent.pointerLeave(link);
    fireEvent.blur(link);
    rest(INTENT_REST_MS * 10);
    expect(link.dataset.prefetch).toBe(NEXT_DEFAULT);
  });

  it.each([
    ['a data-saving mode', {saveData: true, effectiveType: '4g'}],
    ['a 2G connection', {saveData: false, effectiveType: '2g'}],
  ])('does not prefetch in %s', (_name, connection) => {
    setConnection(connection);
    const link = renderLink();
    fireEvent.pointerEnter(link);
    rest(INTENT_REST_MS);
    focus(link, 'keyboard');
    rest(INTENT_REST_MS);
    fireEvent.pointerDown(link);
    expect(link.dataset.prefetch).toBe(HELD);
  });

  it('reads the connection when the visitor shows intent', () => {
    const link = renderLink();
    setConnection({saveData: true});
    fireEvent.pointerDown(link);
    expect(link.dataset.prefetch).toBe(HELD);
    setConnection({saveData: false});
    fireEvent.pointerDown(link);
    expect(link.dataset.prefetch).toBe(NEXT_DEFAULT);
  });

  it.each([true, false, null, 'auto'] as const)(
    'gives the caller\u2019s prefetch value %j to the Next.js link',
    prefetch => {
      const link = renderLink({prefetch});
      expect(link.dataset.prefetch).toBe(String(prefetch));
      fireEvent.pointerDown(link);
      expect(link.dataset.prefetch).toBe(String(prefetch));
    },
  );

  it('calls the caller\u2019s handlers', () => {
    const handlers = {
      onPointerEnter: vi.fn(),
      onPointerLeave: vi.fn(),
      onPointerDown: vi.fn(),
      onFocus: vi.fn(),
      onBlur: vi.fn(),
      onClick: vi.fn(),
    };
    const link = renderLink(handlers);
    fireEvent.pointerEnter(link);
    fireEvent.pointerLeave(link);
    fireEvent.pointerDown(link);
    fireEvent.focus(link);
    fireEvent.blur(link);
    fireEvent.click(link);
    for (const handler of Object.values(handlers)) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it('calls the caller\u2019s handlers for a touch and for a press focus', () => {
    const handlers = {
      onPointerEnter: vi.fn(),
      onPointerDown: vi.fn(),
      onFocus: vi.fn(),
    };
    const link = renderLink(handlers);
    fireEvent.pointerEnter(link, {pointerType: 'touch'});
    fireEvent.pointerDown(link, {pointerType: 'touch'});
    focus(link, 'press');
    for (const handler of Object.values(handlers)) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it('stops the rest timer when the link unmounts', () => {
    const link = renderLink();
    fireEvent.pointerEnter(link);
    expect(vi.getTimerCount()).toBe(1);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
});
