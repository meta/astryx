// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hitArea.test.ts
 * @input Vitest, jsdom with stubbed matchMedia, IntersectionObserver,
 *   ResizeObserver, requestAnimationFrame and element rects
 * @output Checks the touch hit area: it grows toward 44 px, stops at half the
 *   gap to each neighbour, resolves a group's touch to the nearest target, and
 *   keeps a live control's insets current only where the pointer is coarse,
 *   only on screen, in one batched read-then-write pass per frame
 * @position Test for utils/hitArea.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  clampedHitInsets,
  HIT_INSET_PROPERTIES,
  type HitInsets,
  type HitRect,
  NO_HIT_INSETS,
  resolveHitTarget,
  watchHitArea,
  writeHitInsets,
} from './hitArea';

function rect(left: number, top: number, width: number, height: number) {
  return {left, top, right: left + width, bottom: top + height};
}

describe('clampedHitInsets', () => {
  it('grows a lone 24 px target to 44 px, centered', () => {
    expect(clampedHitInsets(rect(100, 100, 24, 24), [])).toEqual({
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    });
  });

  it('does not grow a target already 44 px or larger on an axis', () => {
    expect(clampedHitInsets(rect(0, 0, 44, 44), [])).toEqual(NO_HIT_INSETS);
    expect(clampedHitInsets(rect(0, 0, 120, 24), [])).toEqual({
      top: 10,
      right: 0,
      bottom: 10,
      left: 0,
    });
  });

  it('stops at half the gap to a neighbour on that side, and only that side', () => {
    // A link 8 px to the right.
    expect(
      clampedHitInsets(rect(100, 100, 24, 24), [rect(132, 100, 60, 24)]),
    ).toEqual({top: 10, right: 4, bottom: 10, left: 10});
  });

  it('does not grow toward a neighbour it touches', () => {
    expect(
      clampedHitInsets(rect(100, 100, 24, 24), [rect(124, 100, 24, 24)]).right,
    ).toBe(0);
  });

  it('stops at half the gap even where it would not reach the neighbour itself, so a tap nearer the neighbour is never its', () => {
    // 16 px apart: growing 10 px would take taps 2 px from the neighbour.
    expect(
      clampedHitInsets(rect(100, 100, 24, 24), [rect(140, 100, 24, 24)]).right,
    ).toBe(8);
  });

  it('ignores a neighbour at least twice its growth away', () => {
    expect(
      clampedHitInsets(rect(100, 100, 24, 24), [rect(144, 100, 24, 24)]),
    ).toEqual({top: 10, right: 10, bottom: 10, left: 10});
  });

  it('stops a diagonal neighbour on the side with the larger gap, so neither area reaches the other', () => {
    const a = rect(100, 100, 24, 24);
    // Down and to the right: 4 px across, 6 px down.
    const b = rect(128, 130, 24, 24);
    const insetsA = clampedHitInsets(a, [b]);
    const insetsB = clampedHitInsets(b, [a]);
    expect(insetsA).toEqual({top: 10, right: 10, bottom: 3, left: 10});
    expect(insetsB).toEqual({top: 3, right: 10, bottom: 10, left: 10});
    expect(a.bottom + insetsA.bottom).toBeLessThanOrEqual(b.top - insetsB.top);
  });

  it('ignores a neighbour that overlaps the target (an ancestor or an overlay)', () => {
    expect(
      clampedHitInsets(rect(100, 100, 24, 24), [rect(90, 90, 200, 60)]),
    ).toEqual({top: 10, right: 10, bottom: 10, left: 10});
  });
});

describe('resolveHitTarget', () => {
  // Two 28 px buttons 4 px apart, as in a dense toolbar.
  const toolbar: HitRect[] = [rect(0, 0, 28, 28), rect(32, 0, 28, 28)];

  it('gives a touch in the gap to the nearer button', () => {
    expect(resolveHitTarget(29, 14, toolbar)).toBe(0);
    expect(resolveHitTarget(31, 14, toolbar)).toBe(1);
  });

  it('extends each button toward 44 px where nothing is near', () => {
    expect(resolveHitTarget(-7, 14, toolbar)).toBe(0);
    expect(resolveHitTarget(14, 35, toolbar)).toBe(0);
  });

  it('answers -1 beyond every hit area', () => {
    expect(resolveHitTarget(14, 60, toolbar)).toBe(-1);
  });

  it('picks the nearer target, not the earlier one, where targets overlap', () => {
    const overlapping: HitRect[] = [rect(0, 0, 40, 28), rect(30, 0, 40, 28)];
    expect(resolveHitTarget(36, 14, overlapping)).toBe(1);
  });
});

describe('writeHitInsets', () => {
  it('sets the four custom properties in px', () => {
    const element = document.createElement('div');
    writeHitInsets(element, {top: 1, right: 2, bottom: 3, left: 4});
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.top)).toBe(
      '1px',
    );
    expect(element.style.getPropertyValue(HIT_INSET_PROPERTIES.left)).toBe(
      '4px',
    );
  });
});

describe('watchHitArea', () => {
  let coarse = true;
  let pointerListeners: Set<() => void>;
  let frames: (() => void)[];
  let intersection: ((entries: IntersectionObserverEntry[]) => void) | null;
  const rects = new Map<Element, HitRect>();
  const log: string[] = [];

  function place(element: Element, at: HitRect): void {
    rects.set(element, at);
    element.getBoundingClientRect = () => {
      log.push(`read ${element.id}`);
      const r = rects.get(element) ?? rect(0, 0, 0, 0);
      return {
        ...r,
        x: r.left,
        y: r.top,
        width: r.right - r.left,
        height: r.bottom - r.top,
        toJSON: () => r,
      };
    };
  }

  function show(...elements: Element[]): void {
    intersection?.(
      elements.map(
        target => ({target, isIntersecting: true}) as IntersectionObserverEntry,
      ),
    );
  }

  function flush(): void {
    const due = frames;
    frames = [];
    due.forEach(run => run());
  }

  beforeEach(() => {
    coarse = true;
    pointerListeners = new Set();
    frames = [];
    intersection = null;
    rects.clear();
    log.length = 0;
    vi.stubGlobal('matchMedia', (media: string) => ({
      media,
      get matches() {
        return media === '(pointer: coarse)' && coarse;
      },
      addEventListener: (_type: string, listener: () => void) =>
        pointerListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        pointerListeners.delete(listener),
    }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
          intersection = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
      frames.push(run);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    document.body.innerHTML =
      '<label><span id="switch" role="switch" tabindex="0"></span> Wi-Fi</label>' +
      '<a id="link" href="#details">Details</a>' +
      '<span id="other" role="switch" tabindex="0"></span>';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const byId = (id: string) => document.getElementById(id) as HTMLElement;

  it('measures an on-screen control in the next frame and stops at half the gap to a neighbouring link', () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    place(byId('other'), rect(400, 400, 24, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    expect(heard).toEqual([]);
    flush();
    expect(heard).toEqual([{top: 10, right: 4, bottom: 10, left: 10}]);
    stop();
  });

  it('measures nothing off screen', () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    flush();
    expect(heard).toEqual([]);
    expect(log).toEqual([]);
    stop();
  });

  it('batches every pending control into one frame: all reads, then all writes', () => {
    const first = byId('switch');
    const second = byId('other');
    place(first, rect(100, 100, 24, 24));
    place(second, rect(400, 400, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    const stops = [first, second].map(element =>
      watchHitArea(element, () => log.push(`write ${element.id}`)),
    );
    show(first, second);
    expect(frames).toHaveLength(1);
    flush();
    const firstWrite = log.findIndex(entry => entry.startsWith('write'));
    expect(firstWrite).toBeGreaterThan(0);
    expect(
      log.slice(firstWrite).every(entry => entry.startsWith('write')),
    ).toBe(true);
    expect(log.filter(entry => entry.startsWith('write'))).toEqual([
      'write switch',
      'write other',
    ]);
    stops.forEach(stop => stop());
  });

  it('measures nothing where the primary pointer is fine, and returns to 0 when it turns fine', () => {
    coarse = false;
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    expect(heard).toEqual([]);
    expect(log).toEqual([]);
    // The pointer turns coarse, then fine again.
    coarse = true;
    pointerListeners.forEach(listener => listener());
    flush();
    expect(heard).toEqual([{top: 10, right: 10, bottom: 10, left: 10}]);
    coarse = false;
    pointerListeners.forEach(listener => listener());
    expect(heard.at(-1)).toEqual(NO_HIT_INSETS);
    stop();
  });

  it('stops hearing a control after its function runs', () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    stop();
    flush();
    expect(heard).toEqual([]);
  });
});

describe('the package surface', () => {
  it('keeps hitArea out of the public utils entry', () => {
    const entry = fs.readFileSync(
      path.join(path.dirname(new URL(import.meta.url).pathname), 'index.ts'),
      'utf8',
    );
    expect(entry).not.toMatch(/hitArea/);
  });
});
