// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxDismiss.interaction.browser.spec.ts
 * @input The built Lightbox stories on the phone project, real touch input
 *   and the interaction harness
 * @output Proofs for Lightbox's drag to dismiss against Photos' measured one.
 *   They cover the follow, shrink and fades, a release that dismisses or
 *   springs back, a zoomed photo's pan and a gallery. They also cover a
 *   blocked main thread, Reduce Motion, reopening, a caller that keeps the
 *   viewer open, Close above a gallery's pages and a storyboard.
 * @position Interaction tests for Lightbox (browser), beside
 *   LightboxZoom.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  armHold,
  blockMainThread,
  type BusyRun,
  type BusyWindow,
  compareCurve,
  CONTROL_RGB,
  curveOf,
  drag,
  frames,
  type HeldAnimation,
  openStory,
  pooledBusyProof,
  releaseAnimations,
  sampleCurve,
  startBusyControl,
  startScreencast,
  timeline,
  type TouchDriver,
  touchDriver,
  type TouchScript,
  touchStoryboard,
  trackBrightness,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';
import {slowViewer} from './viewerTempo';

const storybook = withStorybook(test);

// Photos' measured drag to dismiss (motion/uikit/zoomMedia.ts), restated so
// a change to the table has to be made here too.
const SCALE_K = 4.91e-6;
const BACKDROP_K = 1.35e-5;
const CHROME_PER_PT = 0.00533;
const CHROME_START = 17.8;
/** The pan's begin threshold: travel before it is the finger's alone. */
const THRESHOLD = 10;
/** The dismissal's opacity spring: critically damped, mass 1. */
const FADE_STIFFNESS = 947.14;

/**
 * How near its end, in brightness levels, a fade on the dismissal's opacity
 * spring still steps a whole level between two frames `frameMs` apart. It
 * takes the widest range, all 255 levels. Nearer the end, a fade that still
 * runs can show the same 8-bit level twice.
 */
function wholeStepsUntil(frameMs: number): number {
  const omega = Math.sqrt(FADE_STIFFNESS);
  const left = (s: number) => 255 * (1 + omega * s) * Math.exp(-omega * s);
  // Past its fastest point, at 1 / omega, the step between frames only falls.
  let t = 1 / omega;
  while (left(t) - left(t + frameMs / 1000) >= 1) {
    t += 0.0001;
  }
  return left(t);
}

/** A critically damped spring from `from` to `to`, at rest at the start. */
function criticallyDamped(stiffness: number, from: number, to: number) {
  const omega = Math.sqrt(stiffness);
  return (ms: number) => {
    const t = ms / 1000;
    return to + (from - to) * (1 + omega * t) * Math.exp(-omega * t);
  };
}

function photoSvg(width: number, height: number): string {
  let squares = '';
  for (let y = 0; y < height; y += 50) {
    for (let x = 0; x < width; x += 50) {
      if ((x + y) % 100 === 0) {
        squares += `<rect x="${x}" y="${y}" width="50" height="50"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${squares}</g><circle cx="${width / 2}" cy="${height / 2}" r="${height / 8}" fill="#d22"/></svg>`;
}

interface Viewer {
  driver: TouchDriver;
  dialog: Locator;
  photo: Locator;
  close: Locator;
  /** The photo's box centre on the page. */
  centre: {x: number; y: number};
  /** The photo's zoom-stage transform. */
  photoState: () => Promise<{x: number; y: number; scale: number}>;
  backdropAlpha: () => Promise<number>;
  /** The opacity of the controls' layer (the Close button's). */
  closeAlpha: () => Promise<number>;
}

const STORIES = {
  plain: {id: 'core-lightbox--default', trigger: 'Open lightbox'},
  zoom: {id: 'core-lightbox--with-zoom', trigger: 'Open with zoom'},
  gallery: {
    id: 'core-lightbox--gallery-with-zoom',
    trigger: 'Open gallery with zoom',
  },
  // Its parent asks before closing; Playwright dismisses the confirm, so the
  // parent keeps the viewer open.
  confirm: {
    id: 'core-lightbox--confirm-close',
    trigger: 'Open, confirm to close',
  },
} as const;

async function openViewer(
  page: Page,
  story: keyof typeof STORIES = 'plain',
): Promise<Viewer> {
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({contentType: 'image/svg+xml', body: photoSvg(3000, 2000)}),
  );
  await openStory(page, storybook(), STORIES[story].id);
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: STORIES[story].trigger});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const photo =
    story === 'gallery'
      ? dialog.locator('[data-current] img')
      : dialog.locator('img').first();
  await expect
    .poll(async () =>
      photo.evaluate(el => (el as HTMLImageElement).naturalWidth),
    )
    .toBe(3000);
  await frames(page, 2);
  const rect = await photo.boundingBox();
  if (rect == null) {
    throw new Error('no photo');
  }
  const close = dialog.getByRole('button', {name: 'Close'});
  return {
    driver,
    dialog,
    photo,
    close,
    centre: {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2},
    photoState: async () =>
      photo.evaluate(el => {
        const style = getComputedStyle(el);
        const [x = '0', y = '0'] =
          style.translate === 'none' ? [] : style.translate.split(' ');
        return {
          x: parseFloat(x),
          y: parseFloat(y),
          scale: style.scale === 'none' ? 1 : parseFloat(style.scale),
        };
      }),
    backdropAlpha: async () =>
      dialog.evaluate(el =>
        parseFloat(getComputedStyle(el, '::backdrop').opacity),
      ),
    closeAlpha: async () =>
      dialog
        .locator('[data-lightbox-chrome]')
        .first()
        .evaluate(el => parseFloat(getComputedStyle(el).opacity)),
  };
}

/** A slow drag down by `dy`, held still before the lift. */
function pullDown(from: {x: number; y: number}, dy: number): TouchScript {
  return drag(
    from,
    {x: from.x, y: from.y + dy},
    {durationMs: 500, restMs: 150},
  );
}

test('a drag down carries the photo and shrinks it by the travel, as the backdrop and controls fade', async ({
  page,
}, testInfo) => {
  const v = await openViewer(page);
  const rows: {
    travel: number;
    scale: number;
    backdrop: number;
    chrome: number;
    dy: number;
  }[] = [];
  await v.driver.play(pullDown(v.centre, 155), {
    onEvent: async step => {
      if (step.type !== 'touchMove') {
        return;
      }
      await frames(page, 1);
      const travel = step.changed[0].y - v.centre.y - THRESHOLD;
      if (travel <= 0) {
        return;
      }
      const s = await v.photoState();
      rows.push({
        travel,
        scale: s.scale,
        dy: s.y,
        backdrop: await v.backdropAlpha(),
        chrome: await v.closeAlpha(),
      });
    },
  });
  await writeEvidence(
    'curves/lightbox-drag-to-dismiss',
    {[`${testInfo.project.name}.json`]: JSON.stringify(rows, null, 1)},
    testInfo,
  );
  expect(rows.length).toBeGreaterThan(10);
  const photoHeight = await v.photo.evaluate(
    el => (el as HTMLElement).offsetHeight,
  );
  for (const row of rows) {
    // The travel the photo shows: its centre's offset (it shrinks about it).
    const t = row.dy - ((1 - row.scale) * photoHeight) / 2;
    // It follows the finger 1:1 (a read may trail it by one move).
    expect(Math.abs(t - row.travel)).toBeLessThan(6);
    expect(row.scale).toBeCloseTo(1 - SCALE_K * t * t, 3);
    // The fades are read after the photo: a read may see them up to two
    // moves behind it (12 px of travel; WebKit dispatches slower).
    const backdrop = (travel: number) =>
      Math.min(1, 1 - BACKDROP_K * Math.max(0, travel) ** 2);
    const chrome = (travel: number) =>
      Math.min(1, Math.max(0, 1 - CHROME_PER_PT * (travel - CHROME_START)));
    expect(row.backdrop).toBeLessThanOrEqual(backdrop(t - 12) + 0.005);
    expect(row.backdrop).toBeGreaterThanOrEqual(backdrop(t) - 0.005);
    expect(row.chrome).toBeLessThanOrEqual(chrome(t - 12) + 0.005);
    expect(row.chrome).toBeGreaterThanOrEqual(chrome(t) - 0.005);
  }
});

test("a release moving down sends the photo on the dismissal's spring and closes the viewer", async ({
  page,
}, testInfo) => {
  const v = await openViewer(page);
  // The viewer closes at the exit's end. A hold sent after the lift can
  // arrive after that on a busy machine. So the page holds the exit itself as
  // it starts.
  const hold = await armHold(page, v.photo, {
    judges: {target: v.photo, property: 'translate'},
  });
  await v.driver.play(pullDown(v.centre, 110));
  const held = await hold.held();
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const samples = curveOf(
    await sampleCurve(v.photo, timeline(duration)),
    'translateY',
  );
  await releaseAnimations(page);
  const from = samples[0].value;
  const to = samples[samples.length - 1].value;
  // x(t) = to + (A + B·t)·e^(−ωt), A = from − to; B carries the release
  // velocity (B = v₀ + ωA), fitted by least squares.
  const omega = Math.sqrt(918.09);
  let num = 0;
  let den = 0;
  for (const {t, value} of samples) {
    const ts = t / 1000;
    const basis = ts * Math.exp(-omega * ts);
    num += basis * (value - to - (from - to) * Math.exp(-omega * ts));
    den += basis * basis;
  }
  const b = den > 0 ? num / den : 0;
  const spring = (ms: number) => {
    const ts = ms / 1000;
    return to + (from - to + b * ts) * Math.exp(-omega * ts);
  };
  const result = compareCurve(samples, spring, 1);
  await writeEvidence(
    'curves/lightbox-dismiss-exit',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {held, samples, result},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(1);
  expect(to).toBeGreaterThan(from + 200);
  await expect(v.dialog).toBeHidden();
});

test("the dismissal plays at the viewer's tempo", async ({page}) => {
  // The same exit at tempo 1, to compare the paced one with.
  const atTempo1 = await dismissCurves(page, await openViewer(page));
  const v = await openViewer(page);
  await slowViewer(page, DISMISS_TEMPO);
  const paced = await dismissCurves(page, v);
  // Released at rest, so each spring takes exactly that many times as long.
  for (const part of ['move', 'fade'] as const) {
    const ratio = paced[part] / atTempo1[part];
    expect(ratio, part).toBeGreaterThan(DISMISS_TEMPO - 0.1);
    expect(ratio, part).toBeLessThan(DISMISS_TEMPO + 0.1);
  }
});

/** The tempo the dismissal's tempo case plays the viewer at. */
const DISMISS_TEMPO = 2;

/**
 * Dismisses the photo with a slow drag held still before the lift. Returns
 * how long the exit's curves run: the photo's move, on the position spring,
 * and a control's fade, on the size spring. The viewer closes at the exit's
 * end, and a read after the lift can come later than that on a busy machine.
 * So the page holds both curves itself as they start.
 */
async function dismissCurves(
  page: Page,
  v: Viewer,
): Promise<{move: number; fade: number}> {
  const chrome = v.dialog.locator('[data-lightbox-chrome]').first();
  const moves = await armHold(page, v.photo, {
    judges: {target: v.photo, property: 'translate'},
  });
  const fades = await armHold(page, chrome, {
    judges: {target: chrome, property: 'opacity'},
  });
  await v.driver.play(pullDown(v.centre, 110));
  const length = (runs: ReadonlyArray<HeldAnimation>, property: string) =>
    Math.max(
      ...runs
        .filter(run => run.keyframes.some(frame => property in frame))
        .map(run => run.curveEndMs),
    );
  const move = length(await moves.held(), 'translate');
  const fade = length(await fades.held(), 'opacity');
  await releaseAnimations(page);
  await expect(v.dialog).toBeHidden();
  return {move, fade};
}

test('a pull flicked back up springs back on springs.settle', async ({
  page,
}, testInfo) => {
  const v = await openViewer(page);
  const down = {x: v.centre.x, y: v.centre.y + 150};
  const script: TouchScript = drag(v.centre, down, {durationMs: 400})
    .slice(0, -1)
    .concat(
      drag(down, {x: down.x, y: down.y - 60}, {durationMs: 60})
        .slice(1)
        .map(f => ({
          ...f,
          t: f.t + 420,
        })),
    );
  // The return runs half a second. A hold sent after the lift can arrive
  // after it ends on a busy machine. So the page holds it itself as it starts.
  const hold = await armHold(page, v.photo, {
    judges: {target: v.photo, property: 'scale'},
  });
  await v.driver.play(script);
  const held = await hold.held();
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const samples = curveOf(
    await sampleCurve(v.photo, timeline(duration)),
    'scaleX',
  );
  await releaseAnimations(page);
  // `springs.settle`: response 0.5 s, critically damped, so a stiffness of
  // (2π / 0.5 s)² at mass 1. The size returns from rest.
  const result = compareCurve(
    samples,
    criticallyDamped(((2 * Math.PI) / 0.5) ** 2, samples[0].value, 1),
    0.002,
  );
  await writeEvidence(
    'curves/lightbox-dismiss-cancel',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {held, samples, result},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(samples[0].value).toBeLessThan(0.99);
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
    0.002,
  );
  await waitForRest(v.photo);
  expect(await v.photoState()).toEqual({x: 0, y: 0, scale: 1});
  await expect(v.dialog).toBeVisible();
  await expect.poll(v.backdropAlpha).toBeCloseTo(1, 2);
  await expect.poll(v.closeAlpha).toBeCloseTo(1, 2);
});

test('a pull brought back to where it started springs back', async ({page}) => {
  const v = await openViewer(page);
  const down = {x: v.centre.x, y: v.centre.y + 120};
  const script = drag(v.centre, down, {durationMs: 300})
    .slice(0, -1)
    .concat(
      drag(
        down,
        {x: down.x, y: v.centre.y + THRESHOLD + 4},
        {durationMs: 300, restMs: 150},
      )
        .slice(1)
        .map(f => ({...f, t: f.t + 320})),
    );
  await v.driver.play(script);
  await frames(page, 30);
  await waitForRest(v.photo);
  expect(await v.photoState()).toEqual({x: 0, y: 0, scale: 1});
  await expect(v.dialog).toBeVisible();
});

test("a zoomed photo's vertical drag pans it and never dismisses", async ({
  page,
}) => {
  const v = await openViewer(page, 'zoom');
  await v.driver.play([
    {t: 0, fingers: [{id: 0, ...v.centre}]},
    {t: 50, fingers: []},
    {t: 170, fingers: [{id: 0, ...v.centre}]},
    {t: 220, fingers: []},
  ]);
  await waitForAnimation(v.photo);
  await waitForRest(v.photo);
  const zoomed = await v.photoState();
  expect(zoomed.scale).toBeGreaterThan(1.5);
  await v.driver.play(pullDown(v.centre, 80));
  await waitForRest(v.photo);
  const after = await v.photoState();
  expect(after.scale).toBeCloseTo(zoomed.scale, 3);
  await expect(v.dialog).toBeVisible();
  expect(await v.backdropAlpha()).toBeCloseTo(1, 2);
});

test('a gallery photo dismisses with a drag down', async ({page}) => {
  const v = await openViewer(page, 'gallery');
  await v.driver.play(pullDown(v.centre, 120));
  await expect(v.dialog).toBeHidden();
});

test('the dismissal keeps changing the screen every frame while the main thread is blocked', async ({
  page,
}, testInfo) => {
  // The dismissal runs for about a fifth of a second. A blocked WebKit
  // presents a frame only every 100 to 300 ms, so one run can hold too few
  // frames to judge. The proof plays it several times and judges the runs
  // pooled: each run on its own frames, the frame floor over all of them.
  const runs: BusyRun[] = [];
  const windows: BusyWindow[] = [];
  const closed: boolean[] = [];
  // The backdrop's level on the cast while the finger rests before each lift:
  // the value the page itself set at the drag's end.
  const beforeLift: (number | null)[] = [];
  let closest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < DISMISS_RUNS; run += 1) {
    const v = await openViewer(page);
    const box = await v.photo.boundingBox();
    if (box == null) {
      throw new Error('no photo');
    }
    // A flat point of the backdrop above the photo. The dismissal fades the
    // backdrop there every frame it runs, and nothing else paints there.
    const probe = {x: box.x + box.width / 2, y: box.y - 40};
    // A compositor-only control animation in the same window: what the
    // compositor presented while the main thread spun, on this machine.
    await startBusyControl(page);
    const cast = await startScreencast(page);
    // Blocked inside the page once the dismissal runs on the compositor. The
    // page already waits when the lift starts the dismissal, so a busy
    // machine's round trip does not start the block later in the fade.
    const blocking = blockMainThread(page, 400, {
      during: v.photo,
      minProgressMs: 16,
    });
    const played = await v.driver.play(pullDown(v.centre, 60));
    const block = await blocking;
    // A few frames after the block, so the screencast holds its end.
    await frames(page, 6);
    const castFrames = await cast.stop();
    const tracked = await trackBrightness(page, castFrames, {
      ...probe,
      size: 8,
    });
    const lift =
      played.find(e => e.type === 'touchEnd')?.dispatchedAt ?? Number.NaN;
    const lastMove =
      played.filter(e => e.type === 'touchMove').at(-1)?.dispatchedAt ??
      Number.NaN;
    beforeLift.push(
      tracked.filter(f => f.box != null && f.t >= lastMove && f.t < lift).at(-1)
        ?.box?.x ?? null,
    );
    const final = tracked.at(-1)?.box?.x ?? 0;
    const settled =
      tracked.find(
        f =>
          f.t >= block.from && f.box != null && Math.abs(f.box.x - final) <= 1,
      )?.t ?? block.to;
    const window = {
      from: block.from + 20,
      to: Math.min(block.to, settled) - 1,
    };
    const shown = tracked.filter(f => f.t >= window.from && f.t <= window.to);
    for (let i = 1; i < shown.length; i += 1) {
      closest = Math.min(closest, shown[i].t - shown[i - 1].t);
    }
    runs.push({
      tracked,
      control: await trackMarker(page, castFrames, {rgb: CONTROL_RGB}),
      window,
    });
    windows.push(window);
    closed.push(
      await v.dialog.waitFor({state: 'hidden', timeout: 2000}).then(
        () => true,
        () => false,
      ),
    );
  }
  // Every drag ends at the same travel, so the page sets one backdrop level
  // before each lift.
  const setBeforeBlock = beforeLift[0];
  expect(
    setBeforeBlock,
    'a frame shows the rest before the lift',
  ).not.toBeNull();
  beforeLift.forEach((level, i) => {
    expect(level, `run ${i + 1}: the backdrop's level before the lift`).toBe(
      setBeforeBlock,
    );
  });
  // A change of the backdrop's brightness counts, in 8-bit levels. So
  // judging stops where the fade's step between the closest two frames shown
  // falls below one level. A shown level is rounded, so half a level is added.
  const proof = pooledBusyProof(runs, {
    axis: 'x',
    settledWithin: wholeStepsUntil(closest) + 0.5,
    // WebKit presents a just-started compositor fade late, so the backdrop can
    // hold the page's own last level into the block. A hold at any other
    // level is a freeze.
    setBeforeBlock: setBeforeBlock ?? undefined,
    // A run whose control moved on fewer than two frames is too little to
    // judge. At least two of the four runs must be judged.
    minRunFrames: 2,
    minJudgedRuns: 2,
  });
  await writeEvidence(
    'busy-main-thread/lightbox-dismiss',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {windows, beforeLift, proof},
        null,
        1,
      ),
    },
    testInfo,
  );
  // Judged against the control. A two-core runner's software compositor and
  // the screencast share the core the block spins on. So every compositor
  // animation presents fewer frames there, the control's too. The screen
  // keeps changing with the control, and a main-thread fade would not.
  expect(proof.verdict.failures).toEqual([]);
  // Each judged run shows the backdrop at a new level on at least one of its
  // own frames, not an excused one. So runs of one frame cannot add up to the
  // floor.
  proof.judged.forEach((judged, i) => {
    const read = proof.runs[i]?.control;
    if (judged) {
      expect(
        (read?.movedWith ?? 0) - (read?.belowStep ?? 0),
        `run ${i + 1} shows a new backdrop level`,
      ).toBeGreaterThanOrEqual(1);
    }
  });
  // The cutoff above comes from two frames a run showed, not a default.
  expect(closest, 'a run shows two frames in its window').toBeLessThan(
    Number.POSITIVE_INFINITY,
  );
  for (const window of windows) {
    expect(window.to - window.from).toBeGreaterThan(100);
  }
  expect(closed).toEqual(windows.map(() => true));
});

/** How many dismissals the busy proof plays and judges pooled. */
const DISMISS_RUNS = 4;

test('under Reduce Motion the dismissal fades the photo out in place', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const v = await openViewer(page);
  // The fade runs 200 ms and the viewer closes at its end. A hold sent from
  // here after the lift can arrive after the fade ends on a busy machine. So
  // the page holds the fade itself as it starts.
  const hold = await armHold(page, v.photo, {
    judges: {target: v.photo, property: 'opacity'},
  });
  await v.driver.play(pullDown(v.centre, 110));
  const held = await hold.held();
  const samples = await sampleCurve(v.photo, [0, 50]);
  await releaseAnimations(page);
  // Under reduced motion, a fade of 200 ms or less.
  expect(Math.max(...held.map(a => a.curveEndMs))).toBeLessThanOrEqual(205);
  // The travel lands at the end; meanwhile the photo fades where it was.
  expect(samples[0].transform.translateY).toBeCloseTo(
    samples[1].transform.translateY,
    1,
  );
  expect(samples[1].opacity).toBeLessThan(samples[0].opacity);
  expect(held.length).toBeGreaterThan(0);
  await expect(v.dialog).toBeHidden();
});

test(
  'storyboard: drag to dismiss',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const v = await openViewer(page);
    const board = await touchStoryboard(
      page,
      v.driver,
      drag(
        v.centre,
        {x: v.centre.x + 20, y: v.centre.y + 160},
        {
          durationMs: 300,
          hz: 20,
          restMs: 100,
        },
      ),
      {
        name: 'lightbox-drag-to-dismiss',
        // The viewer closes at the exit's end, and on a busy machine that can
        // come before the frame after the lift. So the photo is read without
        // a wait for it, and a closed viewer reads as closed.
        measure: async () => {
          const [scale] = await v.photo.evaluateAll(photos =>
            photos.map(el => {
              const value = getComputedStyle(el).scale;
              return value === 'none' ? 1 : parseFloat(value);
            }),
          );
          const [backdrop] = await v.dialog.evaluateAll(dialogs =>
            dialogs.map(el =>
              parseFloat(getComputedStyle(el, '::backdrop').opacity),
            ),
          );
          return scale == null || backdrop == null
            ? {closed: true}
            : {scale: +scale.toFixed(3), backdrop: +backdrop.toFixed(2)};
        },
        columns: 4,
        cellScale: 0.35,
      },
    );
    await board.write(testInfo);
  },
);

test("reopening at the dismissed photo's neighbour shows that photo", async ({
  page,
}) => {
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({contentType: 'image/svg+xml', body: photoSvg(3000, 2000)}),
  );
  await openStory(page, storybook(), 'core-lightbox--gallery');
  const driver = await touchDriver(page);
  const thumbnails = page.locator('#storybook-root img[style*="cover"]');
  const tapThumbnail = async (i: number) => {
    const b = await thumbnails.nth(i).boundingBox();
    if (b == null) {
      throw new Error('no thumbnail');
    }
    await driver.tap({x: b.x + b.width / 2, y: b.y + b.height / 2});
  };
  const dialog = page.getByRole('dialog');
  const current = dialog.locator('[data-current]');
  await tapThumbnail(1);
  await expect(dialog).toBeVisible();
  // A plain image opener zooms the photo out of it: wait for it to land.
  await waitForRest(current.locator('img'));
  await frames(page, 4);
  const rect = await current.locator('img').boundingBox();
  if (rect == null) {
    throw new Error('no photo');
  }
  await driver.play(
    pullDown({x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}, 110),
  );
  await expect(dialog).toBeHidden();
  // The release faded the second photo's neighbours, the third among them.
  await tapThumbnail(2);
  await expect(dialog).toBeVisible();
  await frames(page, 4);
  expect(
    await current.evaluate(el => parseFloat(getComputedStyle(el).opacity)),
  ).toBe(1);
});

test('a caller that keeps the viewer open gets the photo, the backdrop and the controls back', async ({
  page,
}) => {
  const v = await openViewer(page, 'confirm');
  await v.driver.play(pullDown(v.centre, 110));
  // The photo comes back once the caller keeps the viewer open.
  await expect
    .poll(
      async () => {
        const s = await v.photoState();
        return Math.abs(s.y) < 0.5 && Math.abs(s.scale - 1) < 0.001;
      },
      {timeout: 3000},
    )
    .toBe(true);
  await expect(v.dialog).toBeVisible();
  const state = await v.photoState();
  expect(state.y).toBeCloseTo(0, 0);
  expect(state.scale).toBeCloseTo(1, 3);
  expect(await v.backdropAlpha()).toBeCloseTo(1, 2);
  expect(await v.closeAlpha()).toBeCloseTo(1, 2);
  // And a new drag follows the finger again.
  let followed = 0;
  await v.driver.play(pullDown(v.centre, 80), {
    onEvent: async step => {
      if (step.type === 'touchMove') {
        followed = Math.max(followed, (await v.photoState()).y);
      }
    },
  });
  expect(followed).toBeGreaterThan(20);
});

test('a photo dragged to dismiss draws above its caption', async ({page}) => {
  // Without zoom the caption sits right under the photo. So the drag carries
  // the photo over it while the caption still shows, faded.
  const v = await openViewer(page);
  const caption = v.dialog.locator('[data-lightbox-caption]');
  await expect(caption).toBeVisible();
  let compared = false;
  await v.driver.play(pullDown(v.centre, 100), {
    onEvent: async step => {
      if (
        compared ||
        step.type !== 'touchMove' ||
        step.changed[0].y - v.centre.y < 90
      ) {
        return;
      }
      compared = true;
      await frames(page, 1);
      const [photoBox, captionBox] = await Promise.all([
        v.photo.boundingBox(),
        caption.boundingBox(),
      ]);
      if (photoBox == null || captionBox == null) {
        throw new Error('no photo or caption');
      }
      // Where the photo covers the caption, 2 px inside both edges.
      const top = Math.ceil(Math.max(photoBox.y, captionBox.y)) + 2;
      const bottom =
        Math.floor(
          Math.min(
            photoBox.y + photoBox.height,
            captionBox.y + captionBox.height,
          ),
        ) - 2;
      const left = Math.ceil(Math.max(photoBox.x, captionBox.x)) + 2;
      const right =
        Math.floor(
          Math.min(
            photoBox.x + photoBox.width,
            captionBox.x + captionBox.width,
          ),
        ) - 2;
      // The cover spans the caption's text, and the caption still shows.
      expect(bottom - top).toBeGreaterThan(24);
      expect(
        await caption.evaluate(el => Number(getComputedStyle(el).opacity)),
      ).toBeGreaterThan(0.3);
      const clip = {x: left, y: top, width: right - left, height: bottom - top};
      const shown = await page.screenshot({clip});
      await caption.evaluate(el => {
        (el as HTMLElement).style.visibility = 'hidden';
      });
      const hidden = await page.screenshot({clip});
      await caption.evaluate(el => {
        (el as HTMLElement).style.visibility = '';
      });
      // Hiding the caption changes no pixel under the photo.
      expect(shown.equals(hidden)).toBe(true);
    },
  });
  expect(compared).toBe(true);
});

for (const story of ['zoom', 'gallery'] as const) {
  test(`a photo dragged to dismiss draws past the box it was fitted in (${story})`, async ({
    page,
  }) => {
    // Held sideways, a landscape photo fills its box's height, so the drag
    // carries it past the box's bottom edge at once.
    await page.setViewportSize({width: 874, height: 402});
    const v = await openViewer(page, story);
    const seen: {drawn?: {past: number; clippedBy: string | null}} = {};
    await v.driver.play(pullDown(v.centre, 140), {
      onEvent: async step => {
        if (
          seen.drawn != null ||
          step.type !== 'touchMove' ||
          step.changed[0].y - v.centre.y < 130
        ) {
          return;
        }
        await frames(page, 1);
        seen.drawn = await v.photo.evaluate(el => {
          const photo = el.getBoundingClientRect();
          const stage = el
            .closest('[data-zoom-dismissing]')
            ?.getBoundingClientRect();
          // The first box between the photo and the dialog that clips it.
          let clippedBy: string | null = null;
          for (
            let box = el.parentElement;
            box != null && box.tagName !== 'DIALOG';
            box = box.parentElement
          ) {
            if (
              getComputedStyle(box).overflowY !== 'visible' &&
              photo.bottom > box.getBoundingClientRect().bottom + 0.5
            ) {
              clippedBy = box.outerHTML.slice(0, 80);
              break;
            }
          }
          return {
            past: photo.bottom - (stage?.bottom ?? Number.NaN),
            clippedBy,
          };
        });
      },
    });
    // The photo reaches past its box, and no box cuts it off.
    expect(seen.drawn?.past).toBeGreaterThan(20);
    expect(seen.drawn?.clippedBy).toBeNull();
  });
}

test('a caption comes back under the photo once a drag to close springs back', async ({
  page,
}) => {
  // A 3:1 panorama leaves the stage free space below the fitted photo, so
  // the caption moves up under it.
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(3000, 1000),
    }),
  );
  await openStory(page, storybook(), 'core-lightbox--zoom-with-caption');
  const driver = await touchDriver(page);
  const trigger = await page
    .getByRole('button', {name: 'Open zoom with caption'})
    .boundingBox();
  if (trigger == null) {
    throw new Error('no trigger');
  }
  await driver.tap({
    x: trigger.x + trigger.width / 2,
    y: trigger.y + trigger.height / 2,
  });
  const dialog = page.getByRole('dialog');
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(3000);
  // The caption's box, not its text: the text sits on a backing inside the
  // box's top padding.
  const caption = dialog.locator('[data-lightbox-caption]', {
    hasText: 'A winding path through the forest',
  });
  const gap = async () => {
    const photo = await img.boundingBox();
    const below = await caption.boundingBox();
    if (photo == null || below == null) {
      throw new Error('no photo or caption');
    }
    return Math.round(below.y - (photo.y + photo.height));
  };
  await expect.poll(gap).toBe(0);
  const box = await img.boundingBox();
  if (box == null) {
    throw new Error('no photo');
  }
  // Down 60 px and back to the start, then lifted: the drag is cancelled.
  const start = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  const down = {x: start.x, y: start.y + 60};
  await driver.play(
    drag(start, down, {durationMs: 300})
      .slice(0, -1)
      .concat(
        drag(down, start, {durationMs: 300, restMs: 150})
          .slice(1)
          .map(f => ({...f, t: f.t + 320})),
      ),
  );
  await expect(dialog).toBeVisible();
  await expect.poll(gap).toBe(0);
});

test("while the controls fade with a drag, a tap on Close still reaches it, above a gallery's pages", async ({
  page,
}) => {
  const v = await openViewer(page, 'gallery');
  const close = await v.close.boundingBox();
  if (close == null) {
    throw new Error('no Close button');
  }
  const at = {x: close.x + close.width / 2, y: close.y + close.height / 2};
  let hit = '';
  await v.driver.play(pullDown(v.centre, 100), {
    onEvent: async step => {
      if (
        step.type === 'touchMove' &&
        hit === '' &&
        (await v.closeAlpha()) < 0.95
      ) {
        hit = await page.evaluate(
          ([x, y]) => {
            const el = document.elementFromPoint(x, y);
            return (
              el?.closest('button')?.getAttribute('aria-label') ??
              el?.tagName ??
              'nothing'
            );
          },
          [at.x, at.y],
        );
      }
    },
  });
  expect(hit).toBe('Close');
});

test('the backdrop dims and blurs the page, under a finger and with a mouse', async ({
  page,
  browser,
}) => {
  const filterOf = async (dialog: Locator) =>
    dialog.evaluate(el => {
      const style = getComputedStyle(
        el,
        '::backdrop',
      ) as CSSStyleDeclaration & {
        webkitBackdropFilter?: string;
      };
      return style.backdropFilter || style.webkitBackdropFilter || 'none';
    });
  const v = await openViewer(page);
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  expect(await filterOf(v.dialog)).toBe('blur(2px)');
  // A fine pointer too.
  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
    hasTouch: false,
    isMobile: false,
  });
  try {
    const desktop = await context.newPage();
    expect(
      await desktop.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await openStory(desktop, storybook(), STORIES.plain.id);
    await desktop.getByRole('button', {name: STORIES.plain.trigger}).click();
    const dialog = desktop.getByRole('dialog');
    await expect(dialog).toBeVisible();
    expect(await filterOf(dialog)).toBe('blur(2px)');
  } finally {
    await context.close();
  }
});
