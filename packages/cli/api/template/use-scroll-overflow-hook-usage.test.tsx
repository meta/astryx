// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useScrollOverflow example fades the edge of its filter strip only on
 * the side where filters are hidden, and updates the fade as the strip
 * scrolls and as filters are added. The side follows the strip's own
 * direction (the Right to left switch), not the page's.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseScrollOverflowHookUsage from '../../assets/templates/blocks/components/Hooks/useScrollOverflowHookUsage';

// The node project does not compile StyleX. Each style compiles to its key as
// the class name, so the test can read which fade the strip has.
vi.mock('@stylexjs/stylex', () => ({
  create: (styles: Record<string, unknown>) =>
    Object.fromEntries(
      Object.keys(styles).map(key => [key, {$$css: true, [key]: key}]),
    ),
  props: (...styles: unknown[]) => ({
    className: styles
      .filter(style => typeof style === 'object' && style != null)
      .flatMap(style => Object.keys(style as object))
      .filter(key => key !== '$$css')
      .join(' '),
  }),
}));

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

const STRIP_WIDTH = 320;
const FILTER_WIDTH = 120;

let root: Root | null = null;
let container: HTMLElement;
let scrollLeft = 0;

function strip(): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    '[aria-label="Active filters"]',
  );
  if (element == null) {
    throw new Error('no filter strip rendered');
  }
  return element;
}

function fade(): string {
  return (
    strip()
      .className.split(' ')
      .find(name => name.startsWith('fade')) ?? 'none'
  );
}

function setRightToLeft(): void {
  const toggle = container.querySelector<HTMLInputElement>('[role="switch"]');
  act(() => {
    toggle?.click();
  });
}

function scrollTo(offset: number): void {
  scrollLeft = offset;
  act(() => {
    strip().dispatchEvent(new Event('scroll'));
  });
}

async function addFilter(): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find(
    candidate => candidate.textContent === 'Add filter',
  );
  await act(async () => {
    button?.click();
  });
}

beforeEach(() => {
  scrollLeft = 0;
  // jsdom has no layout. The strip is as wide as its filters.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.getAttribute('aria-label') === 'Active filters'
        ? STRIP_WIDTH
        : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.children.length * FILTER_WIDTH;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockImplementation(
    () => scrollLeft,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseScrollOverflowHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.documentElement.removeAttribute('dir');
  vi.restoreAllMocks();
});

describe('useScrollOverflow example', () => {
  it('shows no fade while every filter fits', () => {
    expect(strip().children).toHaveLength(2);
    expect(fade()).toBe('none');
  });

  it('fades the end once an added filter overflows the strip', async () => {
    await addFilter();
    await addFilter();
    expect(strip().children).toHaveLength(4);
    expect(fade()).toBe('fadeRight');
  });

  it('fades the side where filters are hidden as the strip scrolls', async () => {
    await addFilter();
    await addFilter();
    const maxScroll = 4 * FILTER_WIDTH - STRIP_WIDTH;

    scrollTo(maxScroll / 2);
    expect(fade()).toBe('fadeBoth');

    scrollTo(maxScroll);
    expect(fade()).toBe('fadeLeft');

    scrollTo(0);
    expect(fade()).toBe('fadeRight');
  });

  it('fades the right edge first when the strip is right to left', async () => {
    setRightToLeft();
    await addFilter();
    await addFilter();
    const maxScroll = 4 * FILTER_WIDTH - STRIP_WIDTH;
    expect(fade()).toBe('fadeLeft');

    scrollTo(-maxScroll);
    expect(fade()).toBe('fadeRight');
  });

  it('follows the strip, not the page, inside a right-to-left page', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    await addFilter();
    await addFilter();
    const maxScroll = 4 * FILTER_WIDTH - STRIP_WIDTH;
    expect(fade()).toBe('fadeRight');

    scrollTo(maxScroll);
    expect(fade()).toBe('fadeLeft');
  });
});
