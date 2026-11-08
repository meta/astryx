// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useScrollableArea example is an Activity log panel that becomes a
 * keyboard tab stop only when its entries overflow, shades only the edges
 * with hidden entries, and keeps its scroll from chaining to the page.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import UseScrollableAreaHookUsage from '../../assets/templates/blocks/components/Hooks/useScrollableAreaHookUsage';

// The node project does not compile StyleX. Each style renders as its key in
// the class name, so the test can read which edge shadow the panel has.
vi.mock('@stylexjs/stylex', () => ({
  create: (styles: Record<string, unknown>) =>
    Object.fromEntries(Object.keys(styles).map(key => [key, key])),
  props: (...styles: unknown[]) => ({
    className: styles.filter(style => typeof style === 'string').join(' '),
  }),
}));

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

const PANEL_HEIGHT = 160;
const ENTRY_HEIGHT = 40;

let root: Root | null = null;
let container: HTMLElement;
let scrollTop = 0;

function isPanel(element: Element): boolean {
  return element.getAttribute('aria-label') === 'Activity log';
}

function panel(): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    '[aria-label="Activity log"]',
  );
  if (element == null) {
    throw new Error('no Activity log panel rendered');
  }
  return element;
}

function entryCount(element: Element): number {
  return element.querySelector('[data-scroll-content]')?.children.length ?? 0;
}

function shadow(): string {
  return (
    panel()
      .className.split(' ')
      .find(name => name.startsWith('shadow')) ?? 'none'
  );
}

async function nextFrame(): Promise<void> {
  await act(
    () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
  );
}

async function addEntries(count: number): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find(
    candidate => candidate.textContent === 'Add entry',
  );
  for (let i = 0; i < count; i++) {
    act(() => button?.click());
    await nextFrame();
  }
}

function scrollTo(offset: number): void {
  scrollTop = offset;
  act(() => {
    panel().dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  scrollTop = 0;
  // jsdom has no layout. The panel is 160px tall, and each entry is 40px.
  const getComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const style = getComputedStyle(element);
    if (!isPanel(element)) {
      return style;
    }
    return new Proxy(style, {
      get: (target, property) =>
        property === 'overflowY'
          ? 'auto'
          : (target[property as keyof CSSStyleDeclaration] as unknown),
    });
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isPanel(this) ? 300 : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isPanel(this) ? 300 : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isPanel(this) ? PANEL_HEIGHT : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
    function (this: HTMLElement) {
      return isPanel(this)
        ? Math.max(PANEL_HEIGHT, entryCount(this) * ENTRY_HEIGHT)
        : 0;
    },
  );
  vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(
    () => scrollTop,
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseScrollableAreaHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

describe('useScrollableArea example', () => {
  it('is not a tab stop and has no shadow while every entry fits', () => {
    expect(entryCount(panel())).toBe(3);
    expect(panel().hasAttribute('tabindex')).toBe(false);
    expect(shadow()).toBe('none');
  });

  it('becomes a tab stop that does not scroll the page once entries overflow', async () => {
    await addEntries(2);
    expect(entryCount(panel())).toBe(5);
    expect(panel().tabIndex).toBe(0);
    expect(panel().style.overscrollBehaviorY).toBe('contain');
    expect(shadow()).toBe('shadowBottom');
  });

  it('shades only the edges with hidden entries as the panel scrolls', async () => {
    await addEntries(3);
    const maxScroll = 6 * ENTRY_HEIGHT - PANEL_HEIGHT;

    scrollTo(maxScroll / 2);
    expect(shadow()).toBe('shadowBoth');

    scrollTo(maxScroll);
    expect(shadow()).toBe('shadowTop');

    scrollTo(0);
    expect(shadow()).toBe('shadowBottom');
  });
});
