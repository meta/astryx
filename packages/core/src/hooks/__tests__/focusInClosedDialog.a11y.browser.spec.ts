// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusInClosedDialog.a11y.browser.spec.ts
 * @input The LayerDismissal FocusInClosedInFlowDialog story in a built
 *   Storybook
 * @output Proof that Tab moves through layers that open inside a closed
 *   `<dialog>` the page displays in flow, and skips a closed dialog the page
 *   does not display
 * @position Browser accessibility spec for useFocusTrap's reachability test,
 *   which Popover's focus trap and DropdownMenu's region stops share
 *
 * SYNC: The story is in apps/storybook/stories/LayerDismissal.stories.tsx.
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

const STORY = 'core-layer-dismissal--focus-in-closed-in-flow-dialog';

async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    {waitUntil: 'load'},
  );
}

/**
 * Opens a Popover of `DetailsFields` by a click on `trigger`. Then it walks the
 * Popover with Tab and Shift+Tab, across its fields and around both edges.
 */
async function walkDetailsPopover(page: Page, trigger: string): Promise<void> {
  await page.getByRole('button', {name: trigger}).click();
  const name = page.getByRole('textbox', {name: 'Name', exact: true});
  const note = page.getByRole('textbox', {name: 'Note', exact: true});
  // The Popover's own close control, last in its content and visually hidden
  // until it takes focus.
  const close = page.getByRole('button', {name: 'Close popover'});
  await expect(name).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(note).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(name).toBeFocused();
  // Before the first stop, Shift+Tab wraps to the last. Past the last, Tab
  // wraps to the first. The focus trap moves focus there itself, so WebKit
  // also reaches the button. The first field, in a closed dialog that the
  // page does not display, is no stop, so the wrap skips it.
  await page.keyboard.press('Shift+Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(name).toBeFocused();
  await expect(page.locator(':popover-open')).toHaveCount(1);
}

test('Tab moves through a Popover in a closed dialog shown in flow, and wraps at both edges', async ({
  page,
}) => {
  await openStory(page);
  await walkDetailsPopover(page, 'Edit details');
});

test('Tab moves through the same Popover in an open Dialog, and wraps at both edges', async ({
  page,
}) => {
  await openStory(page);
  await page.getByRole('button', {name: 'Open dialog'}).click();
  await expect(
    page.getByRole('dialog', {name: 'Dialog with a popover'}),
  ).toBeVisible();
  await walkDetailsPopover(page, 'Edit in dialog');
});

test('Tab walks the header, menu and footer of a DropdownMenu in a closed dialog shown in flow, and wraps', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName === 'webkit',
    'WebKit moves Tab to no button unless the user turns on full keyboard access.',
  );
  await openStory(page);
  await page.getByRole('button', {name: 'Labels', exact: true}).click();
  const menu = page.getByRole('menu', {name: 'Labels', exact: true});
  await expect(menu).toBeVisible();
  const field = page.getByRole('textbox', {name: 'Filter labels'});
  const create = page.getByRole('button', {name: 'Create label'});

  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(create).toBeFocused();
  // Past the footer's last control, Tab wraps to the header. Before the
  // header's first, Shift+Tab wraps to the footer. The menu stays open.
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(create).toBeFocused();
  await expect(menu).toBeVisible();
});
