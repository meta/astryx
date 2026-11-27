// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/(Selector|MultiSelector|BottomSheet)/|apps/storybook/stories/Selector\.stories)

/**
 * @file SelectorSheetHeldOpen.a11y.chromium.spec.ts
 * @input The Bottom Sheet Presentation story, its sheet frame's chunk held
 *   until the test releases it
 * @output Browser proof that a tap made before the sheet's frame arrives
 *   leaves the trigger collapsed and naming nothing, and that axe finds no
 *   violation then or after the sheet opens
 * @position Chromium contract for the held open of an on-demand sheet
 */

import AxeBuilder from '@axe-core/playwright';
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
test.afterAll(async () => storybook?.close());

async function axeViolations(page: Page): Promise<string[]> {
  // A story is a page fragment with no landmarks or heading.
  const results = await new AxeBuilder({page})
    .disableRules(['landmark-one-main', 'page-has-heading-one', 'region'])
    .analyze();
  return results.violations.map(
    violation =>
      `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
  );
}

test('a tap before the sheet arrives leaves the trigger collapsed, and axe passes before and after', async ({
  page,
}) => {
  let release: () => void = () => {};
  const released = new Promise<void>(resolve => {
    release = resolve;
  });
  let requested = false;
  await page.route('**/SelectorBottomSheetFrame-*.js', async route => {
    requested = true;
    await released;
    await route.continue();
  });
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-selector--bottom-sheet-presentation&viewMode=story`,
  );
  const trigger = page.getByRole('combobox').first();
  await expect(trigger).toBeVisible();

  await trigger.click();
  await expect.poll(() => requested).toBe(true);
  // Held: no sheet yet, so the trigger reports no expanded list.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).not.toHaveAttribute('aria-controls');
  expect(await axeViolations(page)).toEqual([]);

  release();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger).toHaveAttribute(
    'aria-controls',
    (await listbox.getAttribute('id')) ?? '',
  );
  expect(await axeViolations(page)).toEqual([]);
});
