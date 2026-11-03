// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.test.ts
 * @input vitest (jsdom), the animated-layout module, a recording stand-in for
 *   Element.animate and stubbed layout rectangles (jsdom lays nothing out)
 * @output Checks the handle (`spec:AST-105` FR1), that nothing runs without
 *   one (FR2), which elements the walk takes and how it moves them (FR3),
 *   the shared `springs.settle` motion and Reduce Motion by pointer (FR4),
 *   and the indicator's transition
 * @position Testing; the real geometry is proven in
 *   __tests__/animatedLayout.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  applyLayoutChangeTransition,
  createAnimatedLayout,
  holdLayoutExit,
  playLayoutChange,
  releaseLayoutExit,
  reportLayoutChange,
} from './animatedLayout';

interface Played {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
  finish?: () => void;
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
    played.push({
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      cancel,
    });
    // Every glide reads as 100 ms in when a later change retargets it.
    const entry = played[played.length - 1];
    return {
      cancel,
      addEventListener(type: string, listener: () => void) {
        if (type === 'finish') {
          entry.finish = listener;
        }
      },
      currentTime: 100,
    } as unknown as Animation;
  };
  window.matchMedia = (query: string) =>
    ({
      matches: media[query] === true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
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

/**
 * An area with a changed element and the given followers after it, each
 * shifted by `shift` px down after the change unless it says otherwise.
 */
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

describe('the handle (spec:AST-105 FR1)', () => {
  it('has no public members', () => {
    const area = document.createElement('div');
    const handle = createAnimatedLayout(() => area);
    expect(Object.keys(handle)).toEqual([]);
    expect(Object.getOwnPropertyNames(handle)).toEqual([]);
    expect(Object.isFrozen(handle)).toBe(true);
  });
});

describe('without a handle (spec:AST-105 FR2)', () => {
  it('measures nothing and plays nothing', async () => {
    const {changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    placeAt(a, {before: [0, 0, 400, 40], after: [0, 80, 400, 40]}, phase);
    await runChange(null, changed, phase);
    expect(played).toEqual([]);
  });
});

describe('the walk (spec:AST-105 FR3, Coverage)', () => {
  it('moves following siblings at every level up to the area, by their layout change, and nothing past it', async () => {
    const {area, changed, phase} = setUp(
      `<div id="area"><section id="l1"><div id="l2"><div id="changed"></div><div id="s2"></div></div><div id="s1"></div></section><div id="s0"></div></div>
       <div id="outside"></div>`,
    );
    for (const [id, y] of [
      ['s2', 0],
      ['s1', 50],
      ['s0', 100],
      ['outside', 700],
    ] as const) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, y, 400, 40], after: [0, y + 80, 400, 40]},
        phase,
      );
    }
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const moved = played
      .filter(p => p.keyframes[0].translate != null)
      .map(p => (p.element as HTMLElement).id);
    expect(moved.sort()).toEqual(['s0', 's1', 's2']);
    for (const entry of played.filter(p => p.keyframes[0].translate != null)) {
      expect(translateOf(entry).y).toBeCloseTo(-80);
      // One replace-composited translate, which the compositor runs.
      expect(entry.options.composite).toBeUndefined();
      expect(entry.options.easing).toBe('linear');
      // Lands where layout put it.
      expect(String(entry.keyframes.at(-1)?.translate)).toBe('0px 0px');
    }
  });

  it('reads every follower (place, transform, scale) before it starts any glide, so a long page is laid out once', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div><div id="b"></div><div id="c"></div></div>',
    );
    for (const [id, y] of [
      ['a', 0],
      ['b', 40],
      ['c', 80],
    ] as const) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, y, 400, 40], after: [0, y + 80, 400, 40]},
        phase,
      );
    }
    // A style or layout read after a glide started lays the page out again.
    const readsAfterAGlide: string[] = [];
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element: Element, pseudo?: string | null) => {
        if (played.some(p => p.keyframes[0].translate != null)) {
          readsAfterAGlide.push((element as HTMLElement).id);
        }
        return computed(element, pseudo);
      },
    );
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(played.filter(p => p.keyframes[0].translate != null)).toHaveLength(
      3,
    );
    expect(readsAfterAGlide).toEqual([]);
  });

  it('takes the children of a display: contents wrapper and skips absolute, fixed, hidden and display: none elements', async () => {
    const {area, changed, phase} = setUp(
      `<div id="area"><div id="changed"></div>
        <div id="wrap" style="display: contents"><div id="c1"></div><div id="c2"></div></div>
        <div id="abs" style="position: absolute"></div>
        <div id="fixed" style="position: fixed"></div>
        <div id="hidden" style="visibility: hidden"></div>
        <div id="none" style="display: none"></div></div>`,
    );
    for (const id of ['c1', 'c2', 'abs', 'fixed', 'hidden', 'none']) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, 10, 400, 40], after: [0, 90, 400, 40]},
        phase,
      );
    }
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const moved = played
      .filter(p => p.keyframes[0].translate != null)
      .map(p => (p.element as HTMLElement).id);
    expect(moved.sort()).toEqual(['c1', 'c2']);
  });

  it('leaves an element whose rectangle did not change, and one outside the visible part before and after', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="still"></div><div id="far"></div></div>',
    );
    placeAt(
      document.getElementById('still') as HTMLElement,
      {before: [0, 10, 400, 40]},
      phase,
    );
    placeAt(
      document.getElementById('far') as HTMLElement,
      {before: [0, 2000, 400, 40], after: [0, 2080, 400, 40]},
      phase,
    );
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(played.filter(p => p.keyframes[0].translate != null)).toEqual([]);
  });

  it('moves each element once for two changes in one frame, by the total', async () => {
    document.body.innerHTML =
      '<div id="area"><div id="g1"></div><div id="g2"></div><div id="after"></div></div>';
    const area = document.getElementById('area') as HTMLElement;
    const phase: {current: 'before' | 'after'} = {current: 'before'};
    placeAt(area, {before: [0, 0, 400, 600]}, phase);
    placeAt(
      document.getElementById('after') as HTMLElement,
      {before: [0, 0, 400, 40], after: [0, 160, 400, 40]},
      phase,
    );
    const layout = createAnimatedLayout(() => area);
    const one = reportLayoutChange(layout, () => document.getElementById('g1'));
    const two = reportLayoutChange(layout, () => document.getElementById('g2'));
    one.measureBefore();
    two.measureBefore();
    phase.current = 'after';
    one.animate();
    two.animate();
    await flushMicrotasks();
    const moves = played.filter(p => (p.element as HTMLElement).id === 'after');
    expect(moves).toHaveLength(1);
    expect(translateOf(moves[0]).y).toBeCloseTo(-160);
  });

  it('never scrolls the area', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    area.scrollTop = 0;
    placeAt(
      document.getElementById('a') as HTMLElement,
      {before: [0, 0, 400, 40], after: [0, 80, 400, 40]},
      phase,
    );
    const scrollTo = vi.fn();
    area.scrollTo = scrollTo;
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(scrollTo).not.toHaveBeenCalled();
    expect(area.scrollTop).toBe(0);
  });
});

describe('one shared motion (spec:AST-105 FR4)', () => {
  async function changeOnce(style = '') {
    const {area, changed, phase} = setUp(
      `<div id="area" style="${style}"><div id="changed"></div><div id="a"></div></div>`,
    );
    placeAt(
      document.getElementById('a') as HTMLElement,
      {before: [0, 0, 400, 40], after: [0, 80, 400, 40]},
      phase,
    );
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
  }

  it('plays the changed element and its followers on springs.settle, with one duration', async () => {
    await changeOnce();
    const follower = played.find(p => (p.element as HTMLElement).id === 'a');
    const own = played.find(p => (p.element as HTMLElement).id === 'changed');
    expect(follower).toBeDefined();
    expect(own).toBeDefined();
    expect(own?.options.duration).toBe(follower?.options.duration);
    // SwiftUI's smooth spring (0.5 s, no bounce) settles in about 0.6 s.
    expect(Number(follower?.options.duration)).toBeGreaterThan(400);
    expect(Number(follower?.options.duration)).toBeLessThan(900);
  });

  it("ignores a scope's --motion-springs-settle: the role is internal", async () => {
    await changeOnce();
    const shared = played.find(p => (p.element as HTMLElement).id === 'a');
    played = [];
    document.body.innerHTML = '';
    await changeOnce('--motion-springs-settle: 0.2s 0');
    const scoped = played.find(p => (p.element as HTMLElement).id === 'a');
    expect(scoped?.options.duration).toBe(shared?.options.duration);
  });

  it('cross-fades with no travel under Reduce Motion on a coarse pointer', async () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    media['(pointer: coarse)'] = true;
    await changeOnce();
    expect(played).toHaveLength(2);
    for (const entry of played) {
      expect(entry.keyframes[0].translate).toBeUndefined();
      expect(entry.keyframes[0].opacity).toBe(0);
      expect(Number(entry.options.duration)).toBeLessThanOrEqual(200);
    }
  });

  it('changes at once under Reduce Motion on a fine pointer', async () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    await changeOnce();
    expect(played).toEqual([]);
  });

  it('retargets an element already gliding: one glide, started from where it is on screen', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    let top = 0;
    vi.spyOn(a, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, top, 400, 40),
    );
    const layout = createAnimatedLayout(() => area);
    // First change: the row's layout moves 0 -> 80.
    let report = reportLayoutChange(layout, () => changed);
    report.measureBefore();
    top = 80;
    report.animate();
    await flushMicrotasks();
    const first = played.find(p => p.element === a);
    expect(translateOf(first as Played).y).toBeCloseTo(-80);
    // Mid-glide it shows at 50 on screen; the second change moves its layout
    // 80 -> 120.
    played = [];
    phase.current = 'before';
    top = 50;
    report = reportLayoutChange(layout, () => changed);
    report.measureBefore();
    top = 120;
    report.animate();
    await flushMicrotasks();
    expect(first?.cancel).toHaveBeenCalledTimes(1);
    const second = played.filter(p => p.element === a);
    expect(second).toHaveLength(1);
    // From 50 on screen to 120: it starts 70 px above its new place.
    expect(translateOf(second[0]).y).toBeCloseTo(-70);
    // And it keeps the first glide's speed 100 ms in (about 6 px a frame);
    // a new spring from rest moves about 1.4 px in its first frame.
    const next = translateOf({
      ...second[0],
      keyframes: second[0].keyframes.slice(1),
    });
    expect(next.y - -70).toBeGreaterThan(3);
  });

  it('drops a measurement no commit claims by the next frame', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const a = document.getElementById('a') as HTMLElement;
    let top = 200;
    vi.spyOn(a, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, top, 400, 40),
    );
    const layout = createAnimatedLayout(() => area);
    // A refused toggle: measured, never committed.
    reportLayoutChange(layout, () => changed).measureBefore();
    await new Promise(resolve => {
      requestAnimationFrame(resolve);
    });
    await new Promise(resolve => {
      requestAnimationFrame(resolve);
    });
    // The area scrolls 150 px; then a real change moves the row 80 px.
    top = 50;
    phase.current = 'before';
    const report = reportLayoutChange(layout, () => changed);
    report.measureBefore();
    top = 130;
    expect(report.animate()).toBe(true);
    await flushMicrotasks();
    const moves = played.filter(p => p.element === a);
    expect(moves).toHaveLength(1);
    expect(translateOf(moves[0]).y).toBeCloseTo(-80);
  });

  it('reports an unmeasured change, which moves nothing', async () => {
    const {area, changed} = setUp(
      '<div id="area"><div id="changed"></div><div id="a"></div></div>',
    );
    const report = reportLayoutChange(
      createAnimatedLayout(() => area),
      () => changed,
    );
    expect(report.animate()).toBe(false);
    await flushMicrotasks();
    expect(played).toEqual([]);
  });
});

describe('the changed element exits (spec:AST-105 FR4)', () => {
  function exitSetUp() {
    document.body.innerHTML =
      '<div id="area"><div id="content">Details</div><p id="after">Next</p></div>';
    const area = document.getElementById('area') as HTMLElement;
    const content = document.getElementById('content') as HTMLElement;
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 600),
    );
    vi.spyOn(content, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 40, 400, 80),
    );
    Object.defineProperty(content, 'offsetHeight', {value: 80});
    // The row after it: 8 px of gap below the 80 px content, which a hidden
    // content gives back too, and its end margin pulls the row up.
    const after = document.getElementById('after') as HTMLElement;
    vi.spyOn(after, 'getBoundingClientRect').mockImplementation(() => {
      if (
        content.style.position === 'absolute' ||
        content.style.display === 'none'
      ) {
        return new DOMRect(0, 40, 400, 20);
      }
      const margin =
        Number.parseFloat(content.style.getPropertyValue('margin-block-end')) ||
        0;
      return new DOMRect(0, 40 + 80 + 8 + margin, 400, 20);
    });
    const layout = createAnimatedLayout(() => area);
    // The close is measured: only a measured close exits.
    const change = reportLayoutChange(layout, () => content);
    change.measureBefore();
    change.animate();
    return {area, content, after, layout};
  }

  it('holds nothing for a close no change measured', () => {
    const {area, content} = exitSetUp();
    const unmeasured = createAnimatedLayout(() => area);
    const other = document.createElement('div');
    area.append(other);
    expect(holdLayoutExit(unmeasured, other, vi.fn())).toBe(false);
    expect(other).not.toHaveAttribute('inert');
    expect(content).not.toHaveAttribute('inert');
  });

  it('puts back an inert and inline values the element had before its exit', () => {
    const {content, layout} = exitSetUp();
    content.setAttribute('inert', '');
    content.style.setProperty('pointer-events', 'auto');
    expect(holdLayoutExit(layout, content, vi.fn())).toBe(true);
    expect(content.style.pointerEvents).toBe('none');
    releaseLayoutExit(content);
    expect(content).toHaveAttribute('inert');
    expect(content.style.pointerEvents).toBe('auto');
    expect(content.style.getPropertyValue('margin-block-end')).toBe('');
  });

  it('keeps the content where it is while it gives up its space, conceals it on the spring, then hands it back', () => {
    const {content, layout} = exitSetUp();
    const done = vi.fn();
    const written = vi.spyOn(content.style, 'setProperty');
    expect(holdLayoutExit(layout, content, done)).toBe(true);
    // Measured out of flow, never with `display: none` (which would restart
    // the CSS animations inside it).
    expect(
      written.mock.calls.some(([property]) => property === 'display'),
    ).toBe(false);
    expect(content.style.position).toBe('');
    // In flow (it scrolls and clips with its container), taking exactly the
    // space it frees when hidden, gap included; out of reach.
    expect(content.style.position).toBe('');
    expect(content.style.getPropertyValue('margin-block-end')).toBe('-88px');
    expect(content.style.display).toBe('');
    expect(content).toHaveAttribute('inert');
    expect(content.style.pointerEvents).toBe('none');
    const exit = played.find(p => p.element === content);
    expect(exit?.keyframes[0].opacity).toBe(1);
    expect(String(exit?.keyframes.at(-1)?.clipPath)).toBe('inset(0 0 100% 0)');
    expect(exit?.options.fill).toBe('forwards');
    expect(done).not.toHaveBeenCalled();
    exit?.finish?.();
    expect(done).toHaveBeenCalledTimes(1);
    releaseLayoutExit(content);
    expect(content.style.getPropertyValue('margin-block-end')).toBe('');
    expect(content).not.toHaveAttribute('inert');
    expect(content.style.pointerEvents).toBe('');
  });

  it('guesses, then corrects, where a negative margin would collapse with its end margin', () => {
    const {content, after, layout} = exitSetUp();
    after.style.marginTop = '-4px';
    const reads = vi.mocked(after.getBoundingClientRect);
    reads.mockClear();
    expect(holdLayoutExit(layout, content, vi.fn())).toBe(true);
    expect(reads.mock.calls.length).toBeGreaterThan(2);
    expect(content.style.getPropertyValue('margin-block-end')).toBe('-88px');
  });

  it('stops an exit when the content opens again', () => {
    const {content, layout} = exitSetUp();
    const done = vi.fn();
    holdLayoutExit(layout, content, done);
    const exit = played.find(p => p.element === content);
    releaseLayoutExit(content);
    expect(exit?.cancel).toHaveBeenCalledTimes(1);
    expect(content.style.getPropertyValue('margin-block-end')).toBe('');
    exit?.finish?.();
    expect(done).not.toHaveBeenCalled();
  });

  it('lands at once without a handle, and under Reduce Motion with a fine pointer', () => {
    const {content, layout} = exitSetUp();
    expect(holdLayoutExit(null, content, vi.fn())).toBe(false);
    media['(prefers-reduced-motion: reduce)'] = true;
    expect(holdLayoutExit(layout, content, vi.fn())).toBe(false);
    expect(content.style.getPropertyValue('margin-block-end')).toBe('');
    expect(played).toEqual([]);
  });

  it('lands at once where no end margin frees its space (a grid track)', () => {
    const {area, content, after, layout} = exitSetUp();
    area.style.display = 'grid';
    // The row after it ignores the margin: it moves only when the content
    // is hidden.
    vi.spyOn(after, 'getBoundingClientRect').mockImplementation(
      () =>
        new DOMRect(
          0,
          content.style.position === 'absolute' ||
            content.style.display === 'none'
            ? 40
            : 128,
          400,
          20,
        ),
    );
    expect(holdLayoutExit(layout, content, vi.fn())).toBe(false);
    expect(content.style.getPropertyValue('margin-block-end')).toBe('');
    expect(content).not.toHaveAttribute('inert');
    expect(played).toEqual([]);
  });

  it("a refused hold keeps the element's own end margin and lets the content after it take its place at once", async () => {
    const {area, content, after, layout} = exitSetUp();
    // A grid track, which no end margin frees.
    area.style.display = 'grid';
    content.style.setProperty('margin-block-end', '12px');
    vi.spyOn(after, 'getBoundingClientRect').mockImplementation(
      () =>
        new DOMRect(
          0,
          content.style.position === 'absolute' ||
            content.style.display === 'none'
            ? 40
            : 128,
          400,
          20,
        ),
    );
    expect(holdLayoutExit(layout, content, vi.fn())).toBe(false);
    expect(content.style.getPropertyValue('margin-block-end')).toBe('12px');
    // The component hides it; the flush glides nothing.
    content.style.display = 'none';
    await flushMicrotasks();
    expect(played).toEqual([]);
  });

  it('fades under Reduce Motion with a coarse pointer', () => {
    const {content, layout} = exitSetUp();
    media['(prefers-reduced-motion: reduce)'] = true;
    media['(pointer: coarse)'] = true;
    expect(holdLayoutExit(layout, content, vi.fn())).toBe(true);
    const exit = played.find(p => p.element === content);
    expect(exit?.keyframes.map(k => k.opacity)).toEqual([1, 0]);
    expect(exit?.keyframes[0].clipPath).toBeUndefined();
  });
});

describe('two changes in one frame (spec:AST-105 FR3)', () => {
  it('moves a changed element an earlier change displaced with its row, by its total change', async () => {
    document.body.innerHTML =
      '<div id="area"><div id="g1"></div><div id="g2"></div><div id="after"></div></div>';
    const area = document.getElementById('area') as HTMLElement;
    const phase: {current: 'before' | 'after'} = {current: 'before'};
    placeAt(area, {before: [0, 0, 400, 600]}, phase);
    // The second group opens and is pushed down 80 px by the first.
    placeAt(
      document.getElementById('g2') as HTMLElement,
      {before: [0, 0, 400, 40], after: [0, 80, 400, 120]},
      phase,
    );
    const layout = createAnimatedLayout(() => area);
    const one = reportLayoutChange(layout, () => document.getElementById('g1'));
    const two = reportLayoutChange(layout, () => document.getElementById('g2'));
    one.measureBefore();
    two.measureBefore();
    phase.current = 'after';
    one.animate();
    two.animate();
    await flushMicrotasks();
    const moves = played.filter(p => (p.element as HTMLElement).id === 'g2');
    expect(moves).toHaveLength(1);
    expect(translateOf(moves[0]).y).toBeCloseTo(-80);
  });

  it('does not move an element that was not rendered before the change', async () => {
    document.body.innerHTML =
      '<div id="area"><div id="g1"></div><div id="shown"></div></div>';
    const area = document.getElementById('area') as HTMLElement;
    const phase: {current: 'before' | 'after'} = {current: 'before'};
    placeAt(area, {before: [0, 0, 400, 600]}, phase);
    placeAt(
      document.getElementById('shown') as HTMLElement,
      {before: [0, 0, 0, 0], after: [0, 80, 400, 40]},
      phase,
    );
    const report = reportLayoutChange(
      createAnimatedLayout(() => area),
      () => document.getElementById('g1'),
    );
    report.measureBefore();
    phase.current = 'after';
    report.animate();
    await flushMicrotasks();
    expect(played).toEqual([]);
  });
});

describe('the indicator transition', () => {
  it('takes the spring as a linear() easing with a handle, and clears without one', () => {
    document.body.innerHTML = '<div id="area"><svg id="chevron"></svg></div>';
    const area = document.getElementById('area') as HTMLElement;
    const chevron = document.getElementById(
      'chevron',
    ) as unknown as SVGSVGElement;
    applyLayoutChangeTransition(
      createAnimatedLayout(() => area),
      chevron,
    );
    expect(
      chevron.style.getPropertyValue('transition-timing-function'),
    ).toMatch(/^linear\(0 0%, .*1 100%\)$/);
    expect(chevron.style.getPropertyValue('transition-duration')).toMatch(
      /^\d+ms$/,
    );
    applyLayoutChangeTransition(null, chevron);
    expect(chevron.style.getPropertyValue('transition-duration')).toBe('');
  });

  it('is immediate under Reduce Motion', () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    document.body.innerHTML = '<div id="area"><svg id="chevron"></svg></div>';
    const area = document.getElementById('area') as HTMLElement;
    const chevron = document.getElementById(
      'chevron',
    ) as unknown as SVGSVGElement;
    applyLayoutChangeTransition(
      createAnimatedLayout(() => area),
      chevron,
    );
    expect(chevron.style.getPropertyValue('transition-duration')).toBe('0s');
  });
});

describe('elements the app moves itself (spec:AST-105 Coverage)', () => {
  it('leaves a follower with its own transform or translate to take its place at once', async () => {
    const {area, changed, phase} = setUp(
      `<div id="area"><div id="changed"></div>
        <div id="transformed" style="transform: rotate(2deg)"></div>
        <div id="translated" style="translate: 4px 0"></div>
        <div id="plain"></div></div>`,
    );
    for (const id of ['transformed', 'translated', 'plain']) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, 10, 400, 40], after: [0, 90, 400, 40]},
        phase,
      );
    }
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const moved = played
      .filter(p => p.keyframes[0].translate != null)
      .map(p => (p.element as HTMLElement).id);
    expect(moved).toEqual(['plain']);
  });

  it('glides a follower whose transform leaves it in place: a swipe row at rest, a resting or pressed button', async () => {
    const {area, changed, phase} = setUp(
      `<div id="area"><div id="changed"></div>
        <div id="swipeRow" style="transform: translate3d(0px, 0px, 0px)"></div>
        <div id="button" style="transform: matrix(1, 0, 0, 1, 0, 0)"></div>
        <div id="pressed" style="transform: scale(0.98)"></div>
        <div id="pressedMatrix" style="transform: matrix(0.98, 0, 0, 0.98, 0, 0)"></div>
        <div id="scaled" style="scale: 0.98"></div>
        <div id="zero" style="translate: 0px; rotate: 0deg"></div>
        <div id="swiped" style="transform: translate3d(-120px, 0px, 0px)"></div>
        <div id="pressedAndMoved" style="transform: matrix(0.98, 0, 0, 0.98, 0, 12)"></div></div>`,
    );
    const ids = [
      'swipeRow',
      'button',
      'pressed',
      'pressedMatrix',
      'scaled',
      'zero',
      'swiped',
      'pressedAndMoved',
    ];
    for (const id of ids) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, 10, 400, 40], after: [0, 90, 400, 40]},
        phase,
      );
    }
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const moved = played
      .filter(p => p.keyframes[0].translate != null)
      .map(p => (p.element as HTMLElement).id);
    // A row a swipe holds open, or anything translated, is still the app's.
    expect(moved.sort()).toEqual([
      'button',
      'pressed',
      'pressedMatrix',
      'scaled',
      'swipeRow',
      'zero',
    ]);
  });

  it('glides a follower whose own transition runs from no transform to a scale (a press starting)', async () => {
    const {area, changed, phase} = setUp(
      `<div id="area"><div id="changed"></div><div id="pressing"></div><div id="sliding"></div></div>`,
    );
    for (const id of ['pressing', 'sliding']) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, 10, 400, 40], after: [0, 90, 400, 40]},
        phase,
      );
    }
    class StubKeyframeEffect {
      constructor(readonly frames: Keyframe[]) {}
      getKeyframes() {
        return this.frames;
      }
    }
    vi.stubGlobal('KeyframeEffect', StubKeyframeEffect);
    const runs = (frames: Keyframe[]) => () =>
      [{effect: new StubKeyframeEffect(frames)}] as unknown as Animation[];
    // A press's transition: from no transform toward a scale, in place.
    (document.getElementById('pressing') as HTMLElement).getAnimations = runs([
      {transform: 'none'},
      {transform: 'matrix(0.98, 0, 0, 0.98, 0, 0)'},
    ]);
    // The app sliding the element itself stays the app's.
    (document.getElementById('sliding') as HTMLElement).getAnimations = runs([
      {transform: 'none'},
      {transform: 'translateX(120px)'},
    ]);
    try {
      await runChange(
        createAnimatedLayout(() => area),
        changed,
        phase,
      );
    } finally {
      vi.unstubAllGlobals();
    }
    const moved = played
      .filter(p => p.keyframes[0].translate != null)
      .map(p => (p.element as HTMLElement).id);
    expect(moved).toEqual(['pressing']);
  });

  it('leaves a follower whose own keyframes hold an unresolved var() to the app: its value is unknown', async () => {
    const {area, changed, phase} = setUp(
      `<div id="area"><div id="changed"></div><div id="slide"></div><div id="slideY"></div><div id="spin"></div><div id="grow"></div></div>`,
    );
    for (const id of ['slide', 'slideY', 'spin', 'grow']) {
      placeAt(
        document.getElementById(id) as HTMLElement,
        {before: [0, 10, 400, 40], after: [0, 90, 400, 40]},
        phase,
      );
    }
    class StubKeyframeEffect {
      constructor(readonly frames: Keyframe[]) {}
      getKeyframes() {
        return this.frames;
      }
    }
    vi.stubGlobal('KeyframeEffect', StubKeyframeEffect);
    const runs = (id: string, frames: Keyframe[]) => {
      (document.getElementById(id) as HTMLElement).getAnimations = () =>
        [{effect: new StubKeyframeEffect(frames)}] as unknown as Animation[];
    };
    // An app's own slide-ins and spin, from values a custom property holds.
    runs('slide', [{translate: 'var(--from)'}, {translate: '0px'}]);
    runs('slideY', [
      {transform: 'translateY(var(--from))'},
      {transform: 'none'},
    ]);
    runs('spin', [{transform: 'rotate(var(--angle))'}, {transform: 'none'}]);
    // A scale stays in place whatever its value.
    runs('grow', [{scale: 'var(--from)'}, {scale: '1'}]);
    try {
      await runChange(
        createAnimatedLayout(() => area),
        changed,
        phase,
      );
    } finally {
      vi.unstubAllGlobals();
    }
    const moved = played
      .filter(p => p.keyframes[0].translate != null)
      .map(p => (p.element as HTMLElement).id);
    expect(moved).toEqual(['grow']);
  });
});

describe('siblings before the change (spec:AST-105 FR3, Coverage)', () => {
  it('moves an earlier sibling a centered row shifts when a later item grows', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="row"><div id="first"></div><div id="changed"></div></div></div>',
    );
    // A centered row: the item before the growing one moves left by half.
    placeAt(
      document.getElementById('first') as HTMLElement,
      {before: [160, 0, 40, 24], after: [120, 0, 40, 24]},
      phase,
    );
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const moves = played.filter(
      p =>
        (p.element as HTMLElement).id === 'first' &&
        p.keyframes[0].translate != null,
    );
    expect(moves).toHaveLength(1);
    expect(translateOf(moves[0]).x).toBeCloseTo(40);
  });

  it('leaves an earlier sibling whose rectangle did not change', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="first"></div><div id="changed"></div></div>',
    );
    placeAt(
      document.getElementById('first') as HTMLElement,
      {before: [0, 0, 400, 40]},
      phase,
    );
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    expect(
      played.filter(p => (p.element as HTMLElement).id === 'first'),
    ).toEqual([]);
  });
});

describe('the walk stops at the band a change can bring into view', () => {
  it('reads no sibling past the band, after or before the change', async () => {
    // A 600 px area: the band runs a viewport above and below it.
    const rows = Array.from({length: 40}, (_, i) => `<div id="r${i}"></div>`);
    const {area, changed, phase} = setUp(
      `<div id="area">${rows.slice(0, 20).join('')}<div id="changed"></div>${rows.slice(20).join('')}</div>`,
    );
    const reads = new Map<string, number>();
    rows.forEach((_, i) => {
      const row = document.getElementById(`r${i}`) as HTMLElement;
      // Rows 100 px apart, the changed element between rows 19 and 20 at
      // 1000 px: 20 rows above it reach -1000 px, 20 below reach 3000 px.
      const top = i < 20 ? (i - 20) * 100 + 1000 : (i - 20) * 100 + 1100;
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
        reads.set(row.id, (reads.get(row.id) ?? 0) + 1);
        const shift = phase.current === 'after' && i >= 20 ? 80 : 0;
        return new DOMRect(0, top - 1000 + shift, 400, 100);
      });
    });
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    // The band is -600..1200 px: rows past it are never read.
    expect(reads.get('r39')).toBeUndefined();
    expect(reads.get('r0')).toBeUndefined();
    expect(reads.get('r20')).toBeGreaterThan(0);
    expect(reads.get('r19')).toBeGreaterThan(0);
  });
});

describe('the walk reaches what the changes can move (spec:AST-105 FR3)', () => {
  it("glides the change's ancestor that a centered column moves, and the content inside it moves only with it", async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="column"><div id="above"></div><div id="card"><div id="title"></div><div id="changed"></div></div></div></div>',
    );
    // The column centers its content: opening the change moves the card and
    // the content above it up by half the growth.
    placeAt(
      document.getElementById('above') as HTMLElement,
      {before: [0, 100, 400, 40], after: [0, 60, 400, 40]},
      phase,
    );
    placeAt(
      document.getElementById('card') as HTMLElement,
      {before: [0, 140, 400, 60], after: [0, 100, 400, 140]},
      phase,
    );
    placeAt(
      document.getElementById('title') as HTMLElement,
      {before: [0, 140, 400, 20], after: [0, 100, 400, 20]},
      phase,
    );
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const glides = new Map(
      played
        .filter(p => p.keyframes[0].translate != null)
        .map(p => [(p.element as HTMLElement).id, translateOf(p).y]),
    );
    expect(glides.get('card')).toBeCloseTo(40);
    expect(glides.get('above')).toBeCloseTo(40);
    // The title rides with its card: it moved by nothing of its own.
    expect(glides.has('title')).toBe(false);
  });

  it('reaches the band that all the changes in one frame can pull into view', () => {
    const rows = Array.from({length: 30}, (_, i) => `<div id="r${i}"></div>`);
    document.body.innerHTML = `<div id="area"><div id="a"></div><div id="b"></div>${rows.join('')}</div>`;
    const area = document.getElementById('area') as HTMLElement;
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 560),
    );
    // Two 500 px groups closing at once: the rows below them come up 1,000 px.
    for (const [id, y] of [
      ['a', 0],
      ['b', 500],
    ] as const) {
      vi.spyOn(
        document.getElementById(id) as HTMLElement,
        'getBoundingClientRect',
      ).mockReturnValue(new DOMRect(0, y, 400, 500));
    }
    const reads = new Set<string>();
    rows.forEach((_, i) => {
      const row = document.getElementById(`r${i}`) as HTMLElement;
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
        reads.add(row.id);
        return new DOMRect(0, 1000 + i * 100, 400, 100);
      });
    });
    const layout = createAnimatedLayout(() => area);
    reportLayoutChange(layout, () =>
      document.getElementById('a'),
    ).measureBefore();
    reportLayoutChange(layout, () =>
      document.getElementById('b'),
    ).measureBefore();
    // One group's band ends at 560 + 560; both together reach 560 + 1,000.
    expect(reads.has('r5')).toBe(true);
    expect(reads.has('r20')).toBe(false);
  });

  it('reads each element once however many changes report in one frame', () => {
    const rows = Array.from({length: 200}, (_, i) => `<div id="r${i}"></div>`);
    document.body.innerHTML = `<div id="area">${rows.join('')}</div>`;
    const area = document.getElementById('area') as HTMLElement;
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 6000),
    );
    let reads = 0;
    rows.forEach((_, i) => {
      vi.spyOn(
        document.getElementById(`r${i}`) as HTMLElement,
        'getBoundingClientRect',
      ).mockImplementation(() => {
        reads += 1;
        return new DOMRect(0, i * 30, 400, 30);
      });
    });
    const layout = createAnimatedLayout(() => area);
    // A tree collapsing 100 rows in one update reports 100 changes.
    for (let i = 0; i < 100; i += 1) {
      reportLayoutChange(layout, () =>
        document.getElementById(`r${i}`),
      ).measureBefore();
    }
    expect(reads).toBeLessThanOrEqual(rows.length);
  });

  it('walks no further than the first sibling outside the band from a change outside it', () => {
    const rows = Array.from({length: 1000}, (_, i) => `<div id="r${i}"></div>`);
    document.body.innerHTML = `<div id="area">${rows.join('')}</div>`;
    const area = document.getElementById('area') as HTMLElement;
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 400, 600),
    );
    const reads = new Set<string>();
    rows.forEach((_, i) => {
      const row = document.getElementById(`r${i}`) as HTMLElement;
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
        reads.add(row.id);
        return new DOMRect(0, i * 100, 400, 100);
      });
    });
    reportLayoutChange(
      createAnimatedLayout(() => area),
      () => document.getElementById('r900'),
    ).measureBefore();
    // The change itself, and one sibling on each side, which lie outside.
    expect(reads.size).toBeLessThanOrEqual(3);
  });

  it('stops inside a display: contents wrapper at the band too', () => {
    const rows = Array.from({length: 40}, (_, i) => `<div id="c${i}"></div>`);
    const {area, changed} = setUp(
      `<div id="area"><div id="changed"></div><div style="display: contents">${rows.join('')}</div></div>`,
    );
    void area;
    const reads = new Set<string>();
    rows.forEach((_, i) => {
      const row = document.getElementById(`c${i}`) as HTMLElement;
      vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => {
        reads.add(row.id);
        return new DOMRect(0, i * 100, 400, 100);
      });
    });
    reportLayoutChange(
      createAnimatedLayout(() => area),
      () => changed,
    ).measureBefore();
    // The band ends a viewport below the 600 px area.
    expect(reads.has('c12')).toBe(true);
    expect(reads.has('c30')).toBe(false);
  });

  it('moves an earlier sibling that order places after the change, near the visible part', async () => {
    const {area, changed, phase} = setUp(
      '<div id="area"><div id="ordered" style="order: 1"></div><div id="changed"></div></div>',
    );
    // First in the DOM, laid out after the change: it moves down when the
    // change grows.
    placeAt(
      document.getElementById('ordered') as HTMLElement,
      {before: [0, 0, 400, 40], after: [0, 80, 400, 40]},
      phase,
    );
    await runChange(
      createAnimatedLayout(() => area),
      changed,
      phase,
    );
    const glide = played.find(
      p =>
        (p.element as HTMLElement).id === 'ordered' &&
        p.keyframes[0].translate != null,
    );
    expect(glide).toBeDefined();
    expect(translateOf(glide!).y).toBeCloseTo(-80);
  });
});
