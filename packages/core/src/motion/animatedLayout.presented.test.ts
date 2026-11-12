// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.presented.test.ts
 * @input vitest (jsdom), the animated-layout module, a recording stand-in for
 *   Element.animate and stubbed layout rectangles (jsdom lays nothing out)
 * @output Checks that a running translate glide reports its element to the
 *   presented hit-test registry. The cases cover its offset from where iOS
 *   WebKit hit-tests it, a touch-down's resolve and its end. Each motion
 *   resolves once more as it settles: a glide, an inert element's, a reveal
 *   that rides a glide and an indicator's transition. A cancelled or removed
 *   one never does. A change's
 *   glides cost one notice as they start and one as they end, even after a
 *   glide in a removed frame ended. A fade or an inert element reports
 *   nothing, and a glide whose element left its document loses its report
 * @position Testing; GestureHost's use of the registry is proven in
 *   gestures/__tests__/presentedGlide.test.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  applyLayoutChangeTransition,
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
/** Animations get an effect a ride can replace frames on, when set. */
let withEffects = false;
/** Each element's animation start, when a test sets one. */
let startTimes = new Map<Element, number>();
const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  played = [];
  media = {};
  withEffects = false;
  startTimes = new Map();
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const cancel = vi.fn();
    const listeners: Record<string, (() => void)[]> = {};
    const timing = {...(options as KeyframeAnimationOptions)};
    const effect = {
      frames: keyframes as Keyframe[],
      setKeyframes(next: Keyframe[]) {
        effect.frames = next;
      },
      updateTiming(next: KeyframeAnimationOptions) {
        Object.assign(timing, next);
      },
      getTiming: () => timing,
      getKeyframes: () => effect.frames,
    };
    const animation = {
      cancel,
      addEventListener(type: string, listener: () => void) {
        (listeners[type] ??= []).push(listener);
      },
      currentTime: 100,
      startTime: startTimes.get(this) ?? null,
      ...(withEffects ? {effect} : {}),
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

  /** Frames the page asks for, run on demand. */
  function holdFrames() {
    const queued: FrameRequestCallback[] = [];
    const realFrame = window.requestAnimationFrame.bind(window);
    const spy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        queued.push(callback);
        return queued.length;
      });
    return {
      run: () => {
        for (const callback of queued.splice(0)) {
          callback(window.performance.now());
        }
      },
      pending: () => queued.length,
      /** Waits for `count` real frames; a page that draws none fails by name. */
      real: async (count: number) =>
        new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`holdFrames: ${count} real frames did not come`));
          }, 5000);
          let left = count;
          const tick = () => {
            left -= 1;
            if (left > 0) {
              realFrame(tick);
              return;
            }
            clearTimeout(timer);
            resolve();
          };
          realFrame(tick);
        }),
      /** Hands frames still asked for back to the real clock, so no loop dies. */
      restore: () => {
        spy.mockRestore();
        for (const callback of queued.splice(0)) {
          realFrame(callback);
        }
      },
    };
  }

  /** The glide's time from which it is drawn within 0.5 px of its place, ms. */
  const settleTime = (glide: Played) => {
    const ys = glide.keyframes.map(frame =>
      Math.abs(translateOf({...glide, keyframes: [frame]}).y),
    );
    let from = ys.length - 1;
    while (from > 0 && ys[from - 1] <= 0.5) {
      from -= 1;
    }
    const offset = glide.keyframes[from].offset ?? from / (ys.length - 1);
    return offset * Number(glide.options.duration);
  };

  /** A glide on row a, its frames held, and its time a test can set. */
  async function settlingGlide(rowHtml = '<div id="a"></div>') {
    // Two real frames first: a loop an earlier test left ends, so this
    // glide's loop starts on the held frames.
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const frames = holdFrames();
    const {area, changed, phase} = setUp(
      `<div id="area"><div id="changed"></div>${rowHtml}</div>`,
    );
    const a = document.getElementById('a') as HTMLElement;
    placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const glide = played.find(p => p.element === a) as Played;
    // The change's other motions end, so only this glide waits for a frame.
    for (const entry of played) {
      if (entry !== glide) {
        entry.finish?.();
      }
    }
    const timing = glide.animation as {currentTime: number};
    const settles = settleTime(glide);
    const written = () => a.style.getPropertyValue('--astryx-presented');
    return {a, frames, glide, timing, settles, written};
  }

  it('resolves once more in the first frame its glide is drawn within half a pixel of its place, so WebKit draws its last frame there', async () => {
    const {a, frames, glide, timing, settles, written} = await settlingGlide();
    const now = window.performance.now();
    const clock = vi.spyOn(window.performance, 'now').mockReturnValue(now);
    try {
      expect(settles).toBeGreaterThan(0);
      expect(settles).toBeLessThan(Number(glide.options.duration));
      // Drawn at its settle point, far from where the glide started, which
      // is where the engine hit-tests it until a resolve.
      (glide.animation as {startTime: number}).startTime = now - settles;
      expect(Math.abs(presentedOffsetOf(a).y)).toBeGreaterThan(10);
      // Short of that keyframe: no write, and the frame loop keeps reading.
      timing.currentTime = settles - 1;
      frames.run();
      expect(written()).toBe('');
      expect(frames.pending()).toBeGreaterThan(0);
      // The frame that reaches it writes once, the engine hit-tests it where
      // it is drawn, and the loop stops.
      timing.currentTime = settles;
      frames.run();
      const write = written();
      expect(write).not.toBe('');
      expect(presentedOffsetOf(a).y).toBeCloseTo(0, 6);
      timing.currentTime = settles + 50;
      frames.run();
      frames.run();
      expect(written()).toBe(write);
      expect(frames.pending()).toBe(0);
    } finally {
      clock.mockRestore();
      frames.restore();
    }
  });

  it('writes nothing for a glide cancelled before it settles, and stops reading its time', async () => {
    const {frames, glide, timing, settles, written} = await settlingGlide();
    try {
      timing.currentTime = settles - 1;
      frames.run();
      glide.cancelled?.();
      frames.run();
      frames.run();
      expect(frames.pending()).toBe(0);
      // Its time passing later writes nothing, from the held frames or from
      // a real frame loop, which three real frames let run.
      timing.currentTime = settles + 10;
      frames.run();
      await frames.real(3);
      frames.run();
      expect(written()).toBe('');
    } finally {
      frames.restore();
    }
  });

  it('writes nothing for a glide whose element leaves the document before it settles', async () => {
    const {a, frames, timing, settles, written} = await settlingGlide();
    try {
      timing.currentTime = settles - 1;
      frames.run();
      a.remove();
      timing.currentTime = settles + 10;
      frames.run();
      frames.run();
      expect(written()).toBe('');
      expect(frames.pending()).toBe(0);
    } finally {
      frames.restore();
    }
  });

  it("resolves an inert element's glide too, which reports nothing, and clears the write at its end", async () => {
    const {a, frames, glide, timing, settles, written} = await settlingGlide(
      '<div id="a" inert></div>',
    );
    try {
      expect(presentedElements().includes(a)).toBe(false);
      timing.currentTime = settles;
      frames.run();
      expect(written()).not.toBe('');
      glide.finish?.();
      expect(written()).toBe('');
      frames.run();
      expect(frames.pending()).toBe(0);
    } finally {
      frames.restore();
    }
  });

  it("resolves an indicator's transition once as it settles, read from the page's clock alone, and clears it at its end", async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const frames = holdFrames();
    let start = 0;
    let elapsed = 0;
    const clock = vi
      .spyOn(window.performance, 'now')
      .mockImplementation(() => start + elapsed);
    try {
      const {area} = setUp(
        '<div id="area"><div id="changed"></div><span id="chevron"></span></div>',
      );
      const chevron = document.getElementById('chevron') as HTMLElement;
      const layout = createAnimatedLayout(() => area);
      applyLayoutChangeTransition(layout, chevron);
      const duration = Number.parseFloat(chevron.style.transitionDuration);
      expect(duration).toBeGreaterThan(0);
      // A start from which the end time, less the start, rounds short of the
      // duration, as a coarsened clock can land. A frame at the end ends it.
      start = 1000.1;
      for (let tries = 0; start + duration - start >= duration; tries += 1) {
        expect(tries).toBeLessThan(1000);
        start += 0.1;
      }
      applyLayoutChangeTransition(layout, chevron);
      const written = () =>
        chevron.style.getPropertyValue('--astryx-presented');
      // Before its curve comes within reach of its end: no write.
      elapsed = duration / 4;
      frames.run();
      expect(written()).toBe('');
      // Past its settle point: one write, and the loop keeps reading.
      elapsed = duration * 0.95;
      frames.run();
      expect(written()).not.toBe('');
      expect(frames.pending()).toBeGreaterThan(0);
      // In the frame at its end, the write goes and the loop stops.
      elapsed = duration;
      frames.run();
      expect(written()).toBe('');
      frames.run();
      expect(frames.pending()).toBe(0);
    } finally {
      clock.mockRestore();
      frames.restore();
    }
  });

  /** When `keyframes` over `duration` ms come within the record's reach. */
  const settleOf = (keyframes: ReadonlyArray<Keyframe>, duration: number) => {
    const numbers = (value: Keyframe[string]) =>
      [
        ...String(value ?? '').matchAll(/(-?[\d.]+(?:e[+-]?\d+)?)([a-z%]*)/gi),
      ].map(([, at, unit]) => ({at: Number(at), unit}));
    const last = keyframes[keyframes.length - 1];
    const styles = Object.keys(last).filter(
      key => !['offset', 'computedOffset', 'easing', 'composite'].includes(key),
    );
    const isNear = (frame: Keyframe) =>
      styles.every(key => {
        const ends = numbers(last[key]);
        return numbers(frame[key]).every(
          ({at, unit}, index) =>
            Math.abs(at - ends[index].at) <=
            (unit === 'px' || unit === '%' ? 0.5 : 0.005),
        );
      });
    let from = keyframes.length - 1;
    while (from > 0 && isNear(keyframes[from - 1])) {
      from -= 1;
    }
    return (keyframes[from].offset ?? from / (keyframes.length - 1)) * duration;
  };

  it("retimes the settle of a reveal whose ride replaces its frames: riding a glide that started 200 ms earlier, it resolves at its own ride's settle", async () => {
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const frames = holdFrames();
    try {
      withEffects = true;
      const {area, changed, phase} = setUp(
        '<div id="area"><div id="changed"></div><div id="a"></div></div>',
      );
      const a = document.getElementById('a') as HTMLElement;
      placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
      // The row below glides from 200 ms before the reveal starts, as a glide
      // an earlier change started does.
      startTimes.set(a, -200);
      startTimes.set(changed, 0);
      await runChange(
        createAnimatedLayout(() => area),
        changed,
        phase,
      );
      const reveal = played.find(p => p.element === changed) as Played;
      const effect = (
        reveal.animation as {
          effect: {
            frames: Keyframe[];
            getTiming: () => KeyframeAnimationOptions;
          };
        }
      ).effect;
      const ridden = Number(effect.getTiming().duration);
      // The ride is the rest of the glide: shorter than the reveal's own curve.
      expect(ridden).toBe(Number(reveal.options.duration) - 200);
      expect(effect.frames).not.toBe(reveal.keyframes);
      const own = settleOf(reveal.keyframes, Number(reveal.options.duration));
      const settles = settleOf(effect.frames, ridden);
      expect(settles).toBeLessThan(own);
      // The change's other motions end, so only the reveal waits.
      for (const entry of played) {
        if (entry !== reveal) {
          entry.finish?.();
        }
      }
      const timing = reveal.animation as {currentTime: number};
      const written = () =>
        changed.style.getPropertyValue('--astryx-presented');
      timing.currentTime = settles - 1;
      frames.run();
      expect(written()).toBe('');
      // Its ride's settle frame writes, before the ride ends.
      timing.currentTime = settles;
      frames.run();
      expect(written()).not.toBe('');
      expect(settles).toBeLessThan(ridden);
      reveal.finish?.();
      expect(written()).toBe('');
      frames.run();
      expect(frames.pending()).toBe(0);
    } finally {
      frames.restore();
    }
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
