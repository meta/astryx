// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PageControl.interaction.browser.spec.ts
 * @input The built "Default" and "Many Pages" PageControl stories, real touch
 *   input (Chromium CDP / WebKit's tap path) and the interaction harness
 * @output Proof against UIPageControl's measurements: taps, the scrub, the
 *   jog, the held platter, the fades, the window's slide and the page scroll
 * @position Browser proof for the lab PageControl, run by
 *   `pnpm test:interaction`
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  animationStoryboard,
  armHold,
  blockMainThread,
  BUSY_PROOF_LOOKAROUND_MS,
  busyWindowProof,
  CONTROL_RGB,
  drag,
  FRAME_STARVATION_MS,
  FrameStarvationError,
  MARKER_RGB,
  releaseAnimations,
  openStory,
  startBusyControl,
  startScreencast,
  touchDriver,
  touchStoryboard,
  trackMarkers,
  waitForRest,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** Indicator pitch, px (the pageControl table: 9.67 + 8). */
const PITCH = 17.67;
/** A full-size dot's scale: the 9.67 px indicator on its 10 px box. */
const DOT_SCALE = 0.967;
/**
 * Frames of the slide the busy proof must judge inside its block. The slide
 * is a 190 ms spring that shows about five frames of travel there.
 */
const MIN_JUDGED_FRAMES = 4;
/** UIPageControl's interaction delay, ms. */
const HOLD_MS = 155;
/** One frame at 60 Hz, ms. */
const FRAME_MS = 1000 / 60;
/** WebKit's page clocks keep whole milliseconds. */
const CLOCK_SLOP_MS = 2;

/** A timer the page ran, on the page's clock. */
interface TimerTask {
  id: number;
  delay: number;
  due: number;
  ranAt: number | null;
  scheduledAt: number;
  /** The timer task that set it, if any. */
  parentId: number | null;
}

/** What the held-finger proof records on the page, on the page's clock. */
interface HeldClock {
  /** The landing's pointer and touch event timeStamps. */
  landings: number[];
  /** When the page dispatched the landing, on the same clock. */
  dispatchedAt: number;
  /** The timer task that runs now. */
  task: TimerTask | null;
  timers: TimerTask[];
  frames: number[];
  flip: {
    at: number;
    task: TimerTask | null;
    /** The pointer or touch event being dispatched at the commit, if any. */
    input: {type: string; timeStamp: number} | null;
    fadedAt: number | null;
  } | null;
}

/**
 * Opens a PageControl story. The phone projects have a coarse primary
 * pointer: the touch presentation, on any engine (one touch model; nothing
 * asks for iOS). A block that sets `hasTouch: false` gets a mouse.
 */
async function open(
  page: Page,
  story = 'lab-pagecontrol--default',
  {rtl = false}: {rtl?: boolean} = {},
) {
  if (rtl) {
    await page.goto(
      `${storybook()}/iframe.html?id=${story}&viewMode=story&globals=direction:rtl`,
    );
    await page.getByRole('slider').waitFor();
  } else {
    await openStory(page, storybook(), story);
  }
  const slider = page.getByRole('slider');
  const driver = await touchDriver(page);
  return {slider, driver};
}

/** The centre of page `index`'s indicator, page coordinates. */
async function indicatorCenter(slider: Locator, index: number) {
  return slider.evaluate((el, i) => {
    const dot = el.querySelector(`[data-page="${i}"]`) as HTMLElement;
    const box = dot.getBoundingClientRect();
    return {x: box.left + box.width / 2, y: box.top + box.height / 2};
  }, index);
}

const valueNow = async (slider: Locator) =>
  Number(await slider.getAttribute('aria-valuenow'));

/** Logs every page change with its time (performance.now()) from now on. */
/**
 * The time per page across a jog's held window, first step to last. A busy
 * page can show one step late and the next at once. That skews a median of
 * the gaps, not the rate.
 */
function msPerPage(window: ReadonlyArray<{t: number; page: number}>) {
  const first = window[0];
  const last = window[window.length - 1];
  return (last.t - first.t) / Math.abs(last.page - first.page);
}

async function logPages(slider: Locator) {
  await slider.evaluate(el => {
    const log: Array<{t: number; page: number}> = [];
    (window as unknown as {pageLog: typeof log}).pageLog = log;
    new MutationObserver(() => {
      log.push({
        t: performance.now(),
        page: Number(el.getAttribute('aria-valuenow')),
      });
    }).observe(el, {attributes: true, attributeFilter: ['aria-valuenow']});
  });
  return () =>
    slider.evaluate(
      () =>
        (window as unknown as {pageLog: Array<{t: number; page: number}>})
          .pageLog,
    );
}

test('a tap on the trailing side of the current indicator moves one page forward, the leading side one back', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  expect(await valueNow(slider)).toBe(3);
  const current = await indicatorCenter(slider, 2);
  await driver.tap({x: current.x + 12, y: current.y});
  await expect.poll(async () => valueNow(slider)).toBe(4);
  await expect(page.getByTestId('page')).toHaveText('Page 4');
  const next = await indicatorCenter(slider, 3);
  await driver.tap({x: next.x - 12, y: next.y});
  await expect.poll(async () => valueNow(slider)).toBe(3);
});

test('a tap just above the control, inside its 44 px hit area, steps a page', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  expect(await valueNow(slider)).toBe(3);
  // The 25.67 px tall control grows about 9 px past each edge.
  await expect
    .poll(() =>
      slider.evaluate(
        el =>
          Number.parseFloat(
            el.style.getPropertyValue('--astryx-hit-inset-top'),
          ) || 0,
      ),
    )
    .toBeGreaterThan(8);
  const box = await slider.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const current = await indicatorCenter(slider, 2);
  await driver.tap({x: current.x + 12, y: box.y - 6});
  await expect.poll(async () => valueNow(slider)).toBe(4);
});

test('the page changes when the finger lifts, not when it lands', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  const current = await indicatorCenter(slider, 2);
  const at = {x: current.x + 12, y: current.y};
  let whileDown = NaN;
  // A finger held 200 ms (a 0.4 px creep, so moves are reported) then lifted.
  await driver.play(
    drag(at, {x: at.x + 0.4, y: at.y}, {durationMs: 200, hz: 10}),
    {
      onEvent: async step => {
        if (step.type === 'touchMove' && Number.isNaN(whileDown)) {
          whileDown = await valueNow(slider);
        }
      },
    },
  );
  expect(whileDown).toBe(3);
  await expect.poll(async () => valueNow(slider)).toBe(4);
});

test('rapid taps are not coalesced: five taps 150 ms apart step five pages (UIKit: each tap steps once)', async ({
  page,
}) => {
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages');
  expect(await valueNow(slider)).toBe(26);
  for (let i = 0; i < 5; i++) {
    const current = await indicatorCenter(slider, 25 + i);
    await driver.tap({x: current.x + 12, y: current.y});
    await page.waitForTimeout(100);
  }
  await expect.poll(async () => valueNow(slider)).toBe(31);
});

test('a finger that travels 16 px scrubs: the page is the indicator under it, switching at the midpoints, with no layout read after the scrub begins', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  const centers = await Promise.all(
    [0, 1, 2, 3, 4].map(i => indicatorCenter(slider, i)),
  );
  const from = centers[2];
  const to = {x: centers[4].x + 4, y: from.y};
  // Every layout read the page makes from here on.
  await page.evaluate(() => {
    const counter = window as unknown as {layoutReads: number};
    const read = Element.prototype.getBoundingClientRect;
    counter.layoutReads = 0;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      counter.layoutReads++;
      return read.call(this);
    };
  });
  const seen: Array<{x: number; reads: number}> = [];
  await driver.play(drag(from, to, {durationMs: 900, hz: 30, restMs: 120}), {
    onEvent: async step => {
      if (step.type === 'touchMove') {
        const x = step.fingers[0].x;
        const travel = x - from.x;
        const expected =
          travel < 16
            ? 2
            : Math.max(0, Math.min(4, Math.round((x - centers[0].x) / PITCH)));
        // One sample of slack at a switch point (the page follows the finger
        // within the move that crossed it). Each other sample waits for the
        // page it expects: where the page lands, not how fast.
        if (
          Math.abs(((x - centers[0].x) / PITCH) % 1) - 0.5 > 0.06 ||
          travel < 15
        ) {
          await expect
            .poll(async () => (await valueNow(slider)) - 1, {
              message: `finger at ${x.toFixed(1)}`,
            })
            .toBe(expected);
        }
        seen.push({
          x,
          reads: await page.evaluate(
            () => (window as unknown as {layoutReads: number}).layoutReads,
          ),
        });
      }
    },
  });
  // The scrub reads the control's layout once, as it begins, and never while
  // the finger moves.
  const scrubbing = seen.filter(({x}) => x - from.x >= 16);
  expect(scrubbing.length).toBeGreaterThan(5);
  expect(scrubbing[0].reads).toBeGreaterThan(0);
  expect(scrubbing[scrubbing.length - 1].reads).toBe(scrubbing[0].reads);
  await expect.poll(async () => valueNow(slider)).toBe(5);
  // Scrubbing back to page 0.
  await driver.play(
    drag(to, {x: centers[0].x - 6, y: from.y}, {durationMs: 900, restMs: 120}),
  );
  await expect.poll(async () => valueNow(slider)).toBe(1);
});

test('past the edge of a windowed control the page keeps stepping, faster the further past (jog)', async ({
  page,
}) => {
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages');
  const box = await slider.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const contentEnd = box.x + box.width - 14;
  const current = await indicatorCenter(slider, 25);
  const pages = await logPages(slider);
  // Scrub 40 px past the content's edge and hold there for 1.2 s:
  // 0.173 pages/s per px → about 7 pages a second.
  await driver.play(
    drag(
      current,
      {x: contentEnd + 40, y: current.y},
      {durationMs: 300, hz: 60, restMs: 1200},
    ),
  );
  const log = await pages();
  const held = log.filter(e => e.t >= log[0].t + 400);
  const nearStep = msPerPage(held);
  expect(nearStep).toBeGreaterThan(110);
  expect(nearStep).toBeLessThan(190);
  expect(log[log.length - 1].page).toBeGreaterThan(30);
  // Far past (100 px): 15 pages a second.
  const far = await logPages(slider);
  const now = await indicatorCenter(slider, (await valueNow(slider)) - 1);
  await driver.play(
    drag(
      now,
      {x: contentEnd + 100, y: now.y},
      {durationMs: 200, hz: 60, restMs: 900},
    ),
  );
  const fast = (await far()).filter((e, i, all) => e.t >= all[0].t + 300);
  const farStep = msPerPage(fast);
  expect(farStep).toBeGreaterThan(50);
  expect(farStep).toBeLessThan(85);
});

test('a held finger shows the platter, the pressed overlay, and dims the other indicators after 155 ms; the touched indicator does not transform', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  const target = await indicatorCenter(slider, 3);
  const restingScale = await slider.evaluate(
    el =>
      getComputedStyle(el.querySelector('[data-page="3"]') as HTMLElement)
        .scale,
  );
  const states: Array<{
    t: number;
    interacting: boolean;
    platter: number;
    other: number;
    touchedScale: string;
  }> = [];
  // The held look comes from the hold's own timer, not from elapsed time. The
  // page records its timer tasks, its frames and the commit that shows the
  // look, all on its own clock.
  await slider.evaluate(el => {
    const clock: HeldClock = {
      landings: [],
      dispatchedAt: 0,
      task: null,
      timers: [],
      frames: [],
      flip: null,
    };
    (window as unknown as {heldClock: HeldClock}).heldClock = clock;
    // Posted as a timer task starts, this message runs as a later task. It
    // marks the end of that timer task.
    const taskEnd = new MessageChannel();
    taskEnd.port1.onmessage = event => {
      if (clock.task?.id === event.data) {
        clock.task = null;
      }
    };
    let ids = 0;
    const setTimer = window.setTimeout.bind(window);
    window.setTimeout = ((
      handler: (...args: unknown[]) => void,
      delay?: number,
      ...args: unknown[]
    ) => {
      const scheduledAt = performance.now();
      const task: TimerTask = {
        id: (ids += 1),
        delay: Number(delay) || 0,
        due: scheduledAt + (Number(delay) || 0),
        ranAt: null,
        scheduledAt,
        parentId: clock.task?.id ?? null,
      };
      clock.timers.push(task);
      return setTimer(() => {
        task.ranAt = performance.now();
        clock.task = task;
        taskEnd.port2.postMessage(task.id);
        handler(...args);
      }, delay);
    }) as typeof window.setTimeout;
    for (const type of ['pointerdown', 'touchstart']) {
      el.addEventListener(
        type,
        event => {
          clock.landings.push(event.timeStamp);
          clock.dispatchedAt = Math.max(clock.dispatchedAt, performance.now());
        },
        {capture: true, once: true},
      );
    }
    const frame = () => {
      clock.frames.push(performance.now());
      if (clock.frames.length < 600) {
        requestAnimationFrame(frame);
      }
    };
    requestAnimationFrame(frame);
    new MutationObserver(() => {
      if (clock.flip == null && el.hasAttribute('data-interacting')) {
        const event = (window as unknown as {event?: Event}).event;
        const flip: NonNullable<HeldClock['flip']> = {
          at: performance.now(),
          task: clock.task,
          input:
            event != null && /^(pointer|touch)/.test(event.type)
              ? {type: event.type, timeStamp: event.timeStamp}
              : null,
          fadedAt: null,
        };
        clock.flip = flip;
        // The platter fades in over its own short transition from here.
        const fade = el
          .getAnimations({subtree: true})
          .find(
            a =>
              (a.effect as KeyframeEffect | null)?.pseudoElement === '::before',
          );
        if (fade == null) {
          flip.fadedAt = flip.at;
        } else {
          fade.finished.then(
            () => {
              flip.fadedAt = performance.now();
            },
            () => {},
          );
        }
      }
    }).observe(el, {attributes: true, attributeFilter: ['data-interacting']});
  });
  const read = async () => {
    const state = await slider.evaluate(el => {
      // The platter is the root's ::before (no element of its own).
      const platter = getComputedStyle(el, '::before');
      const other = el.querySelector('[data-page="0"]') as HTMLElement;
      const touched = el.querySelector('[data-page="3"]') as HTMLElement;
      return {
        t: performance.now(),
        interacting: el.hasAttribute('data-interacting'),
        platter: Number(platter.opacity),
        other: Number(other.style.opacity),
        touchedScale: getComputedStyle(touched).scale,
      };
    });
    states.push(state);
  };
  await driver.play(
    drag(target, {x: target.x + 0.4, y: target.y}, {durationMs: 400, hz: 20}),
    {
      onEvent: async step => {
        if (step.type === 'touchStart' || step.type === 'touchMove') {
          await read();
        }
      },
    },
  );
  const clock = await page.evaluate(
    () => (window as unknown as {heldClock: HeldClock}).heldClock,
  );
  const flip = clock.flip;
  if (flip == null) {
    throw new Error('The held look never showed.');
  }
  // The hold begins where the gesture arena learns its deadline has passed.
  // That is the hold timer's own task, or the one 0 ms task the arena sets
  // after the deadline when that timer ran late. It is also any input dated
  // after the deadline that the page dispatches first. The look commits there.
  const task = flip.task;
  const parent = clock.timers.find(timer => timer.id === task?.parentId);
  // The deadline is 155 ms after the landing, as the gesture arena dates it.
  // The arena's clock never runs back, so a busy page that dispatches the
  // landing late can date it as late as that dispatch.
  const earliest = Math.min(...clock.landings) + HOLD_MS;
  const latest = Math.max(clock.dispatchedAt, ...clock.landings) + HOLD_MS;
  const holdTimer =
    task != null &&
    task.delay === 0 &&
    parent != null &&
    task.scheduledAt >= earliest
      ? parent
      : task;
  const isHoldTimer =
    holdTimer != null &&
    holdTimer.due >= earliest - CLOCK_SLOP_MS &&
    holdTimer.due <= latest + CLOCK_SLOP_MS;
  const isLateInput =
    !isHoldTimer &&
    flip.input != null &&
    flip.input.timeStamp >= earliest - CLOCK_SLOP_MS;
  expect(
    isHoldTimer || isLateInput,
    `the held look commits where the hold begins: landing ${JSON.stringify(clock.landings)}, dispatched at ${clock.dispatchedAt}, commit task ${JSON.stringify(task)}, its parent ${JSON.stringify(parent ?? null)}, input ${JSON.stringify(flip.input)}`,
  ).toBe(true);
  // The product sets the deadline. When the page acts on it is the page's. A
  // hold more than a frame late passes only inside a page stall at least that
  // long. A stall past the harness's starvation bound fails by name.
  const due = isHoldTimer ? holdTimer.due : earliest;
  const ranAt = isHoldTimer
    ? (holdTimer.ranAt ?? Number.POSITIVE_INFINITY)
    : flip.at;
  const timerLateMs = ranAt - due;
  if (timerLateMs > FRAME_MS) {
    const after = Math.min(...clock.frames.filter(at => at >= ranAt));
    const marks = [
      Math.max(...clock.frames.filter(at => at <= due)),
      ...clock.frames.filter(at => at > due && at < ranAt),
      Number.isFinite(after) ? after : ranAt,
    ];
    const stallMs = Math.max(...marks.slice(1).map((at, i) => at - marks[i]));
    if (stallMs > FRAME_STARVATION_MS) {
      throw new FrameStarvationError({
        during: `the hold began ${Math.round(timerLateMs)} ms past due`,
        frames: marks.length - 2,
        min: 1,
        longestGapMs: Math.round(stallMs),
      });
    }
    expect(
      timerLateMs,
      `the hold began ${Math.round(timerLateMs)} ms past due, in a page stall of ${Math.round(stallMs)} ms`,
    ).toBeLessThanOrEqual(stallMs);
  }
  const before = states.filter(s => s.t < flip.at);
  const after = states.filter(s => s.t > flip.at);
  expect(before.length).toBeGreaterThan(0);
  expect(before.every(s => !s.interacting && s.other === 0.48)).toBe(true);
  expect(after.length).toBeGreaterThan(0);
  expect(after.every(s => s.interacting && s.other === 0.25)).toBe(true);
  // Reads after the platter's own short fade has finished show it.
  const fadedAt = flip.fadedAt ?? Number.POSITIVE_INFINITY;
  const shown = states.filter(s => s.t > fadedAt);
  if (shown.length === 0) {
    // No read came after the fade ended. Only a stall over the harness's
    // starvation bound explains that; otherwise the fade itself ran late.
    const lastRead = states[states.length - 1].t;
    const marks = [
      flip.at,
      ...clock.frames.filter(at => at > flip.at && at < lastRead),
      lastRead,
    ];
    const stallMs = Math.max(...marks.slice(1).map((at, i) => at - marks[i]));
    if (stallMs > FRAME_STARVATION_MS) {
      throw new FrameStarvationError({
        during: 'the platter faded in',
        frames: marks.length - 2,
        min: 1,
        longestGapMs: Math.round(stallMs),
      });
    }
    throw new Error(
      `The platter's fade ended ${Math.round(fadedAt - flip.at)} ms after the look showed, past the last read at ${Math.round(lastRead - flip.at)} ms.`,
    );
  }
  expect(shown.every(s => s.platter > 0.9)).toBe(true);
  // The platter is the held look: the system pressed overlay, resolved as any
  // element resolves it here.
  const colors = await slider.evaluate(el => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--color-overlay-pressed)';
    el.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      platter: getComputedStyle(el, '::before').backgroundColor,
      expected,
    };
  });
  expect(colors.expected).not.toBe('rgba(0, 0, 0, 0)');
  expect(colors.platter).toBe(colors.expected);
  // The touched indicator keeps its resting size throughout.
  expect(states.every(s => s.touchedScale === restingScale)).toBe(true);
  // At the lift both return.
  await expect
    .poll(async () =>
      slider.evaluate(el => el.hasAttribute('data-interacting')),
    )
    .toBe(false);
  expect(
    await slider.evaluate(
      el => (el.querySelector('[data-page="0"]') as HTMLElement).style.opacity,
    ),
  ).toBe('0.48');
});

test('the old current indicator fades over 0.125 s after a tap and 0.25 s after any other change, on (0, 0, 0.58, 1)', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  // Each opacity transition as it runs, read from the transition itself: the
  // dot goes back to the switch once its fade starts. And each one that ran
  // to its end, with how long it ran.
  await slider.evaluate(el => {
    const runs: Array<{page: number; duration: number; easing: string}> = [];
    const ends: Array<{page: number; duration: number}> = [];
    Object.assign(window, {runs, ends});
    el.addEventListener('transitionrun', event => {
      const dot = event.target as HTMLElement;
      for (const animation of dot.getAnimations()) {
        if (
          animation instanceof CSSTransition &&
          animation.transitionProperty === 'opacity'
        ) {
          const timing = animation.effect?.getTiming();
          // WebKit names this curve by its keyword.
          const easing =
            timing?.easing === 'ease-out'
              ? 'cubic-bezier(0, 0, 0.58, 1)'
              : (timing?.easing ?? '');
          runs.push({
            page: Number(dot.dataset.page),
            duration: Number(timing?.duration),
            easing,
          });
        }
      }
    });
    el.addEventListener('transitionend', event => {
      const {propertyName, elapsedTime, target} = event as TransitionEvent;
      if (propertyName === 'opacity') {
        ends.push({
          page: Number((target as HTMLElement).dataset.page),
          duration: elapsedTime,
        });
      }
    });
  });
  const runsOf = async (index: number) =>
    page.evaluate(
      i =>
        (
          window as unknown as {
            runs: Array<{page: number; duration: number; easing: string}>;
          }
        ).runs
          .filter(run => run.page === i)
          .map(({duration, easing}) => ({duration, easing})),
      index,
    );
  const endsOf = async (index: number) =>
    page.evaluate(
      i =>
        (
          window as unknown as {ends: Array<{page: number; duration: number}>}
        ).ends
          .filter(end => end.page === i)
          .map(end => end.duration),
      index,
    );
  const current = await indicatorCenter(slider, 2);
  await driver.tap({x: current.x + 12, y: current.y});
  await expect.poll(async () => valueNow(slider)).toBe(4);
  await expect
    .poll(async () => runsOf(2))
    .toEqual([{duration: 125, easing: 'cubic-bezier(0, 0, 0.58, 1)'}]);
  await expect.poll(async () => endsOf(2)).toEqual([0.125]);
  await expect.poll(async () => endsOf(3)).toEqual([0.015625]);
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => valueNow(slider)).toBe(5);
  await expect
    .poll(async () => (await runsOf(3)).at(-1))
    .toEqual({duration: 250, easing: 'cubic-bezier(0, 0, 0.58, 1)'});
  await expect.poll(async () => (await endsOf(3)).at(-1)).toBe(0.25);
});

test('after a page change, a held finger dims every other indicator on the switch, the previous current one included, and the lift restores them on it', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  // Each opacity transition that ran to its end, with how long it ran.
  await slider.evaluate(el => {
    const fades: Array<{page: number; duration: number}> = [];
    (window as unknown as {fades: typeof fades}).fades = fades;
    el.addEventListener('transitionend', event => {
      const {propertyName, elapsedTime, target} = event as TransitionEvent;
      if (propertyName === 'opacity') {
        fades.push({
          page: Number((target as HTMLElement).dataset.page),
          duration: elapsedTime,
        });
      }
    });
  });
  const fadesOf = async (index: number) =>
    page.evaluate(
      i =>
        (
          window as unknown as {fades: Array<{page: number; duration: number}>}
        ).fades
          .filter(fade => fade.page === i)
          .map(fade => fade.duration),
      index,
    );
  // End: page 3's indicator fades out over 0.25 s.
  await slider.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => valueNow(slider)).toBe(5);
  await expect.poll(async () => fadesOf(2)).toEqual([0.25]);
  await page.evaluate(() => {
    (window as unknown as {fades: unknown[]}).fades.length = 0;
  });
  // A finger held on the current indicator dims the others, then lifts. Its
  // step past the last page keeps the page.
  const target = await indicatorCenter(slider, 4);
  await driver.play(
    drag(target, {x: target.x + 0.4, y: target.y}, {durationMs: 400, hz: 20}),
  );
  await expect
    .poll(async () =>
      slider.evaluate(el => el.hasAttribute('data-interacting')),
    )
    .toBe(false);
  expect(await valueNow(slider)).toBe(5);
  for (const index of [0, 1, 2, 3]) {
    await expect.poll(async () => fadesOf(index)).toEqual([0.015625, 0.015625]);
  }
});

test('after a page change made while the control is hidden, a held finger dims the previous current indicator on the switch', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  await slider.evaluate(el => {
    const fades: Array<{page: number; duration: number}> = [];
    (window as unknown as {fades: typeof fades}).fades = fades;
    el.addEventListener('transitionend', event => {
      const {propertyName, elapsedTime, target} = event as TransitionEvent;
      if (propertyName === 'opacity') {
        fades.push({
          page: Number((target as HTMLElement).dataset.page),
          duration: elapsedTime,
        });
      }
    });
  });
  const fadesOf = async (index: number) =>
    page.evaluate(
      i =>
        (
          window as unknown as {fades: Array<{page: number; duration: number}>}
        ).fades
          .filter(fade => fade.page === i)
          .map(fade => fade.duration),
      index,
    );
  // End while the control is hidden: no fade can run.
  await slider.evaluate(el => {
    el.style.display = 'none';
    el.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'End',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  // A role locator skips a hidden element; read the attribute directly.
  const hidden = page.locator('[role="slider"]');
  await expect(hidden).toHaveAttribute('aria-valuenow', '5');
  await hidden.evaluate(el => {
    el.style.display = '';
  });
  // A finger held on the current indicator dims the others, then lifts.
  const target = await indicatorCenter(slider, 4);
  await driver.play(
    drag(target, {x: target.x + 0.4, y: target.y}, {durationMs: 400, hz: 20}),
  );
  await expect
    .poll(async () =>
      slider.evaluate(el => el.hasAttribute('data-interacting')),
    )
    .toBe(false);
  await expect.poll(async () => fadesOf(2)).toEqual([0.015625, 0.015625]);
});

test('when a tap or a key slides the window, the old indicator fades for 0.125 s or 0.25 s, not the switch', async ({
  page,
}) => {
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages');
  // Each opacity transition that ran, with how long it ran: a finished
  // transition's transitionend reports its duration.
  await slider.evaluate(el => {
    const fades: Array<{page: number; duration: number}> = [];
    (window as unknown as {fades: typeof fades}).fades = fades;
    el.addEventListener('transitionend', event => {
      const {propertyName, elapsedTime, target} = event as TransitionEvent;
      if (propertyName === 'opacity') {
        fades.push({
          page: Number((target as HTMLElement).dataset.page),
          duration: elapsedTime,
        });
      }
    });
  });
  const fadesOf = async (index: number) =>
    page.evaluate(
      i =>
        (
          window as unknown as {fades: Array<{page: number; duration: number}>}
        ).fades
          .filter(fade => fade.page === i)
          .map(fade => fade.duration),
      index,
    );
  const translateX = async () =>
    slider.evaluate(el => {
      const strip = el.children[0] as HTMLElement;
      return Number.parseFloat(getComputedStyle(strip).translate) || 0;
    });
  // Page 26 of 50 (index 25) sits in the window's last full slot, so the next
  // page slides the window.
  const before = await translateX();
  const current = await indicatorCenter(slider, 25);
  await driver.tap({x: current.x + 12, y: current.y});
  await expect.poll(async () => valueNow(slider)).toBe(27);
  await expect.poll(async () => translateX()).not.toBeCloseTo(before, 0);
  await expect.poll(async () => fadesOf(25)).toEqual([0.125]);
  // A key slides it again: the old indicator fades for 0.25 s. Page 27 also
  // switched on when it became current, so read only the fades after the key.
  await page.evaluate(() => {
    (window as unknown as {fades: unknown[]}).fades.length = 0;
  });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => valueNow(slider)).toBe(28);
  await expect.poll(async () => fadesOf(26)).toEqual([0.25]);
});

test('when the window jumps, a dot that mounts starts at its size in the old window and grows on the slide', async ({
  page,
}) => {
  const {slider} = await open(page, 'lab-pagecontrol--many-pages');
  const scaleOf = async (index: number) =>
    slider.evaluate((el, i) => {
      const dot = el.querySelector(`[data-page="${i}"]`) as HTMLElement | null;
      return dot == null
        ? null
        : Number.parseFloat(getComputedStyle(dot).scale);
    }, index);
  // Page 46 (index 45) is outside the window, so it is not rendered yet.
  expect(await scaleOf(45)).toBeNull();
  // Read at the commit that mounts it: the size its slide starts from, and
  // that slide's start. Neither moves with a late frame or a long task.
  await slider.evaluate(el => {
    const strip = el.children[0] as HTMLElement;
    const slideOf = (target: HTMLElement) =>
      target
        .getAnimations()
        .reduce<Animation | null>(
          (last, a) =>
            last == null || Number(a.startTime) >= Number(last.startTime)
              ? a
              : last,
          null,
        );
    const observer = new MutationObserver(() => {
      const dot = el.querySelector<HTMLElement>('[data-page="45"]');
      if (dot == null) {
        return;
      }
      observer.disconnect();
      (
        window as unknown as {
          mounted?: {scale: number; growsAt: number; slidesAt: number};
        }
      ).mounted = {
        scale: Number.parseFloat(
          String(
            (slideOf(dot)?.effect as KeyframeEffect | null)?.getKeyframes()[0]
              ?.scale,
          ),
        ),
        growsAt: Number(slideOf(dot)?.startTime),
        slidesAt: Number(slideOf(strip)?.startTime),
      };
    });
    observer.observe(el, {childList: true, subtree: true});
  });
  await slider.focus();
  await page.keyboard.press('End');
  await expect.poll(async () => valueNow(slider)).toBe(50);
  // It mounted at its old-window size, 0, and grows with the slide's start.
  const mounted = await page.evaluate(
    () =>
      (
        window as unknown as {
          mounted?: {scale: number; growsAt: number; slidesAt: number};
        }
      ).mounted,
  );
  expect(mounted?.scale).toBe(0);
  expect(Number.isFinite(mounted?.slidesAt)).toBe(true);
  expect(mounted?.growsAt).toBe(mounted?.slidesAt);
  await expect.poll(async () => scaleOf(45)).toBeCloseTo(DOT_SCALE, 3);
});

test('a windowed control slides one slot 50 ms after the change, on a critically damped spring', async ({
  page,
}) => {
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages');
  // Page 26 of 50 from page 1: the window starts at page 18; page 26 (index
  // 25) is in its last full slot.
  const translateX = () =>
    slider.evaluate(el => {
      const strip = el.children[0] as HTMLElement;
      return Number.parseFloat(getComputedStyle(strip).translate) || 0;
    });
  expect(await translateX()).toBeCloseTo(-18 * PITCH, 0);
  const current = await indicatorCenter(slider, 25);
  await slider.evaluate(el => {
    const strip = el.children[0] as HTMLElement;
    const trace: Array<{t: number; x: number; page: number}> = [];
    const w = window as unknown as {
      slide: typeof trace;
      changedAt?: number;
      liftTask?: boolean;
      slideCurve?: {
        start: number;
        commitAt: number;
        duration: number;
        xs: number[][];
        inLiftTask: boolean;
      };
    };
    w.slide = trace;
    const start = performance.now();
    // The slide's own animation, read at the change's commit. Its start and
    // its curve sit on the document timeline, which a late frame cannot move.
    const observer = new MutationObserver(() => {
      const animation = strip.getAnimations().at(-1);
      if (animation == null) {
        return;
      }
      observer.disconnect();
      const effect = animation.effect as KeyframeEffect;
      w.slideCurve = {
        inLiftTask: w.liftTask === true,
        commitAt: performance.now() - start,
        start: Number(animation.startTime) - start,
        duration: Number(effect.getComputedTiming().duration),
        xs: effect
          .getKeyframes()
          .map(k => [
            Number(k.computedOffset),
            Number.parseFloat(String(k.translate)),
          ]),
      };
    });
    observer.observe(el, {
      attributes: true,
      attributeFilter: ['aria-valuenow'],
    });
    // The change is dated when the lift that makes it begins, at its first
    // event: the pointer's, then the touch's. The page commits the change in
    // that task. The first frame that shows it and the end of the task both
    // come late on a loaded runner, so neither dates it.
    const liftEnd = new MessageChannel();
    liftEnd.port1.onmessage = () => {
      w.liftTask = false;
    };
    for (const type of ['pointerup', 'touchend']) {
      addEventListener(
        type,
        () => {
          if (w.changedAt == null) {
            w.changedAt = performance.now() - start;
            // This message runs as a later task, which ends the lift's task.
            w.liftTask = true;
            liftEnd.port2.postMessage(null);
          }
        },
        {capture: true, once: true},
      );
    }
    const sample = () => {
      trace.push({
        t: performance.now() - start,
        x: Number.parseFloat(getComputedStyle(strip).translate) || 0,
        page: Number(el.getAttribute('aria-valuenow')),
      });
      if (performance.now() - start < 1500) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });
  await driver.tap({x: current.x + 12, y: current.y});
  await expect.poll(async () => valueNow(slider)).toBe(27);
  // The trace holds the slide once a sample sits on the next slot.
  await expect
    .poll(() =>
      slider.evaluate(
        (_, pitch) =>
          (window as unknown as {slide: Array<{x: number}>}).slide.some(
            s => Math.abs(s.x + 19 * pitch) < 0.3,
          ),
        PITCH,
      ),
    )
    .toBe(true);
  const {trace, changedAt, curve} = await slider.evaluate(() => {
    const w = window as unknown as {
      slide: Array<{t: number; x: number; page: number}>;
      changedAt?: number;
      slideCurve?: {
        start: number;
        commitAt: number;
        duration: number;
        xs: number[][];
        inLiftTask: boolean;
      };
    };
    return {
      trace: w.slide,
      changedAt: w.changedAt ?? NaN,
      curve: w.slideCurve,
    };
  });
  if (curve == null) {
    throw new Error('The change started no slide on the strip.');
  }
  expect(curve.inLiftTask, "the change commits in the lift's own task").toBe(
    true,
  );
  const startedAt = curve.start;
  expect(startedAt - changedAt).toBeGreaterThan(30);
  // The slide starts 50 ms after the commit in the lift's own task. A lift
  // task longer than the harness's starvation bound means a busy page.
  const liftTaskMs = curve.commitAt - changedAt;
  if (startedAt - changedAt >= 120 && liftTaskMs > FRAME_STARVATION_MS) {
    throw new FrameStarvationError({
      during: `the lift's task ran ${Math.round(liftTaskMs)} ms to its commit`,
      frames: 0,
      min: 1,
      longestGapMs: Math.round(liftTaskMs),
    });
  }
  expect(startedAt - changedAt).toBeLessThan(120);
  // Monotonic to the next slot, settled within ~0.35 s of starting.
  const xs = trace.filter(s => s.t >= startedAt).map(s => s.x);
  for (let i = 1; i < xs.length; i++) {
    expect(xs[i]).toBeLessThanOrEqual(xs[i - 1] + 0.01);
  }
  const settled = curve.xs.find(([, x]) => Math.abs(x + 19 * PITCH) < 0.3);
  expect(settled).toBeDefined();
  expect((settled?.[0] ?? Infinity) * curve.duration).toBeLessThan(350);
  // Page 27 (index 26) grows from its 7.33 px edge size to full: 9.67 px, a
  // 10 px box at scale 0.967.
  expect(
    Number.parseFloat(
      await slider.evaluate(
        el =>
          getComputedStyle(el.querySelector('[data-page="26"]') as HTMLElement)
            .scale,
      ),
    ),
  ).toBeCloseTo(0.967, 3);
});

test('RTL: a scrub toward the left goes forward and the window slides the other way', async ({
  page,
}) => {
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages', {
    rtl: true,
  });
  expect(await slider.evaluate(el => getComputedStyle(el).direction)).toBe(
    'rtl',
  );
  const stripX = () =>
    slider.evaluate(el =>
      Number.parseFloat(
        getComputedStyle(el.children[0] as HTMLElement).translate,
      ),
    );
  // Page 26: the window starts at page 18, shifted toward the right in RTL.
  expect(await stripX()).toBeCloseTo(18 * PITCH, 0);
  const current = await indicatorCenter(slider, 25);
  const box = await slider.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  // The next pages sit to the left in RTL. Page 26 is the window's last full
  // slot. So a scrub past it toward the left runs into the content's edge and
  // jogs forward, as it does toward the right in LTR. Held 6 px past the edge,
  // about one page a second, the jog steps once about 1 s after the finger
  // crosses it. It steps again about 1 s later, after the lift.
  await driver.play(
    drag(
      current,
      {x: box.x + 14 - 6, y: current.y},
      {durationMs: 300, restMs: 1400},
    ),
  );
  await expect.poll(async () => valueNow(slider)).toBe(27);
  // The window followed one slot, toward the right.
  await expect.poll(stripX, {timeout: 2000}).toBeCloseTo(19 * PITCH, 0);
});

/**
 * At most a jump: `property` holds its start value, then its end value, and
 * never one in between. A cross-fade moves the track at the bottom of its
 * dip.
 */
const holdsOrJumps = (
  keyframes: ReadonlyArray<Record<string, unknown>>,
  property: string,
): boolean => {
  const values = new Set<string>();
  for (const k of keyframes) {
    const v = k[property];
    if (typeof v === 'string' || typeof v === 'number') {
      values.add(String(v));
    }
  }
  return values.size <= 2;
};

test('under Reduce Motion nothing slides or scales, the current indicator and a held finger’s platter change at once, and no fade runs over 200 ms on a coarse pointer (design:reduced-motion DR1, DR2)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages');
  // The phone projects have a coarse pointer, where the cross-fade applies.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  const stripX = () =>
    slider.evaluate(el =>
      Number.parseFloat(
        getComputedStyle(el.children[0] as HTMLElement).translate,
      ),
    );
  const longestFade = () =>
    slider.evaluate(el =>
      Math.max(
        0,
        ...Array.from(el.querySelectorAll<HTMLElement>('[data-page]')).flatMap(
          dot =>
            getComputedStyle(dot)
              .transitionDuration.split(',')
              .map(d =>
                d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000,
              ),
        ),
      ),
    );
  // A tap that moves the window: page 26 to 27. Armed before the tap, the page
  // holds every animation under the control once one has run 60 ms, past the
  // window's 50 ms delay.
  const current = await indicatorCenter(slider, 25);
  const hold = await armHold(page, slider, {
    judges: {target: slider.locator(':scope > *').first(), property: 'opacity'},
    minProgressMs: 60,
  });
  await driver.tap({x: current.x + 12, y: current.y});
  await expect.poll(async () => valueNow(slider)).toBe(27);
  // Every animation is an opacity fade of at most 200 ms. No translate or
  // scale travels.
  const held = await hold.held();
  // The window's own cross-fade is among them: the animator's, not a CSS
  // transition.
  expect(held.some(a => a.kind === 'Animation')).toBe(true);
  for (const a of held) {
    // Nothing travels: the strip and the dots hold, then jump.
    for (const property of ['translate', 'scale', 'transform']) {
      expect(holdsOrJumps(a.keyframes, property)).toBe(true);
    }
    expect(a.curveEndMs).toBeLessThanOrEqual(200);
  }
  await releaseAnimations(page);
  // The window still keeps the page in view.
  await expect.poll(stripX, {timeout: 2000}).toBeCloseTo(-19 * PITCH, 0);
  expect(await longestFade()).toBeLessThanOrEqual(200);
  // A change that is not a tap (a key) changes the current indicator at once.
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => valueNow(slider)).toBe(28);
  expect(await longestFade()).toBe(0);
  // A held finger's platter shows at once, and fades out on the lift.
  const finger = await indicatorCenter(slider, 27);
  const frames = slider.evaluate(
    el =>
      new Promise<{held: boolean; opacity: number}[]>(resolve => {
        const seen: {held: boolean; opacity: number}[] = [];
        const tick = () => {
          seen.push({
            held: el.hasAttribute('data-interacting'),
            opacity: Number(getComputedStyle(el, '::before').opacity),
          });
          const held = seen.map(frame => frame.held);
          const lifted = held.lastIndexOf(true);
          if (lifted !== -1 && seen.length - lifted > 15) {
            resolve(seen);
          } else if (seen.length < 180) {
            requestAnimationFrame(tick);
          } else {
            resolve(seen);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await driver.play(
    drag(finger, {x: finger.x + 1, y: finger.y}, {durationMs: 400, restMs: 0}),
  );
  const seen = await frames;
  const shown = seen.findIndex(frame => frame.held);
  const lifted = seen.map(frame => frame.held).lastIndexOf(true) + 1;
  expect(shown).toBeGreaterThan(-1);
  expect(seen[shown].opacity).toBe(1);
  expect(lifted).toBeLessThan(seen.length);
  expect(seen[lifted].opacity).toBeGreaterThan(0.5);
  const platterFade = await slider.evaluate(el =>
    Math.max(
      ...getComputedStyle(el, '::before')
        .transitionDuration.split(',')
        .map(d =>
          d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000,
        ),
    ),
  );
  expect(platterFade).toBeGreaterThan(0);
  expect(platterFade).toBeLessThanOrEqual(200);
});

test('busy main thread: a window slide finishes on time through a 600 ms block', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's screencast clock is not the page's (harness README); the simulator clip covers it",
  );
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages');
  const strip = slider.locator(':scope > *').first();
  // A chip on the strip between two dots, above them: the window shows it
  // before and after the slide, and no dot's scale reaches it. The strip's
  // translate makes it the chip's containing block, so the chip moves with it.
  await strip.evaluate(
    (el, {left, rgb}) => {
      const chip = document.createElement('div');
      chip.setAttribute('data-harness-marker-chip', '');
      chip.style.cssText = `position:absolute;left:${left}px;top:0;width:12px;height:6px;background:rgb(${rgb.join(',')})`;
      el.append(chip);
    },
    {left: 23.5 * PITCH - 6, rgb: MARKER_RGB},
  );
  // Before the slide, so the control is on the compositor first.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  // The page blocks once the old dot's fade has run a frame, just before the
  // slide starts on its own start time. A round trip from here would start
  // the block later in the slide, or after it.
  const blocking = blockMainThread(page, 600, {during: strip});
  const current = await indicatorCenter(slider, 25);
  await driver.tap({x: current.x + 12, y: current.y});
  const busy = await blocking;
  await waitForRest(strip);
  // Where the slide ends, read from the page once it rests.
  const settledAt = await strip.evaluate(el => {
    const chip = el.querySelector('[data-harness-marker-chip]') as Element;
    return chip.getBoundingClientRect().x;
  });
  const frames = await cast.stop();
  // Only the frames the proof reads are decoded, each once for both colors.
  const [tracked, control] = await trackMarkers(
    page,
    frames.filter(f => f.t <= busy.to + BUSY_PROOF_LOOKAROUND_MS),
    {colors: [MARKER_RGB, CONTROL_RGB]},
  );
  const proof = busyWindowProof(tracked, busy, {
    axis: 'x',
    settledWithinSteps: 2,
    settledAt,
    minJudgedFrames: MIN_JUDGED_FRAMES,
    control,
  });
  // The compositor carried the slide to the next slot during the block. It
  // moved on every frame, and a frame inside the block shows it at rest.
  expect(proof.verdict.failures, proof.summary).toEqual([]);
  expect(proof.monotonic, proof.summary).toBe(true);
  const atRest = tracked.find(
    f =>
      f.box != null &&
      f.t >= busy.from &&
      f.t <= busy.to &&
      Math.abs(f.box.x - settledAt) <= 1,
  );
  expect(atRest, proof.summary).toBeDefined();
  expect(
    await strip.evaluate(el =>
      Number.parseFloat(getComputedStyle(el).translate),
    ),
  ).toBeCloseTo(-19 * PITCH, 0);
});

test('on an Android phone (no -webkit-touch-callout) a finger scrubs: one touch model, no platform idiom', async ({
  page,
}) => {
  const {slider, driver} = await open(page);
  expect(
    await page.evaluate(() => ({
      coarse: matchMedia('(pointer: coarse)').matches,
      ios: CSS.supports('(-webkit-touch-callout: none)'),
    })),
  ).toEqual({coarse: true, ios: false});
  const from = await indicatorCenter(slider, 2);
  const to = await indicatorCenter(slider, 4);
  await driver.play(drag(from, to, {durationMs: 600, restMs: 150}));
  await expect.poll(async () => valueNow(slider)).toBe(5);
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('a long control is the full row of pages, cropped, every dot at full size', async ({
    page,
  }) => {
    const {slider} = await open(page, 'lab-pagecontrol--many-pages');
    // A mouse: the context's pointer must not still match coarse.
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    const facts = await slider.evaluate(el => {
      const dots = Array.from(el.querySelectorAll<HTMLElement>('[data-page]'));
      return {
        count: dots.length,
        scales: new Set(dots.map(d => getComputedStyle(d).scale)).size,
        overflow: getComputedStyle(el).overflow,
        width: el.getBoundingClientRect().width,
      };
    });
    expect(facts).toMatchObject({count: 50, scales: 1, overflow: 'hidden'});
    expect(facts.width).toBeCloseTo(161.3, 0);
  });

  // The tap and the scrub take every pointer. The touch presentation (the
  // platter, the window, the fades) stays on a coarse one.
  test('a click on the trailing side of the current indicator moves one page forward, the leading side one back, once each (spec:AST-094 FR43)', async ({
    page,
  }) => {
    const {slider} = await open(page);
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    // aria-valuenow counts from 1; the dots from 0.
    const start = (await valueNow(slider)) - 1;
    const last = Number(await slider.getAttribute('aria-valuemax')) - 1;
    const forward = start < last;
    const from = await indicatorCenter(slider, start);
    await page.mouse.click(from.x + (forward ? 12 : -12), from.y);
    const next = start + (forward ? 1 : -1);
    await expect.poll(() => valueNow(slider)).toBe(next + 1);
    // The click the browser sends after the press pages nothing more.
    await page.waitForTimeout(150);
    expect(await valueNow(slider)).toBe(next + 1);
    const back = await indicatorCenter(slider, next);
    await page.mouse.click(back.x + (forward ? -12 : 12), back.y);
    await expect.poll(() => valueNow(slider)).toBe(start + 1);
  });

  test('a drag across the dots scrubs: the page is the dot under the pointer (spec:AST-094 FR43)', async ({
    page,
  }) => {
    const {slider} = await open(page);
    // aria-valuenow counts from 1; the dots from 0.
    const last = Number(await slider.getAttribute('aria-valuemax')) - 1;
    expect(last).toBeGreaterThanOrEqual(2);
    const mid = Math.floor(last / 2);
    const first = await indicatorCenter(slider, 0);
    const end = await indicatorCenter(slider, last);
    const middle = await indicatorCenter(slider, mid);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, {steps: 12});
    await expect.poll(() => valueNow(slider)).toBe(last + 1);
    await page.mouse.move(middle.x, middle.y, {steps: 8});
    await expect.poll(() => valueNow(slider)).toBe(mid + 1);
    await page.mouse.up();
    expect(
      await slider.evaluate(el => el.hasAttribute('data-interacting')),
    ).toBe(false);
  });

  test('on a cropped long row, a drag holds the row still, and the page is the dot under the pointer until the lift', async ({
    page,
  }) => {
    const {slider} = await open(page, 'lab-pagecontrol--many-pages');
    const stripX = () =>
      slider.evaluate(
        el =>
          Number.parseFloat(
            getComputedStyle(el.children[0] as HTMLElement).translate,
          ) || 0,
      );
    // aria-valuenow counts from 1; the dots from 0.
    const start = (await valueNow(slider)) - 1;
    const rest = await stripX();
    const from = await indicatorCenter(slider, start);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      const x = from.x + i * PITCH;
      await page.mouse.move(x, from.y, {steps: 3});
      const under = await slider.evaluate((el, at) => {
        let nearest = -1;
        let distance = Infinity;
        for (const dot of el.querySelectorAll<HTMLElement>('[data-page]')) {
          const box = dot.getBoundingClientRect();
          const d = Math.abs(box.left + box.width / 2 - at);
          if (d < distance) {
            distance = d;
            nearest = Number(dot.dataset.page);
          }
        }
        return nearest;
      }, x);
      await expect.poll(() => valueNow(slider)).toBe(under + 1);
      expect(await stripX()).toBe(rest);
    }
    await page.mouse.up();
    // At the lift the row re-centres on the page.
    await expect.poll(stripX).not.toBe(rest);
  });

  test('a held press shows no platter and dims nothing: the held look is the touch presentation', async ({
    page,
  }) => {
    const {slider} = await open(page);
    const look = () =>
      slider.evaluate(el => ({
        interacting: el.hasAttribute('data-interacting'),
        background: getComputedStyle(el).backgroundColor,
        opacities: Array.from(
          el.querySelectorAll<HTMLElement>('[data-page]'),
        ).map(dot => getComputedStyle(dot).opacity),
      }));
    const before = await look();
    const at = await indicatorCenter(slider, await valueNow(slider));
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    // Past UIPageControl's 155 ms interaction delay.
    await page.waitForTimeout(400);
    const held = await look();
    await page.mouse.up();
    expect(held).toEqual({...before, interacting: false});
  });

  for (const [story, count] of [
    ['lab-pagecontrol--default', 5],
    ['lab-pagecontrol--many-pages', 9],
  ] as const) {
    test(`every indicator paints round, as wide as it is tall (${story}, a mouse)`, async ({
      page,
    }) => {
      const {slider} = await open(page, story);
      // A mouse: the context's pointer must not still match coarse.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      const dots = await paintedDots(page, slider);
      expect(dots.length).toBeGreaterThanOrEqual(count);
      for (const dot of dots) {
        expect(
          Math.abs(dot.width - dot.height),
          JSON.stringify(dots),
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});

test('the page can scroll under the control (touch-action)', async ({page}) => {
  const {slider} = await open(page);
  // The scrub's horizontal pan keeps the vertical axis for the page.
  expect(await slider.evaluate(el => getComputedStyle(el).touchAction)).toBe(
    'pan-y pinch-zoom',
  );
});

// A recognizer that competes with the page's scroll decides within 10 px. So
// a swipe that starts vertical on the dots is the page's: it scrolls, and the
// page indicator does not change.
test("a vertical swipe that starts on the dots pages nothing and leaves every move to the page's scroll", async ({
  page,
  browserName,
}) => {
  const {slider, driver} = await open(page);
  // Room to scroll, the control well inside the viewport, and whether each
  // move reached the page cancelled (read after every listener).
  await page.evaluate(() => {
    const above = document.createElement('div');
    above.style.height = '420px';
    document.body.insertBefore(above, document.body.firstChild);
    const below = document.createElement('div');
    below.style.height = '3000px';
    document.body.appendChild(below);
    window.scrollTo(0, 0);
    const log = window as unknown as {cancelledMoves: boolean[]};
    log.cancelledMoves = [];
    addEventListener(
      'touchmove',
      event => log.cancelledMoves.push(event.defaultPrevented),
      {passive: true},
    );
  });
  const pageBefore = await slider.getAttribute('aria-valuenow');
  const from = await indicatorCenter(slider, 3);
  await driver.play(
    drag(from, {x: from.x + 2, y: from.y - 300}, {durationMs: 500, hz: 60}),
  );
  await page.waitForTimeout(400);
  expect(await slider.getAttribute('aria-valuenow')).toBe(pageBefore);
  const cancelled = await page.evaluate(
    () => (window as unknown as {cancelledMoves: boolean[]}).cancelledMoves,
  );
  expect(cancelled.length).toBeGreaterThan(5);
  expect(cancelled.some(Boolean)).toBe(false);
  if (browserName === 'chromium') {
    // Injected touches scroll natively only in Chromium (harness README).
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  }
});

/**
 * The painted size of every indicator, in device pixels. The page decodes the
 * control's screenshot and reads each dark run across its middle row. It also
 * reads the dark run down through that run's centre. Runs cut by the
 * screenshot's edge are left out.
 */
async function paintedDots(page: Page, slider: Locator) {
  const png = await slider.screenshot();
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const g = canvas.getContext('2d');
    if (g == null) {
      throw new Error('no 2d context');
    }
    g.drawImage(img, 0, 0);
    const {data, width, height} = g.getImageData(0, 0, img.width, img.height);
    const dark = (x: number, y: number) => data[(y * width + x) * 4] < 200;
    const cy = Math.floor(height / 2);
    const dots: Array<{width: number; height: number}> = [];
    for (let x = 0; x < width;) {
      if (!dark(x, cy)) {
        x++;
        continue;
      }
      let x1 = x;
      while (x1 < width && dark(x1, cy)) {
        x1++;
      }
      const mid = (x + x1) >> 1;
      let y0 = cy;
      while (y0 > 0 && dark(mid, y0 - 1)) {
        y0--;
      }
      let y1 = cy;
      while (y1 < height - 1 && dark(mid, y1 + 1)) {
        y1++;
      }
      if (x > 0 && x1 < width) {
        dots.push({width: x1 - x, height: y1 - y0 + 1});
      }
      x = x1;
    }
    return dots;
  }, png.toString('base64'));
}

for (const [story, count] of [
  ['lab-pagecontrol--default', 5],
  // The window's two outermost dots overhang the control's box by a pixel or
  // two, so the screenshot cuts them.
  ['lab-pagecontrol--many-pages', 8],
] as const) {
  test(`every indicator paints round, as wide as it is tall (${story}, a finger)`, async ({
    page,
  }) => {
    const {slider} = await open(page, story);
    const dots = await paintedDots(page, slider);
    expect(dots.length).toBeGreaterThanOrEqual(count);
    for (const dot of dots) {
      expect(
        Math.abs(dot.width - dot.height),
        JSON.stringify(dots),
      ).toBeLessThanOrEqual(1);
    }
  });
}

test('storyboard: a tap on the trailing side @storyboard', async ({page}) => {
  const {slider, driver} = await open(page);
  const current = await indicatorCenter(slider, 2);
  const at = {x: current.x + 12, y: current.y};
  const box = await slider.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const storyboard = await touchStoryboard(
    page,
    driver,
    drag(at, {x: at.x + 0.4, y: at.y}, {durationMs: 100, hz: 20}),
    {
      name: 'page-control-tap',
      clip: {
        x: box.x - 8,
        y: box.y - 8,
        width: box.width + 16,
        height: box.height + 16,
      },
      measure: async () => ({page: await valueNow(slider)}),
    },
  );
  await storyboard.write(test.info());
  const pages = storyboard.frames.map(f => (f.data as {page: number}).page);
  // Page 3 until the lift, page 4 after it.
  expect(pages[0]).toBe(3);
  expect(pages.slice(0, -1).every(p => p === 3)).toBe(true);
  expect(pages[pages.length - 1]).toBe(4);
});

test('storyboard: a scrub across the control @storyboard', async ({page}) => {
  const {slider, driver} = await open(page);
  const from = await indicatorCenter(slider, 2);
  const end = await indicatorCenter(slider, 4);
  const box = await slider.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  const storyboard = await touchStoryboard(
    page,
    driver,
    drag(from, {x: end.x + 4, y: from.y}, {durationMs: 600, hz: 10}),
    {
      name: 'page-control-scrub',
      clip: {
        x: box.x - 8,
        y: box.y - 8,
        width: box.width + 16,
        height: box.height + 16,
      },
      measure: async () => ({
        page: await valueNow(slider),
        interacting: await slider.evaluate(el =>
          el.hasAttribute('data-interacting'),
        ),
      }),
    },
  );
  await storyboard.write(test.info());
  const pages = storyboard.frames.map(f => (f.data as {page: number}).page);
  // Pages only move forward, one indicator at a time, and end on page 5.
  for (let i = 1; i < pages.length; i++) {
    expect(pages[i] - pages[i - 1]).toBeGreaterThanOrEqual(0);
    expect(pages[i] - pages[i - 1]).toBeLessThanOrEqual(1);
  }
  expect(pages[pages.length - 1]).toBe(5);
});

test('storyboard: the window slides one slot @storyboard', async ({page}) => {
  const {slider, driver} = await open(page, 'lab-pagecontrol--many-pages');
  const current = await indicatorCenter(slider, 25);
  const box = await slider.boundingBox();
  if (box == null) {
    throw new Error('no control');
  }
  // Armed before the tap, the page holds the change's motion as it starts,
  // however late the test reads it. That motion is the old indicator's fade
  // and the slide, which starts 50 ms after the change.
  const hold = await armHold(page, slider, {
    judges: [
      {target: slider.locator(':scope > *').first(), property: 'translate'},
      {target: slider.locator('[data-page="26"]'), property: 'scale'},
    ],
  });
  await driver.tap({x: current.x + 12, y: current.y});
  const held = await hold.held();
  const {storyboard} = await animationStoryboard(page, {
    name: 'page-control-window-slide',
    held,
    clip: {
      x: box.x - 24,
      y: box.y - 8,
      width: box.width + 48,
      height: box.height + 16,
    },
    measure: async () =>
      slider.evaluate(el => ({
        x: Number.parseFloat(
          getComputedStyle(el.children[0] as HTMLElement).translate,
        ),
        grow: Number.parseFloat(
          getComputedStyle(el.querySelector('[data-page="26"]') as HTMLElement)
            .scale,
        ),
      })),
  });
  await storyboard.write(test.info());
  const frames = storyboard.frames.map(
    f => f.data as {x: number; grow: number},
  );
  // The strip moves one slot left without overshoot while the new current
  // indicator grows from its edge size (0.7588) to full.
  for (let i = 1; i < frames.length; i++) {
    expect(frames[i].x).toBeLessThanOrEqual(frames[i - 1].x + 0.01);
    expect(frames[i].grow).toBeGreaterThanOrEqual(frames[i - 1].grow - 0.001);
  }
  expect(frames[frames.length - 1].x).toBeCloseTo(-19 * PITCH, 0);
  expect(frames[0].grow).toBeLessThan(0.9);
  // Full size: 9.67 px, a 10 px box at scale 0.967.
  expect(frames[frames.length - 1].grow).toBeCloseTo(0.967, 2);
});
