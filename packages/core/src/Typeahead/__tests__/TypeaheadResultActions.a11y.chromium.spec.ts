// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Typeahead/BaseTypeahead ^apps/storybook/stories/Typeahead

/**
 * @file TypeaheadResultActions.a11y.chromium.spec.ts
 * @input The `Core/Typeahead` "Result Actions" story in a built Storybook.
 * @output Real-engine proof for a result's action: the grid passes an
 *   accessibility engine's required-children and required-parent rules, each
 *   action is visible at rest inside its own row, and after the arrow keys
 *   reach a row the inline-end arrow moves to the action in both directions
 *   and Enter fires it without selecting the result.
 * @position Run with `pnpm test:a11y-contract`; the engine's tree, paint and
 *   writing direction are not jsdom claims.
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

test.afterAll(async () => {
  await storybook?.close();
});

async function openGrid(page: Page, direction: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-typeahead--result-actions&viewMode=story&globals=direction:${direction}`,
    {waitUntil: 'load'},
  );
  const input = page.getByRole('combobox');
  await input.fill('a');
  await expect(page.getByRole('grid')).toBeVisible();
  return input;
}

/** The active descendant's role, and the name a screen reader reads for it. */
async function activeDescendant(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const id = document.activeElement?.getAttribute('aria-activedescendant');
    const el = id ? document.getElementById(id) : null;
    if (el == null) {
      return id ? 'missing' : null;
    }
    const role = el.getAttribute('role');
    const name =
      role === 'row'
        ? (document.getElementById(el.getAttribute('aria-labelledby') ?? '')
            ?.textContent ?? '')
        : (el.querySelector('button')?.getAttribute('aria-label') ?? '');
    return `${role}:${name.trim()}`;
  });
}

test('the grid passes the engine rules, with each action visible in its row', async ({
  page,
}) => {
  await openGrid(page);
  expect(await page.getByRole('listbox').count()).toBe(0);
  for (const label of ['Apple', 'Banana']) {
    const row = page.getByRole('row', {name: label});
    const action = page.getByRole('button', {name: `Edit ${label}`});
    await expect(action).toBeVisible();
    expect(await row.locator('button').count()).toBe(1);
  }
  // A story is a page fragment with no landmarks or heading.
  const results = await new AxeBuilder({page})
    .include('[role="grid"]')
    .disableRules(['landmark-one-main', 'page-has-heading-one', 'region'])
    .analyze();
  expect(
    results.violations.map(
      violation =>
        `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`,
    ),
  ).toEqual([]);
});

for (const direction of ['ltr', 'rtl'] as const) {
  test(`${direction}: the inline-end arrow reaches an action and Enter fires only it`, async ({
    page,
  }) => {
    const input = await openGrid(page, direction);
    const toAction = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const toOption = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    await input.press('Home');
    await expect.poll(async () => activeDescendant(page)).toBe('row:Apple');
    await input.press(toAction);
    await expect
      .poll(async () => activeDescendant(page))
      .toBe('gridcell:Edit Apple');
    await input.press('Enter');
    await expect(page.getByText('Last edited: Apple')).toBeVisible();
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(input).toHaveValue('a');
    await input.press(toOption);
    await expect.poll(async () => activeDescendant(page)).toBe('row:Apple');
  });
}
