// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file IndicatorPressRelease.interaction.browser.spec.ts
 * @input The built CheckboxInput, CheckboxList and RadioList Default stories,
 *   real touch input (Chromium CDP / WebKit's input command), the interaction
 *   harness, and the release clocks and curves of the UIKit constants table
 *   (motion/uikit/button.ts for a control, motion/uikit/list.ts for a cell)
 * @output Animation proofs for the press release of the layer over a
 *   checkbox box or a radio circle: it follows its host's curve (a
 *   standalone checkbox is a control and releases like UIButton; a checkbox
 *   or radio row is a cell and releases on the deselect), sampled frame by
 *   frame in both engines; it keeps fading on every frame while the main
 *   thread is blocked and does no Layout or Paint (Chromium); a RadioList row
 *   stays bare while its circle paints; a storyboard of the release, its trace
 *   asserted; with a mouse (spec:AST-094 FR11's fine-pointer profile, FR43) a
 *   checkbox and a CheckboxList row press through the same model at once and
 *   release on their host's clock, a right click and a read-only row paint
 *   nothing, and a radio row keeps its `:active` paint for now
 * @position Interaction evidence for the indicator press layers in
 *   CheckboxInput.tsx and RadioListItem.tsx; the row layers they release
 *   beside are proven in ListRowPress.interaction.browser.spec.ts and
 *   ButtonPressRelease.interaction.browser.spec.ts
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  animationStoryboard,
  blockMainThread,
  castStoryboard,
  compareCurve,
  countBetween,
  cubicBezier,
  freezeTimers,
  holdAnimations,
  installTimerGate,
  openStory,
  releaseAnimations,
  seekAnimations,
  startScreencast,
  tap,
  thawTimers,
  timeline,
  touchDriver,
  traceRendering,
  waitForAnimation,
  withStorybook,
  writeEvidence,
  type CastFrame,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {button} from '../../motion/uikit/button';
import {list} from '../../motion/uikit/list';

const storybook = withStorybook(test);

/** A held press, then the lift: the release starts at the lift. */
const HOLD_MS = 400;

interface Clock {
  readonly releaseMs: number;
  readonly curve: readonly [number, number, number, number];
}

const CONTROL: Clock = {
  releaseMs: button.highlight.releaseMs,
  curve: button.highlight.releaseCurve,
};
const CELL: Clock = {
  releaseMs: list.highlight.releaseMs,
  curve: list.highlight.releaseCurve,
};

interface Surface {
  readonly name: string;
  readonly story: string;
  /** The element whose `::after` is the layer over the mark. */
  readonly layer: (page: Page) => Locator;
  /** Where the finger lands. */
  readonly target: (page: Page) => Locator;
  readonly clock: Clock;
}

/** The option's row: a CheckboxList `li`, a RadioList item. */
const optionRow = (page: Page, option: string) =>
  page
    .locator('#storybook-root .astryx-item, #storybook-root li')
    .filter({hasText: option})
    .first();

const markWrapper = (page: Page, selector: string, option?: string) => {
  const scope = option
    ? optionRow(page, option)
    : page.locator('#storybook-root');
  return scope.locator(selector).first().locator('xpath=../..');
};

const SURFACES: ReadonlyArray<Surface> = [
  {
    name: 'a checkbox (a control)',
    story: 'core-checkboxinput--default',
    layer: page => markWrapper(page, '.astryx-checkbox-indicator'),
    target: page => markWrapper(page, '.astryx-checkbox-indicator'),
    clock: CONTROL,
  },
  {
    name: 'a CheckboxList row’s box (a cell)',
    story: 'core-checkboxlist--default',
    layer: page => markWrapper(page, '.astryx-checkbox-indicator', 'SMS'),
    target: page => optionRow(page, 'SMS'),
    clock: CELL,
  },
  {
    name: 'a RadioList row’s circle (a cell)',
    story: 'core-radiolist--default',
    layer: page => markWrapper(page, '.astryx-radio-indicator', 'SMS'),
    target: page => optionRow(page, 'SMS'),
    clock: CELL,
  },
];

interface Opened {
  driver: TouchDriver;
  layer: Locator;
  center: {x: number; y: number};
  /** A point inside the mark, clear of any glyph, CSS px. */
  probe: {x: number; y: number};
}

async function open(page: Page, surface: Surface): Promise<Opened> {
  await openStory(page, storybook(), surface.story);
  const driver = await touchDriver(page);
  const layer = surface.layer(page);
  await expect(layer).toBeAttached();
  const target = await surface.target(page).boundingBox();
  const box = await layer.boundingBox();
  if (target == null || box == null) {
    throw new Error(`${surface.story}: nothing to press`);
  }
  // The press is the subject, not the toggle: every press starts unchecked.
  // Stopped at the window, before the story's own click handling.
  await page.evaluate(() =>
    window.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    ),
  );
  return {
    driver,
    layer,
    center: {x: target.x + target.width / 2, y: target.y + target.height / 2},
    probe: {x: Math.round(box.x + 4), y: Math.round(box.y + box.height / 2)},
  };
}

/** Opacity of the layer over the mark, as the engine presents it. */
const layerOpacity = async (layer: Locator) =>
  layer.evaluate(el => Number(getComputedStyle(el, '::after').opacity));

for (const surface of SURFACES) {
  test(`the press release of ${surface.name} follows its host’s curve, sampled frame by frame`, async ({
    page,
  }, testInfo) => {
    const opened = await open(page, surface);
    const ease = cubicBezier(...surface.clock.curve);
    const expected = (t: number) =>
      1 - ease(Math.min(1, Math.max(0, t / surface.clock.releaseMs)));
    // Gate the page's timers before the press, so the release timer (which
    // removes the attribute when the clock runs out) holds while seeking.
    await installTimerGate(page);
    await opened.driver.play(tap(opened.center, {holdMs: HOLD_MS}));
    await freezeTimers(page);
    const held = await holdAnimations(page, opened.layer);
    const release = held.find(
      a =>
        a.kind === 'CSSAnimation' && a.durationMs === surface.clock.releaseMs,
    );
    expect(release, JSON.stringify(held)).toBeDefined();
    const samples: {t: number; value: number}[] = [];
    for (const t of timeline(surface.clock.releaseMs)) {
      await seekAnimations(page, t);
      samples.push({t, value: await layerOpacity(opened.layer)});
    }
    await releaseAnimations(page, {finish: true});
    await thawTimers(page);
    const comparison = compareCurve(samples, expected, 0.005);
    await writeEvidence(
      `curves/${surface.story}-indicator-press-release`,
      {
        [`${testInfo.project.name}.json`]: JSON.stringify(
          {clock: surface.clock, held, samples, comparison},
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
  });
}

interface PixelFrame {
  readonly t: number;
  /** Mean of the RGB channels at the probe point, 0–255. */
  readonly value: number;
}

/** The probe point's value in every frame, decoded in a scratch page. */
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

test('the press release of a checkbox keeps fading on every frame while the main thread is blocked', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'screencast frame evidence is Chromium-only in Playwright; the iOS simulator covers Safari',
  );
  const [surface] = SURFACES;
  const opened = await open(page, surface);
  const cast = await startScreencast(page);
  await opened.driver.play(tap(opened.center, {holdMs: HOLD_MS}));
  const [release] = await waitForAnimation(opened.layer, {minProgressMs: 16});
  const block = await blockMainThread(page, 700);
  await page.waitForTimeout(150);
  const frames = await cast.stop();
  const pixels = await samplePixel(page, frames, opened.probe);
  const rest = pixels[0].value;
  const pressed = Math.min(
    ...pixels.filter(p => p.t < release.from).map(p => p.value),
  );
  const strength = (v: number) => (rest - v) / (rest - pressed);
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
    'busy-main-thread/checkbox-press-release',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {block, release, rest, pressed, strengths},
        null,
        1,
      ),
    },
    testInfo,
  );
  const box = await opened.layer.boundingBox();
  const film = await castStoryboard(page, frames, {
    name: 'checkbox-press-release-busy-main-thread',
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
  await film.write(testInfo, {block, release, box});
  expect(rest - pressed).toBeGreaterThan(10);
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

test('the press release of a checkbox does no Layout or Paint per frame', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const opened = await open(page, SURFACES[0]);
  // Keep the tap's compatibility mouse events out of the window: after a tap
  // the engine sets `:active` (and focus) for its own minimum interval
  // (150 ms in Chromium) and repaints when it clears, which is not the
  // release this counts. A cancelled touchend sends none of them.
  await page.evaluate(() =>
    window.addEventListener('touchend', event => event.preventDefault(), {
      capture: true,
      passive: false,
    }),
  );
  let release = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    await opened.driver.play(tap(opened.center, {holdMs: HOLD_MS}));
    [release] = await waitForAnimation(opened.layer);
    await page.waitForTimeout(CONTROL.releaseMs + 100);
  });
  // The steady part of the release: its first and last frames may commit.
  const during = countBetween(trace, release.from + 30, release.to - 30);
  const around = trace.events
    .filter(e => e.t > release.from - 40 && e.t < release.to + 40)
    .map(e => [e.name, Math.round(e.t - release.from)]);
  expect(during.Layout ?? 0, JSON.stringify({during, around})).toBe(0);
  expect(during.Paint ?? 0, JSON.stringify({during, around})).toBe(0);
});

test.describe('a mark answers only its own press owner', () => {
  // Each owner (a CheckboxInput's control, a CheckboxList or RadioList row)
  // declares the press for the layer over its own mark, and a layer reads
  // its nearest owner: holding an outer row leaves a mark in its content at
  // rest (architecture:component-style-authoring INV4).
  const NESTED: ReadonlyArray<{
    name: string;
    story: string;
    outer: string;
    outerMark: string;
    inner: (page: Page) => Locator;
  }> = [
    {
      name: 'a CheckboxList in a CheckboxList row',
      story: 'core-checkboxlist--checkbox-list-in-row-content',
      outer: 'Email',
      outerMark: '.astryx-checkbox-indicator',
      inner: page => innerMark(page, '.astryx-checkbox-indicator', 'Work'),
    },
    {
      name: 'a RadioList in a RadioList row',
      story: 'core-radiolist--radio-list-in-row-content',
      outer: 'Pro',
      outerMark: '.astryx-radio-indicator',
      inner: page => innerMark(page, '.astryx-radio-indicator', 'Monthly'),
    },
    {
      name: 'a CheckboxInput in a RadioList row',
      story: 'core-radiolist--checkbox-in-row-content',
      outer: 'Pro',
      outerMark: '.astryx-radio-indicator',
      inner: page => markWrapper(page, '.astryx-checkbox-indicator'),
    },
  ];
  // The innermost row with this label: rows nest, and an outer row's text
  // includes its content's, so the last match in document order is the
  // inner row.
  const innerMark = (page: Page, selector: string, option: string) =>
    page
      .locator('#storybook-root .astryx-item, #storybook-root li')
      .filter({hasText: option})
      .last()
      .locator(selector)
      .first()
      .locator('xpath=../..');
  const imageOf = async (layer: Locator) =>
    layer.evaluate(el => getComputedStyle(el, '::after').backgroundImage);

  for (const nested of NESTED) {
    test(`holding the outer row leaves ${nested.name}’s mark at rest`, async ({
      page,
    }) => {
      await openStory(page, storybook(), nested.story);
      const driver = await touchDriver(page);
      // The press is the subject, not the toggle.
      await page.evaluate(() =>
        window.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();
          },
          true,
        ),
      );
      const outerLayer = markWrapper(page, nested.outerMark, nested.outer);
      const innerLayer = nested.inner(page);
      await expect(innerLayer).toBeAttached();
      // The visible label, a span: a checkbox also carries a visually hidden
      // `<label>` with the same text.
      const label = await optionRow(page, nested.outer)
        .locator('span')
        .filter({hasText: new RegExp(`^${nested.outer}$`)})
        .first()
        .boundingBox();
      if (label == null) {
        throw new Error(`${nested.story}: no outer label`);
      }
      expect(await imageOf(innerLayer)).toBe('none');
      const held = driver.play(
        tap(
          {x: label.x + label.width / 2, y: label.y + label.height / 2},
          {holdMs: 1500},
        ),
      );
      await page.waitForTimeout(HOLD_MS);
      const outer = await imageOf(outerLayer);
      const inner = await imageOf(innerLayer);
      await held;
      expect(outer).toContain('gradient');
      expect(inner).toBe('none');
    });
  }
});

test('a RadioList row stays bare while its circle paints the press', async ({
  page,
}) => {
  const opened = await open(page, SURFACES[2]);
  const row = page
    .locator('#storybook-root .astryx-item')
    .filter({hasText: 'SMS'})
    .first();
  const rowBox = await row.boundingBox();
  if (rowBox == null) {
    throw new Error('no row');
  }
  const rowProbe = {
    x: Math.round(rowBox.x + rowBox.width - 12),
    y: Math.round(rowBox.y + rowBox.height / 2),
  };
  const pixelAt = async (at: {x: number; y: number}) =>
    page
      .screenshot({clip: {...at, width: 1, height: 1}, animations: 'allow'})
      .then(png => png);
  const restRow = await pixelAt(rowProbe);
  const restMark = await pixelAt(opened.probe);
  // A long hold, played in real time: read while the finger is down.
  const held = opened.driver.play(tap(opened.center, {holdMs: 1500}));
  await page.waitForTimeout(HOLD_MS);
  expect(
    await opened.layer.evaluate(
      el => getComputedStyle(el, '::after').backgroundImage,
    ),
  ).toContain('gradient');
  expect((await pixelAt(rowProbe)).equals(restRow)).toBe(true);
  expect((await pixelAt(opened.probe)).equals(restMark)).toBe(false);
  await held;
});

test(
  'storyboard: a checkbox and a radio row released after a hold',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    for (const surface of [SURFACES[0], SURFACES[2]]) {
      const opened = await open(page, surface);
      await installTimerGate(page);
      const box = await opened.layer.boundingBox();
      if (box == null) {
        throw new Error('no mark');
      }
      const clip = {
        x: Math.max(0, box.x - 12),
        y: Math.max(0, box.y - 12),
        width: box.width + 24,
        height: box.height + 24,
      };
      await opened.driver.play(tap(opened.center, {holdMs: HOLD_MS}));
      await freezeTimers(page);
      const {storyboard} = await animationStoryboard(page, {
        name: `${surface.story}-indicator-press-release`,
        clip,
        scope: opened.layer,
        times: timeline(surface.clock.releaseMs),
        measure: async () => ({opacity: await layerOpacity(opened.layer)}),
        columns: 8,
        cellScale: 2,
      });
      await releaseAnimations(page, {finish: true});
      await thawTimers(page);
      await storyboard.write(testInfo, {clock: surface.clock});
      const ease = cubicBezier(...surface.clock.curve);
      const opacities = storyboard.frames.map(f => f.data.opacity as number);
      expect(opacities[0]).toBeCloseTo(1, 2);
      expect(opacities.at(-1)).toBeLessThan(0.02);
      storyboard.frames.forEach(f =>
        expect(f.data.opacity as number).toBeCloseTo(
          1 - ease(Math.min(1, f.t / surface.clock.releaseMs)),
          2,
        ),
      );
    }
  },
);

test('under Reduce Motion a checkbox’s press release is an opacity cross-fade of 200 ms or less', async ({
  page,
}) => {
  // design:reduced-motion DR2: on a coarse pointer a change cross-fades,
  // opacity only, in 200 ms or less. The control clock (UIButton's 250 ms)
  // is capped there.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const opened = await open(page, SURFACES[0]);
  await opened.driver.tap({
    x: Math.round(opened.center.x),
    y: Math.round(opened.center.y),
  });
  const releases = await opened.layer.evaluate(el =>
    el
      .getAnimations({subtree: true})
      .filter(
        animation =>
          (animation.effect as KeyframeEffect | null)?.pseudoElement ===
          '::after',
      )
      .map(animation => {
        const effect = animation.effect as KeyframeEffect;
        return {
          duration: Number(effect.getTiming().duration),
          properties: effect
            .getKeyframes()
            .flatMap(frame =>
              Object.keys(frame).filter(
                key =>
                  !['offset', 'computedOffset', 'easing', 'composite'].includes(
                    key,
                  ),
              ),
            ),
        };
      }),
  );
  expect(releases.length).toBeGreaterThan(0);
  for (const release of releases) {
    expect(release.duration).toBeLessThanOrEqual(200);
    expect(new Set(release.properties)).toEqual(new Set(['opacity']));
  }
});

/** Every value `data-astryx-press` takes on `owner`, in order, as the page saw it. */
async function recordPress(owner: Locator): Promise<() => Promise<string[]>> {
  await owner.evaluate(el => {
    const seen: string[] = [];
    (window as unknown as {__pressSeen: string[]}).__pressSeen = seen;
    new MutationObserver(() => {
      seen.push(el.getAttribute('data-astryx-press') ?? '');
    }).observe(el, {attributes: true, attributeFilter: ['data-astryx-press']});
  });
  return async () =>
    owner
      .page()
      .evaluate(
        () => (window as unknown as {__pressSeen: string[]}).__pressSeen,
      );
}

/** A CSS time in ms. */
const timeMs = (value: string) =>
  value.endsWith('ms')
    ? Number.parseFloat(value)
    : Number.parseFloat(value) * 1000;

/** Clicks stop at the window: the press is the subject, not the toggle. */
async function stopClicks(page: Page): Promise<void> {
  await page.evaluate(() =>
    window.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();
      },
      true,
    ),
  );
}

test.describe('with a mouse', () => {
  test.use({
    isMobile: false,
    hasTouch: false,
    viewport: {width: 800, height: 600},
    deviceScaleFactor: 1,
  });

  /** The mark's colour under the probe, as presented (mean of R, G, B). */
  const markPixel = async (page: Page, at: {x: number; y: number}) => {
    const shot = await page.screenshot({
      clip: {x: at.x, y: at.y, width: 1, height: 1},
      animations: 'disabled',
      caret: 'hide',
    });
    return page.evaluate(async data => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${data}`)).blob(),
      );
      const canvas = new OffscreenCanvas(1, 1);
      const context = canvas.getContext('2d');
      context?.drawImage(bitmap, 0, 0);
      const px = context?.getImageData(0, 0, 1, 1).data ?? [0, 0, 0];
      return Math.round((px[0] + px[1] + px[2]) / 3);
    }, shot.toString('base64'));
  };

  /** The element that owns a surface's press: the checkbox's control, or the row. */
  const ownerOf = (page: Page, surface: Surface) =>
    surface.story === 'core-checkboxinput--default'
      ? page.locator('#storybook-root [data-astryx-pressable]').first()
      : optionRow(page, 'SMS');

  for (const surface of SURFACES.filter(
    each => each.story !== 'core-radiolist--default',
  )) {
    test(`a mouse press on ${surface.name} paints at once through the press model and releases on its host’s clock (FR43)`, async ({
      page,
    }) => {
      await openStory(page, storybook(), surface.story);
      // A fine-pointer case proves nothing under a coarse primary pointer.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      await stopClicks(page);
      const layer = surface.layer(page);
      const owner = ownerOf(page, surface);
      const target = await surface.target(page).boundingBox();
      if (target == null) {
        throw new Error(`${surface.story}: nothing to press`);
      }
      const seen = await recordPress(owner);
      await page.mouse.move(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
      await page.mouse.down();
      // FR11's fine-pointer profile: the press paints at `pointerdown`, with
      // no delay, through the same controller as a finger's.
      await expect
        .poll(async () => owner.getAttribute('data-astryx-press'), {
          timeout: 100,
        })
        .toBe('on');
      expect(
        await layer.evaluate(
          el => getComputedStyle(el, '::after').backgroundImage,
        ),
      ).toContain('gradient');
      await page.mouse.up();
      // The same release fade as a finger's, on the host's clock.
      await expect
        .poll(async () => owner.getAttribute('data-astryx-press'))
        .toBe('fading');
      expect(
        timeMs(
          await layer.evaluate(
            el => getComputedStyle(el, '::after').animationDuration,
          ),
        ),
      ).toBe(surface.clock.releaseMs);
      expect(await seen()).toEqual(expect.arrayContaining(['on', 'fading']));
    });

    test(`a right click on ${surface.name} paints no press (FR43)`, async ({
      page,
    }) => {
      await openStory(page, storybook(), surface.story);
      await stopClicks(page);
      const owner = ownerOf(page, surface);
      const target = await surface.target(page).boundingBox();
      if (target == null) {
        throw new Error(`${surface.story}: nothing to press`);
      }
      const seen = await recordPress(owner);
      await page.mouse.move(
        target.x + target.width / 2,
        target.y + target.height / 2,
      );
      await page.mouse.down({button: 'right'});
      await page.waitForTimeout(150);
      expect(await owner.getAttribute('data-astryx-press')).toBeNull();
      await page.mouse.up({button: 'right'});
      expect(await seen()).toEqual([]);
    });
  }

  test('a mouse press on a read-only CheckboxList row paints no press (FR43)', async ({
    page,
  }) => {
    await openStory(page, storybook(), 'core-checkboxlist--read-only');
    await stopClicks(page);
    const row = page.locator('#storybook-root li').first();
    const box = await row.boundingBox();
    if (box == null) {
      throw new Error('core-checkboxlist--read-only: no row');
    }
    // Any press the controller marks inside the row, on any element.
    await row.evaluate(el => {
      const seen: string[] = [];
      (window as unknown as {__readOnlySeen: string[]}).__readOnlySeen = seen;
      new MutationObserver(records => {
        for (const record of records) {
          const value = (record.target as Element).getAttribute(
            'data-astryx-press',
          );
          if (value != null) {
            seen.push(value);
          }
        }
      }).observe(el, {
        attributes: true,
        attributeFilter: ['data-astryx-press'],
        subtree: true,
      });
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    const layerImages = await row.evaluate(el =>
      Array.from(el.querySelectorAll('*')).map(
        child => getComputedStyle(child, '::after').backgroundImage,
      ),
    );
    await page.mouse.up();
    expect(
      await page.evaluate(
        () => (window as unknown as {__readOnlySeen: string[]}).__readOnlySeen,
      ),
    ).toEqual([]);
    expect(layerImages.filter(image => image.includes('gradient'))).toEqual([]);
  });

  for (const surface of SURFACES.filter(
    each => each.story === 'core-radiolist--default',
  )) {
    test(`hover and :active on ${surface.name} paint as before, until the press controller treats a nested control as a press boundary`, async ({
      page,
    }) => {
      await openStory(page, storybook(), surface.story);
      // A fine-pointer case proves nothing under a coarse primary pointer.
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(false);
      await page.evaluate(() =>
        window.addEventListener(
          'click',
          event => {
            event.preventDefault();
            event.stopPropagation();
          },
          true,
        ),
      );
      const layer = surface.layer(page);
      const box = await layer.boundingBox();
      const target = await surface.target(page).boundingBox();
      if (box == null || target == null) {
        throw new Error(`${surface.story}: nothing to press`);
      }
      const probe = {
        x: Math.round(box.x + 4),
        y: Math.round(box.y + box.height / 2),
      };
      const center = {
        x: target.x + target.width / 2,
        y: target.y + target.height / 2,
      };
      await page.mouse.move(1, 1);
      const rest = await markPixel(page, probe);
      await page.mouse.move(center.x, center.y);
      await page.waitForTimeout(300);
      const hover = await markPixel(page, probe);
      await page.mouse.down();
      await page.waitForTimeout(300);
      const active = await markPixel(page, probe);
      const pressAttr = await page.evaluate(
        () => document.querySelector('[data-astryx-press]') != null,
      );
      await page.mouse.up();
      // The touch press never runs for a mouse.
      expect(pressAttr).toBe(false);
      // As on the stack without this commit (same pixels on both builds): a
      // checkbox and a radio circle darken on hover and more on `:active`; a
      // CheckboxList row's box stays blank while the row takes the mouse.
      if (surface.story === 'core-checkboxlist--default') {
        expect(hover).toBe(rest);
        expect(active).toBe(rest);
      } else {
        expect(hover).toBeLessThan(rest);
        expect(active).toBeLessThan(hover);
      }
    });
  }
});
