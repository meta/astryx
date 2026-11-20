// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PopoverAnchor.interaction.browser.spec.ts
 * @input The built Popover Anchor Ref story (one `usePopover` popover
 *   shared by three table rows through `anchorRef`), real pointer input and
 *   the interaction harness
 * @output Proofs that the popover sits on the element `anchorRef` holds, that
 *   setting the ref and calling `show()` moves the open popover with no close
 *   or remount, that it shows no surface while its anchor is out of the
 *   document, and that focus inside it then moves out
 * @position Browser proofs for Popover/usePopover.tsx's `anchorRef`
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const surface = (page: Page) => page.getByRole('dialog', {name: 'Edit value'});

/** Whether the surface sits just above or below the cell, over its columns. */
async function isBesideCell(page: Page, row: string) {
  const cell = await page.locator(`[data-cell="${row}"]`).boundingBox();
  const box = await surface(page).boundingBox();
  if (cell == null || box == null) {
    return false;
  }
  // The gap on the side the surface sits: zero when the edges touch.
  const gap = Math.max(
    box.y - (cell.y + cell.height),
    cell.y - (box.y + box.height),
  );
  const overlapsInline =
    box.x < cell.x + cell.width && box.x + box.width > cell.x;
  return gap >= 0 && gap < 24 && overlapsInline;
}

/** Waits until the surface sits beside the cell. */
async function expectBeside(page: Page, row: string) {
  await expect.poll(async () => isBesideCell(page, row)).toBe(true);
}

test('the popover sits on the cell the ref holds, and moves on the next show()', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-anchor-ref--rows');
  await page.getByRole('button', {name: 'Edit row A'}).click();
  await expect(surface(page)).toBeVisible();
  await expectBeside(page, 'A');

  // Mark the surface node and put focus in its field.
  await surface(page).evaluate(node => node.setAttribute('data-first', ''));
  const field = page.getByRole('textbox', {name: 'Value'});
  await field.fill('12');
  await expect(field).toBeFocused();

  await page.getByRole('button', {name: 'Edit row C'}).click();
  await expectBeside(page, 'C');
  // The same node, still open, with its state; one show and no hide.
  await expect(surface(page)).toHaveAttribute('data-first', '');
  await expect(field).toHaveValue('12');
  await expect(page.getByTestId('counts')).toHaveText('shows 1, hides 0');
});

test('the popover shows no surface while its anchor is out of the document', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-anchor-ref--rows');
  await page.getByRole('button', {name: 'Edit row B'}).click();
  await expect(surface(page)).toBeVisible();
  await expectBeside(page, 'B');

  await page.getByRole('button', {name: 'Remove row B value'}).click();
  await expect(surface(page)).toBeHidden();
  // Hidden, not closed.
  await expect(page.getByTestId('counts')).toHaveText('shows 1, hides 0');

  // The restored cell is a new element: the caller names it and shows again.
  await page.getByRole('button', {name: 'Restore row B value'}).click();
  await page.getByRole('button', {name: 'Edit row B'}).click();
  await expect(surface(page)).toBeVisible();
  await expectBeside(page, 'B');
  await expect(page.getByTestId('counts')).toHaveText('shows 1, hides 0');
});

test('focus leaves a surface whose anchor left the document', async ({
  page,
}) => {
  await openStory(page, storybook(), 'core-popover-anchor-ref--rows');
  const edit = page.getByRole('button', {name: 'Edit row B'});
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(surface(page)).toBeVisible();

  // A control inside the popover removes the popover's anchor.
  await page.getByRole('button', {name: 'Delete value B'}).focus();
  await page.keyboard.press('Enter');
  await expect(surface(page)).toBeHidden();
  // The element that held focus when the popover opened takes it back.
  await expect(edit).toBeFocused();

  // The cell returns and the caller shows again; focus is not moved back.
  const restore = page.getByRole('button', {name: 'Restore row B value'});
  await restore.focus();
  await page.keyboard.press('Enter');
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(surface(page)).toBeVisible();
  await expect(edit).toBeFocused();
});
