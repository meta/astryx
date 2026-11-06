// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.presented.test.ts
 * @input vitest (jsdom), the animated-layout module, a recording stand-in for
 *   Element.animate and stubbed layout rectangles (jsdom lays nothing out)
 * @output Checks that a running translate glide reports its element to the
 *   presented hit-test registry. The cases cover its offset from where iOS
 *   WebKit hit-tests it, a touch-down's resolve and its end. A change's
 *   glides cost one notice as they start and one as they end, even after a
 *   glide in a removed frame ended. A fade or an inert element reports
 *   nothing, and a glide whose element left its document loses its report
 * @position Testing; GestureHost's use of the registry is proven in
 *   gestures/__tests__/presentedGlide.test.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAnimatedLayout,
  playLayoutChange,
  reportLayoutChange,
} from './animatedLayout';
import {
  presentedElements,
  presentedOffsetOf,
  resolvePresented,
  watchPresentedElements,
} from './presentation';

interface Played {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
  /** Fires the animation's `finish` listeners. */
  finish?: () => void;
  /** Fires the animation's `cancel` listeners. */
  cancelled?: () => void;
  animation?: object;
}

let played: Played[] = [];
let media: Record<string, boolean> = {};
const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  played = [];
  media = {};
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const cancel = vi.fn();
    const listeners: Record<string, (() => void)[]> = {};
    const animation = {
      cancel,
      addEventListener(type: string, listener: () => void) {
        (listeners[type] ??= []).push(listener);
      },
      currentTime: 100,
    };
    played.push({
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      cancel,
      finish: () => listeners.finish?.forEach(listener => listener()),
      cancelled: () => listeners.cancel?.forEach(listener => listener()),
      animation,
    });
    return animation as unknown as Animation;
  };
  window.matchMedia = (query: string) =>
    ({
      matches: media[query] === true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

afterEach(async () => {
  // Every glide ends, so no report outlives its test.
  for (const entry of played) {
    entry.finish?.();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  Element.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
  document.body.innerHTML = '';
});

/** Gives `element` a rectangle that follows `phase` (before or after). */
function placeAt(
  element: Element,
  rects: {
    before: [number, number, number, number];
    after?: [number, number, number, number];
  },
  phase: {current: 'before' | 'after'},
) {
  vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => {
    const [x, y, w, h] =
      phase.current === 'before' || rects.after == null
        ? rects.before
        : rects.after;
    return new DOMRect(x, y, w, h);
  });
}

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

/** Runs the task that removes the reports of ended glides. */
const nextTask = async () =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
  });

/** An area with a changed element that opens 80 px, and the given HTML. */
function setUp(html: string) {
  document.body.innerHTML = html;
  const area = document.getElementById('area') as HTMLElement;
  const changed = document.getElementById('changed') as HTMLElement;
  const phase: {current: 'before' | 'after'} = {current: 'before'};
  placeAt(area, {before: [0, 0, 400, 600]}, phase);
  placeAt(changed, {before: [0, 0, 400, 0], after: [0, 0, 400, 80]}, phase);
  return {area, changed, phase};
}

function translateOf(entry: Played): {x: number; y: number} {
  const first = String(entry.keyframes[0].translate ?? '');
  const match = /^(-?[\d.e+-]+)px\s+(-?[\d.e+-]+)px/.exec(first);
  return match == null
    ? {x: 0, y: 0}
    : {x: Number(match[1]), y: Number(match[2])};
}

async function runChange(
  layout: ReturnType<typeof createAnimatedLayout> | null,
  changed: Element,
  phase: {current: 'before' | 'after'},
) {
  const report = reportLayoutChange(layout, () => changed);
  report.measureBefore();
  phase.current = 'after';
  report.animate();
  playLayoutChange(layout, changed);
  await flushMicrotasks();
}

describe('a glide in the presented hit-test registry (motion/presentation.ts)', () => {
  /** The translate of keyframe `index` of `entry`, in px. */
  const translateAt = (entry: Played, index: number) =>
    translateOf({...entry, keyframes: entry.keyframes.slice(index)});

  it('reports the element while its translate glides: how far it is drawn from where iOS WebKit hit-tests it', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const glide = played.find(p => p.element === a) as Played;
    // Hit-tested where the glide starts, which is where it is drawn.
    expect(presentedElements()).toContain(a);
    expect(presentedOffsetOf(a)).toEqual({x: 0, y: 0});
    // Some way into the glide it is drawn that far from its start. The clock
    // stands still, so no time passes between the reads.
    const now = window.performance.now();
    const clock = vi.spyOn(window.performance, 'now').mockReturnValue(now);
    try {
      const index = Math.floor((glide.keyframes.length - 1) / 2);
      const at = index / (glide.keyframes.length - 1);
      (glide.animation as {startTime: number}).startTime =
        now - Number(glide.options.duration) * at;
      const moved = translateAt(glide, index).y - translateOf(glide).y;
      expect(moved).toBeGreaterThan(10);
      expect(presentedOffsetOf(a).y).toBeCloseTo(moved, 6);
      // A touch-down resolves it: one style write, and it is hit-tested there.
      resolvePresented([a]);
      expect(a.style.getPropertyValue('--astryx-presented')).not.toBe('');
      expect(presentedOffsetOf(a).y).toBeCloseTo(0, 6);
    } finally {
      clock.mockRestore();
    }
    // At its end it is hit-tested at its layout again, and a task later its
    // report and the write go.
    glide.finish?.();
    expect(presentedOffsetOf(a)).toEqual({x: 0, y: 0});
    await nextTask();
    expect(presentedElements()).not.toContain(a);
    expect(a.style.getPropertyValue('--astryx-presented')).toBe('');
  });

  it('keeps reporting a retargeted glide: the cancel of the glide it replaced clears nothing', async () => {
    const {area, changed} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    let top = 0;
    vi.spyOn(a, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, top, 400, 40),
    );
    const layout = createAnimatedLayout(() => area);
    let report = reportLayoutChange(layout, () => changed);
    report.measureBefore();
    top = 80;
    report.animate();
    await flushMicrotasks();
    const first = played.find(p => p.element === a) as Played;
    resolvePresented([a]);
    played = [];
    top = 50;
    report = reportLayoutChange(layout, () => changed);
    report.measureBefore();
    top = 120;
    report.animate();
    await flushMicrotasks();
    expect(played.filter(p => p.element === a)).toHaveLength(1);
    first.cancelled?.();
    await nextTask();
    expect(presentedElements()).toContain(a);
    expect(a.style.getPropertyValue('--astryx-presented')).not.toBe('');
  });

  it("tells the registry's watchers once as a change's glides start, and once as they end", async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div><div id="b"></div><div id="c"></div></div>',
    );
    for (const [id, y] of [
      ['a', 0],
      ['b', 50],
      ['c', 100],
    ] as const) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, y, 400, 40], after: [0, y + 80, 400, 40]},
        phase,
      );
    }
    let notices = 0;
    const stop = watchPresentedElements(() => {
      notices += 1;
    });
    try {
      await runChange(
        createAnimatedLayout(() => area),
        changed,
        phase,
      );
      const moving = played.filter(p => p.keyframes[0].translate != null);
      expect(moving).toHaveLength(3);
      expect(notices).toBe(1);
      for (const glide of moving) {
        glide.finish?.();
      }
      await nextTask();
      expect(notices).toBe(2);
      for (const glide of moving) {
        expect(presentedElements()).not.toContain(glide.element);
      }
    } finally {
      stop();
    }
  });

  it('reports no inert element: a closing element or a copy takes no touch', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a" inert></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(played.some(p => p.element === a)).toBe(true);
    expect(presentedElements()).not.toContain(a);
  });

  it('reports no element for a motion without travel (a Reduce Motion fade)', async () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    media['(pointer: coarse)'] = true;
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(played.some(p => p.element === a)).toBe(true);
    expect(played.every(p => p.keyframes[0].translate == null)).toBe(true);
    expect(presentedElements()).not.toContain(a);
  });
  it("removes a later glide's report after a glide in a removed frame ended", async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
    // A glide in a frame ends, and the frame goes before any later task.
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameWindow = frame.contentWindow as Window & typeof globalThis;
    frameWindow.Element.prototype.animate = Element.prototype.animate;
    const frameDocument = frame.contentDocument as Document;
    frameDocument.body.innerHTML =
      '<div id="area"><div id="changed"></div><div id="b"></div></div>';
    const frameArea = frameDocument.getElementById('area') as HTMLElement;
    const frameChanged = frameDocument.getElementById('changed') as HTMLElement;
    const b = frameDocument.getElementById('b') as HTMLElement;
    const framePhase: {current: 'before' | 'after'} = {current: 'before'};
    placeAt(frameArea, {before: [0, 0, 400, 600]}, framePhase);
    placeAt(
      frameChanged,
      {before: [0, 0, 400, 0], after: [0, 0, 400, 80]},
      framePhase,
    );
    placeAt(b, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, framePhase);
    await runChange(
      createAnimatedLayout(() => frameArea),
      frameChanged,
      framePhase,
    );
    expect(presentedElements()).toContain(b);
    played.find(p => p.element === b)?.finish?.();
    frame.remove();
    // A glide on the page then ends.
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(presentedElements()).toContain(a);
    played.find(p => p.element === a)?.finish?.();
    await nextTask();
    await nextTask();
    // Booleans: a matcher would print the closed frame's element.
    expect(presentedElements().includes(a)).toBe(false);
    expect(presentedElements().includes(b)).toBe(false);
  });

  it('removes the report of a glide whose element left the document before it ended', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div><div id="b"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    const b = document.getElementById('b') as HTMLElement;
    placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
    placeAt(b, {before: [0, 50, 400, 40], after: [0, 130, 400, 40]}, phase);
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(presentedElements().includes(a)).toBe(true);
    expect(presentedElements().includes(b)).toBe(true);
    // Row a leaves the document mid-glide; row b's glide then ends.
    a.remove();
    played.find(p => p.element === b)?.finish?.();
    await nextTask();
    expect(presentedElements().includes(a)).toBe(false);
    expect(presentedElements().includes(b)).toBe(false);
  });
});
