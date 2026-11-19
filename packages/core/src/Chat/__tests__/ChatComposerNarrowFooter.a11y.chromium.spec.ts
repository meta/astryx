// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Chat/ChatComposer|apps/storybook/stories/ChatComposer)

/**
 * @file ChatComposerNarrowFooter.a11y.chromium.spec.ts
 * @input The `Core/ChatComposer` NarrowFooterActions story in a built
 *   Storybook, in Chromium at a 320px viewport
 * @output Real-browser proof that labeled footer actions wider than the
 *   footer wrap inside the composer: the send action stays inside the
 *   composer, nothing scrolls sideways, and no action label is cut
 * @position Runs in pr-a11y when ChatComposer or its stories change. jsdom
 *   does no layout, so only a browser shows where the send action lands.
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test('footer actions wrap and the send action stays inside a narrow composer', async ({
  page,
}) => {
  await page.setViewportSize({width: 320, height: 640});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-chatcomposer--narrow-footer-actions&viewMode=story`,
  );
  const composer = page.getByTestId('narrow-footer-composer');
  await expect(composer).toBeVisible();
  const send = page.getByRole('button', {name: 'Send'});
  await expect(send).toBeVisible();
  const composerBox = await composer.boundingBox();
  const sendBox = await send.boundingBox();
  const overflow = await composer.evaluate(element => ({
    composer: element.scrollWidth - element.clientWidth,
    page:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(overflow.composer).toBeLessThanOrEqual(0);
  expect(overflow.page).toBeLessThanOrEqual(0);
  expect((sendBox?.x ?? Infinity) + (sendBox?.width ?? 0)).toBeLessThanOrEqual(
    (composerBox?.x ?? 0) + (composerBox?.width ?? 0),
  );
  for (const name of ['Research mode', 'Attach files', 'Settings']) {
    const cut = await page
      .getByRole('button', {name})
      .evaluate(button =>
        [...button.querySelectorAll<HTMLElement>('*')].some(
          part => part.scrollWidth > part.clientWidth,
        ),
      );
    expect(cut, `${name} keeps its whole label`).toBe(false);
  }
});
