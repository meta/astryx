// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastExit.interaction.browser.spec.ts
 * @input Toast stories in the built Storybook, a touch driver, and the card's
 *   Web Animations
 * @output Proves that under a finger every exit slides the card past its
 *   edge on the banner's measured timing, without fading. The exits are a
 *   swipe, the close button, the timeout and an app's dismiss
 * @position Toast's interaction proofs of its exit timing
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  touchDriver,
  waitForRest,
  withStorybook,
  type TouchFrame,
} from '@astryxdesign/interaction-harness';
import {toast as TOAST} from '../../motion/uikit/toast';

const storybook = withStorybook(test);

const FRAME_MS = 1000 / 60;

interface CardAnimation {
  /** The animated properties, from the first keyframe. */
  properties: string[];
  /** When the card reaches its last value (ms after the start). */
  motionMs: number;
  /** The card's vertical translate at each keyframe, with its time (ms). */
  frames: {ms: number; y: number}[];
}

/** Records every Web Animation the card starts, before the app loads. */
async function recordCardAnimations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorder = window as unknown as {__cardAnimations: CardAnimation[]};
    recorder.__cardAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this.classList.contains('astryx-toast')) {
        const effect = animation.effect as KeyframeEffect;
        const duration = Number(effect.getTiming().duration);
        const frames = effect.getKeyframes();
        const ignored = new Set([
          'offset',
          'computedOffset',
          'easing',
          'composite',
        ]);
        const ys = frames.map(frame => ({
          ms: (frame.computedOffset ?? 0) * duration,
          y: Number.parseFloat(
            String(frame.translate ?? '0px 0px').split(' ')[1] ?? '0',
          ),
        }));
        const last = ys[ys.length - 1]?.y ?? 0;
        recorder.__cardAnimations.push({
          properties: Object.keys(frames[0] ?? {}).filter(
            name => !ignored.has(name),
          ),
          motionMs: ys.find(frame => frame.y === last)?.ms ?? duration,
          frames: ys,
        });
      }
      return animation;
    };
  });
}

async function cardAnimations(page: Page): Promise<CardAnimation[]> {
  return page.evaluate(
    () =>
      (window as unknown as {__cardAnimations: CardAnimation[]})
        .__cardAnimations,
  );
}

/** The measured curve's progress halfway through its duration. */
function exitCurveAtHalf(): number {
  const [x1, y1, x2, y2] = TOAST.exitCurve;
  const at = (t: number, a: number, b: number) =>
    3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 50; i += 1) {
    const mid = (low + high) / 2;
    if (at(mid, x1, x2) < 0.5) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return at((low + high) / 2, y1, y2);
}

/**
 * The exit: one animation that moves the card's translate alone, for the
 * banner's measured duration, past the bottom edge.
 */
async function expectBannerSlide(
  page: Page,
  edgeDistance: number,
  {onCurve}: {onCurve: boolean},
): Promise<void> {
  await expect
    .poll(async () => (await cardAnimations(page)).length, {timeout: 3000})
    .toBeGreaterThan(0);
  const exits = await cardAnimations(page);
  expect(exits, 'one exit animation').toHaveLength(1);
  const [exit] = exits;
  expect(exit.properties, 'the card slides without fading').toEqual([
    'translate',
  ]);
  expect(exit.motionMs, 'the slide lasts the banner retract').toBeCloseTo(
    TOAST.exitMs,
    0,
  );
  const end = exit.frames[exit.frames.length - 1].y;
  expect(end, 'the card ends past its edge').toBeGreaterThanOrEqual(
    edgeDistance,
  );
  if (onCurve) {
    // From rest, halfway through, the card has covered what the measured
    // curve gives (between keyframes the animation runs linearly).
    const half = TOAST.exitMs / 2;
    const after = exit.frames.findIndex(frame => frame.ms >= half);
    const a = exit.frames[Math.max(0, after - 1)];
    const b = exit.frames[after];
    const y =
      b.ms === a.ms ? b.y : a.y + ((b.y - a.y) * (half - a.ms)) / (b.ms - a.ms);
    expect(
      Math.abs(y / end - exitCurveAtHalf()),
      'the slide follows the measured curve',
    ).toBeLessThan(0.02);
  }
}

async function showCard(page: Page, story: string, trigger: string) {
  await openStory(page, storybook(), story);
  await page
    .getByRole('button', {name: trigger})
    .evaluate(element => (element as HTMLElement).click());
  const card = page.locator('.astryx-toast').first();
  await expect(card).toBeVisible();
  await waitForRest(card);
  const box = await card.boundingBox();
  if (box == null) {
    throw new Error('no toast');
  }
  await page.evaluate(() => {
    (window as unknown as {__cardAnimations: unknown[]}).__cardAnimations = [];
  });
  const viewportHeight = page.viewportSize()?.height ?? 0;
  return {card, box, edgeDistance: viewportHeight - box.y};
}

test.describe('under a finger', () => {
  test.use({
    viewport: {width: 390, height: 844},
    isMobile: true,
    hasTouch: true,
  });

  test.beforeEach(async ({page}) => {
    await recordCardAnimations(page);
  });

  test('a swipe slides the card out on the banner retract', async ({page}) => {
    const {box, edgeDistance} = await showCard(
      page,
      'core-toast--error-persists',
      'Trigger error',
    );
    const driver = await touchDriver(page);
    // A quick 40 px flick toward the bottom edge dismisses it.
    const start = {
      x: Math.round(box.x + box.width * 0.3),
      y: Math.round(box.y + box.height / 2),
    };
    const frames: TouchFrame[] = [{t: 0, fingers: [{id: 0, ...start}]}];
    for (let i = 1; i <= 3; i += 1) {
      frames.push({
        t: +(i * FRAME_MS).toFixed(3),
        fingers: [{id: 0, x: start.x, y: start.y + Math.round((40 * i) / 3)}],
      });
    }
    await driver.play([
      ...frames,
      {t: +(4 * FRAME_MS).toFixed(3), fingers: []},
    ]);
    // After a dismissing release the slide starts at the card's speed, so
    // only its timing and its end are the banner's.
    await expectBannerSlide(page, edgeDistance - 40, {onCurve: false});
  });

  test('the close button slides the card out on the banner retract', async ({
    page,
  }) => {
    const {edgeDistance} = await showCard(
      page,
      'core-toast--error-persists',
      'Trigger error',
    );
    await page
      .getByRole('button', {name: 'Dismiss notification'})
      .evaluate(element => (element as HTMLElement).click());
    await expectBannerSlide(page, edgeDistance, {onCurve: true});
  });

  test('the timeout slides the card out on the banner retract', async ({
    page,
  }) => {
    const {edgeDistance} = await showCard(
      page,
      'core-toast--default',
      'Show toast',
    );
    await expect
      .poll(async () => (await cardAnimations(page)).length, {timeout: 9000})
      .toBeGreaterThan(0);
    await expectBannerSlide(page, edgeDistance, {onCurve: true});
  });

  test("an app's dismiss() slides the card out on the banner retract", async ({
    page,
  }) => {
    const {edgeDistance} = await showCard(
      page,
      'core-toast--programmatic-dismiss',
      'Show persistent toast',
    );
    await page
      .getByRole('button', {name: 'Dismiss', exact: true})
      .evaluate(element => (element as HTMLElement).click());
    await expectBannerSlide(page, edgeDistance, {onCurve: true});
  });
});
