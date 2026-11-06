// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetScrimClock.a11y.browser.spec.ts
 * @input The built BottomSheet Showcase story, on a phone viewport with
 *   real touch input through the interaction harness
 * @output Real-engine proof that a touch drag's close and the fade that
 *   clears its scrim start at the same time on the document timeline. It
 *   runs in Chromium and in WebKit, which reports the backdrop's fade on the
 *   dialog
 * @position Chromium and WebKit; the Chromium release spec measures the
 *   same pair end to end
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {drag, touchDriver} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test.use({viewport: {width: 390, height: 844}, hasTouch: true});

test("a touch drag's close and its scrim's fade start together", async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheet--showcase&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open sheet'}).click();
  const dialog = page.getByRole('dialog', {name: 'Filters'});
  await expect(dialog).toBeVisible();
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          !document
            .getAnimations()
            .some(animation => animation.playState === 'running'),
      ),
    )
    .toBe(true);
  // Each frame, keep the start of the close and of the fade that clears the
  // scrim. WebKit reports that fade on the dialog, with no pseudo-element.
  await dialog.evaluate(element => {
    const watch = {fade: Number.NaN, close: Number.NaN, done: false};
    Object.assign(window, {clockWatch: watch});
    // The fade can start on its own first and take the close's start a few
    // frames later. Sampling ends once it has, or five frames after both
    // start.
    let framesSinceBoth = 0;
    const look = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect as KeyframeEffect | null;
        if (
          effect?.target === element &&
          (animation as CSSTransition).transitionProperty === 'opacity' &&
          Number(effect.getKeyframes().at(-1)?.opacity) === 0 &&
          animation.startTime != null
        ) {
          watch.fade = Number(animation.startTime);
        }
      }
      const close = element
        .querySelector('.astryx-bottom-sheet')
        ?.getAnimations()[0];
      if (close?.startTime != null) {
        watch.close = Number(close.startTime);
      }
      if (Number.isFinite(watch.fade) && Number.isFinite(watch.close)) {
        framesSinceBoth += 1;
      }
      if (Math.abs(watch.fade - watch.close) < 1 || framesSinceBoth > 5) {
        watch.done = true;
      } else {
        requestAnimationFrame(look);
      }
    };
    requestAnimationFrame(look);
  });
  const box = await sheet.boundingBox();
  if (box == null) {
    throw new Error('no sheet box');
  }
  const x = Math.round(box.x + box.width / 2);
  // A short flick down from the grabber, about 1,500 px/s: the sheet closes,
  // and the drag leaves the scrim where it was.
  const driver = await touchDriver(page);
  const y = Math.round(box.y + 12);
  await driver.play(drag({x, y}, {x, y: y + 60}, {durationMs: 40}), {
    pacing: 'spacing',
  });
  const read = async () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            clockWatch: {fade: number; close: number; done: boolean};
          }
        ).clockWatch,
    );
  await expect.poll(async () => (await read()).done).toBe(true);
  const {fade, close} = await read();
  expect(Math.abs(fade - close)).toBeLessThan(1);
});
