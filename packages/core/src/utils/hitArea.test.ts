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
  groupGrowth,
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

describe('groupGrowth', () => {
  it('grows each side of a row as far as the member on that edge would, and a wide group by its narrow end members', () => {
    // Three 32 px toggles in a 104 × 32 row, 4 px apart.
    const row = rect(0, 100, 104, 32);
    const members = [
      rect(0, 100, 32, 32),
      rect(36, 100, 32, 32),
      rect(72, 100, 32, 32),
    ];
    expect(groupGrowth(row, members)).toEqual({
      top: 6,
      right: 6,
      bottom: 6,
      left: 6,
    });
    // A column of wide members grows only at its top and bottom.
    const column = rect(0, 0, 120, 64);
    expect(
      groupGrowth(column, [rect(0, 0, 120, 32), rect(0, 32, 120, 32)]),
    ).toEqual({top: 6, right: 0, bottom: 6, left: 0});
    // A row wider than its members shrinks past its last member, so it
    // covers only their targets: 32 px buttons ending 160 px short.
    expect(groupGrowth(rect(0, 100, 264, 32), members)).toEqual({
      top: 6,
      right: -154,
      bottom: 6,
      left: 6,
    });
    expect(groupGrowth(row, [])).toEqual(NO_HIT_INSETS);
    // The full growth it gives stops at a neighbour, as a control's does.
    expect(
      clampedHitInsets(
        row,
        [rect(-8, 100, 4, 32)],
        44,
        groupGrowth(row, members),
      ).left,
    ).toBe(2);
  });
});

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

// Lets the promise callbacks that follow an animation's end run.
async function promiseCallbacks(): Promise<void> {
  for (let index = 0; index < 5; index++) {
    await Promise.resolve();
  }
}

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

  /** Give `element` the whole-pixel layout size that jsdom leaves at 0. */
  function layOut(element: HTMLElement, width: number, height: number): void {
    Object.defineProperty(element, 'offsetWidth', {
      configurable: true,
      value: width,
    });
    Object.defineProperty(element, 'offsetHeight', {
      configurable: true,
      value: height,
    });
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

  it('measures a control in an opening layer by its layout box, so its insets hold once the layer settles', () => {
    // The layer opens from half size about the page origin, so every rect on
    // screen is half its layout box during the first pass.
    const half = ({left, top, right, bottom}: HitRect) => ({
      left: left / 2,
      top: top / 2,
      right: right / 2,
      bottom: bottom / 2,
    });
    const control = byId('switch');
    Object.assign(control.style, {
      width: '24px',
      height: '24px',
      boxSizing: 'border-box',
    });
    layOut(control, 24, 24);
    place(control, half(rect(100, 100, 24, 24)));
    place(byId('link'), half(rect(132, 100, 60, 24)));
    place(byId('other'), half(rect(400, 400, 24, 24)));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    // The same insets as the page at full size gives.
    expect(heard).toEqual([{top: 10, right: 4, bottom: 10, left: 10}]);
    stop();
  });

  it('reads no computed style for a control at its layout size', () => {
    const control = byId('switch');
    const other = byId('other');
    layOut(control, 24, 24);
    place(control, rect(100, 100, 24, 24));
    place(other, rect(400, 400, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    const getComputedStyle = vi.spyOn(window, 'getComputedStyle');
    const stops = [control, other].map(element =>
      watchHitArea(element, () => {}),
    );
    show(control, other);
    flush();
    // One control is at its layout size and the other has none, so neither
    // resolves style in the measuring pass.
    expect(getComputedStyle).not.toHaveBeenCalled();
    stops.forEach(stop => stop());
  });

  it("reads a group's growth from its members in its layout px, so a group in an opening layer keeps its insets", () => {
    // As above, the layer opens from half size about the page origin.
    const half = ({left, top, right, bottom}: HitRect) => ({
      left: left / 2,
      top: top / 2,
      right: right / 2,
      bottom: bottom / 2,
    });
    const group = byId('other');
    Object.assign(group.style, {
      width: '68px',
      height: '32px',
      boxSizing: 'border-box',
    });
    layOut(group, 68, 32);
    place(group, half(rect(200, 300, 68, 32)));
    place(byId('switch'), half(rect(100, 100, 24, 24)));
    place(byId('link'), half(rect(132, 100, 60, 24)));
    // Two 32 px members, each 6 px short of 44 on each axis.
    const members = [
      half(rect(200, 300, 32, 32)),
      half(rect(236, 300, 32, 32)),
    ];
    const heard: HitInsets[] = [];
    const stop = watchHitArea(group, insets => heard.push(insets), {
      growth: (box, toLayout) => groupGrowth(box, members.map(toLayout)),
    });
    show(group);
    flush();
    // At half size the members would read 16 px and grow 14 px.
    expect(heard).toEqual([{top: 6, right: 6, bottom: 6, left: 6}]);
    stop();
  });

  it('matches the page against its selector once, and keeps what it found current from each mutation', () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    place(byId('other'), rect(400, 400, 24, 24));
    const queries = vi.spyOn(document, 'querySelectorAll');
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    expect(queries).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([{top: 10, right: 4, bottom: 10, left: 10}]);

    // A later pass reads every rect again, but finds the elements kept.
    place(byId('link'), rect(140, 100, 60, 24));
    log.length = 0;
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(queries).toHaveBeenCalledTimes(1);
    expect(log).toContain('read link');
    expect(heard.at(-1)).toEqual({top: 10, right: 8, bottom: 10, left: 10});

    // A neighbour added in the same task as the pass counts in it. Only the
    // added element is matched, not the whole page again.
    const above = document.createElement('button');
    above.id = 'above';
    document.body.append(above);
    place(above, rect(100, 80, 24, 12));
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(queries).toHaveBeenCalledTimes(1);
    expect(heard.at(-1)).toEqual({top: 4, right: 8, bottom: 10, left: 10});

    // An attribute the selector reads makes an element a neighbour.
    const below = document.createElement('span');
    below.id = 'below';
    document.body.append(below);
    place(below, rect(100, 130, 24, 12));
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(heard.at(-1)).toEqual({top: 4, right: 8, bottom: 10, left: 10});
    below.setAttribute('role', 'button');
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(heard.at(-1)).toEqual({top: 4, right: 8, bottom: 3, left: 10});

    // A neighbour removed stops counting.
    above.remove();
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(heard.at(-1)).toEqual({top: 10, right: 8, bottom: 3, left: 10});
    stop();
  });

  it('counts a control watched after the last pass by its own box, not by a part inside it', () => {
    // A group whose box reaches nearer the control than the input inside it.
    const group = document.createElement('div');
    const input = document.createElement('input');
    group.append(input);
    document.body.append(group);
    place(group, rect(100, 60, 24, 30));
    place(input, rect(100, 20, 24, 10));
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    place(byId('other'), rect(400, 400, 24, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    // The input is too far away to stop the control's growth.
    expect(heard.at(-1)).toEqual({top: 10, right: 4, bottom: 10, left: 10});
    // The group starts a watch. No element changes, but its box, not its
    // input, is now the neighbour.
    const stopGroup = watchHitArea(group, () => {});
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(heard.at(-1)).toEqual({top: 5, right: 4, bottom: 10, left: 10});
    // The group stops its watch: its input, too far away, is the neighbour
    // again.
    stopGroup();
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(heard.at(-1)).toEqual({top: 10, right: 4, bottom: 10, left: 10});
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
    // The clock holds still, so a slow machine cannot spend the frame budget
    // and split the batch. The budget has its own case below.
    vi.spyOn(performance, 'now').mockReturnValue(0);
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

  it('reads nothing on the page at a finger’s press, and swallows no click, for a watch whose owner reads its own targets (checkAtPress off)', () => {
    const control = byId('switch');
    const link = byId('link');
    place(control, rect(100, 100, 24, 24));
    place(link, rect(400, 100, 60, 24));
    const stop = watchHitArea(control, () => {}, {checkAtPress: false});
    show(control);
    flush();
    // The link moved to 8 px away with nothing re-measuring yet.
    place(link, rect(132, 100, 60, 24));
    const read = vi.spyOn(link, 'getBoundingClientRect');
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 130, clientY: 112});
    control.dispatchEvent(press);
    expect(read).not.toHaveBeenCalled();
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    control.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
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

  it('leaves a touch on content that the element paints past its own box to that content, however near a neighbour is', () => {
    // A row moved aside, its panel's entry painted beside it, and the next
    // row 2 px below the touch.
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="row"><button id="entry">Read</button></div>' +
        '<a id="next" href="#next">Next</a>',
    );
    const row = byId('row');
    const entry = byId('entry');
    place(row, rect(88, 16, 388, 60));
    place(entry, rect(16, 16, 72, 60));
    place(byId('next'), rect(16, 78, 388, 60));
    const stop = watchHitArea(row, () => {}, {ownsDescendantTouches: true});
    show(row);
    flush();
    // On the entry: 36 px from the row's box, 32 px from the next row.
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 52, clientY: 46});
    entry.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    entry.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    // The same touch on the row itself, in its band, is still checked.
    const bandPress = new Event('pointerdown', {bubbles: true});
    Object.assign(bandPress, {
      pointerType: 'touch',
      clientX: 52,
      clientY: 46,
    });
    row.dispatchEvent(bandPress);
    const bandClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    row.dispatchEvent(bandClick);
    expect(bandClick.defaultPrevented).toBe(true);
    stop();
  });

  it('still swallows a touch on a control’s own grown input that a neighbour is nearer, unless the watch owns its descendants’ touches', () => {
    // A switch whose invisible input grows past its track, as its coarse hit
    // area. A link moved to 2 px past the switch.
    const control = byId('switch');
    control.insertAdjacentHTML('beforeend', '<input id="input" />');
    const input = byId('input');
    place(control, rect(100, 100, 24, 24));
    place(input, rect(100, 100, 28, 24));
    place(byId('link'), rect(126, 100, 60, 24));
    const stop = watchHitArea(control, () => {});
    show(control);
    flush();
    // On the input, 2.5 px past the switch and 0.5 px from the link.
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 126.5, clientY: 112});
    input.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    input.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
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

  it('observes the page for its interactive elements only while the pointer is coarse and a watch is live (spec:AST-094 FR24)', () => {
    const Native = globalThis.MutationObserver;
    let pageObservers = 0;
    vi.stubGlobal(
      'MutationObserver',
      class extends Native {
        private isOnPage = false;
        override observe(target: Node, options?: MutationObserverInit) {
          if (target === document && !this.isOnPage) {
            this.isOnPage = true;
            pageObservers += 1;
          }
          super.observe(target, options);
        }
        override disconnect() {
          if (this.isOnPage) {
            this.isOnPage = false;
            pageObservers -= 1;
          }
          super.disconnect();
        }
      },
    );
    const control = byId('switch');
    const other = byId('other');
    place(control, rect(100, 100, 24, 24));
    place(other, rect(400, 400, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    // Under a fine pointer: none.
    coarse = false;
    const stops = [control, other].map(element =>
      watchHitArea(element, () => {}),
    );
    show(control, other);
    flush();
    expect(pageObservers).toBe(0);
    // Coarse, with two watches: one.
    coarse = true;
    pointerListeners.forEach(listener => listener());
    show(control, other);
    flush();
    expect(pageObservers).toBe(1);
    // The pointer turns fine: released.
    coarse = false;
    pointerListeners.forEach(listener => listener());
    expect(pageObservers).toBe(0);
    // Coarse again, then the last watch stops: released.
    coarse = true;
    pointerListeners.forEach(listener => listener());
    show(control, other);
    flush();
    expect(pageObservers).toBe(1);
    stops[0]();
    expect(pageObservers).toBe(1);
    stops[1]();
    expect(pageObservers).toBe(0);
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

  it('reads no layout as a finger presses: the click that the press sends measures, and a nearer neighbour swallows it', () => {
    const control = byId('switch');
    const link = byId('link');
    place(control, rect(100, 100, 24, 24));
    place(link, rect(400, 100, 60, 24));
    const stop = watchHitArea(control, () => {});
    show(control);
    flush();
    // The link moved to 8 px away with nothing re-measuring yet.
    place(link, rect(132, 100, 60, 24));
    log.length = 0;
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 130, clientY: 112});
    control.dispatchEvent(press);
    // The press decides nothing yet, so a scroll it starts waits on no layout.
    expect(log).toEqual([]);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    control.dispatchEvent(click);
    expect(log).toContain('read link');
    expect(click.defaultPrevented).toBe(true);
    stop();
  });

  describe('when an animation moves boxes between the touch and its click', () => {
    /** One running animation of `target`, from keyframes jsdom cannot run. */
    const running = (target: Element, frames: Keyframe[]) => ({
      playState: 'running',
      effect: {
        target,
        getComputedTiming: () => ({endTime: 300}),
        getKeyframes: () => frames,
      },
      finished: new Promise<void>(() => {}),
    });
    const tap = (control: Element, x: number, y: number) => {
      const press = new Event('pointerdown', {bubbles: true});
      Object.assign(press, {pointerType: 'touch', clientX: x, clientY: y});
      control.dispatchEvent(press);
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      control.dispatchEvent(click);
      return click;
    };
    // jsdom has no Web Animations: the page reports the given animations.
    const reportAnimations = (animations: ReadonlyArray<object>) =>
      Object.defineProperty(document, 'getAnimations', {
        configurable: true,
        value: () => animations,
      });
    afterEach(() => {
      delete (document as {getAnimations?: unknown}).getAnimations;
    });

    it('lets the click through when a glide has moved its control: the fresh box is not the one the finger landed on', () => {
      const control = byId('switch');
      const row = control.closest('label') as HTMLElement;
      const link = byId('link');
      place(control, rect(100, 100, 24, 24));
      place(link, rect(400, 100, 60, 24));
      const stop = watchHitArea(control, () => {});
      show(control);
      flush();
      const press = new Event('pointerdown', {bubbles: true});
      Object.assign(press, {pointerType: 'touch', clientX: 112, clientY: 112});
      control.dispatchEvent(press);
      // By the click, a glide moved the row down. The link is now where the
      // finger landed.
      place(control, rect(100, 140, 24, 24));
      place(link, rect(100, 100, 60, 24));
      reportAnimations([
        running(row, [
          {offset: 0, transform: 'translateY(0px)'},
          {offset: 1, transform: 'translateY(40px)'},
        ]),
      ]);
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      control.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(false);
      stop();
    });

    it('measures at the press a control that a pass saw an ancestor animation move: its box is still where the finger landed', () => {
      const control = byId('switch');
      const row = control.closest('label') as HTMLElement;
      const link = byId('link');
      place(control, rect(100, 100, 24, 24));
      place(link, rect(400, 100, 60, 24));
      // A glide runs, so the pass holds the control back.
      reportAnimations([
        running(row, [
          {offset: 0, transform: 'translateY(0px)'},
          {offset: 1, transform: 'translateY(40px)'},
        ]),
      ]);
      const stop = watchHitArea(control, () => {});
      show(control);
      flush();
      // The link moved to 8 px away with nothing re-measuring yet.
      place(link, rect(132, 100, 60, 24));
      log.length = 0;
      const press = new Event('pointerdown', {bubbles: true});
      Object.assign(press, {pointerType: 'touch', clientX: 130, clientY: 112});
      control.dispatchEvent(press);
      expect(log).toContain('read link');
      // By the click, the glide moved the row: the press already decided.
      place(control, rect(100, 140, 24, 24));
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      control.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
      stop();
    });

    it('leaves out a neighbour that an animation moves: its box now is not its box at the touch', () => {
      const control = byId('switch');
      const link = byId('link');
      place(control, rect(100, 100, 24, 24));
      place(link, rect(400, 100, 60, 24));
      const stop = watchHitArea(control, () => {});
      show(control);
      flush();
      // The link slides in to 8 px away.
      place(link, rect(132, 100, 60, 24));
      reportAnimations([
        running(link, [
          {offset: 0, translate: '268px 0'},
          {offset: 1, translate: '0 0'},
        ]),
      ]);
      expect(tap(control, 130, 112).defaultPrevented).toBe(false);
      stop();
    });

    it('still checks the click when the control’s row holds a paused animation: a paused box does not move', () => {
      const control = byId('switch');
      const row = control.closest('label') as HTMLElement;
      const link = byId('link');
      place(control, rect(100, 100, 24, 24));
      place(link, rect(400, 100, 60, 24));
      const stop = watchHitArea(control, () => {});
      show(control);
      flush();
      // The link moved to 8 px away with nothing re-measuring yet.
      place(link, rect(132, 100, 60, 24));
      reportAnimations([
        {
          ...running(row, [
            {offset: 0, transform: 'translateY(0px)'},
            {offset: 1, transform: 'translateY(40px)'},
          ]),
          playState: 'paused',
        },
      ]);
      expect(tap(control, 130, 112).defaultPrevented).toBe(true);
      stop();
    });

    it('keeps a neighbour under a paused animation in the click’s check: it does not move', () => {
      const control = byId('switch');
      const link = byId('link');
      place(control, rect(100, 100, 24, 24));
      place(link, rect(400, 100, 60, 24));
      const stop = watchHitArea(control, () => {});
      show(control);
      flush();
      // The link moved to 8 px away, and a paused animation holds it there.
      place(link, rect(132, 100, 60, 24));
      reportAnimations([
        {
          ...running(link, [
            {offset: 0, translate: '268px 0'},
            {offset: 1, translate: '0 0'},
          ]),
          playState: 'paused',
        },
      ]);
      expect(tap(control, 130, 112).defaultPrevented).toBe(true);
      stop();
    });

    it('still checks the click when the control’s row only fades or tints: nothing moved since the touch', () => {
      const control = byId('switch');
      const row = control.closest('label') as HTMLElement;
      const link = byId('link');
      place(control, rect(100, 100, 24, 24));
      place(link, rect(400, 100, 60, 24));
      const stop = watchHitArea(control, () => {});
      show(control);
      flush();
      // The link moved to 8 px away with nothing re-measuring yet.
      place(link, rect(132, 100, 60, 24));
      reportAnimations([
        running(row, [
          {offset: 0, opacity: '1', backgroundColor: 'rgba(0, 0, 0, 0)'},
          {offset: 1, opacity: '0.6', backgroundColor: 'rgb(0, 0, 0)'},
        ]),
      ]);
      expect(tap(control, 130, 112).defaultPrevented).toBe(true);
      stop();
    });
  });

  it('leaves the insets alone at the click of a press that scales the control, and measures them once the press’s motion ends', async () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(400, 100, 60, 24));
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    expect(heard).toEqual([{top: 10, right: 10, bottom: 10, left: 10}]);
    // The press scales the control about its center, and its motion runs.
    control.style.transform = 'matrix(0.9, 0, 0, 0.9, 0, 0)';
    place(control, rect(101.2, 101.2, 21.6, 21.6));
    let finish = () => {};
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    control.getAnimations = () => [
      {
        playState: 'running',
        effect: {getComputedTiming: () => ({endTime: 150})},
        finished,
      } as unknown as Animation,
    ];
    const press = new Event('pointerdown', {bubbles: true});
    Object.assign(press, {pointerType: 'touch', clientX: 112, clientY: 112});
    control.dispatchEvent(press);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    control.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    // The scaled box reads other insets, but the click writes none.
    expect(heard).toHaveLength(1);
    // The motion ends at the layout box: the pass finds the same insets.
    control.style.transform = '';
    place(control, rect(100, 100, 24, 24));
    control.getAnimations = () => [];
    finish();
    await finished;
    await promiseCallbacks();
    flush();
    expect(heard).toEqual([{top: 10, right: 10, bottom: 10, left: 10}]);
    stop();
  });

  it('runs no pass while the page scrolls: a control that scrolls into view is measured once the scroll ends', () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const control = byId('switch');
      place(control, rect(100, 100, 24, 24));
      place(byId('link'), rect(132, 100, 60, 24));
      const heard: HitInsets[] = [];
      const stop = watchHitArea(control, insets => heard.push(insets));
      flush();
      log.length = 0;
      window.dispatchEvent(new Event('scroll'));
      show(control);
      window.dispatchEvent(new Event('resize'));
      flush();
      // A frame of the scroll reads no layout and writes no insets.
      expect(log).toEqual([]);
      expect(heard).toEqual([]);
      window.dispatchEvent(new Event('scrollend'));
      flush();
      expect(heard).toEqual([{top: 10, right: 4, bottom: 10, left: 10}]);

      // Where no scrollend comes, the pass runs once the scroll is still.
      log.length = 0;
      place(byId('link'), rect(140, 100, 60, 24));
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      flush();
      expect(log).toEqual([]);
      vi.advanceTimersByTime(1000);
      flush();
      expect(heard.at(-1)).toEqual({top: 10, right: 8, bottom: 10, left: 10});
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('measures nothing while an ancestor animates, as a screen that slides in or a layer that grows, and measures once it comes to rest', async () => {
    const control = byId('switch');
    const screen = control.closest('label') as HTMLElement;
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    let finish = () => {};
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    const slide = {
      playState: 'running',
      effect: {target: screen, getComputedTiming: () => ({endTime: 300})},
      finished,
    };
    // jsdom has no Web Animations: the page reports one running slide.
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => (slide.playState === 'running' ? [slide] : []),
    });
    try {
      const heard: HitInsets[] = [];
      const stop = watchHitArea(control, insets => heard.push(insets));
      show(control);
      flush();
      expect(log).toEqual([]);
      expect(heard).toEqual([]);
      slide.playState = 'finished';
      finish();
      await finished;
      await promiseCallbacks();
      flush();
      expect(heard).toEqual([{top: 10, right: 4, bottom: 10, left: 10}]);
      stop();
    } finally {
      delete (document as {getAnimations?: unknown}).getAnimations;
    }
  });

  it('measures a control under a paused parent animation: an app can leave it paused, and a paused box does not move', () => {
    const control = byId('switch');
    const screen = control.closest('label') as HTMLElement;
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    const slide = {
      playState: 'paused',
      effect: {target: screen, getComputedTiming: () => ({endTime: 300})},
      finished: new Promise<void>(() => {}),
    };
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => [slide],
    });
    try {
      const heard: HitInsets[] = [];
      const stop = watchHitArea(control, insets => heard.push(insets));
      show(control);
      flush();
      expect(heard).toEqual([{top: 10, right: 4, bottom: 10, left: 10}]);
      stop();
    } finally {
      delete (document as {getAnimations?: unknown}).getAnimations;
    }
  });

  it('measures a control under a parent that only fades or tints: no box moves', () => {
    const control = byId('switch');
    const row = control.closest('label') as HTMLElement;
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(132, 100, 60, 24));
    const tint = {
      playState: 'running',
      effect: {
        target: row,
        getComputedTiming: () => ({endTime: 300}),
        getKeyframes: () => [
          {offset: 0, opacity: '0', backgroundColor: 'rgba(0, 0, 0, 0)'},
          {offset: 1, opacity: '1', backgroundColor: 'rgb(0, 0, 0)'},
        ],
      },
      finished: new Promise<void>(() => {}),
    };
    Object.defineProperty(document, 'getAnimations', {
      configurable: true,
      value: () => [tint],
    });
    try {
      const heard: HitInsets[] = [];
      const stop = watchHitArea(control, insets => heard.push(insets));
      show(control);
      flush();
      expect(heard).toEqual([{top: 10, right: 4, bottom: 10, left: 10}]);
      stop();
    } finally {
      delete (document as {getAnimations?: unknown}).getAnimations;
    }
  });

  it('keeps the page’s interactive elements across a layer’s open and close, and a row watched in it: it matches only what changed, never the whole page again', () => {
    const control = byId('switch');
    place(control, rect(100, 100, 24, 24));
    place(byId('link'), rect(400, 100, 60, 24));
    place(byId('other'), rect(400, 400, 24, 24));
    const queries = vi.spyOn(document, 'querySelectorAll');
    const heard: HitInsets[] = [];
    const stop = watchHitArea(control, insets => heard.push(insets));
    show(control);
    flush();
    expect(queries).toHaveBeenCalledTimes(1);
    expect(heard).toEqual([{top: 10, right: 10, bottom: 10, left: 10}]);

    // A layer opens beside the control with two rows, and a row is watched.
    const layer = document.createElement('div');
    layer.innerHTML =
      '<div role="menuitem" id="row1" tabindex="-1"></div>' +
      '<div role="menuitem" id="row2" tabindex="-1"></div>';
    document.body.append(layer);
    place(byId('row1'), rect(132, 100, 60, 24));
    place(byId('row2'), rect(132, 128, 60, 24));
    const stopRow = watchHitArea(byId('row1'), () => {});
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(heard.at(-1)).toEqual({top: 10, right: 4, bottom: 10, left: 10});

    // The layer closes: its rows stop counting.
    stopRow();
    layer.remove();
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(heard.at(-1)).toEqual({top: 10, right: 10, bottom: 10, left: 10});
    expect(queries).toHaveBeenCalledTimes(1);
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

  it('stops a watch whose window closed before it, as a removed iframe’s', () => {
    const iframe = document.body.appendChild(document.createElement('iframe'));
    const frameDocument = iframe.contentDocument as Document;
    const control = frameDocument.body.appendChild(
      frameDocument.createElement('button'),
    );
    const stop = watchHitArea(control, () => {});
    iframe.remove();
    expect(() => stop()).not.toThrow();
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
