// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxZoom.interaction.browser.spec.ts
 * @input The built "With zoom" Lightbox story on the phone project, with a
 *   3000 × 2000 test photo, real touch input and the interaction harness
 * @output Proofs for Lightbox's zoom stage against UIKit's measured zooming,
 *   under a finger in Chromium and WebKit. They cover the pinch, the give past
 *   the limits, the double tap and the zoomed pan. They also cover a tap
 *   beside the photo, a settle through a blocked main thread, the sharp
 *   redraw and storyboards
 * @position Interaction tests for Lightbox (browser); the shape follows
 *   BottomSheet/__tests__/BottomSheetDetent.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';
import {
  CONTROL_RGB,
  animationStoryboard,
  blockMainThread,
  busyWindowProof,
  castStoryboard,
  compareCurve,
  countBetween,
  cubicBezier,
  curveOf,
  drag,
  flick,
  frames,
  freezeTimers,
  holdAnimations,
  installLongTaskLog,
  installTimerGate,
  markElement,
  openStory,
  PARTIAL_LIFT_SKIP,
  pinch,
  releaseAnimations,
  sampleCurve,
  startBusyControl,
  startScreencast,
  timeline,
  touchDriver,
  touchStoryboard,
  traceRendering,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  writeEvidence,
  type TouchDriver,
  type TouchFrame,
  type TouchScript,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// UIKit's measured zoom (motion/uikit/zoomMedia.ts), restated so a change to
// the table has to be made here too.
const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);
/** The theme's duration token that a finger's double tap zooms over. */
const TAP_ZOOM_DURATION = '--duration-medium';
/** iOS's measured length of a finger's 2× double-tap zoom, ms. */
const IOS_DOUBLE_TAP_MS = 308;
/** The theme's duration tokens, shortest to longest. */
const DURATION_TOKENS = [
  '--duration-fast-min',
  '--duration-fast',
  '--duration-fast-max',
  '--duration-medium-min',
  '--duration-medium',
  '--duration-medium-max',
  '--duration-slow-min',
  '--duration-slow',
  '--duration-slow-max',
];
const settleMs = (from: number, to: number) =>
  Math.min(400, 100 + 300 * Math.abs(Math.log(to / from)));

/**
 * A test photo: a checkerboard of 50 px squares, whose sharp edges judge the
 * redraw, with a red disc at its centre. It is SVG, so it has an intrinsic
 * size and draws its edges at any zoom. The squares are drawn one by one,
 * since a `<pattern>` goes through a tile image whose seams some engines blur.
 */
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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PhotoState {
  /** The stage, in page coordinates. */
  stage: Box;
  /** The photo's fitted box, in stage coordinates. */
  fit: Box;
  /** The zoom stage's transform: offset from the fitted box, and scale. */
  x: number;
  y: number;
  scale: number;
}

interface OpenViewer {
  driver: TouchDriver;
  dialog: Locator;
  stage: Locator;
  photo: Locator;
  state: () => Promise<PhotoState>;
}

// A plain evaluate (no auto-wait): it must work mid-animation.
async function readState(
  photo: Locator,
  options: {touches?: boolean} = {},
): Promise<PhotoState & {touches?: {x: number; y: number}[]}> {
  return photo.evaluate((element, withTouches) => {
    const img = element as HTMLImageElement;
    const stage = img.parentElement as HTMLElement;
    const rect = stage.getBoundingClientRect();
    const style = getComputedStyle(img);
    const [tx = '0px', ty = '0px'] =
      style.translate === 'none' ? [] : style.translate.split(' ');
    const scale = style.scale === 'none' ? 1 : parseFloat(style.scale);
    return {
      stage: {
        x: rect.left + stage.clientLeft,
        y: rect.top + stage.clientTop,
        width: stage.clientWidth,
        height: stage.clientHeight,
      },
      fit: {
        x: img.offsetLeft,
        y: img.offsetTop,
        width: img.offsetWidth,
        height: img.offsetHeight,
      },
      x: parseFloat(tx),
      y: parseFloat(ty),
      scale,
      // The touches the page last received (a capture listener the proof
      // installs), read with the photo in the same evaluate.
      ...(withTouches
        ? {
            touches:
              (window as unknown as {__touches?: {x: number; y: number}[]})
                .__touches ?? [],
          }
        : {}),
    };
  }, options.touches === true);
}

/** The fitted-photo point shown under the page point `at`. */
function photoPointAt(state: PhotoState, at: {x: number; y: number}) {
  return {
    u: (at.x - state.stage.x - state.fit.x - state.x) / state.scale,
    v: (at.y - state.stage.y - state.fit.y - state.y) / state.scale,
  };
}

/** Where the fitted-photo point (u, v) shows, in page coordinates. */
function pagePointOf(state: PhotoState, u: number, v: number) {
  return {
    x: state.stage.x + state.fit.x + state.x + u * state.scale,
    y: state.stage.y + state.fit.y + state.y + v * state.scale,
  };
}

async function openViewer(
  page: Page,
  photo: {width: number; height: number} = {width: 3000, height: 2000},
): Promise<OpenViewer> {
  await installLongTaskLog(page);
  await page.route('https://picsum.photos/**', async route =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: photoSvg(photo.width, photo.height),
    }),
  );
  await openStory(page, storybook(), 'core-lightbox--with-zoom');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open with zoom'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const dialog = page.getByRole('dialog', {name: 'Forest path'});
  await expect(dialog).toBeVisible();
  const stage = dialog.getByRole('button', {name: 'Zoom'});
  const img = dialog.getByRole('img', {name: 'Forest path'});
  await expect
    .poll(async () => img.evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBe(photo.width);
  // Also the page's first contact with the curve recorder, so an animation a
  // test's first action starts is recorded however soon it ends.
  await waitForRest(img);
  await frames(page, 2);
  return {
    driver,
    dialog,
    stage,
    photo: img,
    state: async () => readState(img),
  };
}

function doubleTap(at: {x: number; y: number}): TouchScript {
  return [
    {t: 0, fingers: [{id: 0, ...at}]},
    {t: 50, fingers: []},
    {t: 170, fingers: [{id: 0, ...at}]},
    {t: 220, fingers: []},
  ];
}

const pageScale = async (page: Page) =>
  page.evaluate(() => window.visualViewport?.scale ?? 1);

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** WCAG 2's relative luminance of an sRGB colour. */
function luminance({r, g, b}: Rgb): number {
  const [lr, lg, lb] = [r, g, b].map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG 2's contrast ratio of two colours. */
function contrast(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (light + 0.05) / (dark + 0.05);
}

/** The colour a `color` value such as `rgb(255, 255, 255)` names. */
function parseRgb(value: string): Rgb {
  const [r, g, b] = (value.match(/[\d.]+/g) ?? []).map(Number);
  return {r, g, b};
}

/** The darkest of a screenshot's pixels at `points` (CSS px). */
function lightestAt(
  png: {width: number; data: Uint8Array},
  scale: number,
  points: {x: number; y: number}[],
): Rgb {
  let lightest: Rgb = {r: 0, g: 0, b: 0};
  for (const {x, y} of points) {
    const i = (Math.round(y * scale) * png.width + Math.round(x * scale)) * 4;
    const pixel = {r: png.data[i], g: png.data[i + 1], b: png.data[i + 2]};
    if (luminance(pixel) > luminance(lightest)) {
      lightest = pixel;
    }
  }
  return lightest;
}

/** Every shipped theme; the probe theme is a test fixture, not a design. */
const SHIPPED_THEMES = [
  'butter',
  'chocolate',
  'gothic',
  'matcha',
  'neutral',
  'stone',
  'y2k',
] as const;

for (const theme of SHIPPED_THEMES) {
  test(`over a zoomed light photo, Close, Previous, Next and the counter keep their contrast (${theme})`, async ({
    page,
  }) => {
    await page.route('https://picsum.photos/**', async route =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000"><rect width="3000" height="2000" fill="#fff"/></svg>',
      }),
    );
    // Storybook's theme global applies from the story's first render.
    await page.goto(
      `${storybook()}/iframe.html?id=core-lightbox--gallery-with-zoom&viewMode=story&globals=astryxTheme:${theme}`,
    );
    await page.locator('#storybook-root > *').first().waitFor();
    await frames(page, 2);
    const driver = await touchDriver(page);
    const tapOn = async (locator: Locator) => {
      const b = await locator.boundingBox();
      if (b == null) {
        throw new Error('nothing to tap');
      }
      await driver.tap({x: b.x + b.width / 2, y: b.y + b.height / 2});
    };
    await tapOn(page.getByRole('button', {name: 'Open gallery with zoom'}));
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // The second photo, so both Previous and Next show. The tap leaves Next
    // hovered, as a phone does, where a theme may restyle its background.
    await tapOn(dialog.getByRole('button', {name: 'Next'}));
    await expect(dialog.getByText('2 / 4')).toBeVisible();
    const img = dialog.getByRole('img', {name: 'Mountain lake'});
    // The stage, and whatever moved inside it to show the second photo, rests.
    await waitForRest(dialog.getByRole('button', {name: 'Zoom'}));
    const rect = await img.boundingBox();
    if (rect == null) {
      throw new Error('no photo');
    }
    await driver.play(
      doubleTap({x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}),
    );
    await expect
      .poll(async () =>
        img.evaluate(el => parseFloat(getComputedStyle(el).scale) || 1),
      )
      .toBeGreaterThan(1.5);
    await waitForRest(img);
    const zoomed = await img.boundingBox();
    const controls = [
      {name: 'Close', locator: dialog.getByRole('button', {name: 'Close'})},
      {
        name: 'Previous',
        locator: dialog.getByRole('button', {name: 'Previous'}),
      },
      {name: 'Next', locator: dialog.getByRole('button', {name: 'Next'})},
    ];
    const counter = dialog.getByText('2 / 4');
    const boxes = await Promise.all(
      [...controls.map(c => c.locator), counter].map(async l =>
        l.boundingBox(),
      ),
    );
    // Present, painted and over the photo: the zoomed photo covers every box.
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect(zoomed).not.toBeNull();
      if (box == null || zoomed == null) {
        return;
      }
      expect(box.width * box.height).toBeGreaterThan(0);
      expect(zoomed.x).toBeLessThanOrEqual(box.x);
      expect(zoomed.y).toBeLessThanOrEqual(box.y);
      expect(zoomed.x + zoomed.width).toBeGreaterThanOrEqual(box.x + box.width);
      expect(zoomed.y + zoomed.height).toBeGreaterThanOrEqual(
        box.y + box.height,
      );
    }
    const shot = PNG.sync.read(await page.screenshot());
    const scale = shot.width / (page.viewportSize()?.width ?? shot.width);
    const ratios: Record<string, number> = {};
    for (const [i, {name, locator}] of controls.entries()) {
      const box = boxes[i];
      if (box == null) {
        return;
      }
      // The icon's own colour: a theme may restyle the button around it.
      const fg = parseRgb(
        await locator.evaluate(
          el => getComputedStyle(el.querySelector('svg') ?? el).color,
        ),
      );
      // A ring between the icon and the button's edge: what the icon sits on.
      const centre = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      const radius = Math.min(box.width, box.height) * 0.34;
      const ring = Array.from({length: 8}, (_, k) => ({
        x: centre.x + radius * Math.cos((k * Math.PI) / 4),
        y: centre.y + radius * Math.sin((k * Math.PI) / 4),
      }));
      ratios[name] = contrast(fg, lightestAt(shot, scale, ring));
    }
    const counterBox = boxes[controls.length];
    if (counterBox == null) {
      return;
    }
    const counterFg = parseRgb(
      await counter.evaluate(el => getComputedStyle(el).color),
    );
    // Just inside the counter's box, beside its text.
    const beside = [
      {x: counterBox.x + 2, y: counterBox.y + counterBox.height / 2},
      {
        x: counterBox.x + counterBox.width - 2,
        y: counterBox.y + counterBox.height / 2,
      },
    ];
    ratios.counter = contrast(counterFg, lightestAt(shot, scale, beside));
    for (const {name} of controls) {
      expect(ratios[name], name).toBeGreaterThanOrEqual(3);
    }
    expect(ratios.counter, 'counter').toBeGreaterThanOrEqual(4.5);
  });
}

test('the stage fills the phone screen and fits the photo', async ({page}) => {
  const {state} = await openViewer(page);
  const s = await state();
  const viewport = page.viewportSize() ?? {width: 0, height: 0};
  expect(s.stage.width).toBe(viewport.width);
  expect(s.stage.height).toBe(viewport.height);
  expect(s.fit.width).toBe(viewport.width);
  expect(s.fit.height).toBeCloseTo((viewport.width * 2000) / 3000, 0);
  expect(s.fit.y).toBeCloseTo((viewport.height - s.fit.height) / 2, 0);
  expect([s.x, s.y, s.scale]).toEqual([0, 0, 1]);
});

test('a pinch keeps the photo point under the fingers, and the page does not zoom', async ({
  page,
}) => {
  const {driver, state, photo} = await openViewer(page);
  const before = await state();
  const centre = {x: 150, y: before.stage.y + before.stage.height / 2 + 30};
  // The photo point under the centroid when the pinch begins (past its 8 px
  // threshold the fingers have already moved a little).
  let anchor: {u: number; v: number} | null = null;
  // Spread and move: the centroid travels 40 px right and 20 px up.
  const spread = pinch({
    center: centre,
    fromDistance: 80,
    toDistance: 260,
    durationMs: 400,
  });
  const moved: TouchScript = spread.map(frame => {
    const p = Math.min(1, frame.t / 400);
    return {
      t: frame.t,
      fingers: frame.fingers.map(f => ({
        ...f,
        x: f.x + 40 * p,
        y: f.y - 20 * p,
      })),
    };
  });
  const errors: number[] = [];
  const scales: number[] = [];
  let moves = 0;
  // The centroid of the touches the page received (the engine may round a
  // scripted position), which is what the stage follows.
  await page.evaluate(() => {
    document.addEventListener(
      'touchmove',
      event => {
        (window as unknown as {__touches: {x: number; y: number}[]}).__touches =
          [...event.touches].map(touch => ({
            x: touch.clientX,
            y: touch.clientY,
          }));
      },
      {capture: true, passive: true},
    );
  });
  await driver.play(moved, {
    onEvent: async step => {
      if (step.type !== 'touchMove' || step.fingers.length < 2) {
        return;
      }
      moves++;
      // The photo and the touches the page received, in one evaluate. The
      // page takes a touch with its frame, after the dispatch returns. So two
      // reads could straddle one on a busy page: the photo from one move and
      // the fingers from the next. An anchor taken from such a pair stays off
      // by that move for the whole pinch.
      const {touches: received = [], ...s} = await readState(photo, {
        touches: true,
      });
      const centroid =
        received.length === 2
          ? {
              x: (received[0].x + received[1].x) / 2,
              y: (received[0].y + received[1].y) / 2,
            }
          : {
              x: (step.fingers[0].x + step.fingers[1].x) / 2,
              y: (step.fingers[0].y + step.fingers[1].y) / 2,
            };
      if (anchor == null) {
        if (s.scale !== 1) {
          anchor = photoPointAt(s, centroid);
        }
        return;
      }
      const shown = pagePointOf(s, anchor.u, anchor.v);
      errors.push(Math.hypot(shown.x - centroid.x, shown.y - centroid.y));
      scales.push(s.scale);
    },
  });
  expect(moves).toBeGreaterThan(10);
  expect(errors.length).toBeGreaterThan(5);
  // UIKit keeps the point within 1 pt; one event of lag is allowed here.
  expect(Math.max(...errors), JSON.stringify(errors)).toBeLessThan(2);
  // The zoom grew with the fingers and kept no momentum after the lift.
  expect(scales.every((s, i) => i === 0 || s >= scales[i - 1] - 0.001)).toBe(
    true,
  );
  await frames(page, 3);
  const lifted = await state();
  await frames(page, 18);
  const later = await state();
  expect(later.scale).toBeCloseTo(lifted.scale, 3);
  expect(later.scale).toBeGreaterThan(2.5);
  expect(await pageScale(page)).toBe(1);
});

test('a pinch on the controls still zooms the page', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'native pinch-zoom from scripted touches is Chromium-only',
  );
  const {driver, dialog} = await openViewer(page);
  const close = dialog.getByRole('button', {name: 'Close'});
  const box = await close.boundingBox();
  if (box == null) {
    throw new Error('no close button');
  }
  await driver.play(
    pinch({
      center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
      fromDistance: 30,
      toDistance: 200,
      durationMs: 400,
    }),
  );
  await expect.poll(async () => pageScale(page)).toBeGreaterThan(1.5);
});

test('past the minimum the zoom gives way, then returns on the eased curve', async ({
  page,
}, testInfo) => {
  const {driver, photo, state} = await openViewer(page);
  const before = await state();
  const centre = {x: 201, y: before.stage.y + before.stage.height / 2};
  let shown = 1;
  let pinchScale = 1;
  await driver.play(
    pinch({
      center: centre,
      fromDistance: 300,
      toDistance: 100,
      durationMs: 300,
      restMs: 100,
    }),
    {
      onEvent: async step => {
        if (step.type === 'touchMove' && step.fingers.length === 2) {
          shown = (await state()).scale;
          pinchScale = Math.abs(step.fingers[1].x - step.fingers[0].x);
        }
      },
    },
  );
  // The recognizer's scale is relative to the span when the pinch began
  // (past its 8 px hysteresis); UIKit's law maps it to the shown zoom.
  const recognizerScale = pinchScale / (300 - 8);
  expect(shown).toBeCloseTo(1 / (2 - recognizerScale), 2);
  const [settle] = await waitForAnimation(photo);
  const held = await holdAnimations(page, photo);
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const samples = curveOf(
    await sampleCurve(photo, timeline(duration)),
    'scaleX',
  );
  await releaseAnimations(page);
  const from = samples[0].value;
  const expectedMs = settleMs(from, 1);
  const expected = (t: number) =>
    from + (1 - from) * EASE_IN_OUT(Math.min(1, t / expectedMs));
  const result = compareCurve(samples, expected, 0.003);
  await writeEvidence(
    'curves/lightbox-zoom-past-minimum',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {settle, held, samples, result},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(from).toBeCloseTo(shown, 2);
  expect(duration).toBeGreaterThanOrEqual(expectedMs - 1);
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
    0.003,
  );
  await waitForRest(photo);
  const rest = await state();
  expect([rest.x, rest.y, rest.scale]).toEqual([0, 0, 1]);
});

test("past the maximum the zoom gives way by UIKit's law and settles about the last centroid", async ({
  page,
}) => {
  // A 600 × 400 photo on a 3× phone has a low maximum, so one pinch passes
  // it. Six times the zoom that shows its pixels 1:1 is 2.985, above the
  // fill zoom.
  const {driver, photo, state} = await openViewer(page, {
    width: 600,
    height: 400,
  });
  const before = await state();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const max = Math.max(
    before.stage.height / before.fit.height,
    (6 * 600) / (before.fit.width * dpr),
  );
  const centre = {x: 220, y: before.stage.y + before.stage.height / 2};
  let last = before;
  let span = 0;
  await driver.play(
    pinch({
      center: centre,
      fromDistance: 70,
      toDistance: 330,
      durationMs: 400,
      restMs: 100,
    }),
    {
      onEvent: async step => {
        if (step.type === 'touchMove' && step.fingers.length === 2) {
          last = await state();
          span = Math.abs(step.fingers[1].x - step.fingers[0].x);
        }
      },
    },
  );
  const recognizerScale = span / (70 + 8);
  expect(recognizerScale).toBeGreaterThan(max);
  expect(last.scale).toBeCloseTo(max * (2 - max / recognizerScale), 2);
  // The photo point under the last centroid stays there through the settle.
  const anchor = photoPointAt(last, centre);
  await waitForAnimation(photo);
  await waitForRest(photo);
  const rest = await state();
  expect(rest.scale).toBeCloseTo(max, 3);
  const shown = pagePointOf(rest, anchor.u, anchor.v);
  // Unless the stage's edge stopped it (it keeps the photo inside).
  const clampedX =
    rest.x === 0 ||
    Math.abs(rest.x - (rest.stage.width - rest.fit.width * rest.scale)) < 0.5;
  if (!clampedX) {
    expect(shown.x).toBeCloseTo(centre.x, 0);
  }
  expect(await pageScale(page)).toBe(1);
});

test('a double tap zooms over the Storybook theme’s duration token nearest iOS’s 308 ms', async ({
  page,
}) => {
  const {stage} = await openViewer(page);
  const tokens = await stage.evaluate((element, names) => {
    const style = getComputedStyle(element);
    return names.map(name => {
      const value = style.getPropertyValue(name).trim();
      const ms = value.endsWith('ms')
        ? parseFloat(value)
        : parseFloat(value) * 1000;
      return {name, ms};
    });
  }, DURATION_TOKENS);
  expect(tokens.every(token => Number.isFinite(token.ms))).toBe(true);
  const nearest = tokens.reduce((best, token) =>
    Math.abs(token.ms - IOS_DOUBLE_TAP_MS) <
    Math.abs(best.ms - IOS_DOUBLE_TAP_MS)
      ? token
      : best,
  );
  // The Storybook theme's medium duration, 300 ms, is the nearest to iOS's
  // measured 308 ms.
  expect(nearest).toEqual({name: TAP_ZOOM_DURATION, ms: 300});
});

test('a double tap zooms until the photo fills the screen, about the tapped point', async ({
  page,
}, testInfo) => {
  const {driver, photo, stage, state} = await openViewer(page);
  const before = await state();
  const at = {x: 120, y: before.stage.y + before.stage.height / 2};
  const tapped = photoPointAt(before, at);
  await driver.play(doubleTap(at));
  const [zoom] = await waitForAnimation(photo);
  const held = await holdAnimations(page, photo);
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const samples = curveOf(
    await sampleCurve(photo, timeline(duration)),
    'scaleX',
  );
  await releaseAnimations(page);
  const fill = before.stage.height / before.fit.height;
  // A tap starts the zoom, so it plays the theme's move easing and medium
  // duration: its duration token on its `--ease-move`.
  const theme = await stage.evaluate((element, token) => {
    const style = getComputedStyle(element);
    return {
      duration: style.getPropertyValue(token).trim(),
      ease: style.getPropertyValue('--ease-move').trim(),
    };
  }, TAP_ZOOM_DURATION);
  expect(theme.duration).toMatch(/^\d+(\.\d+)?ms$/);
  const points = /^cubic-bezier\(([^)]*)\)$/
    .exec(theme.ease)?.[1]
    ?.split(',')
    .map(Number);
  if (points?.length !== 4 || points.some(Number.isNaN)) {
    throw new Error(`no cubic-bezier move easing: ${theme.ease}`);
  }
  const expectedMs = parseFloat(theme.duration);
  const ease = cubicBezier(points[0], points[1], points[2], points[3]);
  const expected = (t: number) =>
    1 + (fill - 1) * ease(Math.min(1, t / expectedMs));
  const result = compareCurve(samples, expected, 0.005);
  await writeEvidence(
    'curves/lightbox-double-tap-zoom',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {zoom, held, samples, result},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(result.maxError, JSON.stringify(result.worst)).toBeLessThanOrEqual(
    0.005,
  );
  await waitForRest(photo);
  const zoomed = await state();
  expect(zoomed.scale).toBeCloseTo(fill, 3);
  // The tapped photo point stays under the finger across the screen. Up and
  // down, the photo exactly fills the screen.
  const shown = pagePointOf(zoomed, tapped.u, tapped.v);
  expect(shown.x).toBeCloseTo(at.x, 0);
  expect(zoomed.fit.y + zoomed.y).toBeCloseTo(0, 0);
  await expect(stage).toHaveAttribute('aria-pressed', 'true');
  // Again: back to the fitted size.
  await driver.play(doubleTap({x: 300, y: at.y}));
  await waitForAnimation(photo);
  await waitForRest(photo);
  const fitted = await state();
  expect([fitted.x, fitted.y, fitted.scale]).toEqual([0, 0, 1]);
  await expect(stage).toHaveAttribute('aria-pressed', 'false');
});

test("a double tap near the photo's top edge stops at the screen's top edge", async ({
  page,
}) => {
  const {driver, photo, state} = await openViewer(page);
  const before = await state();
  // Kept in place, the tapped point would leave a gap above the photo.
  await driver.play(
    doubleTap({
      x: before.stage.x + before.stage.width / 2,
      y: before.stage.y + before.fit.y + 10,
    }),
  );
  await waitForAnimation(photo);
  await waitForRest(photo);
  const zoomed = await state();
  expect(zoomed.fit.y + zoomed.y).toBeCloseTo(0, 1);
});

test('a zoomed pan tracks the finger, rubber-bands past the edge and returns', async ({
  page,
}) => {
  const {driver, photo, state} = await openViewer(page);
  const before = await state();
  const mid = {x: 201, y: before.stage.y + before.stage.height / 2};
  await driver.play(doubleTap(mid));
  await waitForAnimation(photo);
  await waitForRest(photo);
  const zoomed = await state();
  // Room to the left edge: the photo's left edge is this far off screen.
  const room = -(zoomed.fit.x + zoomed.x);
  const overshoot = 120;
  const xs: number[] = [];
  await driver.play(
    drag(
      mid,
      {x: mid.x + room + overshoot + 10, y: mid.y},
      {durationMs: 500, restMs: 150},
    ),
    {
      onEvent: async step => {
        if (step.type === 'touchMove') {
          xs.push((await state()).x);
        }
      },
    },
  );
  // 1:1 until the edge (after the 10 px hysteresis), then UIScrollView's
  // rubber band over the stage width: (1 − 1 ÷ (x·0.55 ÷ d + 1))·d.
  const d = zoomed.stage.width;
  const banded = (1 - 1 / ((overshoot * 0.55) / d + 1)) * d;
  expect(xs.at(-1)).toBeCloseTo(zoomed.x + room + banded, 0);
  await waitForRest(photo);
  const back = await state();
  expect(back.fit.x + back.x).toBeCloseTo(0, 1);
  expect(back.scale).toBeCloseTo(zoomed.scale, 6);
});

test('a zoomed flick coasts and stops at the far edge', async ({page}) => {
  const {driver, photo, state} = await openViewer(page);
  const before = await state();
  const mid = {x: 201, y: before.stage.y + before.stage.height / 2};
  await driver.play(doubleTap(mid));
  await waitForAnimation(photo);
  await waitForRest(photo);
  // Bring the photo within 160 px of its far edge with a slow drag, held
  // still before the lift so it does not coast. The flick's own 120 px leave
  // 40 for the coast, which it reaches at any release velocity the run
  // measures. Under load, Linux WebKit delivers a flick's moves in bursts,
  // and its release velocity came out as low as ~350 px/s.
  const near = await state();
  const toEdge =
    near.fit.x + near.x + near.fit.width * near.scale - near.stage.width;
  const from = {x: near.stage.width - 20, y: mid.y};
  await driver.play(
    drag(
      from,
      {x: from.x - (toEdge - 160), y: from.y},
      {durationMs: 600, restMs: 150},
    ),
  );
  await waitForRest(photo);
  const zoomed = await state();
  const script = flick(mid, {
    velocity: {x: -1500, y: 0},
    durationMs: 80,
    hz: 120,
  });
  let released = zoomed;
  await driver.play(script, {
    onEvent: async step => {
      if (step.type === 'touchMove') {
        released = await state();
      }
    },
  });
  await frames(page, 6);
  const coasting = await state();
  // The photo kept moving after the lift.
  expect(coasting.x).toBeLessThan(released.x - 5);
  await waitForRest(photo, {timeout: 8_000});
  const rest = await state();
  // At the right edge: the photo's right edge on the stage's.
  expect(rest.fit.x + rest.x + rest.fit.width * rest.scale).toBeCloseTo(
    rest.stage.width,
    0,
  );
});

test('a finger landing on a coasting photo stops it where it shows', async ({
  page,
}) => {
  const {driver, photo, state} = await openViewer(page);
  const before = await state();
  const mid = {x: 201, y: before.stage.y + before.stage.height / 2};
  await driver.play(doubleTap(mid));
  await waitForAnimation(photo);
  await waitForRest(photo);
  await driver.play(
    flick(mid, {velocity: {x: -900, y: 0}, durationMs: 80, hz: 120}),
  );
  // The finger lands once the coast has carried the photo on past the
  // release, then rests 250 ms and lifts without moving.
  const released = (await state()).x;
  await expect
    .poll(async () => (await state()).x, {timeout: 2000})
    .toBeLessThan(released - 10);
  const reads: PhotoState[] = [];
  await driver.play(
    [
      {t: 0, fingers: [{id: 0, x: 120, y: mid.y}]},
      {t: 250, fingers: []},
    ],
    {
      onEvent: async () => {
        reads.push(await state());
      },
    },
  );
  // Read at the touch-down and at the lift.
  expect(reads).toHaveLength(2);
  const [{x: caughtX}, {x: heldX, stage, fit, scale}] = reads;
  // The coast stopped at once, where it showed, short of the edge.
  expect(heldX).toBeCloseTo(caughtX, 1);
  expect(heldX).toBeGreaterThan(stage.width - fit.width * scale - fit.x + 20);
  // Inside the stage, the lift with no drag leaves it there.
  await frames(page, 15);
  expect((await state()).x).toBeCloseTo(heldX, 1);
});

test('a finger left down after a pinch keeps panning without a jump', async ({
  page,
}) => {
  const {driver, photo, state} = await openViewer(page);
  test.skip(!driver.partialLifts, PARTIAL_LIFT_SKIP);
  const before = await state();
  const mid = {x: 201, y: before.stage.y + before.stage.height / 2};
  await driver.play(doubleTap(mid));
  await waitForAnimation(photo);
  await waitForRest(photo);
  // Two fingers spread and drift left together, then the right one lifts
  // and the left one drags on 60 px.
  const script: TouchFrame[] = [];
  for (let i = 0; i <= 12; i++) {
    const p = i / 12;
    script.push({
      t: i * 16,
      fingers: [
        {id: 0, x: 170 - 30 * p, y: mid.y},
        {id: 1, x: 250 - 10 * p, y: mid.y},
      ],
    });
  }
  script.push({t: 13 * 16, fingers: [{id: 0, x: 140, y: mid.y}]});
  for (let i = 1; i <= 12; i++) {
    script.push({
      t: (13 + i) * 16,
      fingers: [{id: 0, x: 140 - 5 * i, y: mid.y}],
    });
  }
  script.push({t: 26 * 16 + 150, fingers: []});
  const xs: {type: string; x: number}[] = [];
  await driver.play(script, {
    onEvent: async step => {
      // A touchmove nothing has cancelled yet reaches the page with the next
      // frame (Chromium aligns them to it): read once it has.
      await frames(page, 1);
      xs.push({type: step.type, x: (await state()).x});
    },
  });
  const lift = xs.findIndex(e => e.type === 'touchEnd');
  const lastMove = xs.map(e => e.type).lastIndexOf('touchMove');
  expect(lift).toBeGreaterThan(0);
  // No jump when the second finger lifts, then 1:1 with the finger left.
  expect(Math.abs(xs[lift].x - xs[lift - 1].x)).toBeLessThan(1);
  expect(xs[lift].x - xs[lastMove].x).toBeCloseTo(60, 0);
});

test('a tap beside the photo closes the viewer; a tap on it does not', async ({
  page,
}) => {
  const {driver, dialog, state} = await openViewer(page);
  const s = await state();
  await driver.play([
    {t: 0, fingers: [{id: 0, x: 201, y: s.stage.y + s.stage.height / 2}]},
    {t: 50, fingers: []},
  ]);
  // A single tap waits out the double tap's 300 ms. Forty frames pass that
  // at up to 120 Hz.
  await frames(page, 40);
  await expect(dialog).toBeVisible();
  await driver.play([
    {t: 0, fingers: [{id: 0, x: 201, y: s.stage.y + 60}]},
    {t: 50, fingers: []},
  ]);
  await expect(dialog).toBeHidden();
});

test('the double-tap zoom keeps advancing every frame while the main thread is blocked', async ({
  page,
}, testInfo) => {
  const {driver, photo, state} = await openViewer(page);
  const before = await state();
  await markElement(photo, {mode: 'outline'});
  // A compositor-only control animation in the same window: what the
  // compositor presented while the main thread spun, on this machine.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  // The page itself waits for the zoom and blocks one frame into it. The
  // theme's move easing covers most of its travel early, and a round trip
  // from the test would start the block too late.
  const blocking = blockMainThread(page, 500, {during: photo});
  await driver.play(
    doubleTap({x: 201, y: before.stage.y + before.stage.height / 2}),
  );
  const block = await blocking;
  // A few frames after the block, so the screencast holds its end.
  await frames(page, 6);
  const castFrames = await cast.stop();
  const tracked = await trackMarker(page, castFrames);
  const control = await trackMarker(page, castFrames, {rgb: CONTROL_RGB});
  // The theme's move easing slows hard at its end, so its last few px span
  // several frames. WebKit's 2 px cast step shows that as a plateau, so
  // judging stops two cast steps from the end.
  const proof = busyWindowProof(tracked, block, {
    axis: 'height',
    settledWithinSteps: 2,
    control,
  });
  await writeEvidence(
    'busy-main-thread/lightbox-double-tap-zoom',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          block,
          proof,
          frames: tracked.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            y: f.box?.y ?? null,
            h: f.box?.height ?? null,
          })),
          control: control.map(f => ({
            t: +(f.t - block.from).toFixed(1),
            x: f.box?.x ?? null,
          })),
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  const film = await castStoryboard(page, castFrames, {
    name: 'lightbox-double-tap-zoom-busy-main-thread',
    zero: block.from,
    from: block.from - 40,
    to: proof.judged.to + 40,
    columns: 8,
    cellScale: 0.35,
    data: t => ({h: tracked.find(f => f.t === t)?.box?.height ?? -1}),
  });
  await film.write(testInfo, {block, judged: proof.judged});
  // Judged against the control. A two-core runner's software compositor and
  // the screencast share the core the block spins on. So every compositor
  // animation presents fewer frames there, the control's too. The photo keeps
  // pace with the control, and a main-thread animation would not.
  expect(proof.verdict.failures).toEqual([]);
  expect(proof.monotonic).toBe(true);
});

test('the zoom settles and the pinch do no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, photo, state} = await openViewer(page);
  const before = await state();
  let zoom = {from: 0, to: 0};
  let pinchWindow = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    await driver.play(
      doubleTap({x: 201, y: before.stage.y + before.stage.height / 2}),
    );
    [zoom] = await waitForAnimation(photo);
    await waitForRest(photo);
    const start = Date.now();
    await driver.play(
      pinch({
        center: {x: 201, y: before.stage.y + before.stage.height / 2},
        fromDistance: 100,
        toDistance: 180,
        durationMs: 400,
        restMs: 100,
      }),
    );
    pinchWindow = {from: start, to: Date.now()};
  });
  const during = countBetween(trace, zoom.from + 50, zoom.to - 50);
  expect(during.Layout ?? 0, JSON.stringify(during)).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify(during)).toBe(0);
  // While the fingers move: no layout (a style write per event, composited).
  const moving = countBetween(
    trace,
    pinchWindow.from + 100,
    pinchWindow.to - 150,
  );
  expect(moving.Layout ?? 0, JSON.stringify(moving)).toBe(0);
  expect(trace.longTasks).toEqual([]);
});

test('the zoomed photo is redrawn sharp', async ({page}, testInfo) => {
  // A 5:1 panorama: the double tap fills the screen at about 8.9×. A photo
  // left at its fitted raster would smear each edge over ~9 pixels.
  const {driver, photo, state} = await openViewer(page, {
    width: 3000,
    height: 600,
  });
  const before = await state();
  await driver.play(
    doubleTap({x: 201, y: before.stage.y + before.stage.height / 2}),
  );
  await waitForAnimation(photo);
  await waitForRest(photo);
  await frames(page, 10);
  // Rows of device pixels across the checkerboard: count the pixels caught
  // between black and white at each edge. A photo scaled up from its fitted
  // raster smears each edge over several pixels. A redraw at the new zoom
  // keeps it to one or two, from the edge's sub-pixel position and the
  // engine's filtering.
  const zoomed = await state();
  const y = Math.round(zoomed.stage.y + zoomed.stage.height * 0.3);
  // The whole viewport, decoded in a scratch page like the harness's marker
  // tracking (a clipped capture of the top layer is not the presented frame).
  const shot = await page.screenshot({scale: 'device'});
  await writeEvidence(
    'sharpness/lightbox-zoomed',
    {[`${testInfo.project.name}.png`]: shot},
    testInfo,
  );
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const scratch = await page.context().newPage();
  // One checkerboard period of rows, from a third of the way down. The row
  // that crosses the most edges lies inside a row of squares, not on the
  // boundary between two.
  const rows = await scratch.evaluate(
    async ({base64, from, count}) => {
      const blob = await (
        await fetch(`data:image/png;base64,${base64}`)
      ).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext('2d');
      if (context == null) {
        throw new Error('no 2d context');
      }
      context.drawImage(bitmap, 0, 0);
      const out: number[][] = [];
      for (let row = from; row < from + count; row++) {
        const data = context.getImageData(0, row, bitmap.width, 1).data;
        const values: number[] = [];
        for (let i = 0; i < data.length; i += 4) {
          values.push((data[i] + data[i + 1] + data[i + 2]) / 3);
        }
        out.push(values);
      }
      return out;
    },
    {
      base64: shot.toString('base64'),
      from: Math.round(y * dpr),
      count: Math.ceil(((100 * zoomed.fit.width) / 3000) * zoomed.scale * dpr),
    },
  );
  await scratch.close();
  const measureRow = (gray: number[]) => {
    let edges = 0;
    let smeared = 0;
    let run = 0;
    let side: 'dark' | 'light' | null = null;
    for (const value of gray) {
      if (value > 40 && value < 215) {
        run++;
        continue;
      }
      const next = value <= 40 ? 'dark' : 'light';
      if (side != null && next !== side) {
        edges++;
        smeared = Math.max(smeared, run);
      }
      side = next;
      run = 0;
    }
    return {edges, smeared};
  };
  const {edges, smeared} = rows
    .map(measureRow)
    .reduce((best, next) => (next.edges > best.edges ? next : best));
  await writeEvidence(
    'sharpness/lightbox-zoomed',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {
          scale: zoomed.scale,
          edges,
          smeared,
          y,
        },
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(zoomed.scale).toBeGreaterThan(8);
  expect(edges).toBeGreaterThanOrEqual(4);
  expect(
    smeared,
    `widest edge ${smeared} device px at zoom ${zoomed.scale}`,
  ).toBeLessThanOrEqual(2);
});

test(
  'storyboard: pinch to zoom and the return from past the minimum',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, photo, state} = await openViewer(page);
    await installTimerGate(page);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: viewport.height};
    const s = await state();
    const centre = {x: 180, y: s.stage.y + s.stage.height / 2};
    const measure = async () => {
      const now = await state();
      return {
        scale: +now.scale.toFixed(3),
        x: +now.x.toFixed(1),
        y: +now.y.toFixed(1),
      };
    };
    const spread = await touchStoryboard(
      page,
      driver,
      pinch({
        center: centre,
        fromDistance: 80,
        toDistance: 260,
        durationMs: 300,
        hz: 30,
        restMs: 100,
      }),
      {name: 'lightbox-pinch-zoom', clip, measure, columns: 5, cellScale: 0.4},
    );
    const squeeze = await touchStoryboard(
      page,
      driver,
      pinch({
        center: centre,
        fromDistance: 300,
        toDistance: 70,
        durationMs: 300,
        hz: 30,
        restMs: 100,
      }),
      {
        name: 'lightbox-pinch-past-minimum',
        clip,
        measure,
        columns: 5,
        cellScale: 0.4,
      },
    );
    await waitForAnimation(photo);
    await freezeTimers(page);
    const {storyboard: settle} = await animationStoryboard(page, {
      name: 'lightbox-return-from-past-minimum',
      clip,
      scope: photo,
      measure,
      columns: 6,
      cellScale: 0.35,
    });
    await spread.write(testInfo);
    await squeeze.write(testInfo);
    await settle.write(testInfo);
  },
);

test(
  'storyboard: double tap to fill and back',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const {driver, photo, state} = await openViewer(page);
    await installTimerGate(page);
    const viewport = page.viewportSize() ?? {width: 402, height: 714};
    const clip = {x: 0, y: 0, width: viewport.width, height: viewport.height};
    const s = await state();
    const measure = async () => {
      const now = await state();
      return {scale: +now.scale.toFixed(3), x: +now.x.toFixed(1)};
    };
    await driver.play(doubleTap({x: 120, y: s.stage.y + s.stage.height / 2}));
    await waitForAnimation(photo);
    await freezeTimers(page);
    const {storyboard: zoomIn} = await animationStoryboard(page, {
      name: 'lightbox-double-tap-zoom-in',
      clip,
      scope: photo,
      measure,
      columns: 6,
      cellScale: 0.35,
    });
    await zoomIn.write(testInfo);
  },
);
