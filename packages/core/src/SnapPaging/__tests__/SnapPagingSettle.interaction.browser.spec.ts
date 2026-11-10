// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SnapPagingSettle.interaction.browser.spec.ts
 * @input The built Carousel snap-paging stories, real touch input and edge
 *   presses through the interaction harness. A count of the keyframe bakes
 *   the page starts, and a per-frame read of each item's translate, its
 *   animations and its layer
 * @output Proof that a settle samples its curve once: one element bakes it.
 *   Every item that can show plays its own animation, on a layer of its own,
 *   from the lead's start and at the lead's translate. That holds through a settle across pages, a touch that catches one,
 *   a second press, and a row resized under a held finger. An item out of
 *   view through the whole settle gets no animation, and a caught row puts
 *   every item at the lead's translate
 * @position Browser proof for snap paging's settle, run by
 *   `pnpm test:interaction`
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  FRAME_STARVATION_MS,
  FrameStarvationError,
  openStory,
  requireFrames,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

async function open(page: Page, args: Record<string, string> = {}) {
  await openStory(page, storybook(), 'core-carousel--snap-paging-three-up', {
    mode: 'paging',
    ...args,
  });
  const scroller = page.getByRole('region').getByRole('group').first();
  return {scroller};
}

/**
 * Whether the paging still moves the items: an item carries its translate
 * or runs an animation. A settle from rest can run with no inline translate.
 */
const isTakenOver = async (scroller: Locator) =>
  scroller.evaluate(el =>
    Array.from(el.children).some(
      child =>
        (child as HTMLElement).style.translate !== '' ||
        child.getAnimations().length > 0,
    ),
  );

async function settled(scroller: Locator) {
  await expect
    .poll(async () => isTakenOver(scroller), {
      message: 'the row hands back to native scroll',
      timeout: 2_000,
    })
    .toBe(false);
}

/** A flick toward the row's end: 80 px over 80 ms. */
async function flick(page: Page, scroller: Locator) {
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const y = box.y + box.height / 2;
  const from = {x: box.x + box.width / 2 + 40, y};
  const driver = await touchDriver(page);
  await driver.play(drag(from, {x: from.x - 80, y}, {durationMs: 80}));
}

/**
 * Counts the animations `Element.animate` starts on each item from now on,
 * by item index.
 */
async function countAnimates(scroller: Locator) {
  await scroller.evaluate(el => {
    const counts = new Map<number, number>();
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, ...args) {
      const index = Array.prototype.indexOf.call(el.children, this);
      if (index >= 0) {
        counts.set(index, (counts.get(index) ?? 0) + 1);
      }
      return animate.apply(this, args);
    };
    (window as unknown as {__animates: Map<number, number>}).__animates =
      counts;
  });
  return async () =>
    scroller.evaluate(() => [
      ...(window as unknown as {__animates: Map<number, number>}).__animates,
    ]);
}

type Frame = {
  readonly t: number;
  readonly kept: boolean;
  readonly position: number;
  readonly running: boolean;
};

type Miss = {frame: number; item: number; x: number; lead: number};

type Watch = {
  frames: Frame[];
  /** An item in view with no animation of its own while the lead settles. */
  missing: Miss[];
  /** An item that animates without a layer of its own. */
  unpromoted: Miss[];
  /** An item that animates from another start than the lead's. */
  late: {frame: number; item: number; start: number; lead: number}[];
  /** An item in view away from the lead's translate. */
  apart: Miss[];
  animated: number[] | null;
  touch: {start: number | null; end: number | null};
};

/**
 * Watches every frame until the row is handed back. While the lead item
 * settles, each item in view, as the lead places it, has its own animation
 * or rests at the settle's end. Each animating item carries its layer and
 * starts when the lead starts. Each item in view sits at the lead's
 * translate.
 * Each frame records where the row shows and whether the lead settles. The
 * watch also records which items had an animation on the settle's first
 * frame, and when a touch went down and lifted.
 */
async function watchShown(scroller: Locator) {
  await scroller.evaluate(el => {
    const log: Watch = {
      frames: [],
      missing: [],
      unpromoted: [],
      late: [],
      apart: [],
      animated: null,
      touch: {start: null, end: null},
    };
    (window as unknown as {__shown: Watch}).__shown = log;
    el.addEventListener(
      'touchstart',
      () => {
        log.touch.start ??= performance.now();
      },
      {capture: true, passive: true},
    );
    el.addEventListener(
      'touchend',
      () => {
        log.touch.end = performance.now();
      },
      {capture: true, passive: true},
    );
    const xOf = (child: Element) =>
      Number.parseFloat(getComputedStyle(child).translate) || 0;
    const runningOf = (child: Element) =>
      child
        .getAnimations()
        .find(animation => animation.playState === 'running') ?? null;
    const sample = () => {
      const items = Array.from(el.children);
      const isHeld = items.some(
        child =>
          (child as HTMLElement).style.translate !== '' ||
          child.getAnimations().length > 0,
      );
      if (isHeld) {
        // WebKit reads an accelerated animation at the time of each read, so
        // the lead is read before and after the items. A frame whose lead
        // moved between its two reads is not kept. Every translate is read
        // before any box.
        const before = xOf(items[0]);
        const xs = items.map(xOf);
        const lead = xOf(items[0]);
        const box = el.getBoundingClientRect();
        const kept = Math.abs(lead - before) <= 0.01;
        const settle = runningOf(items[0]);
        const lastFrame = (settle?.effect as KeyframeEffect | null | undefined)
          ?.getKeyframes()
          .at(-1);
        const endX =
          lastFrame == null
            ? null
            : Number.parseFloat(String(lastFrame.translate));
        log.frames.push({
          t: performance.now(),
          kept,
          position: Math.abs(el.scrollLeft) - lead,
          running: settle != null,
        });
        const frame = log.frames.length;
        items.forEach((child, item) => {
          const rect = child.getBoundingClientRect();
          const x = xs[item];
          // Where the item shows if it moves with the lead.
          const left = rect.left + lead - x;
          const isInView = left + rect.width > box.left && left < box.right;
          const own = runningOf(child);
          if (own != null) {
            if (!getComputedStyle(child).willChange.includes('translate')) {
              log.unpromoted.push({frame, item, x, lead});
            }
            const start = Number(own.startTime);
            const leadStart = Number(settle?.startTime);
            if (
              own.startTime != null &&
              settle?.startTime != null &&
              start !== leadStart
            ) {
              log.late.push({frame, item, start, lead: leadStart});
            }
            if (kept && isInView && Math.abs(x - lead) > 0.01) {
              log.apart.push({frame, item, x, lead});
            }
          } else if (kept && isInView) {
            if (endX != null && Math.abs(x - endX) > 0.01) {
              log.missing.push({frame, item, x, lead});
            } else if (endX == null && Math.abs(x - lead) > 0.01) {
              log.apart.push({frame, item, x, lead});
            }
          }
        });
        if (log.animated == null && settle != null) {
          log.animated = items.flatMap((child, item) =>
            child.getAnimations().length > 0 ? [item] : [],
          );
        }
      }
      if (isHeld || log.frames.length === 0) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  return async () =>
    scroller.evaluate(() => (window as unknown as {__shown: Watch}).__shown);
}

/** Every item the row shows moved with the lead, on a layer of its own. */
function expectInStep(log: Watch) {
  expect(log.missing, JSON.stringify(log.missing.slice(0, 8))).toEqual([]);
  expect(log.unpromoted, JSON.stringify(log.unpromoted.slice(0, 8))).toEqual(
    [],
  );
  expect(log.late, JSON.stringify(log.late.slice(0, 8))).toEqual([]);
  expect(log.apart, JSON.stringify(log.apart.slice(0, 8))).toEqual([]);
}

/**
 * Starts reading the lead item on every frame, before an action. Each frame
 * reads whether the paging holds the lead, whether its settle runs from the
 * start the browser gave it, and its translate. The settle starts at the
 * paging's first `animate` call on the lead. A drag before it holds the lead
 * too, and its travel is not the settle's. A settle created in the action's
 * task has no start until a frame commits it. The returned read resolves true
 * for the first frame where the settle runs and the lead shows `moved` px of
 * it. That frame may come before the read: a loaded runner can start the read
 * after the settle ends. Else the read resolves false 2 s after it starts. A
 * frame gap over the starvation gap between the settle's start and its
 * hand-back hides its run, so that read fails by name.
 */
async function watchSettleRuns(scroller: Locator, moved = 0) {
  type Watch = {
    frames: {t: number; held: boolean; runs: boolean}[];
    runs: boolean;
    startedAt: number | null;
    from: number;
    done: boolean;
    animate: typeof Element.prototype.animate;
  };
  await scroller.evaluate((el, distance) => {
    const lead = el.firstElementChild as HTMLElement;
    const xOf = () => Number.parseFloat(getComputedStyle(lead).translate) || 0;
    const watch: Watch = {
      frames: [],
      runs: false,
      startedAt: null,
      from: 0,
      done: false,
      animate: Element.prototype.animate,
    };
    (window as unknown as {__settleRuns: Watch}).__settleRuns = watch;
    Element.prototype.animate = function (this: Element, ...args) {
      if (this === lead && watch.startedAt == null) {
        watch.startedAt = performance.now();
        watch.from = xOf();
      }
      return watch.animate.apply(this, args);
    };
    const check = (time: number) => {
      const animations = lead.getAnimations();
      watch.runs =
        watch.startedAt != null &&
        animations.some(
          a => a.playState === 'running' && a.startTime != null,
        ) &&
        Math.abs(xOf() - watch.from) >= distance;
      watch.frames.push({
        t: time,
        held: animations.length > 0 || lead.style.translate !== '',
        runs: watch.runs,
      });
      if (!watch.runs && !watch.done) {
        requestAnimationFrame(check);
      }
    };
    requestAnimationFrame(check);
  }, moved);
  return async () => {
    const {runs, startedAt, frames} = await scroller.evaluate(async () => {
      const watch = (window as unknown as {__settleRuns: Watch}).__settleRuns;
      const until = performance.now() + 2000;
      while (!watch.runs && performance.now() < until) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      watch.done = true;
      Element.prototype.animate = watch.animate;
      return {
        runs: watch.runs,
        startedAt: watch.startedAt,
        frames: watch.frames,
      };
    });
    // The paging started a settle, but no frame showed it run `moved` px.
    // A frame gap over the starvation gap between the settle's start and its
    // hand-back hid it, which fails by name.
    if (!runs && startedAt != null) {
      const first = frames.findIndex(frame => frame.t >= startedAt);
      const from = first < 0 ? frames.length : first;
      const released = frames.findIndex((frame, i) => i >= from && !frame.held);
      const settle = frames.slice(
        Math.max(0, from - 1),
        released < 0 ? frames.length : released + 1,
      );
      try {
        requireFrames(settle, {
          min: 1,
          during:
            moved > 0
              ? `the settle showed ${moved} px of its move`
              : 'the settle ran',
          where: frame => frame.runs,
        });
      } catch (shortfall) {
        if (shortfall instanceof FrameStarvationError) {
          throw shortfall;
        }
      }
    }
    return runs;
  };
}

/**
 * The touch reached the page too late to judge the catch. The row showed less
 * than a pixel of the settle left. A frame gap longer than the starvation gap
 * came first. The runner held the touch back, so the run proves nothing about
 * where the catch stops.
 */
class LateTouchError extends Error {
  constructor(shown: number, end: number, gapMs: number) {
    super(
      `the touch reached the page with the row at ${shown.toFixed(2)} px, within a pixel of the settle's end at ${end.toFixed(2)} px, after a ${gapMs.toFixed(0)} ms frame gap: the runner held the touch back, so the run proves nothing about where the catch stops`,
    );
    this.name = 'LateTouchError';
  }
}

/**
 * Resizes the row's frame by `by` px at the first touch move after the row is
 * held. The returned read says whether the resize ran.
 */
async function resizeWhenHeld(scroller: Locator, by: number) {
  await scroller.evaluate((el, px) => {
    const frame = el.closest('[role="region"]')?.parentElement;
    if (frame == null) {
      throw new Error('no frame');
    }
    const record = window as unknown as {__resized: boolean};
    record.__resized = false;
    el.addEventListener(
      'touchmove',
      () => {
        const isHeld = Array.from(el.children).some(
          child => (child as HTMLElement).style.translate !== '',
        );
        if (isHeld && !record.__resized) {
          record.__resized = true;
          frame.style.width = `${frame.clientWidth + px}px`;
        }
      },
      {passive: true},
    );
  }, by);
  return async () =>
    scroller.evaluate(
      () => (window as unknown as {__resized: boolean}).__resized,
    );
}

/** A slow drag of `px` toward the row's end, held still before the lift. */
async function hold(page: Page, scroller: Locator, px: number) {
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const y = box.y + box.height / 2;
  const from = {x: box.x + box.width / 2 + px / 2, y};
  const driver = await touchDriver(page);
  await driver.play(
    drag(from, {x: from.x - px, y}, {durationMs: 200, restMs: 150}),
  );
}

test('a settle bakes its curve once: only the lead item bakes keyframes', async ({
  page,
}) => {
  const {scroller} = await open(page);
  const animates = await countAnimates(scroller);
  await flick(page, scroller);
  await settled(scroller);
  // Every item that can show plays the settle, and the lead's call bakes
  // its keyframes. The other calls copy them, so none of them calls
  // `animate`.
  expect(await animates()).toEqual([[0, 1]]);
});

test('every item the row shows moves with the lead through a one-view settle, and an item out of view gets no animation', async ({
  page,
}) => {
  const {scroller} = await open(page);
  const shown = await watchShown(scroller);
  await flick(page, scroller);
  await settled(scroller);
  const log = await shown();
  requireFrames(log.frames, {
    min: 3,
    during: 'the settle',
    where: frame => frame.kept,
  });
  expectInStep(log);
  // One view on from the start: items 0 to 5 can show; 6 to 8 stay out.
  expect(log.animated).toEqual([0, 1, 2, 3, 4, 5]);
});

test('a press past the last page goes back to the first: every item it sweeps through the view moves with the lead', async ({
  page,
}) => {
  const {scroller} = await open(page, {hasLoop: '!true'});
  const next = page.getByRole('button', {name: 'Scroll right'});
  // Edge presses step about one view each, until the row reaches its end.
  const atEnd = async () =>
    scroller.evaluate(
      el => Math.abs(el.scrollLeft) >= el.scrollWidth - el.clientWidth - 1,
    );
  for (let i = 0; i < 6 && !(await atEnd()); i++) {
    await next.click();
    await settled(scroller);
  }
  expect(await atEnd()).toBe(true);
  const shown = await watchShown(scroller);
  // At the end, the press wraps to the start. Items 3 to 5 show only on the
  // way.
  await next.click();
  await settled(scroller);
  expect(await scroller.evaluate(el => Math.abs(el.scrollLeft))).toBeLessThan(
    1,
  );
  const log = await shown();
  requireFrames(log.frames, {
    min: 3,
    during: 'the settle',
    where: frame => frame.kept,
  });
  expectInStep(log);
  expect(log.animated).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('a touch that catches the settle stops every item where the lead shows it', async ({
  page,
}) => {
  const {scroller} = await open(page);
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const offset = async () => scroller.evaluate(el => Math.abs(el.scrollLeft));
  const next = page.getByRole('button', {name: 'Scroll right'});
  // A press that nothing catches shows where the press's settle ends.
  await next.click();
  await settled(scroller);
  const end = await offset();
  await page.getByRole('button', {name: 'Scroll left'}).click();
  await settled(scroller);
  expect(await offset()).toBeLessThan(1);
  const shown = await watchShown(scroller);
  const driver = await touchDriver(page);
  const runs = await watchSettleRuns(scroller, 4);
  await next.click();
  // The touch lands once the row shows some of the settle, so where it stops
  // lies strictly between the settle's start and its end.
  expect(await runs(), 'the press starts its settle').toBe(true);
  // A still touch stops the move where it shows, by the pager's catch time
  // at the latest. Its lift settles the row on a stop.
  await driver.play(
    tap({x: box.x + box.width / 2, y: box.y + box.height / 2}, {holdMs: 250}),
  );
  await settled(scroller);
  const log = await shown();
  requireFrames(log.frames, {
    min: 3,
    during: 'the settle',
    where: frame => frame.kept,
  });
  expectInStep(log);
  // From the catch to the lift, the settle is cancelled. The row stays where
  // the touch stopped it, between the settle's start and its end.
  const {start, end: lift} = log.touch;
  if (start == null || lift == null) {
    throw new Error('the page saw no touch');
  }
  const before = log.frames.filter(frame => frame.t < start).at(-1);
  expect(before?.running, 'the touch lands while the settle runs').toBe(true);
  if (before != null && before.position >= end - 1) {
    // Only a frame gap before the touch shows the runner held it back. With
    // none, the checks below judge the catch.
    const shownBefore = log.frames.filter(frame => frame.t < start);
    const gapMs = Math.max(
      0,
      ...shownBefore.slice(1).map((frame, i) => frame.t - shownBefore[i].t),
    );
    if (gapMs > FRAME_STARVATION_MS) {
      throw new LateTouchError(before.position, end, gapMs);
    }
  }
  const held = requireFrames(log.frames, {
    min: 2,
    during: 'the hold after the catch',
    where: frame => frame.t > start + 120 && frame.t < lift,
  });
  for (const frame of held) {
    expect(frame.running, 'the catch cancels the settle').toBe(false);
    expect(frame.position).toBeGreaterThan(1);
    expect(frame.position).toBeLessThan(end - 1);
  }
  expect(
    new Set(held.map(frame => frame.position.toFixed(2))).size,
    'the row holds still under the touch',
  ).toBe(1);
});

test('a second flick in a settle measures every item where it is drawn, and rests on a view page', async ({
  page,
}) => {
  const {scroller} = await open(page);
  // The three-up story's view pages start at every third item, the last one
  // at the row's end.
  const pages = await scroller.evaluate(el => {
    const items = Array.from(el.children) as HTMLElement[];
    const travel = el.scrollWidth - el.clientWidth;
    return items
      .filter((_, index) => index % 3 === 0)
      .map(item => Math.min(item.offsetLeft - items[0].offsetLeft, travel));
  });
  const runs = await watchSettleRuns(scroller, 150);
  await flick(page, scroller);
  // The second flick lands once the row shows half of the first settle.
  expect(await runs(), 'the first flick settles').toBe(true);
  await flick(page, scroller);
  await settled(scroller);
  const at = await scroller.evaluate(el => Math.abs(el.scrollLeft));
  expect(
    pages.some(stop => Math.abs(stop - at) < 1),
    JSON.stringify({at, pages}),
  ).toBe(true);
});

test('a second press in a settle moves every item with the lead', async ({
  page,
}) => {
  const {scroller} = await open(page);
  const next = page.getByRole('button', {name: 'Scroll right'});
  const shown = await watchShown(scroller);
  const runs = await watchSettleRuns(scroller);
  await next.click();
  expect(await runs(), 'the first press starts its settle').toBe(true);
  await next.click();
  await settled(scroller);
  const log = await shown();
  requireFrames(log.frames, {
    min: 3,
    during: 'the two presses',
    where: frame => frame.kept,
  });
  expectInStep(log);
});

test('a row widened under a held finger: its settle moves every item the wider row shows', async ({
  page,
}) => {
  const {scroller} = await open(page);
  // 90 px wider, the row shows item 4 near the start, which the takeover's
  // view could not.
  const resized = await resizeWhenHeld(scroller, 90);
  const shown = await watchShown(scroller);
  await hold(page, scroller, 80);
  await settled(scroller);
  expect(await resized(), 'the row widens while the finger holds it').toBe(
    true,
  );
  const log = await shown();
  requireFrames(log.frames, {
    min: 3,
    during: 'the hold and its settle',
    where: frame => frame.kept,
  });
  expectInStep(log);
  expect(log.animated).toContain(4);
});

test('a row narrowed under a held finger, its items a share of its width: its settle moves every item it shows', async ({
  page,
}) => {
  const {scroller} = await open(page);
  // Items 40 % of the row wide: the narrowing moves every item's start, and
  // item 2 comes into view near the start.
  await scroller.evaluate(el => {
    for (const child of Array.from(el.children)) {
      (child as HTMLElement).style.width = '40%';
    }
  });
  const resized = await resizeWhenHeld(scroller, -100);
  const shown = await watchShown(scroller);
  await hold(page, scroller, 40);
  await settled(scroller);
  expect(await resized(), 'the row narrows while the finger holds it').toBe(
    true,
  );
  const log = await shown();
  requireFrames(log.frames, {
    min: 3,
    during: 'the hold and its settle',
    where: frame => frame.kept,
  });
  expectInStep(log);
  expect(log.animated).toContain(2);
});
