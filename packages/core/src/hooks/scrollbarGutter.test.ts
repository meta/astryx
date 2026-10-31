// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.test.ts
 * @input Uses vitest and a stubbed viewport, element box and CSS.supports
 *   (jsdom does no layout)
 * @output Unit tests for holdScrollbarGutter
 * @position Testing; validates scrollbarGutter.ts implementation
 *
 * SYNC: When scrollbarGutter.ts changes, update tests to match new behavior
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {holdScrollbarGutter} from './scrollbarGutter';

const originalCss = Object.getOwnPropertyDescriptor(window, 'CSS');

/**
 * jsdom does no layout, so both halves of the measurement are stubbed: the
 * viewport (`innerWidth` vs `documentElement.clientWidth`) and the element's
 * own box, which `widths` reads from and a test flips to simulate the lock
 * widening it. `gutter` says whether the engine has `scrollbar-gutter`.
 */
function stub({
  innerWidth,
  clientWidth,
  widths = () => clientWidth,
  gutter = true,
}: {
  innerWidth: number;
  clientWidth: number;
  widths?: () => number;
  gutter?: boolean;
}) {
  Object.defineProperty(window, 'innerWidth', {
    value: innerWidth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  });
  Object.defineProperty(window, 'CSS', {
    value: {
      supports: (property: string, value: string) =>
        gutter && property === 'scrollbar-gutter' && value === 'stable',
    },
    configurable: true,
    writable: true,
  });
  const box = vi.fn(() => ({width: widths()}) as DOMRect);
  document.body.getBoundingClientRect = box;
  return {box};
}

const rootGutter = () => document.documentElement.style.scrollbarGutter;

describe('holdScrollbarGutter', () => {
  afterEach(() => {
    document.body.style.cssText = '';
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the stubs so jsdom's own values come back
    delete document.documentElement.clientWidth;
    // @ts-expect-error -- restore the prototype's implementation
    delete document.body.getBoundingClientRect;
    if (originalCss) {
      Object.defineProperty(window, 'CSS', originalCss);
    } else {
      Reflect.deleteProperty(window, 'CSS');
    }
    vi.restoreAllMocks();
  });

  it('holds the gutter open with the lock’s styles when a space-taking scrollbar is about to be hidden', () => {
    // A 1024px window over a 1009px layout viewport = a 15px classic scrollbar.
    stub({innerWidth: 1024, clientWidth: 1009});

    const hold = holdScrollbarGutter(document.body);

    // Taking the hold only reads; the gutter is written with the lock.
    expect(rootGutter()).toBe('');

    hold.settle();
    expect(rootGutter()).toBe('stable');

    hold.release();
    expect(rootGutter()).toBe('');
  });

  it('reads no layout once the lock’s styles apply, where the engine holds the gutter', () => {
    const {box} = stub({innerWidth: 1024, clientWidth: 1009});
    const computed = vi.spyOn(window, 'getComputedStyle');

    const hold = holdScrollbarGutter(document.body);
    document.documentElement.style.overflow = 'hidden';
    hold.settle();

    // A read after the lock's writes would force a second layout during the
    // overlay's opening commit.
    expect(box).not.toHaveBeenCalled();
    expect(computed).not.toHaveBeenCalled();
    hold.release();
  });

  it('leaves an overlay scrollbar alone, reading nothing past the viewport', () => {
    const {box} = stub({innerWidth: 1024, clientWidth: 1024});
    const computed = vi.spyOn(window, 'getComputedStyle');

    const hold = holdScrollbarGutter(document.body);
    hold.settle();

    expect(rootGutter()).toBe('');
    expect(document.body.style.paddingRight).toBe('');
    expect(box).not.toHaveBeenCalled();
    expect(computed).not.toHaveBeenCalled();

    hold.release();
  });

  it('does not pad on an engine without scrollbar-gutter when the element kept its width', () => {
    stub({
      innerWidth: 1024,
      clientWidth: 1009,
      widths: () => 1009,
      gutter: false,
    });

    const hold = holdScrollbarGutter(document.body);
    hold.settle();

    expect(rootGutter()).toBe('');
    expect(document.body.style.paddingRight).toBe('');

    hold.release();
  });

  it('falls back to padding on an engine without scrollbar-gutter when the element grew', () => {
    // The scrollbar goes away and the element widens by 15px.
    let width = 1009;
    stub({
      innerWidth: 1024,
      clientWidth: 1009,
      widths: () => width,
      gutter: false,
    });

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();

    expect(document.body.style.paddingRight).toBe('15px');

    hold.release();

    expect(document.body.style.paddingRight).toBe('');
  });

  it("adds to the page's own padding instead of replacing it", () => {
    let width = 1009;
    stub({
      innerWidth: 1024,
      clientWidth: 1009,
      widths: () => width,
      gutter: false,
    });
    document.body.style.paddingRight = '24px';

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();

    expect(document.body.style.paddingRight).toBe('39px');

    hold.release();

    expect(document.body.style.paddingRight).toBe('24px');
  });

  it('restores the page’s own scrollbar-gutter rather than clearing it', () => {
    stub({innerWidth: 1024, clientWidth: 1009});
    document.documentElement.style.scrollbarGutter = 'stable both-edges';

    const hold = holdScrollbarGutter(document.body);
    hold.settle();

    expect(rootGutter()).toBe('stable');

    hold.release();

    expect(rootGutter()).toBe('stable both-edges');
  });

  it('settles once, however many times it is called', () => {
    let width = 1009;
    stub({
      innerWidth: 1024,
      clientWidth: 1009,
      widths: () => width,
      gutter: false,
    });

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();
    hold.settle();
    hold.settle();

    expect(document.body.style.paddingRight).toBe('15px');

    hold.release();
  });

  it('does nothing where there is no layout to measure', () => {
    stub({innerWidth: 1024, clientWidth: 0});

    const hold = holdScrollbarGutter(document.body);
    hold.settle();

    expect(rootGutter()).toBe('');
    expect(document.body.style.paddingRight).toBe('');

    hold.release();
  });
});
