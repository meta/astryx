// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListRowPress.interaction.browser.spec.ts
 * @input The built List, TreeList and press feedback stories, real touch input
 *   (Chromium CDP / WebKit's input command), the interaction harness, and the
 *   default theme's exit motion tokens, which the release plays
 * @output Interaction and animation proofs for a list row's touch press
 *   release: a held row paints the pressed token at full strength, and the
 *   release follows the exit easing sampled frame by frame (both
 *   engines); the release keeps fading on every frame while the main thread
 *   is blocked (Chromium screencast, WebKit video); the release does no
 *   Layout or Paint; storyboards of the release and of the blocked window
 * @position Interaction evidence for the row press layer
 *   (privateAttributes/press.stylex.ts `rowPressLayerStyles.cell`) as composed by Item
 *   (List rows) and TreeList rows
 *
 * The press strength is read from pixels: the row's own background before
 * the press is strength 0, the frame the press is believed is strength 1, and
 * every other frame is placed between the two. The pressed overlay is a
 * translucent token, so the sampled channel moves linearly with the layer's
 * opacity.
 */

import {readFile} from 'node:fs/promises';
import {
  chromium,
  expect,
  keepRequestsLocal,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  animationStoryboard,
  armHold,
  blockMainThread,
  castStoryboard,
  compareCurve,
  countBetween,
  cubicBezier,
  freezeTimers,
  installLongTaskLog,
  installTimerGate,
  openStory,
  readLongTasks,
  releaseAnimations,
  requireFrames,
  seekAnimations,
  startScreencast,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  traceRendering,
  watchAnimations,
  withStorybook,
  writeEvidence,
  type CastFrame,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The release's clock and curve: the theme's exit motion tokens. */
interface Exit {
  readonly ms: number;
  readonly curve: readonly [number, number, number, number];
  readonly ease: (t: number) => number;
}

/** Reads `--duration-exit` and `--ease-exit` where the press paints. */
async function exitOf(surface: Locator): Promise<Exit> {
  const {ms, curve} = await surface.evaluate(el => {
    const style = getComputedStyle(el);
    const time = style.getPropertyValue('--duration-exit').trim();
    const points = (
      style.getPropertyValue('--ease-exit').match(/-?\d*\.?\d+/g) ?? []
    ).map(Number);
    return {
      ms: time.endsWith('ms') ? parseFloat(time) : parseFloat(time) * 1000,
      curve: points,
    };
  });
  const points = curve as unknown as Exit['curve'];
  return {ms, curve: points, ease: cubicBezier(...points)};
}

/** The layer's opacity t ms into the release: the strength, 1 → 0. */
const strengthAt = (exit: Exit, t: number) =>
  1 - exit.ease(Math.min(1, Math.max(0, t / exit.ms)));

/**
 * How far before the release's end a recorded frame may land and still count
 * as having reached rest: two of a Playwright video's frames (about 40 ms
 * apart), because the recording's frame gaps vary.
 */
const REST_MARGIN_MS = 80;

/** Long enough that the press is believed (scroll.delaysContentTouchesMs). */
const HOLD_MS = 400;

interface RowStory {
  readonly name: string;
  readonly story: string;
  /** The pressable row under test. */
  readonly row: (page: Page) => Locator;
}

const LIST_ROW: RowStory = {
  name: 'List row',
  story: 'core-list--interactive',
  // "Sent": not the selected row, so its resting background is the page's.
  row: page =>
    page.locator('[data-astryx-pressable]').filter({hasText: 'Sent'}).first(),
};

const SCROLLER_ROW: RowStory = {
  name: 'Item row in a scroller',
  story: 'core-press-feedback-touch--rows',
  row: page =>
    page
      .locator('[data-astryx-pressable]')
      .filter({hasText: 'Conversation 2'})
      .first(),
};

const TREE_ROW: RowStory = {
  name: 'TreeList row',
  story: 'core-treelist--basic',
  row: page =>
    page
      .locator('[data-astryx-pressable]')
      .filter({hasText: 'App.tsx'})
      .first(),
};

interface OpenRow {
  driver: TouchDriver;
  row: Locator;
  /**
   * A point inside the row's trailing padding, clear of its text, icons and
   * (in a tree) the guide lines, CSS px.
   */
  probe: {x: number; y: number};
  center: {x: number; y: number};
}

async function openRow(page: Page, story: RowStory): Promise<OpenRow> {
  await installLongTaskLog(page);
  await openStory(page, storybook(), story.story);
  const driver = await touchDriver(page);
  const row = story.row(page);
  await expect(row).toBeVisible();
  const box = await row.boundingBox();
  if (box == null) {
    throw new Error(`${story.name}: no row`);
  }
  return {
    driver,
    row,
    probe: {
      x: Math.round(box.x + box.width - 3),
      y: Math.round(box.y + box.height / 2),
    },
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
  };
}

/** Opacity of the row's press layer (the `::before`), as the engine presents it. */
/** The press layer's strength: 0 while the row has no layer box (at rest). */
const layerOpacity = async (row: Locator) =>
  row.evaluate(el => {
    const before = getComputedStyle(el, '::before');
    return before.content === 'none' || before.content === 'normal'
      ? 0
      : Number(before.opacity);
  });

/** The press attribute the controller writes on the row. */
const pressState = async (row: Locator) =>
  row.evaluate(el => el.getAttribute('data-astryx-press'));

interface PixelFrame {
  readonly t: number;
  /** Mean of the RGB channels at the probe point, 0–255. */
  readonly value: number;
}

/**
 * The probe point's value in every frame. Decoding runs in a scratch page of
 * the same browser (no image decoder in Node), like the harness's own marker
 * tracking.
 */
async function samplePixel(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  probe: {x: number; y: number},
): Promise<PixelFrame[]> {
  const scratch = await page.context().newPage();
  try {
    const out: PixelFrame[] = [];
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const values = await scratch.evaluate(
        async ({items, at}) => {
          const results: number[] = [];
          for (const item of items) {
            const bitmap = await createImageBitmap(
              await (
                await fetch(`data:image/${item.format};base64,${item.data}`)
              ).blob(),
            );
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(bitmap, 0, 0);
            const scale = bitmap.width / item.viewportWidth;
            const px = context.getImageData(
              Math.round(at.x * scale),
              Math.round(at.y * scale),
              1,
              1,
            ).data;
            results.push((px[0] + px[1] + px[2]) / 3);
          }
          return results;
        },
        {
          items: batch.map(f => ({
            data: f.data,
            format: f.format,
            viewportWidth: f.viewportWidth,
          })),
          at: probe,
        },
      );
      values.forEach((value, k) => out.push({t: batch[k].t, value}));
    }
    return out;
  } finally {
    await scratch.close();
  }
}

test('a held row paints the pressed token and its release follows the exit easing, sampled frame by frame', async ({
  page,
}, testInfo) => {
  const {driver, row, center} = await openRow(page, LIST_ROW);
  const exit = await exitOf(row);
  expect(await layerOpacity(row)).toBe(0);
  // Gate the page's timers before the press, so the controller's check at
  // the release clock (after which the release ends with its animation) can
  // be held while the release is seeked.
  await installTimerGate(page);
  // The page holds the release itself as soon as it runs. A hold the test
  // sends after the lift arrives later on a busy machine, and the release
  // can end first.
  const hold = await armHold(page, row, {
    judges: {target: row, property: 'opacity', pseudoElement: '::before'},
  });
  await driver.play(tap(center, {holdMs: HOLD_MS}));
  expect(await pressState(row)).toBe('fading');
  await freezeTimers(page);
  const held = await hold.held();
  const release = held.find(
    a => a.target?.startsWith('li') && a.kind === 'CSSAnimation',
  );
  expect(release, JSON.stringify(held)).toBeDefined();
  expect(release?.durationMs).toBe(exit.ms);
  const samples: {t: number; value: number}[] = [];
  for (const t of timeline(exit.ms)) {
    await seekAnimations(page, t);
    samples.push({t, value: await layerOpacity(row)});
  }
  await releaseAnimations(page, {finish: true});
  await thawTimers(page);
  const comparison = compareCurve(samples, t => strengthAt(exit, t), 0.005);
  await writeEvidence(
    'curves/list-row-press-release',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          releaseMs: exit.ms,
          curve: exit.curve,
          held,
          samples,
          comparison,
        },
        null,
        2,
      ),
    },
    testInfo,
  );
  expect(samples[0].value).toBeCloseTo(1, 2);
  expect(
    comparison.maxError,
    JSON.stringify(comparison.worst),
  ).toBeLessThanOrEqual(0.005);
  // At rest after the release: no press, no layer.
  await expect.poll(async () => pressState(row)).toBeNull();
  expect(await layerOpacity(row)).toBe(0);
});

for (const story of [LIST_ROW, SCROLLER_ROW, TREE_ROW]) {
  test(`${story.name}: the release keeps fading on every frame while the main thread is blocked`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'screencast frame evidence is Chromium-only in Playwright; WebKit has its own video proof below',
    );
    const {driver, row, center, probe} = await openRow(page, story);
    const cast = await startScreencast(page);
    // The page starts the block itself, a frame into the release. A block the
    // test sends after the release starts lands later on a busy machine. The
    // short release can then end with too few frames left to judge.
    const watch = await watchAnimations(row);
    // Strength 0 is the row at rest; strength 1 the believed press.
    const [block] = await Promise.all([
      blockMainThread(page, 700, {during: row}),
      driver.play(tap(center, {holdMs: HOLD_MS})),
    ]);
    const [release] = await watch.started({minProgressMs: 16});
    await page.waitForTimeout(150);
    const frames = await cast.stop();
    const pixels = await samplePixel(page, frames, probe);
    // The last frame is the row at rest: the release ended inside the block.
    // The first frame can already show the press, because a row outside a
    // scroller paints in the frame the finger lands.
    const rest = pixels[pixels.length - 1].value;
    const pressedFrames = pixels.filter(p => p.t < release.from);
    const pressed = Math.min(...pressedFrames.map(p => p.value));
    const strength = (v: number) => (rest - v) / (rest - pressed);
    // Judge the release while it was still visibly moving inside the block.
    const end = Math.min(block.to, release.to) - 10;
    const during = pixels.filter(p => p.t > block.from && p.t <= end);
    const strengths = during.map(p => ({
      t: +(p.t - block.from).toFixed(1),
      strength: +strength(p.value).toFixed(3),
    }));
    const intervals = during
      .map((p, i) => (i === 0 ? p.t - block.from : p.t - during[i - 1].t))
      .filter(dt => dt > 0);
    const longestGap = Math.max(
      end - (during.at(-1)?.t ?? block.from),
      ...intervals,
    );
    await writeEvidence(
      `busy-main-thread/${story.story}`,
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {block, release, rest, pressed, strengths},
          null,
          1,
        ),
      },
      testInfo,
    );
    const film = await castStoryboard(page, frames, {
      name: `${story.story}-release-busy-main-thread`,
      zero: block.from,
      from: release.from - 40,
      to: release.to + 40,
      columns: 6,
      cellScale: 0.45,
      data: t => {
        const p = pixels.find(f => f.t === t);
        return {strength: p == null ? -1 : +strength(p.value).toFixed(3)};
      },
    });
    await film.write(testInfo, {block, release});
    // The press painted at full strength before the lift.
    expect(rest - pressed).toBeGreaterThan(10);
    // Frames kept coming through the block, each one further along the fade.
    expect(during.length, JSON.stringify(strengths)).toBeGreaterThanOrEqual(
      Math.floor((end - block.from) / (1000 / 60)) - 2,
    );
    expect(longestGap).toBeLessThan(40);
    for (let i = 1; i < strengths.length; i++) {
      expect(strengths[i].strength).toBeLessThanOrEqual(
        strengths[i - 1].strength + 0.01,
      );
    }
    const last = strengths.at(-1);
    expect(last).toBeDefined();
    expect(strengths[0].strength).toBeGreaterThan((last?.strength ?? 1) + 0.2);
  });
}

test('a busy first frame after the lift delays the release instead of skipping into it', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit starts the release at the time the busy script began, so the first frame after a 150 ms block reads opacity 0.03; the next case shows the release still plays to its end there',
  );
  const {driver, row, center} = await openRow(page, LIST_ROW);
  // When the press controller writes the release, 150 ms of script hold the
  // main thread before the first frame. The release starts when the browser
  // styles it, so the first frame due after the block shows it at most one
  // frame in.
  await row.evaluate(el => {
    (window as unknown as {__first: Promise<number>}).__first = new Promise(
      resolve => {
        const observer = new MutationObserver(() => {
          if (el.getAttribute('data-astryx-press') !== 'fading') {
            return;
          }
          observer.disconnect();
          const until = performance.now() + 150;
          while (performance.now() < until) {
            // Busy: the main thread is held.
          }
          // The first frame due after the block: a frame scheduled before
          // it runs with that earlier time.
          const read = () => {
            if ((document.timeline.currentTime as number) < until) {
              requestAnimationFrame(read);
              return;
            }
            resolve(Number(getComputedStyle(el, '::before').opacity));
          };
          requestAnimationFrame(read);
        });
        observer.observe(el, {attributeFilter: ['data-astryx-press']});
      },
    );
  });
  await driver.play(tap(center, {holdMs: 300}));
  const first = await page.evaluate(
    async () => (window as unknown as {__first: Promise<number>}).__first,
  );
  // At most one frame into the release: its ease-out curve takes the first
  // frame to about 0.74; a start pinned before the block would be past 0.4.
  expect(first).toBeGreaterThan(0.7);
  await expect.poll(async () => layerOpacity(row)).toBe(0);
});

test('a busy first frame after the lift still plays the whole release before the press attribute goes', async ({
  page,
  browserName,
}) => {
  const {driver, row, center} = await openRow(page, LIST_ROW);
  const exit = await exitOf(row);
  // When the press controller writes the release, 150 ms of script hold the
  // main thread before the first frame, so the release starts after the
  // block. Every frame after it is read until the attribute goes: the layer
  // must reach rest on the curve, not vanish while it is still painted. The
  // page also records when the release animation starts and ends, and when
  // the attribute leaves `fading`, all on its clock from the block's end.
  await row.evaluate(el => {
    const frames: [number, number, string | null][] = [];
    const release = {
      startAt: Number.NaN,
      endsAt: Number.NaN,
      leftAt: Number.NaN,
    };
    (
      window as unknown as {__frames: typeof frames; __release: typeof release}
    ).__frames = frames;
    (
      window as unknown as {__frames: typeof frames; __release: typeof release}
    ).__release = release;
    const observer = new MutationObserver(() => {
      if (el.getAttribute('data-astryx-press') !== 'fading') {
        return;
      }
      observer.disconnect();
      const until = performance.now() + 150;
      while (performance.now() < until) {
        // Busy: the main thread is held.
      }
      const leave = new MutationObserver(() => {
        if (el.getAttribute('data-astryx-press') !== 'fading') {
          release.leftAt = performance.now() - until;
          leave.disconnect();
        }
      });
      leave.observe(el, {attributeFilter: ['data-astryx-press']});
      const sample = (time: number) => {
        const layer = getComputedStyle(el, '::before');
        const strength =
          layer.content === 'none' || layer.content === 'normal'
            ? 0
            : Number(layer.opacity);
        const press = el.getAttribute('data-astryx-press');
        if (press === 'fading' && Number.isNaN(release.startAt)) {
          const animation = el
            .getAnimations({subtree: true})
            .find(
              running =>
                (running.effect as KeyframeEffect | null)?.pseudoElement ===
                '::before',
            );
          if (animation?.startTime != null) {
            release.startAt = Number(animation.startTime) - until;
            release.endsAt =
              release.startAt +
              Number(animation.effect?.getComputedTiming().endTime);
          }
        }
        if ((document.timeline.currentTime as number) >= until) {
          frames.push([+(time - until).toFixed(1), strength, press]);
        }
        if (press === 'fading' && frames.length < 120) {
          requestAnimationFrame(sample);
        }
      };
      requestAnimationFrame(sample);
    });
    observer.observe(el, {attributeFilter: ['data-astryx-press']});
  });
  await driver.play(tap(center, {holdMs: 300}));
  await expect.poll(async () => pressState(row)).toBeNull();
  const {frames, release} = await page.evaluate(() => {
    const w = window as unknown as {
      __frames: [number, number, string | null][];
      __release: {startAt: number; endsAt: number; leftAt: number};
    };
    return {frames: w.__frames, release: w.__release};
  });
  const record = JSON.stringify({release, frames});
  const fading = frames.filter(([, , press]) => press === 'fading');
  // WebKit can start the release at the time the busy script began, so its
  // first frame after the block can already be near rest (opacity 0.03
  // measured) and few frames remain. There, only the end and the order of
  // the frames hold. A page starved of frames fails by name.
  if (browserName !== 'webkit') {
    requireFrames(
      frames.map(([t, strength, press]) => ({t, strength, press})),
      {
        min: 4,
        during: 'the release played',
        where: frame => frame.press === 'fading',
      },
    );
  }
  expect(
    Number.isFinite(release.startAt) && Number.isFinite(release.endsAt),
    'the release animation was not read',
  ).toBe(true);
  // The attribute goes once the release has played, however late it started:
  // it leaves `fading` at or after the release animation's end. Both times
  // are on the page's clock, so a frame gap moves neither.
  expect(release.leftAt, record).toBeGreaterThanOrEqual(release.endsAt - 1);
  // Each fading frame shows the layer no stronger than the exit curve at that
  // frame's own time into the release. A late frame shows a later point of
  // the curve, so a frame gap still reads true.
  for (const [t, strength] of fading) {
    expect(strength, record).toBeLessThanOrEqual(
      strengthAt(exit, t - release.startAt) + 0.01,
    );
  }
  // And the release played on the way there, frame by frame.
  for (let i = 1; i < fading.length; i++) {
    expect(fading[i][1], record).toBeLessThanOrEqual(fading[i - 1][1] + 0.01);
  }
});

test('the release does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, row, center} = await openRow(page, LIST_ROW);
  const exit = await exitOf(row);
  let release = {from: 0, to: 0};
  const started = Date.now();
  const trace = await traceRendering(page, async () => {
    const watch = await watchAnimations(row);
    await driver.play(tap(center, {holdMs: HOLD_MS}));
    [release] = await watch.started();
    await page.waitForTimeout(exit.ms + 100);
  });
  // The steady part of the release: its first and last frames may commit.
  const during = countBetween(trace, release.from + 30, release.to - 30);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  expect(await readLongTasks(page, {from: started, to: Date.now()})).toEqual(
    [],
  );
});

test('WebKit: the release keeps fading while the main thread is blocked (video)', async ({
  browser,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'webkit',
    'the Chromium screencast test covers Chromium',
  );
  const size = {width: 402, height: 714};
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    recordVideo: {dir: testInfo.outputPath('video'), size},
  });
  const page = await context.newPage();
  const {driver, row, center, probe} = await openRow(page, LIST_ROW);
  // A long exit duration on the row, so its release spans many of the
  // recording's frames inside the block, whatever the theme's own value is.
  await row.evaluate(el =>
    (el as HTMLElement).style.setProperty('--duration-exit', '400ms'),
  );
  const exit = await exitOf(row);
  // A beacon the main thread paints: blue while it is about to block, green
  // once it has run again. Frames in which the beacon is blue were presented
  // while script could not run.
  await page.evaluate(() => {
    const beacon = document.createElement('div');
    beacon.id = 'beacon';
    Object.assign(beacon.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '40px',
      height: '40px',
      background: 'rgb(128, 128, 128)',
      zIndex: '2147483647',
    });
    document.body.append(beacon);
  });
  // Armed in the page so the block starts two frames after the lift, with
  // no test-runner round trip in between: blue, committed by two frames,
  // then the block; every frame showing blue was presented while script
  // could not run.
  await page.evaluate(() => {
    addEventListener(
      'touchend',
      () => {
        const beacon = document.getElementById('beacon') as HTMLElement;
        beacon.style.background = 'rgb(0, 0, 255)';
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const end = performance.now() + 700;
            while (performance.now() < end) {
              // blocked
            }
            beacon.style.background = 'rgb(0, 200, 0)';
          }),
        );
      },
      {once: true, passive: true, capture: true},
    );
  });
  await page.waitForTimeout(300);
  await driver.play(tap(center, {holdMs: HOLD_MS}));
  await page.waitForTimeout(1300);
  const video = page.video();
  await context.close();
  const path = await video?.path();
  expect(path).toBeTruthy();
  const bytes = (await readFile(path as string)).toString('base64');
  const decoder = await chromium.launch();
  try {
    const playerContext = await decoder.newContext();
    await keepRequestsLocal(playerContext);
    const player = await playerContext.newPage();
    const samples = await player.evaluate(
      async ({at, webm, beaconAt}) => {
        const element = document.createElement('video');
        element.muted = true;
        element.src = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(webm), c => c.charCodeAt(0))], {
            type: 'video/webm',
          }),
        );
        document.body.append(element);
        if (element.readyState < 1) {
          await new Promise(r =>
            element.addEventListener('loadedmetadata', r, {once: true}),
          );
        }
        element.pause();
        const canvas = document.createElement('canvas');
        canvas.width = element.videoWidth;
        canvas.height = element.videoHeight;
        const context2d = canvas.getContext('2d', {
          willReadFrequently: true,
        }) as CanvasRenderingContext2D;
        const out: {t: number; value: number; beacon: string}[] = [];
        const duration = Number.isFinite(element.duration)
          ? element.duration
          : 10;
        for (let t = 0; t < duration; t += 0.01) {
          element.currentTime = t;
          await new Promise(r =>
            element.addEventListener('seeked', r, {once: true}),
          );
          context2d.drawImage(element, 0, 0);
          const px = context2d.getImageData(at.x, at.y, 1, 1).data;
          const b = context2d.getImageData(beaconAt.x, beaconAt.y, 1, 1).data;
          const beacon =
            b[2] > 180 && b[0] < 80
              ? 'blocked'
              : b[1] > 150 && b[2] < 80
                ? 'after'
                : 'before';
          out.push({t, value: (px[0] + px[1] + px[2]) / 3, beacon});
        }
        return out;
      },
      {
        at: probe,
        webm: bytes,
        beaconAt: {x: size.width - 20, y: size.height - 20},
      },
    );
    const blocked = samples.filter(s => s.beacon === 'blocked');
    const before = samples.filter(s => s.beacon === 'before');
    const rest = Math.max(...before.map(s => s.value));
    // The pressed colour from the hold's own frames, not from the page's
    // load, so a dark frame while Storybook starts cannot move it.
    const holdStart = blocked.length > 0 ? blocked[0].t - HOLD_MS / 1000 : 0;
    const pressed = Math.min(
      ...before.filter(s => s.t >= holdStart).map(s => s.value),
    );
    // The exit curve leaves fastest at its end, so the last frame the
    // recording catches can be short of rest. The release has reached its
    // end when a frame shows at least the curve's value `REST_MARGIN_MS`
    // before the end.
    const nearRest =
      rest - (rest - pressed) * strengthAt(exit, exit.ms - REST_MARGIN_MS) - 1;
    // Judge the release up to the frame it reaches the row's resting color,
    // within `REST_MARGIN_MS`.
    // (Measured in the Linux WebKit build: once an accelerated animation has
    // finished while script is still blocked, the compositor shows the value
    // the main thread last committed until script runs again. That is this
    // build's end-of-animation hand-back, after the release; iOS Safari 26.2
    // holds the resting color on the simulator. It is recorded below, not
    // judged here.)
    const restIndex = blocked.findIndex(s => s.value >= nearRest);
    const fading = restIndex === -1 ? blocked : blocked.slice(0, restIndex + 1);
    const distinct = fading
      .map(s => Math.round(s.value))
      .filter((v, i, all) => i === 0 || v !== all[i - 1]);
    const afterEnd = restIndex === -1 ? [] : blocked.slice(restIndex + 1);
    await writeEvidence(
      'busy-main-thread/list-row-release-webkit',
      {
        'webkit.json': JSON.stringify(
          {rest, pressed, nearRest, exit, blocked, distinct, afterEnd},
          null,
          1,
        ),
      },
      testInfo,
    );
    testInfo.annotations.push({
      type: 'WebKit frames during the block',
      description: `release: ${distinct.join(' ')}; after it ended, still blocked: ${[
        ...new Set(afterEnd.map(s => Math.round(s.value))),
      ].join(' ')}`,
    });
    expect(blocked.length).toBeGreaterThan(0);
    // The row kept getting lighter while script could not run, all the way
    // to its resting color: from a frame still short of rest, it reached rest
    // (within `REST_MARGIN_MS`) inside the blocked window. A release on
    // the main thread would hold its first frame's value until the block
    // ends, 700 ms on, and could not. (The recording's frames are about
    // 40 ms apart, so how many land inside the release depends on its phase:
    // the count is not judged.)
    const values = JSON.stringify(blocked.map(s => Math.round(s.value)));
    expect(blocked[0].value, values).toBeLessThan(nearRest);
    expect(restIndex, values).toBeGreaterThan(0);
    // Lighter frame by frame. The first frames move the row by about one
    // level, so a video decode may round one of them a level back: allow
    // that one level, never more.
    for (let i = 1; i < distinct.length; i++) {
      expect(distinct[i], values).toBeGreaterThanOrEqual(distinct[i - 1] - 1);
    }
    expect(distinct.at(-1), values).toBeGreaterThan(distinct[0]);
  } finally {
    await decoder.close();
  }
});

test(
  'storyboard: a row released after a hold',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, row, center} = await openRow(page, LIST_ROW);
    const exit = await exitOf(row);
    await installTimerGate(page);
    const box = await row.boundingBox();
    if (box == null) {
      throw new Error('no row');
    }
    const clip = {
      x: 0,
      y: Math.max(0, box.y - 16),
      width: page.viewportSize()?.width ?? 402,
      height: box.height + 32,
    };
    // Armed before the press, so the film starts where the release starts.
    const hold = await armHold(page, row, {
      judges: {target: row, property: 'opacity', pseudoElement: '::before'},
    });
    await driver.play(tap(center, {holdMs: HOLD_MS}));
    await freezeTimers(page);
    const {storyboard} = await animationStoryboard(page, {
      name: 'list-row-press-release',
      clip,
      held: await hold.held(),
      measure: async () => ({
        opacity: await layerOpacity(row),
        state: await pressState(row),
      }),
      columns: 7,
      cellScale: 0.6,
    });
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    await storyboard.write(testInfo);
    // The trace is the assertion; the sheet is the evidence.
    const opacities = storyboard.frames.map(f => f.data.opacity as number);
    expect(opacities[0]).toBeCloseTo(1, 2);
    expect(opacities.at(-1)).toBeLessThan(0.01);
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1] + 1e-6);
    }
    storyboard.frames.forEach(f =>
      expect(f.data.opacity as number).toBeCloseTo(strengthAt(exit, f.t), 2),
    );
  },
);
