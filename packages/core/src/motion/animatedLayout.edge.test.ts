// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayout.edge.test.ts
 * @input vitest (jsdom), the animated-layout module, a recording stand-in for
 *   Element.animate (its KeyframeEffect's `setKeyframes` and `updateTiming`
 *   included, and a current time read off a stubbed document timeline) and
 *   stubbed layout rectangles (jsdom lays nothing out)
 * @output Checks `spec:AST-105` FR9's edge reveal: the one-state reveal and
 *   conceal from each edge, left to right and right to left; a reversal that
 *   starts from what shows; the moving edge riding the glide of the content
 *   after it, through a reversal too; and the two-state form, which holds the
 *   old state as one copy while the edge rides a gliding element, the element
 *   raised above the copy while it conceals, a reversal starting from the
 *   extent it shows, and Reduce Motion by pointer; and a resized element's
 *   reveal with no copy (a resize controller's pane): held at the extent it
 *   was laid out at while it conceals, its edge's margin freeing the
 *   difference, clipped to its new extent, riding the content beside it
 * @position Testing; the real geometry is proven in
 *   __tests__/animatedLayout.interaction.browser.spec.ts and, for the SideNav
 *   rail's two-state form, SideNav's rail-motion specs
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAnimatedLayout,
  holdLayoutEdge,
  holdLayoutExit,
  playLayoutChange,
  playLayoutEdge,
  releaseLayoutExit,
  reportLayoutChange,
  reportLayoutEdge,
  type LayoutEdge,
} from './animatedLayout';

interface Played {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  startTime: number | null;
  cancel: ReturnType<typeof vi.fn>;
  /** What `setKeyframes` replaced the frames with, if anything. */
  ridden: Keyframe[] | null;
  /** The duration `updateTiming` set, if any. */
  duration: number | null;
  finish?: () => void;
}

let played: Played[] = [];
let media: Record<string, boolean> = {};
const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;

function setTimeline(currentTime: number) {
  Object.defineProperty(document, 'timeline', {
    configurable: true,
    value: {currentTime},
  });
}

function timelineNow(): number {
  return Number(document.timeline?.currentTime ?? 0);
}

beforeEach(() => {
  played = [];
  media = {};
  setTimeline(1000);
  // The page's clock reads the timeline's frame time: no block since it.
  vi.spyOn(performance, 'now').mockImplementation(timelineNow);
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const entry: Played = {
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      startTime: null,
      cancel: vi.fn(),
      ridden: null,
      duration: null,
    };
    played.push(entry);
    return {
      cancel: entry.cancel,
      addEventListener(type: string, listener: () => void) {
        if (type === 'finish') {
          entry.finish = listener;
        }
      },
      get startTime() {
        return entry.startTime;
      },
      set startTime(value: number | null) {
        entry.startTime = value;
      },
      // As a browser reads it: the timeline's time since the start.
      get currentTime() {
        return entry.startTime == null ? 0 : timelineNow() - entry.startTime;
      },
      effect: {
        setKeyframes(frames: Keyframe[]) {
          entry.ridden = frames;
        },
        updateTiming(timing: OptionalEffectTiming) {
          entry.duration = Number(timing.duration);
        },
      },
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
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

function lastOn(element: Element): Played | undefined {
  return played.filter(entry => entry.element === element).at(-1);
}

/** The keyframe a running animation shows `elapsed` ms in, and that time. */
function frameAt(entry: Played, index: number): {frame: Keyframe; at: number} {
  const frame = entry.keyframes[index];
  return {frame, at: Number(frame.offset) * Number(entry.options.duration)};
}

/**
 * A column area: a revealed element (`#content`, 80 px tall once open) and
 * `followers` rows after it, which the change pushes down by 80 px.
 */
function columnSetup({
  direction = 'ltr',
  followers = 0,
}: {direction?: 'ltr' | 'rtl'; followers?: number} = {}) {
  const rows = Array.from(
    {length: followers},
    (_, i) => `<div id="row${i}">Row ${i}</div>`,
  ).join('');
  document.body.innerHTML = `
    <div id="area" dir="${direction}" style="direction: ${direction}">
      <div id="content" dir="${direction}" style="direction: ${direction}">Shipping details</div>${rows}
    </div>`;
  const area = document.getElementById('area') as HTMLElement;
  const content = document.getElementById('content') as HTMLElement;
  let isOpen = false;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this === area) {
        return DOMRect.fromRect({x: 0, y: 0, width: 400, height: 600});
      }
      if (this === content) {
        return DOMRect.fromRect({x: 0, y: 0, width: 400, height: 80});
      }
      const index = /^row(\d+)$/.exec(this.id)?.[1];
      if (index != null) {
        return DOMRect.fromRect({
          x: 0,
          y: (isOpen ? 80 : 0) + Number(index) * 40,
          width: 400,
          height: 40,
        });
      }
      return DOMRect.fromRect({x: 0, y: 0, width: 0, height: 0});
    },
  );
  const handle = createAnimatedLayout(() => area);
  return {
    area,
    content,
    handle,
    row: (i: number) => document.getElementById(`row${i}`) as HTMLElement,
    /** Opens or closes the content, as a commit would, around the report. */
    toggle(open: boolean) {
      const report = reportLayoutChange(handle, () => content);
      report.measureBefore();
      isOpen = open;
      report.animate();
    },
  };
}

describe('the one-state edge reveal (spec:AST-105 FR9)', () => {
  const firstLast = (entry: Played | undefined) => [
    String(entry?.keyframes[0].clipPath),
    String(entry?.keyframes.at(-1)?.clipPath),
  ];

  it('reveals from the block-end edge by default', () => {
    const {content, handle, toggle} = columnSetup();
    toggle(true);
    playLayoutChange(handle, content);
    expect(firstLast(lastOn(content))).toEqual([
      'inset(0 0 100% 0)',
      'inset(0 0 0% 0)',
    ]);
  });

  it.each<[LayoutEdge, 'ltr' | 'rtl', string]>([
    ['block-start', 'ltr', 'inset(100% 0 0 0)'],
    ['inline-end', 'ltr', 'inset(0 100% 0 0)'],
    ['inline-start', 'ltr', 'inset(0 0 0 100%)'],
    ['inline-end', 'rtl', 'inset(0 0 0 100%)'],
    ['inline-start', 'rtl', 'inset(0 100% 0 0)'],
  ])('reveals from its %s edge (%s)', (edge, direction, hidden) => {
    const {content, handle, toggle} = columnSetup({direction});
    toggle(true);
    playLayoutChange(handle, content, {edge});
    const [first, last] = firstLast(lastOn(content));
    expect(first).toBe(hidden);
    expect(last).toBe(hidden.replace('100%', '0%'));
  });

  it('conceals to the edge it is given, left to right and right to left', async () => {
    for (const [direction, hidden] of [
      ['ltr', 'inset(0 100% 0 0)'],
      ['rtl', 'inset(0 0 0 100%)'],
    ] as const) {
      setTimeline(1000);
      const {content, handle, toggle} = columnSetup({
        direction,
        followers: 1,
      });
      toggle(true);
      playLayoutChange(handle, content);
      await flushMicrotasks();
      // Long after the reveal ended.
      setTimeline(61_000);
      toggle(false);
      expect(
        holdLayoutExit(handle, content, vi.fn(), {edge: 'inline-end'}),
      ).toBe(true);
      const exit = lastOn(content);
      expect(String(exit?.keyframes[0].clipPath)).toBe(
        hidden.replace('100%', '0%'),
      );
      expect(String(exit?.keyframes.at(-1)?.clipPath)).toBe(hidden);
      releaseLayoutExit(content);
    }
  });

  it('a conceal that reverses a running reveal starts from what the reveal shows', async () => {
    const {content, handle, toggle} = columnSetup();
    toggle(true);
    playLayoutChange(handle, content);
    await flushMicrotasks();
    const reveal = lastOn(content) as Played;
    const {frame, at} = frameAt(reveal, 6);
    setTimeline(1000 + at);
    toggle(false);
    expect(holdLayoutExit(handle, content, vi.fn())).toBe(true);
    const conceal = lastOn(content) as Played;
    expect(conceal).not.toBe(reveal);
    // The running reveal stops where it shows, and the conceal starts there.
    expect(reveal.cancel).toHaveBeenCalled();
    expect(String(conceal.keyframes[0].clipPath)).toBe(String(frame.clipPath));
    expect(Number(conceal.keyframes[0].opacity)).toBeCloseTo(
      Number(frame.opacity),
      3,
    );
    expect(String(conceal.keyframes.at(-1)?.clipPath)).toBe(
      'inset(0 0 100% 0)',
    );
  });

  it('a reveal that reverses a running conceal starts from what the conceal shows', async () => {
    const {content, handle, toggle} = columnSetup();
    toggle(true);
    playLayoutChange(handle, content);
    await flushMicrotasks();
    setTimeline(61_000);
    toggle(false);
    holdLayoutExit(handle, content, vi.fn());
    await flushMicrotasks();
    const conceal = lastOn(content) as Played;
    const {frame, at} = frameAt(conceal, 6);
    setTimeline(61_000 + at);
    // Opened again mid-exit, as an adopter does it.
    toggle(true);
    releaseLayoutExit(content);
    playLayoutChange(handle, content);
    const reveal = lastOn(content) as Played;
    expect(reveal).not.toBe(conceal);
    expect(String(reveal.keyframes[0].clipPath)).toBe(String(frame.clipPath));
    expect(Number(reveal.keyframes[0].opacity)).toBeCloseTo(
      Number(frame.opacity),
      3,
    );
    expect(String(reveal.keyframes.at(-1)?.clipPath)).toBe('inset(0 0 0% 0)');
  });

  it("rides the glide of the content after it: its edge is that content's, frame by frame", async () => {
    const {content, handle, row, toggle} = columnSetup({followers: 2});
    toggle(true);
    playLayoutChange(handle, content);
    await flushMicrotasks();
    const glide = lastOn(row(0)) as Played;
    const reveal = played.find(entry => entry.element === content) as Played;
    expect(reveal.ridden).not.toBeNull();
    expect(reveal.duration).toBe(Number(glide.options.duration));
    expect(reveal.ridden).toHaveLength(glide.keyframes.length);
    // Wherever the row shows, the content shows down to it.
    reveal.ridden?.forEach((frame, index) => {
      const y = Number(
        /px\s+(-?[\d.e+-]+)px/.exec(
          String(glide.keyframes[index].translate),
        )?.[1],
      );
      expect(frame.clipPath).toBe(`inset(0px 0px ${Math.max(0, -y)}px 0px)`);
      expect(Number(frame.opacity)).toBeCloseTo(1 - Math.max(0, -y) / 80, 6);
    });
  });

  it('through a reversal, conceals on the new glide of the content after it', async () => {
    const {content, handle, row, toggle} = columnSetup({followers: 1});
    toggle(true);
    playLayoutChange(handle, content);
    await flushMicrotasks();
    const glide = lastOn(row(0)) as Played;
    const index = 6;
    setTimeline(
      1000 +
        Number(glide.keyframes[index].offset) * Number(glide.options.duration),
    );
    toggle(false);
    holdLayoutExit(handle, content, vi.fn());
    await flushMicrotasks();
    const conceal = lastOn(content) as Played;
    const again = lastOn(row(0)) as Played;
    expect(again).not.toBe(glide);
    expect(conceal.duration).toBe(Number(again.options.duration));
    // Its edge is the row's, wherever the row's carried glide shows it: what
    // the content shows is the 80 px less the row's distance above its place.
    conceal.ridden?.forEach((frame, i) => {
      const y = Number(
        /px\s+(-?[\d.e+-]+)px/.exec(String(again.keyframes[i].translate))?.[1],
      );
      expect(frame.clipPath).toBe(
        `inset(0px 0px ${Math.min(80, Math.max(0, 80 - y))}px 0px)`,
      );
    });
    expect(String(conceal.ridden?.at(-1)?.clipPath)).toBe(
      'inset(0px 0px 80px 0px)',
    );
  });
});

/**
 * A row area: a panel 260 px wide that collapses to 48 beside a column, which
 * the change moves by the difference (the SideNav rail beside AppShell's
 * content).
 */
function rowSetup({direction = 'ltr'}: {direction?: 'ltr' | 'rtl'} = {}) {
  document.body.innerHTML = `
    <div id="area" dir="${direction}" style="direction: ${direction}">
      <div id="row" style="display: flex">
        <div id="side"><nav id="panel" style="direction: ${direction}"><span>Projects</span></nav></div>
        <div id="column"><main id="content">The page</main></div>
      </div>
    </div>`;
  const area = document.getElementById('area') as HTMLElement;
  const host = document.getElementById('row') as HTMLElement;
  const side = document.getElementById('side') as HTMLElement;
  const panel = document.getElementById('panel') as HTMLElement;
  const column = document.getElementById('column') as HTMLElement;
  let width = 260;
  const rtl = direction === 'rtl';
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this === area || this === host) {
        return DOMRect.fromRect({x: 0, y: 0, width: 1000, height: 600});
      }
      if (this === panel || this === side) {
        return DOMRect.fromRect({
          x: rtl ? 1000 - width : 0,
          y: 0,
          width,
          height: 600,
        });
      }
      if (this === column) {
        return DOMRect.fromRect({
          x: rtl ? 0 : width,
          y: 0,
          width: 1000 - width,
          height: 600,
        });
      }
      return DOMRect.fromRect({x: 0, y: 0, width: 0, height: 0});
    },
  );
  const handle = createAnimatedLayout(() => area);
  return {
    handle,
    host,
    side,
    panel,
    column,
    /** Sets the panel's width as a commit would, the column's glide around it. */
    resize(next: number, shown: number | null = null) {
      const hold = holdLayoutEdge(handle, panel, {edge: 'inline-end', shown});
      const report = reportLayoutChange(handle, () => panel);
      report.measureBefore();
      width = next;
      report.animate();
      return hold;
    },
  };
}

describe('the two-state edge reveal (spec:AST-105 FR9)', () => {
  it('conceals by clipping the old state, held as one copy, from what it shows to the new extent, on the glide it rides', async () => {
    const {handle, host, side, panel, column, resize} = rowSetup();
    const hold = resize(48);
    expect(hold?.swap).not.toBeNull();
    expect(hold?.extent).toBe(260);
    const icons = vi.fn((p: number) => ({opacity: p}));
    playLayoutEdge(hold!, panel, handle, {
      edge: 'inline-end',
      rideWith: column,
      parts: isConceal => {
        expect(isConceal).toBe(true);
        return {
          copyOpacity: p => 1 - p,
          incoming: [{element: panel, frames: icons}],
        };
      },
    });
    await flushMicrotasks();
    const copy = hold!.swap!.copy;
    expect(copy.parentElement).toBe(host);
    const clip = lastOn(copy) as Played;
    expect(clip.keyframes[0].clipPath).toBe('inset(0px 0px 0px 0px)');
    expect(clip.keyframes.at(-1)?.clipPath).toBe('inset(0px 212px 0px 0px)');
    expect(clip.keyframes.at(-1)?.opacity).toBe(0);
    // Every frame of the copy follows the column's glide.
    const glide = lastOn(column) as Played;
    expect(clip.keyframes).toHaveLength(glide.keyframes.length);
    // The panel, raised above its copy while it conceals, shows the caller's
    // own frames, and drops the raise once the reveal ends.
    expect(side.style.zIndex).toBe('2');
    expect(icons).toHaveBeenCalled();
    clip.finish?.();
    expect(side.style.zIndex).toBe('');
    expect(copy.isConnected).toBe(false);
  });

  it('reveals by clipping the element open from what showed, under the old state', async () => {
    const {handle, panel, column, resize} = rowSetup();
    resize(48);
    await flushMicrotasks();
    setTimeline(61_000);
    played = [];
    const hold = resize(260);
    playLayoutEdge(hold!, panel, handle, {
      edge: 'inline-end',
      rideWith: column,
      parts: isConceal => ({copyOpacity: p => (isConceal ? 1 : 1 - p)}),
    });
    await flushMicrotasks();
    const reveal = played.find(
      entry => entry.element === panel && 'clipPath' in entry.keyframes[0],
    ) as Played;
    expect(reveal.keyframes[0].clipPath).toBe('inset(0px 212px 0px 0px)');
    expect(reveal.keyframes.at(-1)?.clipPath).toBe('inset(0px 0px 0px 0px)');
    const old = lastOn(hold!.swap!.copy) as Played;
    expect(old.keyframes[0].opacity).toBe(1);
    expect(old.keyframes.at(-1)?.opacity).toBe(0);
  });

  it('clips the edge on the left right to left', async () => {
    const {handle, panel, column, resize} = rowSetup({direction: 'rtl'});
    const hold = resize(48);
    playLayoutEdge(hold!, panel, handle, {
      edge: 'inline-end',
      rideWith: column,
    });
    await flushMicrotasks();
    const clip = lastOn(hold!.swap!.copy) as Played;
    expect(clip.keyframes.at(-1)?.clipPath).toBe('inset(0px 0px 0px 212px)');
  });

  it('starts a reversal from the extent it shows', async () => {
    const {handle, panel, column, resize} = rowSetup();
    const hold = resize(48);
    const motion = playLayoutEdge(hold!, panel, handle, {
      edge: 'inline-end',
      rideWith: column,
    });
    await flushMicrotasks();
    motion.end();
    played = [];
    // Partway, the panel showed 150 px wide; the adopter hands that over.
    const again = resize(260, 150);
    expect(again?.extent).toBe(150);
    playLayoutEdge(again!, panel, handle, {
      edge: 'inline-end',
      rideWith: column,
    });
    await flushMicrotasks();
    const reveal = played.find(
      entry => entry.element === panel && 'clipPath' in entry.keyframes[0],
    ) as Played;
    expect(reveal.keyframes[0].clipPath).toBe('inset(0px 110px 0px 0px)');
  });

  it('reports what it shows while it runs, and nothing once it has settled', async () => {
    const {handle, panel, resize} = rowSetup();
    const hold = resize(48);
    const motion = playLayoutEdge(hold!, panel, handle, {edge: 'inline-end'});
    expect(motion.shown()).toEqual({extent: 260, progress: 0});
    setTimeline(1000 + 120);
    const partway = motion.shown();
    expect(partway?.progress).toBeGreaterThan(0);
    expect(partway?.progress).toBeLessThan(1);
    expect(partway?.extent).toBeCloseTo(
      260 + (48 - 260) * Number(partway?.progress),
      6,
    );
    setTimeline(1000 + 60_000);
    expect(motion.shown()).toBeNull();
  });

  it('only cross-fades under Reduce Motion with a coarse pointer (design:reduced-motion DR2)', async () => {
    media = {
      '(prefers-reduced-motion: reduce)': true,
      '(pointer: coarse)': true,
    };
    const {handle, panel, column, resize} = rowSetup();
    const hold = resize(48);
    playLayoutEdge(hold!, panel, handle, {
      edge: 'inline-end',
      rideWith: column,
    });
    await flushMicrotasks();
    for (const entry of played) {
      for (const frame of entry.keyframes) {
        expect(Object.keys(frame).filter(key => key !== 'offset')).toEqual([
          'opacity',
        ]);
      }
    }
  });

  it('changes at once under Reduce Motion with a fine pointer (design:reduced-motion DR3)', async () => {
    media = {'(prefers-reduced-motion: reduce)': true};
    const {handle, panel, column, resize} = rowSetup();
    const hold = resize(48);
    // Nothing to hold: the change lands at once.
    expect(hold?.swap).toBeNull();
    const motion = playLayoutEdge(hold!, panel, handle, {
      edge: 'inline-end',
      rideWith: column,
    });
    await flushMicrotasks();
    expect(played).toEqual([]);
    expect(motion.shown()).toBeNull();
  });
});

/**
 * A row like a Layout with a resizable pane: the pane, a handle and the
 * content, which the change moves by the pane's difference. The pane sits at
 * the inline start (`side: 'start'`) or at the inline end.
 */
function paneSetup({
  direction = 'ltr',
  side = 'start',
}: {direction?: 'ltr' | 'rtl'; side?: 'start' | 'end'} = {}) {
  const pane =
    '<aside id="pane" style="direction: ' + direction + '">Files</aside>';
  const handleEl = '<div id="grip"></div>';
  const content = '<main id="content">The page</main>';
  document.body.innerHTML = `
    <div id="area" dir="${direction}" style="direction: ${direction}">
      <div id="row" style="display: flex">${
        side === 'start' ? pane + handleEl + content : content + handleEl + pane
      }</div>
    </div>`;
  const area = document.getElementById('area') as HTMLElement;
  const row = document.getElementById('row') as HTMLElement;
  const paneEl = document.getElementById('pane') as HTMLElement;
  const grip = document.getElementById('grip') as HTMLElement;
  const main = document.getElementById('content') as HTMLElement;
  let width = 260;
  // Physical x of each box: the pane at the row's start or end edge, as the
  // direction lays it out.
  const atLeft = (side === 'start') === (direction === 'ltr');
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this === area || this === row) {
        return DOMRect.fromRect({x: 0, y: 0, width: 1000, height: 600});
      }
      if (this === paneEl) {
        return DOMRect.fromRect({
          x: atLeft ? 0 : 1000 - width,
          y: 0,
          width,
          height: 600,
        });
      }
      if (this === grip) {
        return DOMRect.fromRect({
          x: atLeft ? width : 1000 - width - 8,
          y: 0,
          width: 8,
          height: 600,
        });
      }
      if (this === main) {
        return DOMRect.fromRect({
          x: atLeft ? width + 8 : 0,
          y: 0,
          width: 1000 - width - 8,
          height: 600,
        });
      }
      return DOMRect.fromRect({x: 0, y: 0, width: 0, height: 0});
    },
  );
  const handle = createAnimatedLayout(() => area);
  return {
    handle,
    pane: paneEl,
    grip,
    /** Collapses or opens the pane, as the controller does, around the report. */
    resize(next: number, edge: LayoutEdge) {
      const report = reportLayoutEdge(handle, () => paneEl, {edge});
      report.measureBefore();
      width = next;
      report.animate();
      return report;
    },
  };
}

describe('the edge reveal of a resized element, with no copy (spec:AST-105 FR9)', () => {
  const clipsOf = (element: Element) =>
    played.filter(
      entry => entry.element === element && 'clipPath' in entry.keyframes[0],
    );

  it('conceals by holding the element at the extent it was laid out at, freeing the difference by its edge’s margin, and clipping it to its new extent', () => {
    const {pane, resize} = paneSetup();
    resize(48, 'inline-end');
    // Held at 260 px while it conceals; the margin frees 212 px, so the
    // content beyond it stays where the new size puts it.
    expect(pane.style.getPropertyValue('inline-size')).toBe('260px');
    expect(pane.style.getPropertyValue('margin-inline-end')).toBe('-212px');
    const [clip] = clipsOf(pane);
    expect(clip.keyframes[0].clipPath).toBe('inset(0px 0px 0px 0px)');
    expect(clip.keyframes.at(-1)?.clipPath).toBe('inset(0px 212px 0px 0px)');
    // It slides: nothing fades.
    expect(clip.keyframes.some(frame => 'opacity' in frame)).toBe(false);
    // The hold goes when the motion ends.
    clip.finish?.();
    expect(pane.style.getPropertyValue('inline-size')).toBe('');
    expect(pane.style.getPropertyValue('margin-inline-end')).toBe('');
  });

  it('conceals entirely to a size of 0', () => {
    const {pane, resize} = paneSetup();
    resize(0, 'inline-end');
    expect(pane.style.getPropertyValue('margin-inline-end')).toBe('-260px');
    expect(clipsOf(pane)[0].keyframes.at(-1)?.clipPath).toBe(
      'inset(0px 260px 0px 0px)',
    );
  });

  it('reveals from the extent it showed, holding nothing', () => {
    const {pane, resize} = paneSetup();
    resize(48, 'inline-end');
    clipsOf(pane)[0].finish?.();
    played = [];
    setTimeline(61_000);
    resize(260, 'inline-end');
    expect(pane.style.getPropertyValue('inline-size')).toBe('');
    const [clip] = clipsOf(pane);
    expect(clip.keyframes[0].clipPath).toBe('inset(0px 212px 0px 0px)');
    expect(clip.keyframes.at(-1)?.clipPath).toBe('inset(0px 0px 0px 0px)');
  });

  it('rides the glide of the content beside it, frame by frame', async () => {
    const {pane, grip, resize} = paneSetup();
    resize(48, 'inline-end');
    await flushMicrotasks();
    const glide = lastOn(grip) as Played;
    const [clip] = clipsOf(pane);
    expect(clip.ridden).toHaveLength(glide.keyframes.length);
    expect(clip.duration).toBe(Number(glide.options.duration));
    // Wherever the handle shows, the pane shows up to it.
    clip.ridden?.forEach((frame, index) => {
      const x = Number(
        /^(-?[\d.e+-]+)px/.exec(String(glide.keyframes[index].translate))?.[1],
      );
      expect(frame.clipPath).toBe(
        `inset(0px ${Math.min(212, Math.max(0, 212 - x))}px 0px 0px)`,
      );
    });
  });

  it('starts a change made while it runs from the extent it shows', async () => {
    const {pane, resize} = paneSetup();
    resize(48, 'inline-end');
    const [conceal] = clipsOf(pane);
    const index = 6;
    const frame = conceal.keyframes[index];
    setTimeline(1000 + Number(frame.offset) * Number(conceal.options.duration));
    const shown =
      260 - Number(/inset\(0px ([\d.]+)px/.exec(String(frame.clipPath))?.[1]);
    played = [];
    resize(260, 'inline-end');
    // The hold is gone, and the reveal starts where the conceal got to.
    expect(pane.style.getPropertyValue('inline-size')).toBe('');
    expect(conceal.cancel).toHaveBeenCalled();
    const [reveal] = clipsOf(pane);
    expect(String(reveal.keyframes[0].clipPath)).toBe(
      `inset(0px ${260 - shown}px 0px 0px)`,
    );
  });

  it('cancel ends it at once and puts back what it held', () => {
    const {pane, resize} = paneSetup();
    const report = resize(48, 'inline-end');
    expect(pane.style.getPropertyValue('inline-size')).toBe('260px');
    report.cancel();
    expect(pane.style.getPropertyValue('inline-size')).toBe('');
    expect(pane.style.getPropertyValue('margin-inline-end')).toBe('');
    expect(clipsOf(pane)[0].cancel).toHaveBeenCalled();
  });

  it('a pane at the inline end conceals by its inline-start edge, freeing its inline-start margin', () => {
    const {pane, resize} = paneSetup({side: 'end'});
    resize(48, 'inline-start');
    expect(pane.style.getPropertyValue('margin-inline-start')).toBe('-212px');
    expect(clipsOf(pane)[0].keyframes.at(-1)?.clipPath).toBe(
      'inset(0px 0px 0px 212px)',
    );
  });

  it('mirrors the clip right to left', () => {
    const {pane, resize} = paneSetup({direction: 'rtl'});
    resize(48, 'inline-end');
    expect(clipsOf(pane)[0].keyframes.at(-1)?.clipPath).toBe(
      'inset(0px 0px 0px 212px)',
    );
  });

  it('under Reduce Motion with a coarse pointer a reveal fades in and a conceal lands at once (design:reduced-motion DR2)', () => {
    media = {
      '(prefers-reduced-motion: reduce)': true,
      '(pointer: coarse)': true,
    };
    const {pane, resize} = paneSetup();
    resize(48, 'inline-end');
    expect(pane.style.getPropertyValue('inline-size')).toBe('');
    expect(played.filter(entry => entry.element === pane)).toEqual([]);
    resize(260, 'inline-end');
    const fades = played.filter(entry => entry.element === pane);
    expect(fades).toHaveLength(1);
    expect(Object.keys(fades[0].keyframes[0])).toEqual(['opacity']);
  });

  it('under Reduce Motion with a fine pointer every change lands at once (design:reduced-motion DR3)', () => {
    media = {'(prefers-reduced-motion: reduce)': true};
    const {pane, resize} = paneSetup();
    resize(48, 'inline-end');
    resize(260, 'inline-end');
    expect(played.filter(entry => entry.element === pane)).toEqual([]);
    expect(pane.style.getPropertyValue('inline-size')).toBe('');
  });
});
