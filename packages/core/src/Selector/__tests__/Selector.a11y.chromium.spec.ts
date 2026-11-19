// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/MultiSelector

/**
 * @file Selector.a11y.chromium.spec.ts
 * @input Uses checked-in Selector and MultiSelector Storybook stories and Chromium
 * @output Accessibility-tree, initial-disclosure, and keyboard-focus regression coverage
 * @position Browser-only accessibility regression tests for selection controls
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

test('names the no-search bottom-sheet listbox from the Selector label', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--bottom-sheet-presentation&viewMode=story`,
    {waitUntil: 'load'},
  );

  await page.getByRole('combobox', {name: 'Team'}).click();

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  // Playwright resolves this matcher from Chromium's accessibility tree, not
  // the DOM attribute alone. The sheet is a modal layer, so a reference to the
  // trigger outside it produces no name; this is the regression proof.
  await expect(listbox).toHaveAccessibleName('Team');
});

async function expectDisabledDefaultOpenToStayClosed(
  page: Page,
  storyId: string,
  presentation: 'popover' | 'bottom-sheet',
) {
  // Record even a short-lived native opening without changing its behavior.
  await page.addInitScript(() => {
    const openings: string[] = [];
    Object.defineProperty(window, '__selectorDefaultOpenings', {
      value: openings,
    });
    const showPopover = HTMLElement.prototype.showPopover;
    HTMLElement.prototype.showPopover = function (...args) {
      openings.push('popover');
      return showPopover.apply(this, args);
    };
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      openings.push('bottom-sheet');
      return showModal.call(this);
    };
  });
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`,
  );
  await page.getByRole('combobox').waitFor();
  // Generic component props are not all inferred as URL args. Remount with
  // explicit args so the default-open Effect sees them on its first render.
  await page.evaluate(
    async ({storyId, presentation}) => {
      const channel = (
        window as unknown as {
          __STORYBOOK_ADDONS_CHANNEL__: {
            emit(event: string, payload: unknown): void;
            once(event: string, callback: () => void): void;
          };
        }
      ).__STORYBOOK_ADDONS_CHANNEL__;
      await new Promise<void>(resolve => {
        channel.once('storyArgsUpdated', () => {
          channel.once('storyRendered', resolve);
          channel.emit('forceRemount', {storyId});
        });
        channel.emit('updateStoryArgs', {
          storyId,
          updatedArgs: {
            isDefaultOpen: true,
            isDisabled: true,
            isReadOnly: true,
            presentation,
          },
        });
      });
    },
    {storyId, presentation},
  );

  const trigger = page.getByRole('combobox');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await page.evaluate(
    async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as {__selectorDefaultOpenings: string[]})
          .__selectorDefaultOpenings,
    ),
  ).toEqual([]);
}

test('a disabled Selector default opening shows no popover and keeps its tab stop', async ({
  page,
}) => {
  await expectDisabledDefaultOpenToStayClosed(
    page,
    'core-selector--default',
    'popover',
  );
});

test('a disabled MultiSelector default opening shows no sheet and keeps its tab stop', async ({
  page,
}) => {
  await expectDisabledDefaultOpenToStayClosed(
    page,
    'core-multiselector--default',
    'bottom-sheet',
  );
});
