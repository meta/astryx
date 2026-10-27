// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorder.interaction.browser.spec.ts
 * @input The built List "Reorderable", "Reorder With Pinned Rows" and
 *   "Reorder Long List" stories in the touch phone context, the interaction
 *   harness, and the reorder values of the UIKit constants table
 *   (motion/uikit/reorder.ts)
 * @output Interaction and animation proofs of a List with `reorderable`
 *   (spec:AST-103) in the drag's stationary-rows look
 *   (design:ordered-collection-reordering), on a touch screen that is not
 *   iOS: a finger held still on a handle picks the row up, which dims in
 *   place while an aria-hidden preview with the same emphasis and no
 *   elevation follows, and the drop moves it; a flick on a handle scrolls instead; the preview follows the finger
 *   one to one and stops at the list's end while the row stays put; the rows
 *   stay still during the drag while the insertion line marks each gap the
 *   finger reaches; the drop glides the row from where its preview was, and
 *   the rows it passed from their old places, on the shared settle spring
 *   from rest,
 *   even from a finger that lifts moving (told apart from a glide that took
 *   the release velocity); a cancelled drag restores everything at once and
 *   commits nothing; the page autoscrolls by whole points every 20 ms near
 *   the edge; a second finger does not break the drag; a pinch that starts
 *   on a handle zooms; the drop's glides keep moving while the main thread
 *   is blocked; a drag does no Layout or Paint per move; a mouse drags at
 *   once with no motion; under Reduce Motion the rows stay still during the
 *   drag and the drop and a key move cross-fade in place within 200 ms; in
 *   RTL the handle is on the left and the drag keeps x; a focused handle
 *   shows one whole ring, clear of its lines; it keeps a small control's
 *   size while a finger's target reaches 44 pt, short of the next handle's,
 *   and makes its row no taller; a held finger locks text selection on the handle
 *   until the lift, and a mouse sees a plain button's styles; a pinned first
 *   row bounds a drag; storyboards of a drag and a drop. Reorder mode's own
 *   proofs (keys, a mouse click, taps alone, start(key) and the hint) are in
 *   ListReorderMode.interaction.browser.spec.ts
 * @position Interaction evidence for List/listReorderEngine.tsx,
 *   List/ListReorderTouch.ts and List/ListReorderHandle.tsx
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  animationStoryboard,
  busyWindowProof,
  compareCurve,
  countBetween,
  drag,
  flick,
  holdAnimations,
  markElement,
  merge,
  openStory,
  pinch,
  releaseAnimations,
  releaseVelocity,
  seekAnimations,
  startScreencast,
  tap,
  timeline,
  touchDriver,
  touchStoryboard,
  trackMarker,
  traceRendering,
  withStorybook,
  writeEvidence,
  type BusyWindow,
  type Point,
  type TouchEventStep,
} from '@astryxdesign/interaction-harness';
import {solveSpring, toSpring} from '../../motion/spring';
import {reorder} from '../../motion/uikit/reorder';
import {springs} from '../../motion/uikit/springs';
import {autoscrollStep} from '../reorderModel';

const storybook = withStorybook(test);

const STORY = 'core-list--reorderable';
const LONG_STORY = 'core-list--reorder-long-list';
const PINNED_STORY = 'core-list--reorder-with-pinned-rows';
const ROWS = ['Inbox', 'Sent', 'Drafts', 'Archive', 'Spam', 'Trash'];
const HOLD_MS = reorder.claim.delayMs + 80;
/**
 * The list's rows, without the drag's preview and insertion line: inert,
 * aria-hidden ghosts of the list (`data-astryx-leaving`).
 */
const ROW = '#storybook-root li:not([data-astryx-leaving])';
/** The dragged row's preview, which follows the finger. */
const PREVIEW = '[data-astryx-reorder-preview]';
/** The insertion line at the drop position. */
const LINE = '[data-astryx-reorder-line]';

const row = (page: Page, label: string) =>
  page.locator(ROW).filter({hasText: label}).first();

const handle = (page: Page, label: string) =>
  page.getByRole('button', {name: `Reorder ${label}`, exact: true});

const labels = async (page: Page) =>
  page
    .locator(ROW)
    .evaluateAll(rows => rows.map(element => element.textContent ?? ''));

/** Each row's top on screen, by label. */
const rowTops = async (page: Page): Promise<Record<string, number>> =>
  page.locator(ROW).evaluateAll(rows => {
    const tops: Record<string, number> = {};
    for (const element of rows) {
      tops[element.textContent?.trim() ?? ''] =
        element.getBoundingClientRect().top;
    }
    return tops;
  });

const translateY = async (element: Locator) =>
  element.evaluate(el => {
    const value = getComputedStyle(el).translate;
    if (value === 'none' || value === '') {
      return 0;
    }
    const [, y = '0px'] = value.split(' ');
    return Number.parseFloat(y);
  });

const topOf = async (element: Locator) =>
  element.evaluate(el => el.getBoundingClientRect().top);

async function centerOf(element: Locator): Promise<Point> {
  const box = await element.boundingBox();
  if (box == null) {
    throw new Error('no box');
  }
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}

/** Distance between two consecutive rows' tops, and a row's height. */
async function pitchOf(page: Page): Promise<{pitch: number; height: number}> {
  return row(page, ROWS[0]).evaluate(el => {
    const next = el.nextElementSibling as HTMLElement | null;
    const height = (el as HTMLElement).offsetHeight;
    return {
      pitch:
        next == null ? height : next.offsetTop - (el as HTMLElement).offsetTop,
      height,
    };
  });
}

/**
 * Opens a story on a touch screen: Chromium's touch emulation is a coarse
 * pointer, and UIKit's motion is the same on every touch screen.
 */
async function open(page: Page, story = STORY) {
  await openStory(page, storybook(), story);
  const touch = await page.evaluate(
    () => matchMedia('(pointer: coarse)').matches,
  );
  test.skip(!touch, 'the touch reorder runs on a touch screen');
  await expect(
    handle(page, story === LONG_STORY ? 'Item 1' : 'Inbox'),
  ).toBeVisible();
}

const waitForRest = async (page: Page) =>
  expect
    .poll(async () =>
      page.evaluate(
        () =>
          document.getAnimations().filter(a => a.playState === 'running')
            .length,
      ),
    )
    .toBe(0);

const tableProgress = (duration: number) => {
  const curve = solveSpring(toSpring({duration, bounce: 0}), {from: 0, to: 1});
  return {
    at: (ms: number) => curve.value(ms / 1000),
    settleMs: curve.settleTime(0.001) * 1000,
  };
};

test('a finger held still on a handle picks the row up: it dims in place, a preview with the same emphasis follows, and the drop moves it', async ({
  page,
}) => {
  await open(page);
  const {pitch} = await pitchOf(page);
  const inbox = row(page, 'Inbox');
  const opacity = async () =>
    Number(await inbox.evaluate(el => getComputedStyle(el).opacity));
  const from = await centerOf(handle(page, 'Inbox'));
  const driver = await touchDriver(page);
  const held: {
    value?: {
      opacity: number;
      preview: {
        background: string;
        hidden: string | null;
        opacity: number;
        shadow: string;
      } | null;
    };
  } = {};
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y + 1.6 * pitch},
      {
        holdMs: HOLD_MS,
        durationMs: 300,
        restMs: 150,
      },
    ),
    {
      onEvent: async (step: TouchEventStep) => {
        if (
          step.type === 'touchMove' &&
          held.value == null &&
          step.t > HOLD_MS + 100
        ) {
          held.value = {
            opacity: await opacity(),
            preview: await page.evaluate(selector => {
              const preview = document.querySelector<HTMLElement>(selector);
              return preview == null
                ? null
                : {
                    background: getComputedStyle(preview).backgroundColor,
                    hidden: preview.getAttribute('aria-hidden'),
                    opacity: Number(getComputedStyle(preview).opacity),
                    shadow: getComputedStyle(preview).boxShadow,
                  };
            }, PREVIEW),
          };
        }
      },
    },
  );
  // While it moves, the row stays in its place and its preview follows the
  // finger, hidden from assistive technology. The two share one reduced
  // emphasis, and the preview, with the row's background, is not raised
  // (design:ordered-collection-reordering DR2).
  expect(held.value?.opacity).toBeLessThan(1);
  expect(held.value?.preview?.opacity).toBe(held.value?.opacity);
  expect(held.value?.preview?.shadow).toBe('none');
  expect(held.value?.preview?.background).toBeDefined();
  expect(held.value?.preview?.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(held.value?.preview?.hidden).toBe('true');
  await expect
    .poll(async () => labels(page))
    .toEqual(['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash']);
  await waitForRest(page);
  for (const label of ROWS) {
    expect(await translateY(row(page, label))).toBe(0);
  }
  // The drop takes the preview and the line away and restores the row.
  await expect(page.locator(`${PREVIEW}, ${LINE}`)).toHaveCount(0);
  await expect(page.locator('[data-astryx-reordering]')).toHaveCount(0);
  await expect.poll(opacity).toBe(1);
});

test('a flick that starts on a handle scrolls the page and moves no row', async ({
  page,
}) => {
  await open(page, LONG_STORY);
  const driver = await touchDriver(page);
  test.skip(!driver.drivesNativeGestures, 'needs native scrolling from touch');
  const before = await labels(page);
  const from = await centerOf(handle(page, 'Item 8'));
  await driver.play(flick(from, {velocity: {x: 0, y: -1500}, durationMs: 80}));
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(40);
  expect(await labels(page)).toEqual(before);
  await expect(page.locator('[data-astryx-reordering]')).toHaveCount(0);
});

test('after the hold the preview follows the finger one to one and stops with its top at the list top, while the row stays in place', async ({
  page,
}) => {
  await open(page);
  const archive = row(page, 'Archive');
  const from = await centerOf(handle(page, 'Archive'));
  const start = await topOf(archive);
  const listTop = await page
    .locator('#storybook-root ul')
    .evaluate(el => el.getBoundingClientRect().top);
  const height = await archive.evaluate(el => (el as HTMLElement).offsetHeight);
  const driver = await touchDriver(page);
  const errors: number[] = [];
  const stayed: number[] = [];
  const last: {top?: number} = {};
  // Down 80 px, then far up past the top of the list, without lifting.
  const script = drag(
    from,
    {x: from.x, y: from.y + 80},
    {
      holdMs: HOLD_MS,
      durationMs: 300,
    },
  ).slice(0, -1);
  const up = drag(
    {x: from.x, y: from.y + 80},
    {x: from.x, y: 0},
    {
      durationMs: 300,
      restMs: 100,
    },
  );
  const offset = script[script.length - 1].t;
  const full = [
    ...script,
    ...up.slice(1).map(frame => ({...frame, t: frame.t + offset})),
  ];
  await driver.play(full, {
    onEvent: async (step: TouchEventStep) => {
      if (step.type !== 'touchMove' || step.t < HOLD_MS + 20) {
        return;
      }
      const top = await page.evaluate(
        selector =>
          document.querySelector(selector)?.getBoundingClientRect().top ?? null,
        PREVIEW,
      );
      if (top == null) {
        return;
      }
      stayed.push((await topOf(archive)) - start);
      last.top = top;
      const finger = step.fingers[0].y;
      if (finger > from.y - 40) {
        errors.push(top - start - (finger - from.y));
      }
    },
  });
  await writeEvidence(
    'reorder/tracking',
    {
      'tracking.json': JSON.stringify(
        {errors, stayed, lastTop: last.top, listTop},
        null,
        1,
      ),
    },
    test.info(),
  );
  expect(errors.length).toBeGreaterThan(5);
  for (const error of errors) {
    expect(Math.abs(error)).toBeLessThan(1);
  }
  // The row itself never left its place (DR2, DR3).
  for (const moved of stayed) {
    expect(Math.abs(moved)).toBeLessThan(0.5);
  }
  // Clamped at the list's own end (the page's top edge is further up): the
  // preview stops with its top on the list's top, never hanging over what is
  // above the list. At the visible edge itself its centre would stop there.
  expect(last.top).toBeCloseTo(Math.max(listTop, -height / 2), 0);
});

test('the rows stay still while the finger drags, and the insertion line marks the gap where the row would land', async ({
  page,
}, testInfo) => {
  await open(page);
  const {height, pitch} = await pitchOf(page);
  const before = await rowTops(page);
  const from = await centerOf(handle(page, 'Inbox'));
  const driver = await touchDriver(page);
  // Down past Sent and Drafts, and held there.
  const script = drag(
    from,
    {x: from.x, y: from.y + 2.1 * pitch},
    {
      holdMs: HOLD_MS,
      durationMs: 600,
      restMs: 200,
    },
  );
  const moved: number[] = [];
  const lines: number[] = [];
  await driver.play(script, {
    onEvent: async (step: TouchEventStep) => {
      if (step.type !== 'touchMove' || step.t < HOLD_MS + 20) {
        return;
      }
      const tops = await rowTops(page);
      for (const label of ROWS) {
        moved.push(tops[label] - before[label]);
      }
      const line = await page.evaluate(selector => {
        const element = document.querySelector<HTMLElement>(selector);
        return element == null || element.hidden
          ? null
          : element.getBoundingClientRect().top;
      }, LINE);
      if (line != null) {
        lines.push(line);
      }
    },
  });
  // The gaps after Sent and after Drafts, where Inbox would land.
  const gaps = [before.Sent + height, before.Drafts + height];
  await writeEvidence(
    'reorder/stationary-rows',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {before, gaps, lines, moved},
        null,
        1,
      ),
    },
    testInfo,
  );
  // Nothing made room: every row stayed where it was until the drop (DR3).
  expect(moved.length).toBeGreaterThan(5 * ROWS.length);
  for (const value of moved) {
    expect(Math.abs(value)).toBeLessThan(0.5);
  }
  // The line sat in the gap after Sent, then in the gap after Drafts, as the
  // finger crossed them: only ever in a gap, and last after Drafts.
  expect(lines.length).toBeGreaterThan(0);
  for (const top of lines) {
    expect(
      gaps.some(gap => Math.abs(top - gap) < 4),
      `${top}`,
    ).toBe(true);
  }
  expect(lines.some(top => Math.abs(top - gaps[0]) < 4)).toBe(true);
  expect(Math.abs(lines[lines.length - 1] - gaps[1])).toBeLessThan(4);
  await expect
    .poll(async () => labels(page))
    .toEqual(['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash']);
});

/**
 * The best fit of `curve` to `samples` over a commit lag of 0 to 30 ms (the
 * commit that applies a drop lands a few ms into it and continues the same
 * curve from there), and that lag.
 */
function fitLag(
  samples: ReadonlyArray<{t: number; value: number}>,
  curve: (t: number) => number,
): {lag: number; maxError: number} {
  let lag = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let t = 0; t <= 30; t += 0.1) {
    const error = compareCurve(samples, s => curve(s + t), 0.5).maxError;
    if (error < best) {
      best = error;
      lag = t;
    }
  }
  return {lag, maxError: best};
}

/**
 * The settle a release velocity would start (spec:AST-094 FR6, FR38), in
 * px from the row's start, for comparison with the measured one from rest.
 */
function handoffCurve(
  duration: number,
  from: number,
  to: number,
  velocity: number,
): (ms: number) => number {
  const curve = solveSpring(toSpring({duration, bounce: 0}), {
    from,
    to,
    velocity,
  });
  return ms => curve.value(ms / 1000);
}

test('the drop glides the row from where its preview was into its new place on the shared settle spring, from rest, even from a moving finger, and the rows it passed to theirs', async ({
  page,
}, testInfo) => {
  await open(page);
  const {pitch} = await pitchOf(page);
  const inbox = row(page, 'Inbox');
  const sent = row(page, 'Sent');
  const start = await topOf(inbox);
  const sentStart = await topOf(sent);
  const from = await centerOf(handle(page, 'Inbox'));
  const travel = 0.62 * pitch;
  const driver = await touchDriver(page);
  const samples: {t: number; value: number}[] = [];
  const passed: {t: number; value: number}[] = [];
  // A committed move's glide is coordinated layout movement: it plays the
  // shared settle role, springs.settle (spec:AST-105 FR4).
  const duration = springs.settle.duration;
  const progress = tableProgress(duration);
  // The finger lifts while it moves, so a glide that took its velocity would
  // leave from the release moving, not from rest.
  const script = drag(
    from,
    {x: from.x, y: from.y + travel},
    {holdMs: HOLD_MS, durationMs: 100},
  );
  const velocity = releaseVelocity(script).y;
  await driver.play(script, {
    onEvent: async (step: TouchEventStep) => {
      if (step.type !== 'touchEnd') {
        return;
      }
      await holdAnimations(page, page.locator('#storybook-root ul'));
      for (const t of timeline(progress.settleMs)) {
        await seekAnimations(page, t);
        samples.push({t, value: (await topOf(inbox)) - start});
        passed.push({t, value: (await topOf(sent)) - sentStart});
      }
      await releaseAnimations(page, {finish: true});
    },
  });
  // Inbox lands in slot 1, one pitch down; it leaves from where its preview
  // was, `travel` down, and glides the rest on the settle spring.
  const curve = (t: number) => travel + (pitch - travel) * progress.at(t);
  // The commit that applies the drop lands a few ms into it and continues the
  // same curve from there: the held animation starts that much into the
  // glide. The lag is fitted to every sample (a spring from rest is flat at
  // its start, so its first sample cannot place it).
  const {lag} = fitLag(samples, curve);
  const comparison = compareCurve(samples, t => curve(t + lag), 0.5);
  // A glide that took the release velocity misses the samples at any lag.
  const handoff = fitLag(
    samples,
    handoffCurve(duration, travel, pitch, velocity),
  );
  // Sent, which Inbox passed, glides from its old place to its new one, one
  // pitch up, on the same spring.
  const sentFit = fitLag(passed, t => -pitch * progress.at(t));
  await writeEvidence(
    'curves/list-reorder-drop',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          duration,
          pitch,
          travel,
          velocity,
          lag,
          samples,
          comparison,
          handoff,
          passed,
          sentFit,
        },
        null,
        2,
      ),
    },
    testInfo,
  );
  expect(velocity).toBeGreaterThan(150);
  expect(samples[0].value).toBeCloseTo(travel, 0);
  expect(lag).toBeLessThan(30);
  expect(comparison.maxError, JSON.stringify(comparison.worst)).toBeLessThan(
    0.5,
  );
  expect(handoff.maxError).toBeGreaterThan(2);
  expect(sentFit.maxError).toBeLessThan(0.5);
  await expect
    .poll(async () => labels(page))
    .toEqual(['Sent', 'Inbox', 'Drafts', 'Archive', 'Spam', 'Trash']);
});

test('a cancelled drag restores everything at once and commits no move', async ({
  page,
  browserName,
}) => {
  // WebKit's driver dispatches no touch cancel.
  test.skip(browserName === 'webkit', 'Chromium dispatches the touch cancel');
  await open(page);
  const {pitch} = await pitchOf(page);
  const before = await rowTops(page);
  const from = await centerOf(handle(page, 'Inbox'));
  const driver = await touchDriver(page);
  const state = async () =>
    page.evaluate(
      ({rowSelector, preview, line}) => ({
        overlays: document.querySelector(`${preview}, ${line}`) != null,
        opacities: Array.from(
          document.querySelectorAll<HTMLElement>(rowSelector),
        ).map(element => Number(getComputedStyle(element).opacity)),
        travelling: Array.from(
          document.querySelectorAll<HTMLElement>(rowSelector),
        ).some(element =>
          element
            .getAnimations()
            .some(
              animation =>
                animation.playState === 'running' &&
                animation.effect instanceof KeyframeEffect &&
                animation.effect
                  .getKeyframes()
                  .some(frame => frame.translate != null),
            ),
        ),
      }),
      {rowSelector: ROW, preview: PREVIEW, line: LINE},
    );
  const seen: {
    during?: Awaited<ReturnType<typeof state>>;
    after?: Awaited<ReturnType<typeof state>>;
    tops?: Record<string, number>;
  } = {};
  // The browser takes the touch while the finger still moves.
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y + 1.6 * pitch},
      {holdMs: HOLD_MS, durationMs: 200, cancel: true},
    ),
    {
      onEvent: async (step: TouchEventStep) => {
        if (
          step.type === 'touchMove' &&
          seen.during == null &&
          step.t > HOLD_MS + 100
        ) {
          seen.during = await state();
        }
        if (step.type === 'touchCancel') {
          // The next frame: everything is back already (DR5).
          await page.evaluate(
            async () =>
              new Promise<void>(resolve =>
                requestAnimationFrame(() => resolve()),
              ),
          );
          seen.after = await state();
          seen.tops = await rowTops(page);
        }
      },
    },
  );
  // The drag was live: its preview and line were up.
  expect(seen.during?.overlays).toBe(true);
  expect(seen.after?.overlays).toBe(false);
  expect(seen.after?.travelling).toBe(false);
  for (const opacity of seen.after?.opacities ?? [0]) {
    expect(opacity).toBe(1);
  }
  for (const label of ROWS) {
    expect(Math.abs((seen.tops?.[label] ?? Number.NaN) - before[label])).toBe(
      0,
    );
  }
  expect(await labels(page)).toEqual(ROWS);
  await expect(page.locator('[data-astryx-reordering]')).toHaveCount(0);
});

test('near the bottom edge the page autoscrolls by whole points every 20 ms', async ({
  page,
}, testInfo) => {
  await open(page, LONG_STORY);
  const target = row(page, 'Item 6');
  const from = await centerOf(handle(page, 'Item 6'));
  const rowBox = await target.boundingBox();
  const viewport = page.viewportSize();
  if (rowBox == null || viewport == null) {
    throw new Error('no box');
  }
  await page.evaluate(() => {
    const element = document.scrollingElement as Element;
    const proto = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollTop',
    ) as PropertyDescriptor;
    const writes: [number, number][] = [];
    (window as unknown as {__writes: typeof writes}).__writes = writes;
    Object.defineProperty(element, 'scrollTop', {
      configurable: true,
      get(): number {
        return proto.get?.call(this) as number;
      },
      set(value: number) {
        writes.push([performance.now(), value]);
        proto.set?.call(this, value);
      },
    });
  });
  // Bring the row's bottom edge 10 px past the bottom of the viewport.
  const depth = 10;
  const dy = viewport.height + depth - (rowBox.y + rowBox.height);
  const driver = await touchDriver(page);
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y + dy},
      {
        holdMs: HOLD_MS,
        durationMs: 300,
        hz: 30,
        restMs: 1200,
      },
    ),
  );
  const writes = await page.evaluate(
    () => (window as unknown as {__writes: [number, number][]}).__writes,
  );
  // The steady part, with the finger still at the edge.
  const steady = writes.slice(Math.floor(writes.length / 3));
  const steps = steady.slice(1).map(([, v], i) => v - steady[i][1]);
  const intervals = steady.slice(1).map(([t], i) => t - steady[i][0]);
  const [t0, v0] = steady[0];
  const [t1, v1] = steady[steady.length - 1];
  // Points per 20 ms tick on average, whatever the engine's timer jitter.
  const perTick = ((v1 - v0) / (t1 - t0)) * reorder.autoscroll.tickMs;
  const expected = autoscrollStep(depth);
  await writeEvidence(
    'reorder/autoscroll',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {depth, expected, perTick, steps, intervals},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(steady.length).toBeGreaterThan(20);
  // Whole ticks only: one step, or two when a late timer catches up.
  for (const step of steps) {
    expect([expected, 2 * expected]).toContain(step);
  }
  expect(perTick).toBeGreaterThan(expected * 0.93);
  expect(perTick).toBeLessThan(expected * 1.07);
  // The row stayed under the finger and moved down the list.
  await expect
    .poll(async () => (await labels(page)).indexOf('Item 6'))
    .toBeGreaterThan(8);
});

test('a second finger does not break the drag', async ({page, browserName}) => {
  test.skip(
    browserName === 'webkit',
    "Linux WebKit's touchstart lists only the finger that landed, so the " +
      'gesture system reads the first finger as gone (iOS Safari lists every ' +
      'finger: simulator evidence)',
  );
  await open(page);
  const {pitch} = await pitchOf(page);
  const from = await centerOf(handle(page, 'Inbox'));
  const other = await centerOf(row(page, 'Trash'));
  const driver = await touchDriver(page);
  const first = drag(
    from,
    {x: from.x, y: from.y + 1.6 * pitch},
    {
      holdMs: HOLD_MS,
      durationMs: 400,
      restMs: 150,
    },
  );
  const second = tap(other, {holdMs: 120, id: 1}).map(frame => ({
    ...frame,
    t: frame.t + HOLD_MS + 120,
  }));
  await driver.play(merge(first, second));
  await expect
    .poll(async () => labels(page))
    .toEqual(['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash']);
});

test('a pinch whose first finger lands on a handle zooms the page', async ({
  page,
}) => {
  await open(page);
  const driver = await touchDriver(page);
  test.skip(!driver.drivesNativeGestures, 'needs native pinch-zoom from touch');
  const on = await centerOf(handle(page, 'Sent'));
  const before = await labels(page);
  // The first finger on the handle, the second 120 px to its left.
  await driver.play(
    pinch({
      center: {x: on.x - 60, y: on.y},
      fromDistance: 120,
      toDistance: 300,
      durationMs: 300,
      restMs: 100,
    }).map(frame => ({
      ...frame,
      fingers: frame.fingers.map(finger =>
        finger.id === 0 ? {...finger, id: 1} : {...finger, id: 0},
      ),
    })),
  );
  await expect
    .poll(async () => page.evaluate(() => visualViewport?.scale ?? 1))
    .toBeGreaterThan(1.2);
  expect(await labels(page)).toEqual(before);
});

test('two fingers held still with one on a handle, then spread, zoom the page', async ({
  page,
}) => {
  await open(page);
  const driver = await touchDriver(page);
  test.skip(!driver.drivesNativeGestures, 'needs native pinch-zoom from touch');
  const on = await centerOf(handle(page, 'Sent'));
  const before = await labels(page);
  // Both fingers rest past the hold before they spread: the handle must not
  // claim a touch while another finger is on the screen.
  const spread = pinch({
    center: {x: on.x - 60, y: on.y},
    fromDistance: 120,
    toDistance: 300,
    durationMs: 400,
    restMs: 100,
  }).map((frame, index) => ({
    t: index === 0 ? 0 : frame.t + HOLD_MS + 100,
    fingers: frame.fingers.map(finger =>
      finger.id === 0 ? {...finger, id: 1} : {...finger, id: 0},
    ),
  }));
  await driver.play(spread);
  await expect
    .poll(async () => page.evaluate(() => visualViewport?.scale ?? 1))
    .toBeGreaterThan(1.2);
  expect(await labels(page)).toEqual(before);
  await expect(page.locator('[data-astryx-reordering]')).toHaveCount(0);
});

/**
 * How finely the screencast places the marker, in CSS px. For the same
 * spring, Chromium's (PNG) frames move it in 1 px steps and WebKit's (JPEG)
 * frames in 2 px steps, so a spring's last few px, which move less than a
 * step per frame, show as a plateau (80, 80, 80 against a final 77) though
 * every frame is presented. Judging stops two steps from the end.
 */
function castStepPx(page: Page): number {
  return page.context().browser()?.browserType().name() === 'webkit' ? 2 : 1;
}

/**
 * Films `marked` while a drag held at `travel` rows (then released when
 * `releaseFirst`) runs. The page itself blocks its main thread for `blockMs`
 * once the motion under test has run 50 ms on its own clock (three frames:
 * an engine hands a new animation to its compositor in a rendering update,
 * so a block in its first frame holds the start, by design), and reports the
 * window; a test-side trigger would land a variable number of frames late.
 */
async function busyProof(
  page: Page,
  marked: Locator,
  travel: number,
  {
    blockMs,
    releaseFirst,
    dragged = 'Inbox',
    durationMs = 160,
  }: {
    blockMs: number;
    releaseFirst: boolean;
    dragged?: string;
    durationMs?: number;
  },
) {
  const {pitch} = await pitchOf(page);
  const from = await centerOf(handle(page, dragged));
  await marked.evaluate((element, ms) => {
    const target = element as HTMLElement;
    const won = window as unknown as {__block?: BusyWindow};
    const check = () => {
      const moving = target
        .getAnimations()
        .find(a => a.playState === 'running' && Number(a.currentTime) >= 50);
      if (moving == null) {
        requestAnimationFrame(check);
        return;
      }
      // From a task, not inside the frame's callbacks: the frame being
      // rendered finishes first.
      setTimeout(() => {
        const start = performance.now();
        while (performance.now() - start < ms) {
          // the main thread is held
        }
        won.__block = {
          from: performance.timeOrigin + start,
          to: performance.timeOrigin + performance.now(),
        };
      }, 0);
    };
    requestAnimationFrame(check);
  }, blockMs);
  const unmark = await markElement(marked);
  const cast = await startScreencast(page);
  const driver = await touchDriver(page);
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y + travel * pitch},
      {
        holdMs: HOLD_MS,
        durationMs,
        restMs: releaseFirst ? 150 : 900,
      },
    ),
  );
  await page.waitForTimeout(300);
  const frames = await cast.stop();
  await unmark();
  const block = await page.evaluate(
    () => (window as unknown as {__block?: BusyWindow}).__block ?? null,
  );
  if (block == null) {
    throw new Error('the motion under test never started');
  }
  const tracked = await trackMarker(page, frames);
  return busyWindowProof(tracked, block, {
    axis: 'y',
    settledWithin: 2 * castStepPx(page),
  });
}

test('the rows the drop moves keep gliding while the main thread is blocked', async ({
  page,
}, testInfo) => {
  await open(page);
  // In one move Inbox passes Sent, Drafts and Archive, and the finger lifts
  // below them: on the drop Sent glides up a row while script cannot run.
  const proof = await busyProof(page, row(page, 'Sent'), 3.2, {
    blockMs: 200,
    releaseFirst: true,
    durationMs: 16,
  });
  await writeEvidence(
    'busy-main-thread/list-reorder-slide',
    {[`${testInfo.project.name}.json`]: JSON.stringify(proof, null, 1)},
    testInfo,
  );
  expect(proof.changed, JSON.stringify(proof)).toBeGreaterThanOrEqual(3);
  expect(proof.monotonic, JSON.stringify(proof)).toBe(true);
});

test('the dropped row keeps gliding while the main thread is blocked', async ({
  page,
}, testInfo) => {
  await open(page);
  // Released a row and a half down: Inbox glides from where its preview was
  // into its new place.
  const proof = await busyProof(page, row(page, 'Inbox'), 1.49, {
    blockMs: 150,
    releaseFirst: true,
  });
  await writeEvidence(
    'busy-main-thread/list-reorder-drop',
    {[`${testInfo.project.name}.json`]: JSON.stringify(proof, null, 1)},
    testInfo,
  );
  expect(proof.changed, JSON.stringify(proof)).toBeGreaterThanOrEqual(3);
  expect(proof.monotonic, JSON.stringify(proof)).toBe(true);
});

test('a drag does no Layout or Paint per move', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  await open(page);
  const {pitch} = await pitchOf(page);
  const from = await centerOf(handle(page, 'Inbox'));
  const driver = await touchDriver(page);
  let played: Awaited<ReturnType<typeof driver.play>> = [];
  const line: {shownAt?: number} = {};
  const trace = await traceRendering(page, async () => {
    // Past two rows: the insertion line shows at the first gap and moves to
    // the second.
    played = await driver.play(
      drag(
        from,
        {x: from.x, y: from.y + 2.6 * pitch},
        {
          holdMs: HOLD_MS,
          durationMs: 600,
          restMs: 100,
        },
      ),
      {
        onEvent: async (step: TouchEventStep) => {
          if (line.shownAt != null || step.type !== 'touchMove') {
            return;
          }
          const shown = await page.evaluate(selector => {
            const element = document.querySelector<HTMLElement>(selector);
            return element != null && !element.hidden;
          }, LINE);
          if (shown) {
            line.shownAt = Date.now();
          }
        },
      },
    );
    await page.waitForTimeout(400);
  });
  // Once the insertion line is up, to the last move: each move only moves
  // the preview (and the line, at the second gap), in the compositor.
  const moves = played.filter(
    step =>
      step.type === 'touchMove' && step.dispatchedAt > (line.shownAt ?? 0),
  );
  const during = countBetween(
    trace,
    moves[0].dispatchedAt,
    moves[moves.length - 1].dispatchedAt,
  );
  expect(line.shownAt).toBeDefined();
  expect(moves.length).toBeGreaterThan(15);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
});

test.describe('with a mouse', () => {
  test.use({
    hasTouch: false,
    isMobile: false,
    viewport: {width: 900, height: 700},
  });

  /** This context's primary pointer is fine: a case here is a mouse's. */
  const expectFinePointer = async (page: Page) =>
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);

  test("with a mouse the handle keeps a plain button's text selection and callout", async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await expectFinePointer(page);
    await expect(handle(page, 'Inbox')).toBeVisible();
    const styles = await handle(page, 'Inbox').evaluate(element => {
      const read = (el: Element) => {
        const style = getComputedStyle(el) as CSSStyleDeclaration & {
          webkitUserSelect?: string;
          webkitTouchCallout?: string;
        };
        return {
          userSelect: style.userSelect,
          webkitUserSelect: style.webkitUserSelect ?? '',
          callout: style.getPropertyValue('-webkit-touch-callout'),
        };
      };
      const plain = document.createElement('button');
      element.parentElement?.append(plain);
      const result = {handle: read(element), plain: read(plain)};
      plain.remove();
      return result;
    });
    // No local override: a held finger's lock comes from the gesture host.
    expect(styles.handle).toEqual(styles.plain);
  });

  test('a mouse drags a handle at once and the rows jump, with no motion', async ({
    page,
  }) => {
    await openStory(page, storybook(), STORY);
    await expectFinePointer(page);
    const {pitch} = await pitchOf(page);
    const grip = handle(page, 'Inbox');
    const cursor = async () =>
      grip.evaluate(element => getComputedStyle(element).cursor);
    expect(await cursor()).toBe('grab');
    const from = await centerOf(grip);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 1.6 * pitch, {steps: 12});
    // Rows that make room jump: nothing animates.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    // The handle shows a grabbing hand while the drag holds it.
    expect(await cursor()).toBe('grabbing');
    await page.mouse.up();
    await expect
      .poll(async () => labels(page))
      .toEqual(['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash']);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    for (const label of ROWS) {
      expect(await translateY(row(page, label))).toBe(0);
    }
    expect(await cursor()).toBe('grab');
  });

  test('where the primary pointer is fine, no recognizer attaches: the gesture host listens to nothing', async ({
    page,
  }) => {
    // spec:AST-094 FR19, FR24. The gesture host, which every recognizer
    // attaches through, listens on the document; each touch listener a page
    // script puts there is recorded, through a mouse drag too (the test
    // driver's own listeners are left out).
    await page.addInitScript(() => {
      const seen: string[] = [];
      Object.assign(window, {__documentTouchListeners: seen});
      const add = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (
        this: EventTarget,
        type: string,
        ...rest: unknown[]
      ) {
        if (
          type.startsWith('touch') &&
          this === document &&
          !(new Error().stack ?? '').includes('InjectedScript')
        ) {
          seen.push(type);
        }
        return (add as (...args: unknown[]) => void).call(this, type, ...rest);
      };
    });
    await openStory(page, storybook(), STORY);
    await expectFinePointer(page);
    const {pitch} = await pitchOf(page);
    const from = await centerOf(handle(page, 'Inbox'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 1.6 * pitch, {steps: 8});
    await page.mouse.up();
    await expect
      .poll(async () => labels(page))
      .toEqual(['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash']);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as {__documentTouchListeners: string[]})
            .__documentTouchListeners,
      ),
    ).toEqual([]);
  });

  test('a mouse drag selects no text', async ({page}) => {
    await openStory(page, storybook(), STORY);
    await expectFinePointer(page);
    const {pitch} = await pitchOf(page);
    const from = await centerOf(handle(page, 'Inbox'));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x - 120, from.y + 2.4 * pitch, {steps: 10});
    await page.mouse.up();
    expect(
      await page.evaluate(() => window.getSelection()?.toString() ?? ''),
    ).toBe('');
  });
});

// design:reduced-motion (current): under Reduce Motion a reorder's own
// motion — the rows it passes, the drop, a key move — never travels or
// springs; on a coarse pointer it cross-fades (opacity only, at most 200 ms),
// on a fine pointer it completes at once. The row under the finger still
// follows it: the person drags it themselves.
const ROW_FADE_MS = 200;

/**
 * How long, from now, until none of the list's rows runs an animation and
 * every row is fully opaque: measured in the page, frame by frame.
 */
async function msUntilRowsRest(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<number>(resolve => {
        const start = performance.now();
        const check = () => {
          const rows = Array.from(
            document.querySelectorAll<HTMLElement>('#storybook-root li'),
          );
          const busy = rows.some(
            row =>
              row
                .getAnimations()
                .some(animation => animation.playState === 'running') ||
              Number(getComputedStyle(row).opacity) < 1,
          );
          if (!busy || performance.now() - start > 2000) {
            resolve(performance.now() - start);
            return;
          }
          requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
}

/**
 * Starts sampling `label`'s row every frame for `ms`: its opacity and its top
 * on screen. Read the samples with `rowSamples`.
 */
async function sampleRow(page: Page, label: string, ms: number) {
  await page.evaluate(
    ({label, ms}) => {
      const row = Array.from(
        document.querySelectorAll<HTMLElement>(
          '#storybook-root li:not([data-astryx-leaving])',
        ),
      ).find(li => li.textContent?.trim().startsWith(label));
      const samples: {t: number; opacity: number; top: number}[] = [];
      (window as unknown as {__rowSamples: typeof samples}).__rowSamples =
        samples;
      const start = performance.now();
      const tick = () => {
        if (row == null) {
          return;
        }
        const t = performance.now() - start;
        samples.push({
          t,
          opacity: Number(getComputedStyle(row).opacity),
          top: row.getBoundingClientRect().top,
        });
        if (t < ms) {
          requestAnimationFrame(tick);
        }
      };
      tick();
    },
    {label, ms},
  );
}

async function rowSamples(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __rowSamples: {t: number; opacity: number; top: number}[];
        }
      ).__rowSamples,
  );
}

/** Every running animation of `locator`: what it animates and how long. */
async function rowAnimations(locator: Locator) {
  return locator.evaluate(el =>
    el.getAnimations().map(animation => {
      const effect = animation.effect as KeyframeEffect | null;
      const frames = effect?.getKeyframes() ?? [];
      return {
        translate: frames.some(
          frame => 'translate' in frame || 'transform' in frame,
        ),
        opacity: frames.some(frame => 'opacity' in frame),
        endTime: Number(effect?.getComputedTiming().endTime ?? 0),
      };
    }),
  );
}

// The cross-fade is the animator's Reduced Motion default; the rows take it
// as every row motion does (no row keeps travel under Reduced Motion).
test.describe('with Reduce Motion', () => {
  test('the rows stay still while the finger drags, and the drop cross-fades the rows it moves into their new places: no travel, at most 200 ms', async ({
    page,
  }) => {
    // Reduce Motion on, before the story opens.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await open(page);
    expect(
      await page.evaluate(
        () => matchMedia('(prefers-reduced-motion: reduce)').matches,
      ),
    ).toBe(true);
    const {pitch} = await pitchOf(page);
    const before = await rowTops(page);
    const from = await centerOf(handle(page, 'Inbox'));
    const driver = await touchDriver(page);
    const script = drag(
      from,
      {x: from.x, y: from.y + 0.6 * pitch},
      {holdMs: HOLD_MS, durationMs: 160, restMs: 120},
    );
    const lastMove = script.length - 2;
    let index = -1;
    const during: {
      tops?: Record<string, number>;
      animations?: Awaited<ReturnType<typeof rowAnimations>>;
    } = {};
    await driver.play(script, {
      onEvent: async (step: TouchEventStep) => {
        index += 1;
        if (step.type === 'touchMove' && index === lastMove) {
          during.tops = await rowTops(page);
          during.animations = [
            ...(await rowAnimations(row(page, 'Inbox'))),
            ...(await rowAnimations(row(page, 'Sent'))),
          ];
        }
        if (step.type === 'touchEnd') {
          await sampleRow(page, 'Inbox', ROW_FADE_MS + 100);
        }
      },
    });
    // While the finger drags, nothing makes room and nothing moves (DR3).
    expect(during.animations).toEqual([]);
    for (const label of ROWS) {
      expect(during.tops?.[label]).toBe(before[label]);
    }
    // The drop moves no row either (DR8): the rows it moves, Inbox and Sent,
    // only fade, and every row is at rest, fully shown, within the fade (two
    // frames of slack for the measurement).
    for (const label of ['Inbox', 'Sent']) {
      for (const animation of await rowAnimations(row(page, label))) {
        expect(animation.translate).toBe(false);
      }
    }
    expect(await msUntilRowsRest(page)).toBeLessThanOrEqual(ROW_FADE_MS + 34);
    // Inbox fades out where its preview left it, takes its new place while
    // transparent, and fades in there.
    const dropped = await rowSamples(page);
    const lowest = Math.min(...dropped.map(sample => sample.opacity));
    expect(lowest).toBeLessThanOrEqual(0.1);
    const released = dropped[0].top;
    const landed = dropped[dropped.length - 1].top;
    expect(landed).toBe(before.Sent);
    for (const sample of dropped) {
      if (sample.opacity > 0.1) {
        expect(
          [released, landed].some(top => Math.abs(sample.top - top) < 0.5),
          `t=${sample.t.toFixed(0)}`,
        ).toBe(true);
      }
    }
    await expect
      .poll(async () => labels(page))
      .toEqual(['Sent', 'Inbox', 'Drafts', 'Archive', 'Spam', 'Trash']);
    // At rest every row is fully shown where it belongs.
    for (const label of ['Sent', 'Inbox']) {
      expect(await translateY(row(page, label))).toBe(0);
      expect(
        Number(
          await row(page, label).evaluate(el => getComputedStyle(el).opacity),
        ),
      ).toBe(1);
    }
    await expect(page.locator(`${PREVIEW}, ${LINE}`)).toHaveCount(0);
  });

  test('a key move cross-fades its rows too', async ({page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'});
    await open(page);
    await page.keyboard.press('Shift');
    await handle(page, 'Inbox').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(async () => labels(page))
      .toEqual(['Sent', 'Inbox', 'Drafts', 'Archive', 'Spam', 'Trash']);
    const moved = [
      ...(await rowAnimations(row(page, 'Inbox'))),
      ...(await rowAnimations(row(page, 'Sent'))),
    ];
    expect(moved.length).toBeGreaterThan(0);
    for (const animation of moved) {
      expect(animation.translate).toBe(false);
      expect(animation.opacity).toBe(true);
    }
    expect(await msUntilRowsRest(page)).toBeLessThanOrEqual(ROW_FADE_MS + 34);
    await page.keyboard.press('Escape');
  });
});

test.describe('right to left', () => {
  test('the handle sits at the row end on the left, and a hold then drag reorders with x fixed', async ({
    page,
  }) => {
    await page.goto(
      `${storybook()}/iframe.html?id=${STORY}&viewMode=story&globals=direction:rtl`,
    );
    await expect(handle(page, 'Inbox')).toBeVisible();
    const touch = await page.evaluate(
      () => matchMedia('(pointer: coarse)').matches,
    );
    test.skip(!touch, 'the touch reorder runs on a touch screen');
    expect(
      await row(page, 'Inbox').evaluate(el => getComputedStyle(el).direction),
    ).toBe('rtl');
    const rowBox = await row(page, 'Inbox').boundingBox();
    const handleBox = await handle(page, 'Inbox').boundingBox();
    if (rowBox == null || handleBox == null) {
      throw new Error('no box');
    }
    // The trailing control is on the inline end, the left in RTL.
    expect(handleBox.x + handleBox.width / 2).toBeLessThan(
      rowBox.x + rowBox.width / 4,
    );
    const {pitch} = await pitchOf(page);
    const from = await centerOf(handle(page, 'Inbox'));
    const driver = await touchDriver(page);
    const xs: string[] = [];
    await driver.play(
      drag(
        from,
        {x: from.x + 30, y: from.y + 1.6 * pitch},
        {
          holdMs: HOLD_MS,
          durationMs: 300,
          restMs: 150,
        },
      ),
      {
        onEvent: async (step: TouchEventStep) => {
          if (step.type === 'touchMove' && step.t > HOLD_MS + 60) {
            xs.push(
              await row(page, 'Inbox').evaluate(
                el => getComputedStyle(el).translate.split(' ')[0] ?? '',
              ),
            );
          }
        },
      },
    );
    await expect
      .poll(async () => labels(page))
      .toEqual(['Sent', 'Drafts', 'Inbox', 'Archive', 'Spam', 'Trash']);
    // A sideways component is ignored: the row moves along y only.
    expect(xs.length).toBeGreaterThan(3);
    expect(xs.every(x => x === '0px' || x === 'none' || x === '')).toBe(true);
  });
});

test(
  'storyboard: a row held, dragged past two rows and dropped',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    await open(page);
    const {pitch} = await pitchOf(page);
    const from = await centerOf(handle(page, 'Inbox'));
    const driver = await touchDriver(page);
    const storyboard = await touchStoryboard(
      page,
      driver,
      drag(
        from,
        {x: from.x, y: from.y + 1.6 * pitch},
        {
          holdMs: HOLD_MS,
          durationMs: 300,
          hz: 20,
          restMs: 150,
        },
      ),
      {
        name: 'list-reorder-drag',
        clip: {x: 0, y: 0, width: 402, height: 360},
        columns: 6,
        cellScale: 0.45,
      },
    );
    // The last cell: the drop settled in its slot.
    await page.waitForTimeout(500);
    await storyboard.capture('settled, 500 ms after touchEnd', 1500, {});
    await storyboard.write(testInfo);
  },
);

test(
  'storyboard: the drop settling into its slot',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    await open(page);
    const {pitch} = await pitchOf(page);
    const from = await centerOf(handle(page, 'Inbox'));
    const driver = await touchDriver(page);
    let written = false;
    await driver.play(
      drag(
        from,
        // Just short of the next crossing: the row drops almost half a row
        // past its slot, the longest settle a drop can have.
        {x: from.x, y: from.y + 1.48 * pitch},
        {
          holdMs: HOLD_MS,
          durationMs: 300,
          restMs: 200,
        },
      ),
      {
        onEvent: async (step: TouchEventStep) => {
          if (step.type !== 'touchEnd' || written) {
            return;
          }
          written = true;
          const {storyboard} = await animationStoryboard(page, {
            name: 'list-reorder-drop',
            clip: {x: 0, y: 0, width: 402, height: 240},
            times: [0, 33, 67, 100, 150, 200, 300],
            columns: 4,
            cellScale: 0.8,
          });
          await releaseAnimations(page, {finish: true});
          await storyboard.write(testInfo);
        },
      },
    );
  },
);

test('a focused handle shows its own ring, whole, and its row shows none', async ({
  page,
}) => {
  await open(page);
  // Keyboard modality: the next focus is focus-visible.
  await page.keyboard.press('Shift');
  await handle(page, 'Inbox').focus();
  const ring = await handle(page, 'Inbox').evaluate(element => {
    const row = element.closest('li') as HTMLElement;
    const list = element.closest('ul') as HTMLElement;
    const style = getComputedStyle(element);
    const reach =
      parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth);
    const box = element.getBoundingClientRect();
    const bounds = list.getBoundingClientRect();
    return {
      handle: style.outlineStyle,
      row: getComputedStyle(row).outlineStyle,
      left: box.left - reach - bounds.left,
      right: bounds.right - (box.right + reach),
    };
  });
  expect(ring.handle).not.toBe('none');
  // One ring: the row's own (Item's focus-within) stays off for the handle.
  expect(ring.row).toBe('none');
  // Whole: inside the list, which clips its inline overflow.
  expect(ring.left).toBeGreaterThanOrEqual(-0.5);
  expect(ring.right).toBeGreaterThanOrEqual(-0.5);
});

test('a held finger locks text selection on the handle, and the lift unlocks it', async ({
  page,
}) => {
  await open(page);
  const target = handle(page, 'Inbox');
  // Where iOS WebKit does not run, the gesture host's selection lock refuses
  // `selectstart` and writes no style (spec:AST-094 FR41).
  const refuses = async () =>
    target.evaluate(element => {
      const event = new Event('selectstart', {bubbles: true, cancelable: true});
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
  expect(await refuses()).toBe(false);
  const driver = await touchDriver(page);
  let held = false;
  // Lifted before the hold would claim the drag: the lock is the finger's.
  await driver.play(tap(await centerOf(target), {holdMs: 120}), {
    onEvent: async (step: TouchEventStep) => {
      if (step.type === 'touchStart') {
        held = await refuses();
      }
    },
  });
  expect(held).toBe(true);
  await expect.poll(refuses).toBe(false);
});

test("the handle keeps a small control's size; a finger's target reaches 44 pt short of the next handle's, its ring clears its lines, and its row is no taller for it", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Shift');
  await handle(page, 'Inbox').focus();
  // Where the primary pointer is coarse the handle's hit layer takes the
  // insets the shared hit area writes, a frame after layout.
  await expect
    .poll(async () =>
      handle(page, 'Inbox').evaluate(element =>
        getComputedStyle(element)
          .getPropertyValue('--astryx-hit-inset-top')
          .trim(),
      ),
    )
    .not.toBe('');
  const geometry = await handle(page, 'Inbox').evaluate(element => {
    const row = element.closest('li') as HTMLElement;
    const style = getComputedStyle(element);
    const inset =
      -parseFloat(style.outlineOffset) || parseFloat(style.outlineWidth);
    const box = element.getBoundingClientRect();
    const hitInset = (target: Element, side: string) =>
      parseFloat(
        getComputedStyle(target).getPropertyValue(`--astryx-hit-inset-${side}`),
      ) || 0;
    const hit = {
      top: box.top - hitInset(element, 'top'),
      bottom: box.bottom + hitInset(element, 'bottom'),
      left: box.left - hitInset(element, 'left'),
      right: box.right + hitInset(element, 'right'),
    };
    // The next row's handle and the top of its target.
    const next = row.nextElementSibling?.querySelector<HTMLElement>(
      '[data-astryx-list-reorder]',
    );
    const nextTop =
      next == null
        ? Number.POSITIVE_INFINITY
        : next.getBoundingClientRect().top - hitInset(next, 'top');
    // A point in the hit layer outside the visible handle, above it.
    const probe = document.elementFromPoint(
      box.left + box.width / 2,
      box.top - (box.top - hit.top) / 2,
    );
    // The lines are the handle's ::before: one bar centred in it, and a
    // shadow of it on each side.
    const lines = getComputedStyle(element, '::before');
    const bar = parseFloat(lines.height);
    const shadows = Array.from(
      lines.boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px/g),
      ([, , y]) => Math.abs(parseFloat(y)),
    );
    const reach = Math.max(0, ...shadows) + bar / 2;
    const centre = box.top + box.height / 2;
    const glyph = {top: centre - reach, bottom: centre + reach};
    const withHandle = row.getBoundingClientRect().height;
    // The same row without its handle.
    element.style.display = 'none';
    const withoutHandle = row.getBoundingClientRect().height;
    element.style.display = '';
    return {
      width: box.width,
      height: box.height,
      hitHeight: hit.bottom - hit.top,
      hitWidth: hit.right - hit.left,
      gapToNext: nextTop - hit.bottom,
      probeHits: probe === element,
      // The ring's inner edge to the lines, above and below.
      above: glyph.top - (box.top + inset),
      below: box.bottom - inset - glyph.bottom,
      withHandle,
      withoutHandle,
    };
  });
  // A small control for every pointer, as on a desktop (no control grows for
  // a finger).
  expect(geometry.width).toBeLessThan(44);
  expect(geometry.height).toBeLessThan(44);
  // A finger's target: 44 pt, through the invisible hit layer, and it never
  // reaches into the next handle's.
  expect(geometry.hitHeight).toBeCloseTo(44, 0);
  expect(geometry.hitWidth).toBeCloseTo(44, 0);
  expect(geometry.gapToNext).toBeGreaterThanOrEqual(-0.5);
  expect(geometry.probeHits).toBe(true);
  // The ring clears the lines above and below.
  expect(geometry.above).toBeGreaterThan(0);
  expect(geometry.below).toBeGreaterThan(0);
  // The handle takes only its lines' height in the row's layout: the row is
  // as tall with it as without it.
  expect(geometry.withHandle).toBeCloseTo(geometry.withoutHandle, 1);
});

test('a pinned first row bounds a drag: nothing drops above it', async ({
  page,
}) => {
  await open(page, PINNED_STORY);
  const before = await labels(page);
  // Favorites, which the story's isReorderable rejects, has no handle.
  await expect(handle(page, 'Favorites')).toHaveCount(0);
  const {pitch} = await pitchOf(page);
  const from = await centerOf(handle(page, 'Inbox'));
  const driver = await touchDriver(page);
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y - 1.5 * pitch},
      {holdMs: HOLD_MS, durationMs: 300, restMs: 150},
    ),
  );
  await waitForRest(page);
  expect(await labels(page)).toEqual(before);
});
