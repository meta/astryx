// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastSafeArea.a11y.chromium.spec.ts
 * @input The Default story on an iPhone-sized page in Chromium, whose DevTools
 *   protocol emulates the bottom safe-area inset (34 px in portrait).
 * @output Tests that a bottom toast sits its 16 px gap above that inset. Under a
 *   finger it clears 34 px even with no reported inset. With a mouse and no
 *   inset the gap is 16 px.
 * @position Chromium only: Playwright's WebKit has no safe-area emulation.
 */
import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

// An iPhone 17 Pro page in Safari, portrait.
test.use({
  viewport: {width: 402, height: 714},
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const GAP = 16;

async function emulateBottomInset(page: Page, bottom: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setSafeAreaInsetsOverride', {
    insets: {
      top: 0,
      topMax: 0,
      bottom,
      bottomMax: bottom,
      left: 0,
      leftMax: 0,
      right: 0,
      rightMax: 0,
    },
  });
}

/** From the shown toast's bottom edge to the screen's bottom edge, px. */
async function bottomGap(page: Page): Promise<number> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-toast--default&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Show toast'}).click();
  const card = page.locator('.astryx-toast').first();
  await expect(card).toBeVisible();
  // The toast rests once the page's animations end, canceled ones included.
  await page.evaluate(async () => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter(
          animation => animation.effect?.getTiming().iterations !== Infinity,
        )
        .map(async animation => animation.finished),
    );
  });
  return card.evaluate(
    element => window.innerHeight - element.getBoundingClientRect().bottom,
  );
}

test('a bottom toast sits its 16 px gap above the bottom safe-area inset', async ({
  page,
}) => {
  await emulateBottomInset(page, 34);
  expect(await bottomGap(page)).toBeCloseTo(34 + GAP, 0);
});

test('under a finger with no reported inset, a bottom toast still clears 34 px', async ({
  page,
}) => {
  await emulateBottomInset(page, 0);
  expect(await bottomGap(page)).toBeCloseTo(34 + GAP, 0);
});

test('a bottom inset above 34 px adds its own size', async ({page}) => {
  await emulateBottomInset(page, 48);
  expect(await bottomGap(page)).toBeCloseTo(48 + GAP, 0);
});

test.describe('with a mouse', () => {
  test.use({isMobile: false, hasTouch: false});

  test('with no inset, a bottom toast keeps its 16 px gap', async ({page}) => {
    await emulateBottomInset(page, 0);
    expect(await bottomGap(page)).toBeCloseTo(GAP, 0);
  });

  test('a bottom toast sits its 16 px gap above the inset', async ({page}) => {
    await emulateBottomInset(page, 34);
    expect(await bottomGap(page)).toBeCloseTo(34 + GAP, 0);
  });
});
