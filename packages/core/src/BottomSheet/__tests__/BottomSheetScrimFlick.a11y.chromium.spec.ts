// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/BottomSheet|packages/core/src/motion|apps/storybook/stories/BottomSheet)

/**
 * @file BottomSheetScrimFlick.a11y.chromium.spec.ts
 * @input The built BottomSheet Showcase story, on a phone viewport with real
 *   touch input through the interaction harness
 * @output Real-browser proof that a touch flick's close clears the scrim with
 *   the sheet: once the sheet has slid most of the way out, the backdrop's
 *   computed opacity has faded as far
 * @position Runs in pr-a11y when BottomSheet, the motion helpers or their
 *   stories change. jsdom has no cascade for `::backdrop` and no transitions,
 *   so only a browser shows the opacity a person sees on each frame.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

interface Sample {
  /** How far the sheet has slid toward its closed position, 0 to 1. */
  readonly moved: number;
  /** The backdrop's computed opacity. */
  readonly opacity: number;
}

interface FlickWatch {
  samples: Sample[];
  closed: boolean;
}

async function readWatch(page: Page): Promise<FlickWatch> {
  return page.evaluate(
    () => (window as unknown as {flickWatch: FlickWatch}).flickWatch,
  );
}

test("a touch flick's close clears the scrim as the sheet leaves", async ({
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
  // Each frame, keep how far the sheet has slid out and the backdrop's
  // opacity, until the dialog closes (at most 15 s of frames).
  await dialog.evaluate(element => {
    const dialogElement = element as HTMLDialogElement;
    const panel = dialogElement.querySelector('.astryx-bottom-sheet');
    if (panel == null) {
      throw new Error('no sheet');
    }
    const restTop = panel.getBoundingClientRect().top;
    const distance = window.innerHeight - restTop;
    const watch: FlickWatch = {samples: [], closed: false};
    Object.assign(window, {flickWatch: watch});
    const look = () => {
      const top = panel.getBoundingClientRect().top;
      watch.samples.push({
        moved: (top - restTop) / distance,
        opacity: Number(getComputedStyle(dialogElement, '::backdrop').opacity),
      });
      if (!dialogElement.open) {
        watch.closed = true;
      } else if (watch.samples.length < 900) {
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
  const y = Math.round(box.y + 12);
  const driver = await touchDriver(page);
  // A short flick down from the grabber, about 1,500 px/s: the sheet closes.
  // Under load the harness can deliver it too slowly to count as a flick;
  // the sheet then settles back, and one more flick closes it.
  for (let attempt = 0; attempt < 2; attempt++) {
    await driver.play(drag({x, y}, {x, y: y + 60}, {durationMs: 40}), {
      pacing: 'spacing',
    });
    const closing = await expect
      .poll(async () => (await readWatch(page)).closed, {timeout: 3000})
      .toBe(true)
      .then(
        () => true,
        () => false,
      );
    if (closing) {
      break;
    }
  }
  const {samples, closed} = await readWatch(page);
  expect(closed).toBe(true);
  const rest = Math.max(
    ...samples.filter(sample => sample.moved < 0.2).map(s => s.opacity),
  );
  expect(rest).toBeGreaterThan(0);
  // The first frame on which at most a twentieth of the sheet is left in
  // view: the dim behind it has faded about as far.
  const nearlyGone = samples.find(sample => sample.moved >= 0.95);
  if (nearlyGone == null) {
    throw new Error('the sheet never left the screen');
  }
  expect(nearlyGone.opacity / rest).toBeLessThan(0.25);
});
