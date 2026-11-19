// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pageScroller.test.ts
 * @input The page-scroller rules and stand-in scroll containers
 * @output Which containers count as the page's scroller, where their visible
 *   area starts and where their scroll events fire
 * @position Unit coverage for utils/pageScroller.ts
 */

import {afterEach, describe, expect, it} from 'vitest';
import {scrollEventTarget, scrollportTop, scrollsPage} from './pageScroller';

describe('page scroller rules', () => {
  const restore: (() => void)[] = [];
  afterEach(() => {
    for (const undo of restore.splice(0)) {
      undo();
    }
  });

  /** Makes the document report `el` as its scrolling element. */
  function scrollingElementIs(el: Element): void {
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      get: () => el,
    });
    restore.push(() => {
      delete (document as unknown as Record<string, unknown>).scrollingElement;
    });
  }

  /** A container whose box starts 120px below the viewport's top. */
  function boxAt120(el: HTMLElement): HTMLElement {
    el.getBoundingClientRect = () =>
      ({top: 120, bottom: 520, left: 0, right: 0, height: 400}) as DOMRect;
    return el;
  }

  it('treats the scrolling element as the page scroller', () => {
    const root = boxAt120(document.documentElement);
    scrollingElementIs(root);
    expect(scrollsPage(root)).toBe(true);
    expect(scrollportTop(root)).toBe(0);
    expect(scrollEventTarget(root)).toBe(document);
  });

  it('treats the document element as the page scroller when the body is the scrolling element', () => {
    scrollingElementIs(document.body);
    const root = boxAt120(document.documentElement);
    expect(scrollsPage(root)).toBe(true);
    expect(scrollportTop(root)).toBe(0);
    expect(scrollEventTarget(root)).toBe(document);
    expect(scrollsPage(document.body)).toBe(true);
  });

  it('treats any other element as its own scroller', () => {
    scrollingElementIs(document.documentElement);
    const box = boxAt120(document.createElement('div'));
    document.body.appendChild(box);
    restore.push(() => box.remove());
    expect(scrollsPage(box)).toBe(false);
    expect(scrollportTop(box)).toBe(120);
    expect(scrollEventTarget(box)).toBe(box);
  });
});
