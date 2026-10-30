// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonPressTiming.interaction.browser.spec.ts
 * @input The press feedback stories' Secondary button and first list row on
 *   a touch-first device (coarse primary pointer), pressed by a real finger,
 *   a mouse and the Space key
 * @output Real-engine proof of how long each press's release runs on a
 *   touch-first device (`component:Button` FR15): a finger's release on a
 *   control is UIButton's 250 ms, and a mouse's or the Space key's press keeps
 *   the 200 ms release a fine pointer has; a list row's release keeps the
 *   deselect clock's 200 ms. Each release animation's own duration is read
 *   when `fading` is written; `fading` outlasts the animation (its progress
 *   has reached its end when `fading` goes) and goes within a few frames of
 *   that end. The animation's own progress and frames, not ms, bound it, so
 *   a loaded machine running the page late cannot fail it
 * @position Interaction evidence beside
 *   ButtonPressRelease.interaction.browser.spec.ts (the release's curve and
 *   layer)
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  openStory,
  tap,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const BUTTONS = 'core-press-feedback-touch--buttons';
const ROWS = 'core-press-feedback-touch--rows';
/** UIButton's measured release, a finger's on a control (FR15). */
const FINGER_RELEASE_MS = 250;
/** The release a mouse or the Space key keeps on any device (FR15). */
const BUTTON_RELEASE_MS = 200;
/** A list row's release: the deselect clock. */
const ROW_RELEASE_MS = 200;
/** A held press: the release starts at the lift. */
const HOLD_MS = 400;
/**
 * How many frames after the release animation finishes `fading` may still be
 * on: the controller ends it at the animation's end, or at its own check if
 * that comes later. Counted in frames, not ms, so a loaded machine that runs
 * the page late cannot make it fail.
 */
const MAX_FRAMES_AFTER_FINISH = 3;

interface ReleaseRecord {
  fadingAt: number | null;
  goneAt: number | null;
  animationMs: number | null;
  /** The release animation's start on the document timeline, ms. */
  startedAt: number | null;
  /** The document timeline's time when `fading` went, ms. */
  removedAt: number | null;
  finishedAt: number | null;
  framesAfterFinish: number | null;
  cancelled: boolean;
}

type Recorded = Window & {__release?: ReleaseRecord};

async function openSurface(
  page: Page,
  story: string,
  locate: (page: Page) => Locator,
) {
  await openStory(page, storybook(), story);
  const button = locate(page);
  await expect(button).toBeVisible();
  // A touch-first device: the primary pointer is coarse.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(true);
  await button.evaluate(el => {
    const record: ReleaseRecord = {
      fadingAt: null,
      goneAt: null,
      animationMs: null,
      startedAt: null,
      removedAt: null,
      finishedAt: null,
      framesAfterFinish: null,
      cancelled: false,
    };
    (window as Recorded).__release = record;
    new MutationObserver(() => {
      const value = el.getAttribute('data-astryx-press');
      const now = performance.now();
      if (value === 'fading' && record.fadingAt == null) {
        record.fadingAt = now;
        // The release animation the `fading` write starts, on the surface or
        // its own pseudo-elements; reading it flushes the new style.
        const releases = el
          .getAnimations({subtree: true})
          .filter(
            animation =>
              'animationName' in animation &&
              (animation.effect as KeyframeEffect | null)?.target === el,
          );
        const durationOf = (animation: Animation) =>
          Number(
            (animation.effect as KeyframeEffect).getComputedTiming().duration,
          );
        const longest = releases.reduce<Animation | null>(
          (best, animation) =>
            best == null || durationOf(animation) > durationOf(best)
              ? animation
              : best,
          null,
        );
        record.animationMs = longest == null ? null : durationOf(longest);
        // Its start is a frame's time, which can come before the write, so
        // the page's clock is not what says whether it ran to its end.
        longest?.ready.then(
          () => {
            record.startedAt = Number(longest.startTime);
          },
          () => undefined,
        );
        longest?.finished.then(
          () => {
            record.finishedAt = performance.now();
            // Count the frames from the animation's end until `fading` goes.
            let frames = 0;
            const tick = () => {
              if (record.goneAt != null) {
                record.framesAfterFinish = frames;
                return;
              }
              frames += 1;
              requestAnimationFrame(tick);
            };
            tick();
          },
          () => {
            // Cancelled: the paint was removed while it still ran.
            record.cancelled = true;
          },
        );
      } else if (
        value == null &&
        record.fadingAt != null &&
        record.goneAt == null
      ) {
        record.goneAt = now;
        record.removedAt = Number(document.timeline.currentTime);
      }
    }).observe(el, {attributes: true, attributeFilter: ['data-astryx-press']});
  });
  const box = await button.boundingBox();
  if (box == null) {
    throw new Error(`${story}: the surface has no box`);
  }
  return {
    button,
    center: {x: box.x + box.width / 2, y: box.y + box.height / 2},
  };
}

const secondaryButton = (page: Page) =>
  page.getByRole('button', {name: 'Secondary', exact: true});
const firstRow = (page: Page) =>
  page
    .locator('[data-astryx-pressable]')
    .filter({hasText: 'Conversation 1'})
    .first();

const openButton = async (page: Page) =>
  openSurface(page, BUTTONS, secondaryButton);

interface Release {
  /** The release animation's own duration, read when `fading` is written. */
  animationMs: number | null;
  /** How long `fading` lasted on the page's clock. */
  fadingMs: number;
  /**
   * How far the animation had run on the document timeline when `fading`
   * went; null when it had not started.
   */
  ranMs: number | null;
  /**
   * Frames from the animation's end until `fading` went, or 0 when `fading`
   * went first: the animation then stopped with it.
   */
  framesAfterFinish: number;
}

/** The release that just ran, once `fading` has gone. */
async function releaseOf(page: Page): Promise<Release> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const record = (window as Recorded).__release;
          return (
            record != null &&
            (record.cancelled ||
              (record.goneAt != null && record.framesAfterFinish != null))
          );
        }),
      {timeout: 3000},
    )
    .toBe(true);
  const record = await page.evaluate(() => (window as Recorded).__release);
  if (record?.fadingAt == null || record.goneAt == null) {
    throw new Error('no release was recorded');
  }
  return {
    animationMs: record.animationMs,
    fadingMs: record.goneAt - record.fadingAt,
    ranMs:
      record.startedAt == null || record.removedAt == null
        ? null
        : record.removedAt - record.startedAt,
    framesAfterFinish: record.cancelled
      ? 0
      : (record.framesAfterFinish ?? Number.POSITIVE_INFINITY),
  };
}

/**
 * A release of `ms`: its animation runs `ms`, `fading` stays until the
 * animation has run to its end, and goes within a few frames of that end.
 */
function expectRelease(release: Release, ms: number): void {
  expect(release.animationMs).toBe(ms);
  expect(release.ranMs, JSON.stringify(release)).not.toBeNull();
  expect(release.ranMs, JSON.stringify(release)).toBeGreaterThanOrEqual(ms - 1);
  expect(release.framesAfterFinish).toBeLessThanOrEqual(
    MAX_FRAMES_AFTER_FINISH,
  );
}

test("a finger's release on a button runs UIButton's 250 ms", async ({
  page,
}) => {
  const {center} = await openButton(page);
  const driver = await touchDriver(page);
  await driver.play(tap(center, {holdMs: HOLD_MS}));
  const release = await releaseOf(page);
  expectRelease(release, FINGER_RELEASE_MS);
});

test("a mouse press's release on the same device keeps 200 ms", async ({
  page,
}) => {
  const {center} = await openButton(page);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForTimeout(HOLD_MS);
  await page.mouse.up();
  const release = await releaseOf(page);
  expectRelease(release, BUTTON_RELEASE_MS);
});

test("a Space press's release on the same device keeps 200 ms", async ({
  page,
}) => {
  const {button} = await openButton(page);
  await button.focus();
  await page.keyboard.down('Space');
  await page.waitForTimeout(HOLD_MS);
  await page.keyboard.up('Space');
  const release = await releaseOf(page);
  expectRelease(release, BUTTON_RELEASE_MS);
});

test("a finger's release on a list row keeps the deselect clock's 200 ms", async ({
  page,
}) => {
  const {center} = await openSurface(page, ROWS, firstRow);
  const driver = await touchDriver(page);
  await driver.play(tap(center, {holdMs: HOLD_MS}));
  const release = await releaseOf(page);
  expectRelease(release, ROW_RELEASE_MS);
});
