// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(SideNav|motion)/|apps/storybook/stories/SideNav\.stories)

/**
 * @file SideNavCollapseStacking.a11y.chromium.spec.ts
 * @input The built collapsible SideNav story, set beside a content column with
 *   a positioned header that has no z-index, real Chromium, and its Web
 *   Animations clock
 * @output Frame evidence that the collapse's copy of the expanded rail paints at
 *   the rail's own level (a later positioned sibling covers it, as it would
 *   the rail), that the motion's frames are unchanged, and that Reduce Motion
 *   stays instant
 * @position Real-engine proof for component:SideNav FR6; jsdom cannot paint
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

const STORY = 'core-sidenav--collapsible-sidebar';
const HEADER = {r: 255, g: 0, b: 255};

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

async function mount(page: Page) {
  await page.setViewportSize({width: 900, height: 600});
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await expect(page.locator('nav').first()).toBeVisible();
  // A standalone frame, as an app builds it: the nav beside a content column
  // whose positioned header has no z-index, with no stacking context between.
  await page.evaluate(() => {
    const nav = document.querySelector('nav')!;
    const frame = nav.parentElement!;
    Object.assign(frame.style, {
      display: 'flex',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
    });
    const main = document.createElement('main');
    Object.assign(main.style, {
      position: 'relative',
      flex: '1',
      minHeight: '0',
      overflow: 'auto',
    });
    const header = document.createElement('header');
    header.dataset.testid = 'sticky-header';
    Object.assign(header.style, {
      position: 'relative',
      height: '56px',
      background: 'rgb(255, 0, 255)',
    });
    const filler = document.createElement('div');
    filler.style.height = '1200px';
    main.append(header, filler);
    frame.append(main);
  });
  await expect(page.getByTestId('sticky-header')).toBeVisible();
}

/** Collapse, then hold every running animation at `progress` of its length. */
async function collapseAndHold(page: Page, progress: number) {
  await page.getByRole('button', {name: /collapse/i}).click();
  const timings = await page.evaluate(at => {
    return document.getAnimations().map(animation => {
      const timing = animation.effect!.getComputedTiming();
      animation.pause();
      animation.currentTime = Number(timing.duration) * at;
      return {
        duration: Number(timing.duration),
        easing: (animation.effect as KeyframeEffect).getTiming().easing,
        frames: (animation.effect as KeyframeEffect).getKeyframes().length,
      };
    });
  }, progress);
  return {timings};
}

/** The painted color at one viewport point, read from a real screenshot. */
async function pixel(page: Page, x: number, y: number) {
  const shot = await page.screenshot({clip: {x, y, width: 1, height: 1}});
  return page.evaluate(async base64 => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return {r, g, b};
  }, shot.toString('base64'));
}

test("the leaving copy paints at the rail's level: a later positioned sibling covers it, as it would the rail", async ({
  page,
}) => {
  await mount(page);
  // Early in the collapse the copy still covers most of the expanded rail.
  const {timings} = await collapseAndHold(page, 0.15);
  expect(timings.length).toBeGreaterThan(0);
  // The real rail: the copy, placed just before it, is inert.
  const collapsed = await page
    .locator('nav:not([inert]):not([inert] nav)')
    .boundingBox();
  // Just past the collapsed rail, inside the header's band.
  const x = Math.round(collapsed!.x + collapsed!.width + 10);
  await page.screenshot({
    path: test.info().outputPath('collapse-frame.png'),
    clip: {x: 0, y: 0, width: 420, height: 140},
  });
  expect(await pixel(page, x, 28)).toEqual(HEADER);
  // No z-index escalation on the rail or its copy.
  const zIndexes = await page.evaluate(() =>
    [...document.querySelectorAll('nav')].map(nav => nav.style.zIndex),
  );
  expect(zIndexes.every(z => z === '')).toBe(true);
});

test('the collapse keeps its frames and timing, and Reduce Motion stays instant', async ({
  page,
}) => {
  await mount(page);
  const {timings} = await collapseAndHold(page, 0);
  // The receipt of every animation the collapse runs: its length, curve and
  // frame count. The rail's parts share one clock, as on main.
  expect(timings.length).toBeGreaterThan(0);
  const rail = timings.filter(timing => timing.easing === 'linear');
  expect(rail.length).toBeGreaterThan(0);
  for (const timing of rail) {
    expect(timing.duration).toBe(rail[0].duration);
    expect(timing.frames).toBe(rail[0].frames);
  }
  const receipt = timings
    .map(
      ({duration, easing, frames}) =>
        `${duration.toFixed(1)}|${easing}|${frames}`,
    )
    .sort();
  // eslint-disable-next-line no-console -- the receipt is this run's artifact
  console.log(`collapse timings ${JSON.stringify(receipt)}`);

  await page.emulateMedia({reducedMotion: 'reduce'});
  await mount(page);
  await page.getByRole('button', {name: /collapse/i}).click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
