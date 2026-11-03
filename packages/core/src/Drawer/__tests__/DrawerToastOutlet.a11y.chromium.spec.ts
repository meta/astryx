// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Drawer core/Toast ^apps/storybook/stories/Toast

/**
 * @file DrawerToastOutlet.a11y.chromium.spec.ts
 * @input The built Core/Toast AppToastOverDrawer story; real Chromium hit
 *   testing, mouse and keyboard input
 * @output Browser evidence that a toast fired from an open modal Drawer is
 *   hit-testable above the drawer, takes a click, and is reached with Tab, and
 *   that a toast shown before a scrimless Drawer opens stays above it
 * @position Chromium proof for Drawer's modal outlet (Layer/modalOutlet.ts).
 *   jsdom has no top layer and no modal inertness, so
 *   Toast/ToastViewport.modalHost.test.tsx can only check where the viewport
 *   lives.
 */

import {expect, test, type Page} from '@playwright/test';
import {holdMotionStill} from '@astryxdesign/a11y-spec/chromium';
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

async function openDrawerAndToast(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-toast--app-toast-over-drawer&viewMode=story`,
  );
  await holdMotionStill(page);
  await page.getByRole('button', {name: 'Open candidate', exact: true}).click();
  const drawer = page.getByRole('dialog', {name: 'Candidate'});
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', {name: 'Move to Interview'}).click();
  await expect(
    drawer.getByText('The candidate is in Interview.'),
  ).toBeVisible();
  return drawer;
}

// Desktop: the toast's corner sits beside or under the drawer. Phone: the
// drawer covers the whole width, so a toast left outside it is hidden.
for (const viewport of [
  {width: 1280, height: 800},
  {width: 390, height: 844},
]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({viewport});

    test('a toast action above a modal drawer takes the click', async ({
      page,
    }) => {
      const drawer = await openDrawerAndToast(page);
      const undo = page.locator('[popover] button', {hasText: 'Undo'});
      await expect(undo).toBeVisible();
      const box = await undo.boundingBox();
      if (box == null) {
        throw new Error('the Undo button has no box');
      }
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      // Hit testing skips inert content and follows top-layer order: a toast
      // left outside the drawer's modal, or under it, loses this point to the
      // drawer.
      const hit = await page.evaluate(
        ([px, py]) =>
          document.elementFromPoint(px, py)?.closest('button')?.textContent ??
          null,
        [x, y],
      );
      expect(hit).toBe('Undo');

      await page.mouse.click(x, y);
      await expect(
        drawer.getByText('The candidate is back in Screening.'),
      ).toBeVisible();
    });
  });
}

test('Tab reaches the toast action from inside a modal drawer', async ({
  page,
}) => {
  await page.setViewportSize({width: 1280, height: 800});
  await openDrawerAndToast(page);
  let reached = false;
  for (let i = 0; i < 12 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () => document.activeElement?.textContent === 'Undo',
    );
  }
  expect(reached).toBe(true);
});

// A scrimless drawer is a manual popover that enters the top layer after the
// viewport: the viewport re-enters above it. Phone width, so the drawer
// covers the toast's corner.
test('a toast shown before a scrimless drawer opens stays above it', async ({
  page,
}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-toast--app-toast-over-non-modal-drawer&viewMode=story`,
  );
  await holdMotionStill(page);
  await page.getByRole('button', {name: 'Save filters', exact: true}).click();
  const undo = page.locator('[popover] button', {hasText: 'Undo'});
  await expect(undo).toBeVisible();
  await page.getByRole('button', {name: 'Open filters', exact: true}).click();
  await expect(page.getByRole('dialog', {name: 'Filters'})).toBeVisible();

  const box = await undo.boundingBox();
  if (box == null) {
    throw new Error('the Undo button has no box');
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(
    ([px, py]) =>
      document.elementFromPoint(px, py)?.closest('button')?.textContent ?? null,
    [x, y],
  );
  expect(hit).toBe('Undo');
  await page.mouse.click(x, y);
  await expect(page.getByText('The save is undone.')).toBeVisible();
});
