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
  resetHitAreaForTests,
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

  it('stops at half the gap to a neighbour that does not grow itself (a long link)', () => {
    // A 32 × 20 switch 8 px from a link wider and taller than 44 px.
    expect(
      clampedHitInsets(rect(100, 100, 32, 20), [rect(140, 88, 120, 44)]).right,
    ).toBe(4);
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

  it('cuts the same side as a diagonal neighbour of another size, so the two areas never overlap', () => {
    const small = rect(100, 100, 16, 16);
    // 12 px across and 14 px down.
    const wide = rect(128, 130, 32, 20);
    const a = clampedHitInsets(small, [wide]);
    const b = clampedHitInsets(wide, [small]);
    expect(small.bottom + a.bottom).toBeLessThanOrEqual(wide.top - b.top);
    expect(a.bottom).toBe(7);
    expect(b.top).toBe(7);
  });

  it('cuts a wide and a tall diagonal pair whose full areas would meet', () => {
    const square = rect(100, 100, 32, 32);
    // 4 px across and 12 px down.
    const wide = rect(136, 144, 40, 24);
    const a = clampedHitInsets(square, [wide]);
    const b = clampedHitInsets(wide, [square]);
    expect(square.bottom + a.bottom).toBeLessThanOrEqual(wide.top - b.top);
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

  it('gives a corner touch to the nearer of two diagonal targets', () => {
    const pair: HitRect[] = [rect(100, 100, 24, 24), rect(128, 130, 24, 24)];
    // 9.2 px from the first, 4 px from the second.
    expect(resolveHitTarget(133, 126, pair)).toBe(1);
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
    resetHitAreaForTests();
    vi.restoreAllMocks();
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

  it('counts a neighbour up to 44 px away for a small target, so two 8 px dots 24 px apart meet in the middle', () => {
    const control = byId('switch');
    const other = byId('other');
    place(control, rect(100, 100, 8, 8));
    place(other, rect(132, 100, 8, 8));
    place(byId('link'), rect(400, 400, 60, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    expect(heard.at(-1)?.right).toBe(12);
    stop();
  });

  it('gives a second watch of the same element its insets', () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    const first = watchHitArea(control, () => {});
    show(control);
    flush();
    const heard: HitInsets[] = [];
    const second = watchHitArea(control, insets => heard.push(insets));
    flush();
    expect(heard).toEqual([{top: 10, right: 10, bottom: 10, left: 10}]);
    first();
    second();
  });

  it('carries controls past the frame budget to the next frame, measuring at least one a frame', () => {
    const controls = ['switch', 'other'].map(byId);
    place(controls[0], rect(100, 100, 24, 24));
    place(controls[1], rect(400, 400, 24, 24));
    // Every clock read is 5 ms later: each frame's budget is spent after one
    // control.
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5));
    const heard: string[] = [];
    const stops = controls.map(element =>
      watchHitArea(element, () => heard.push(element.id)),
    );
    show(...controls);
    flush();
    expect(heard).toEqual(['switch']);
    expect(frames).toHaveLength(1);
    flush();
    expect(heard).toEqual(['switch', 'other']);
    expect(frames).toHaveLength(0);
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
    // The pointer turns coarse (the observers start, and the visibility
    // observer's first notice comes), then fine again.
    coarse = true;
    pointerListeners.forEach(listener => listener());
    show(control);
    flush();
    expect(heard).toEqual([{top: 10, right: 10, bottom: 10, left: 10}]);
    coarse = false;
    pointerListeners.forEach(listener => listener());
    expect(heard.at(-1)).toEqual(NO_HIT_INSETS);
    stop();
  });

  it('re-measures once its parent’s text settles after a change that moves a neighbour without resizing the control', async () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const control = byId('switch');
    const link = byId('link');
    place(control, rect(100, 100, 24, 24));
    place(link, rect(400, 100, 60, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    expect(heard.at(-1)?.right).toBe(10);
    // The label beside the switch shortens, and the link moves to 8 px away.
    place(link, rect(132, 100, 60, 24));
    (control.parentElement as HTMLElement).lastChild!.textContent = ' Wi';
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    flush();
    expect(heard.at(-1)?.right).toBe(4);
    stop();
    vi.useRealTimers();
  });

  it('swallows the click of a touch that a fresh measurement puts nearer a neighbour, and only that one', () => {
    const control = byId('switch');
    const link = byId('link');
    place(control, rect(100, 100, 24, 24));
    place(link, rect(400, 100, 60, 24));
    const stop = watchHitArea(control, () => {});
    show(control);
    flush();
    // The link moved to 8 px away with nothing re-measuring yet.
    place(link, rect(132, 100, 60, 24));
    const touch = (x: number) => {
      const press = new Event('pointerdown', {bubbles: true});
      Object.assign(press, {pointerType: 'touch', clientX: x, clientY: 112});
      control.dispatchEvent(press);
    };
    const click = () => {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      control.dispatchEvent(event);
      return event.defaultPrevented;
    };
    // 6 px right of the switch: inside the old area, 2 px from the link.
    touch(130);
    expect(click()).toBe(true);
    // One-shot: the next click is the control's.
    expect(click()).toBe(false);
    // A touch with no click leaves nothing behind for the next touch.
    touch(130);
    touch(110);
    expect(click()).toBe(false);
    // A keyboard activation (detail 0) after a touch with no click goes
    // through, and so does a click after the browser cancelled the touch.
    touch(130);
    const key = new MouseEvent('click', {bubbles: true, cancelable: true});
    control.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(false);
    touch(130);
    control.dispatchEvent(new Event('pointercancel', {bubbles: true}));
    expect(click()).toBe(false);
    // A press elsewhere (the control's label) ends it before its click.
    touch(130);
    link.dispatchEvent(new Event('pointerdown', {bubbles: true}));
    expect(click()).toBe(false);
    stop();
  });

  it('runs no observer or window listener for hit areas while the primary pointer is fine', () => {
    coarse = false;
    const constructed = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor() {
          constructed();
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const onWindow = vi.spyOn(window, 'addEventListener');
    const onElement = vi.spyOn(byId('switch'), 'addEventListener');
    const stop = watchHitArea(byId('switch'), () => {});
    expect(constructed).not.toHaveBeenCalled();
    expect(onWindow).not.toHaveBeenCalled();
    expect(onElement).not.toHaveBeenCalled();
    stop();
  });

  it('swallows a touch inside the fresh area that an offset neighbour is nearer (a corner)', () => {
    const control = byId('switch');
    // A tall link beside it, 8 px to the right, reaching far below.
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(132, 100, 60, 80));
    const stop = watchHitArea(control, () => {});
    show(control);
    flush();
    // Inside the area (right inset 4, bottom 10), below the switch: 5 px from
    // the link, 9.5 px from the switch.
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 127, clientY: 133});
    control.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    control.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    stop();
  });

  it('counts tree items, menu checkbox and radio items as neighbours', () => {
    document.body.innerHTML =
      '<span id="switch" role="switch" tabindex="0"></span>' +
      '<div id="item" role="treeitem"></div>';
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    place(byId('item'), rect(132, 100, 60, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    expect(heard.at(-1)?.right).toBe(4);
    stop();
  });

  it('leaves a touch the browser hands a lone control a few px past its area to it: only a nearer neighbour swallows', () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(400, 400, 60, 24));
    const stop = watchHitArea(control, () => {});
    show(control);
    flush();
    // 3 px right of the 44 px area (10 px of growth), nothing near.
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 137, clientY: 112});
    control.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    control.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    stop();
  });

  it('measures a watched neighbour by its own box, not by its grown input', () => {
    document.body.innerHTML =
      '<div id="a"><input id="ia" role="switch"></div>' +
      '<div id="b"><input id="ib" role="switch"></div>';
    const a = byId('a');
    const b = byId('b');
    place(a, rect(100, 100, 32, 20));
    place(b, rect(100, 128, 32, 20));
    // Each input is grown to its hit area: 44 px tall.
    place(byId('ia'), rect(94, 88, 44, 44));
    place(byId('ib'), rect(94, 116, 44, 44));
    const heard: HitInsets[] = [];
    const stopA = watchHitArea(a, insets => heard.push(insets));
    const stopB = watchHitArea(b, () => {});
    show(a, b);
    flush();
    // Half the 8 px gap to b's box, not a quarter (b's input reaches a).
    expect(heard.at(-1)?.bottom).toBe(4);
    stopA();
    stopB();
  });

  it('listens for presses once, on the document: a watched control, row or handle gets no listener of its own (spec:AST-103 FR5)', () => {
    const elements = ['switch', 'other'].map(byId);
    const onElements = elements.map(element =>
      vi.spyOn(element, 'addEventListener'),
    );
    const onDocument = vi.spyOn(document, 'addEventListener');
    const stops = elements.map(element => watchHitArea(element, () => {}));
    for (const spy of onElements) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(
      onDocument.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    stops.forEach(stop => stop());
  });

  it('removes its document listener when the last watch stops (spec:AST-094 FR24)', () => {
    const offDocument = vi.spyOn(document, 'removeEventListener');
    const stops = ['switch', 'other'].map(id =>
      watchHitArea(byId(id), () => {}),
    );
    stops[0]();
    expect(
      offDocument.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(0);
    stops[1]();
    expect(
      offDocument.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
  });

  it('leaves nothing behind after resetHitAreaForTests, even from a watch never stopped', () => {
    watchHitArea(byId('switch'), () => {});
    const offDocument = vi.spyOn(document, 'removeEventListener');
    resetHitAreaForTests();
    expect(
      offDocument.mock.calls.filter(([type]) => type === 'pointerdown'),
    ).toHaveLength(1);
    coarse = false;
    const onDocument = vi.spyOn(document, 'addEventListener');
    const stop = watchHitArea(byId('other'), () => {});
    expect(onDocument).not.toHaveBeenCalled();
    stop();
  });

  it('reads the pointer query at each watch, so a watch never left behind keeps a stale coarse answer', () => {
    const left = watchHitArea(byId('switch'), () => {});
    // The environment's pointer turns fine through a new query object (a
    // test's stub), and the earlier watch never stopped.
    coarse = false;
    const other = byId('other');
    const onElement = vi.spyOn(other, 'addEventListener');
    const stop = watchHitArea(other, () => {});
    expect(onElement).not.toHaveBeenCalled();
    stop();
    left();
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
