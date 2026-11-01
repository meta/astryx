// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CarouselPaging.interaction.browser.spec.ts
 * @input The built "Paging" Carousel stories (`hasSnap`: full-width pages,
 *   loop, cards, a long page) and "With Padding", real touch input (Chromium
 *   CDP / WebKit's input command) and the interaction harness
 * @output Proof that a snapping Carousel with its buttons on a touch screen
 *   pages like a UIKit paging scroll view whose pages are its children: the
 *   pager owns horizontal pans (touch-action), a slow drag past half a page
 *   and a fast flick each move exactly one child, cards page one by one and
 *   the last ones rest where the row ends, padding keeps its inset, the edge
 *   fade follows the page, a vertical drag leaves the pages alone, the Next
 *   button plays setContentOffset(animated:)'s curve, under Reduce Motion
 *   the settle and Next cross-fade without travel, with hasLoop Next on the
 *   last page returns to the first, a settle keeps advancing through a
 *   blocked main thread, a drag changes only styles (no React render), and
 *   storyboards of a swipe and of a card flick
 * @position Browser proof for Carousel `hasSnap` under a finger
 *   (useCarouselPaging + hooks/usePager.ts), run by `pnpm test:interaction`
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  animationStoryboard,
  busyWindowProof,
  compareCurve,
  curveOf,
  drag,
  flick,
  holdAnimations,
  markElement,
  openStory,
  releaseAnimations,
  sampleCurve,
  startScreencast,
  timeline,
  touchDriver,
  trackMarker,
  waitForAnimation,
  waitForRest,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface OpenCarousel {
  driver: TouchDriver;
  scroller: Locator;
  track: Locator;
  /** One page plus the gap, px. */
  stride: number;
  /** A point on the pages: their vertical middle, near the trailing edge. */
  grab: {x: number; y: number};
  width: number;
}

async function openPaging(
  page: Page,
  story = 'core-carousel--paging',
): Promise<OpenCarousel> {
  // The phone projects have a coarse primary pointer: the touch presentation
  // on any engine (one touch model; nothing asks for iOS).
  await openStory(page, storybook(), story);
  const driver = await touchDriver(page);
  const region = page.getByRole('region').first();
  const scroller = region.locator('> div').first();
  const track = scroller.locator('> div').first();
  const geometry = await scroller.evaluate(el => {
    const box = el.getBoundingClientRect();
    const trackEl = el.firstElementChild as HTMLElement;
    const gap = parseFloat(getComputedStyle(trackEl).columnGap) || 0;
    return {
      x: box.x,
      y: box.y,
      width: el.clientWidth,
      height: box.height,
      gap,
    };
  });
  return {
    driver,
    scroller,
    track,
    stride: geometry.width + geometry.gap,
    width: geometry.width,
    grab: {
      x: geometry.x + geometry.width * 0.8,
      y: geometry.y + geometry.height / 2,
    },
  };
}

const trackX = async (track: Locator) =>
  track.evaluate(el => {
    const value = getComputedStyle(el).translate;
    return value === 'none' ? 0 : parseFloat(value);
  });

/** The title of the page under the viewport's centre. */
const pageOnScreen = async (scroller: Locator) =>
  scroller.evaluate(el => {
    const box = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    return hit?.closest('[aria-roledescription="slide"]')?.querySelector('h3')
      ?.textContent;
  });

test('the pager owns horizontal pans; nothing scrolls natively', async ({
  page,
}) => {
  const {scroller} = await openPaging(page);
  const style = await scroller.evaluate(el => ({
    touchAction: getComputedStyle(el).touchAction,
    overflowX: getComputedStyle(el).overflowX,
  }));
  expect(style.touchAction).toBe('pan-y pinch-zoom');
  expect(style.overflowX).toBe('clip');
});

test('a slow drag past half a page and a fast flick each move exactly one page', async ({
  page,
}) => {
  const {driver, scroller, track, stride, width, grab} = await openPaging(page);
  expect(await pageOnScreen(scroller)).toBe('Plan');
  // 60 % of a page at under 300 px/s, then still: the nearest page.
  await driver.play(
    drag(
      grab,
      {x: grab.x - 0.6 * width, y: grab.y},
      {durationMs: 1000, restMs: 120},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  expect(await pageOnScreen(scroller)).toBe('Pack');
  // A hard flick from rest: still one page.
  await driver.play(
    flick(grab, {velocity: {x: -3000, y: 0}, durationMs: 80, hz: 120}),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
  expect(await pageOnScreen(scroller)).toBe('Go');
});

test('a vertical drag leaves the pages alone', async ({page}) => {
  const {driver, track, grab} = await openPaging(page);
  await driver.play(
    drag(grab, {x: grab.x - 20, y: grab.y - 120}, {durationMs: 300}),
  );
  await page.waitForTimeout(100);
  expect(await trackX(track)).toBeCloseTo(0, 0);
});

test("the Next button plays setContentOffset(animated:)'s curve", async ({
  page,
}) => {
  const {driver, track, stride} = await openPaging(page);
  const next = page.getByRole('button', {name: 'Scroll right'});
  const box = await next.boundingBox();
  if (box == null) {
    throw new Error('no Next button');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await waitForAnimation(track);
  const held = await holdAnimations(page, track);
  const end = Math.max(...held.map(a => a.curveEndMs));
  expect(end).toBeGreaterThan(290);
  expect(end).toBeLessThan(310);
  const samples = curveOf(
    await sampleCurve(track, timeline(end)),
    'translateX',
  );
  const result = compareCurve(
    samples,
    t => (-stride * (1 - Math.cos(Math.PI * Math.min(1, t / 300)))) / 2,
    0.5,
  );
  expect(result.maxError).toBeLessThan(0.5);
  await releaseAnimations(page);
});

test('with hasLoop, a swipe past the last page rubber-bands back, and Next there returns to the first', async ({
  page,
}) => {
  const {driver, scroller, track, grab} = await openPaging(
    page,
    'core-carousel--paging-loop',
  );
  const titles: (string | null | undefined)[] = [];
  for (let i = 0; i < 5; i++) {
    await driver.play(
      flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
    );
    await waitForRest(track);
    titles.push(await pageOnScreen(scroller));
  }
  // A paging scroll view does not loop: the fifth flick returns to the last.
  expect(titles).toEqual(['Pack', 'Go', 'Share', 'Remember', 'Remember']);
  const next = page.getByRole('button', {name: 'Scroll right'});
  const box = await next.boundingBox();
  if (box == null) {
    throw new Error('no Next button');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  await waitForRest(track);
  expect(await pageOnScreen(scroller)).toBe('Plan');
});

/** Each slide's start edge from the track's, and where the track can go. */
const slideGeometry = async (scroller: Locator) =>
  scroller.evaluate(el => {
    const trackEl = el.firstElementChild as HTMLElement;
    const box = trackEl.getBoundingClientRect();
    const style = getComputedStyle(el);
    const inner =
      el.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const slides = Array.from(trackEl.children).map(child => {
      const rect = child.getBoundingClientRect();
      return {start: rect.left - box.left, end: rect.right - box.left};
    });
    const extent = Math.max(...slides.map(slide => slide.end));
    return {
      starts: slides.map(slide => slide.start),
      end: extent - inner,
      viewLeft: el.getBoundingClientRect().left,
      padding: parseFloat(style.paddingLeft),
    };
  });

test('cards: a flick moves one card, and the last cards rest where the row ends', async ({
  page,
}) => {
  const {driver, scroller, track, grab} = await openPaging(
    page,
    'core-carousel--paging-cards',
  );
  const {starts, end} = await slideGeometry(scroller);
  expect(end).toBeGreaterThan(starts[1]);
  await driver.play(
    flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-starts[1], 0);
  for (let i = 0; i < starts.length; i++) {
    await driver.play(
      flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
    );
    await waitForRest(track);
  }
  expect(await trackX(track)).toBeCloseTo(-end, 0);
  await expect(page.getByRole('button', {name: 'Scroll right'})).toBeDisabled();
});

test('padding keeps its inset: a flick lands the next child at the padded start edge', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-carousel--with-padding');
  const driver = await touchDriver(page);
  const scroller = page.getByRole('region').first().locator('> div').first();
  const track = scroller.locator('> div').first();
  const {starts, viewLeft, padding} = await slideGeometry(scroller);
  expect(padding).toBeGreaterThan(0);
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  await driver.play(
    flick(
      {x: box.x + box.width * 0.8, y: box.y + box.height / 2},
      {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-starts[1], 0);
  const second = await page
    .locator('[aria-roledescription="slide"]')
    .nth(1)
    .boundingBox();
  expect(second?.x).toBeCloseTo(viewLeft + padding, 0);
});

test('the edge fade follows the page: toward the end on the first page, toward the start on the last', async ({
  page,
}) => {
  const {driver, scroller, track, grab} = await openPaging(page);
  const mask = async () =>
    scroller.evaluate(el => {
      const style = getComputedStyle(el) as CSSStyleDeclaration & {
        webkitMaskImage?: string;
      };
      return style.maskImage !== '' && style.maskImage !== 'none'
        ? style.maskImage
        : (style.webkitMaskImage ?? '');
    });
  expect(await mask()).toContain('to left');
  for (let i = 0; i < 4; i++) {
    await driver.play(
      flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100, hz: 120}),
    );
    await waitForRest(track);
  }
  expect(await mask()).toContain('to right');
  expect(await mask()).not.toContain('calc(100%');
});

test('in a scrolling page: a vertical drag scrolls the page, a horizontal one pages, and a diagonal one goes to its dominant axis (35° pages, 50° scrolls)', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'injected touches do not scroll natively in Linux WebKit (harness README)',
  );
  const {driver, scroller, track, stride, width, grab} = await openPaging(
    page,
    'core-carousel--paging-in-long-page',
  );
  const scrollY = async () => page.evaluate(() => window.scrollY);
  // Steep (vertical): the page scrolls, the pages stay.
  await driver.play(
    drag(
      grab,
      {x: grab.x - 10, y: grab.y - 150},
      {durationMs: 400, restMs: 120},
    ),
  );
  await page.waitForTimeout(300);
  const scrolled = await scrollY();
  expect(scrolled).toBeGreaterThan(80);
  expect(await trackX(track)).toBeCloseTo(0, 0);
  // Horizontal: one page, the page holds still.
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const mid = {x: box.x + box.width * 0.8, y: box.y + box.height / 2};
  await driver.play(
    drag(
      mid,
      {x: mid.x - 0.6 * width, y: mid.y},
      {durationMs: 600, restMs: 120},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  expect(await scrollY()).toBeCloseTo(scrolled, 0);
  // UIKit (a pager inside a vertical scroll view): the drag's dominant axis
  // decides, once. 35° from horizontal is the pager's: past half a page it
  // pages, and the page holds still. That holds here because Chromium holds
  // back moves inside its touch slop, so the pan begins on its first move;
  // Mobile Safari claims a slow drag for the page at about 10–11 px, before
  // the pan's 10 pt start, so on the iOS 26.2 simulator a drag steeper than
  // about 27° scrolls the page instead (25° pages, 30° and 35° scroll).
  const diagonal = (degrees: number, length: number) => {
    const angle = (degrees * Math.PI) / 180;
    return drag(
      mid,
      {
        x: mid.x - length * Math.cos(angle),
        y: mid.y - length * Math.sin(angle),
      },
      {durationMs: 700, restMs: 120},
    );
  };
  await driver.play(
    diagonal(35, (0.6 * width) / Math.cos((35 * Math.PI) / 180)),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
  expect(await scrollY()).toBeCloseTo(scrolled, 0);
  // 50° is the page's: it scrolls, and the pages stay.
  await driver.play(diagonal(50, 200));
  await page.waitForTimeout(300);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
  expect(await scrollY()).toBeGreaterThan(scrolled + 80);
});

test('on an Android phone (no -webkit-touch-callout) the pager pages too: one touch model, no platform idiom', async ({
  page,
}) => {
  const {driver, scroller, track, stride, width, grab} = await openPaging(page);
  expect(
    await scroller.evaluate(el => ({
      overflowX: getComputedStyle(el).overflowX,
      coarse: matchMedia('(pointer: coarse)').matches,
      ios: CSS.supports('(-webkit-touch-callout: none)'),
    })),
  ).toEqual({overflowX: 'clip', coarse: true, ios: false});
  // The pager follows the finger past half a page: the next page, whatever
  // the release speed.
  await driver.play(
    drag(
      grab,
      {x: grab.x - 0.6 * width, y: grab.y},
      {durationMs: 1000, restMs: 0},
    ),
  );
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  // The scroller never scrolled natively.
  expect(await scroller.evaluate(el => el.scrollLeft)).toBe(0);
});

test("under Reduce Motion a scrolling carousel's Next cross-fades and jumps while transparent (design:reduced-motion DR2, a coarse pointer)", async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await openStory(page, storybook(), 'core-carousel--default');
  const scroller = page.getByRole('region').first().locator('> div').first();
  await page.getByRole('button', {name: 'Scroll right'}).click();
  await waitForAnimation(scroller);
  const held = await holdAnimations(page, scroller);
  expect(held.length).toBeGreaterThan(0);
  for (const a of held) {
    // Opacity only (DR1), each half of the 200 ms fade.
    expect(
      a.keyframes.every(k =>
        Object.keys(k).every(key =>
          [
            'opacity',
            'offset',
            'easing',
            'composite',
            'computedOffset',
          ].includes(key),
        ),
      ),
    ).toBe(true);
    expect(a.curveEndMs).toBeLessThanOrEqual(100);
  }
  // Still in place while the fade-out holds: it jumps once transparent.
  expect(await scroller.evaluate(el => el.scrollLeft)).toBe(0);
  await releaseAnimations(page);
  await expect
    .poll(async () => scroller.evaluate(el => el.scrollLeft))
    .toBeGreaterThan(0);
});

/**
 * At most a jump: `property` holds its start value, then its end value, and
 * never one in between (design:reduced-motion DR1; a cross-fade moves the
 * track while it is transparent).
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

test('under Reduce Motion the settle and Next do not travel: an opacity cross-fade of at most 200 ms on a coarse pointer (design:reduced-motion DR2)', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  const {driver, track, grab, stride} = await openPaging(page);
  // The phone projects have a coarse pointer, the case DR2 covers.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  const crossFadesOnly = (
    animations: Awaited<ReturnType<typeof holdAnimations>>,
  ) => {
    expect(animations.length).toBeGreaterThan(0);
    for (const a of animations) {
      // Nothing travels: the track holds, then jumps under the fade (DR1).
      expect(holdsOrJumps(a.keyframes, 'translate')).toBe(true);
      expect(holdsOrJumps(a.keyframes, 'transform')).toBe(true);
      expect(a.curveEndMs).toBeLessThanOrEqual(200);
    }
  };
  await driver.play(flick(grab, {velocity: {x: -1500, y: 0}, durationMs: 100}));
  await waitForAnimation(track);
  crossFadesOnly(await holdAnimations(page, track));
  await releaseAnimations(page);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-stride, 0);
  await page.getByRole('button', {name: 'Scroll right'}).click();
  await waitForAnimation(track);
  crossFadesOnly(await holdAnimations(page, track));
  await releaseAnimations(page);
  await waitForRest(track);
  expect(await trackX(track)).toBeCloseTo(-2 * stride, 0);
});

test('a drag writes only styles: no render, no layout change in the tree', async ({
  page,
}) => {
  const {driver, scroller, width, grab} = await openPaging(page);
  await scroller.evaluate(el => {
    const records: string[] = [];
    (window as unknown as {mutations: string[]}).mutations = records;
    new MutationObserver(list => {
      for (const m of list) {
        const target = m.target as HTMLElement;
        const role =
          target === el.firstElementChild
            ? 'track'
            : (target.getAttribute('aria-roledescription') ?? target.tagName);
        records.push(`${m.type}:${m.attributeName ?? ''}:${role}`);
      }
    }).observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  await driver.play(
    drag(
      grab,
      {x: grab.x - 0.3 * width, y: grab.y},
      {durationMs: 500, restMs: 120},
    ),
  );
  const mutations = await page.evaluate(
    () => (window as unknown as {mutations: string[]}).mutations,
  );
  // The track's translate (per move) and the slides' layers (at the drag's
  // start and at rest); nothing else.
  expect(mutations.length).toBeGreaterThan(10);
  for (const m of mutations) {
    expect(m).toMatch(/^attributes:style:(track|slide)$/);
  }
});

test('a settle keeps advancing every frame through a blocked main thread', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    "WebKit's screencast clock is not the page's, so a 0.3 s settle cannot be placed inside the block; Mobile Safari on the iOS simulator is the WebKit evidence",
  );
  const {driver, scroller, width, grab} = await openPaging(page);
  const second = page.locator('[aria-roledescription="slide"]').nth(1);
  await markElement(second, {inset: 8});
  // 100 ms after the finger lifts, block the main thread for 800 ms.
  await scroller.evaluate(el => {
    el.addEventListener(
      'touchend',
      () => {
        setTimeout(() => {
          const from = performance.timeOrigin + performance.now();
          const end = performance.now() + 800;
          while (performance.now() < end) {
            // busy
          }
          (window as unknown as {busy: unknown}).busy = {
            from,
            to: performance.timeOrigin + performance.now(),
            spins: 0,
          };
        }, 100);
      },
      {once: true, passive: true},
    );
  });
  const cast = await startScreencast(page);
  await page.waitForTimeout(300);
  await driver.play(
    flick(grab, {velocity: {x: -1200, y: 0}, durationMs: 80, hz: 120}),
  );
  await page.waitForTimeout(1300);
  const busy = await page.evaluate(
    () =>
      (window as unknown as {busy: {from: number; to: number; spins: number}})
        .busy,
  );
  const tracked = await trackMarker(page, await cast.stop());
  // The settle lasts about 0.33 s from the lift: judge the block's first 200 ms.
  const spanned = {...busy, to: busy.from + 200};
  const proof = busyWindowProof(tracked, spanned, {
    axis: 'x',
    settledWithin: 1,
  });
  test.info().annotations.push({
    type: 'busy window',
    description: JSON.stringify({...proof, window: undefined}),
  });
  expect(proof.frames).toBeGreaterThanOrEqual(proof.expectedFrames - 2);
  expect(proof.changed).toBeGreaterThanOrEqual(proof.frames - 3);
  expect(width).toBeGreaterThan(0);
});

for (const [name, story, velocity] of [
  ['swipe', 'core-carousel--paging', -1200],
  ['cards', 'core-carousel--paging-cards', -1200],
] as const) {
  test(`storyboard: ${name} @storyboard`, async ({page}) => {
    const {driver, scroller, track, grab, width} = await openPaging(
      page,
      story,
    );
    const from = velocity < 0 ? grab : {x: grab.x - width * 0.6, y: grab.y};
    await driver.play(
      flick(from, {velocity: {x: velocity, y: 0}, durationMs: 80, hz: 120}),
    );
    await waitForAnimation(track);
    const box = await scroller.boundingBox();
    if (box == null) {
      throw new Error('no scroller');
    }
    const {storyboard} = await animationStoryboard(page, {
      name: `carousel-paging-${name}`,
      scope: track,
      clip: {x: box.x, y: box.y, width: box.width, height: box.height},
      measure: async () => ({x: await trackX(track)}),
    });
    await storyboard.write(test.info());
    const xs = storyboard.frames.map(f => (f.data as {x: number}).x);
    // Each frame is nearer the page than the one before; UIKit's paging
    // settle (damping ratio 0.86) may overshoot the page by a pixel or two.
    const last = xs[xs.length - 1];
    for (let i = 1; i < xs.length; i++) {
      expect(Math.abs(xs[i] - last)).toBeLessThanOrEqual(
        Math.abs(xs[i - 1] - last) + 2,
      );
    }
    await releaseAnimations(page);
  });
}
