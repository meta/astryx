// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/PowerSearch ^apps/storybook/stories/PowerSearch

/**
 * @file PowerSearchSheetOperatorRows.a11y.chromium.spec.ts
 * @input The `Core/PowerSearch` bottom-sheet story in a built Storybook.
 * @output Real-engine proof that each operator radio in the sheet's value step
 *   is a 44 px target and sits at the choice rows' pitch below it.
 * @position Run with `pnpm test:a11y-contract`. A row's height comes from
 *   layout, which only a shipping layout engine can show.
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

const STORY = 'core-powersearch--sheet-presentation';

async function openStatusStep(page: Page): Promise<void> {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`,
    {
      waitUntil: 'load',
    },
  );
  await page.locator('button[aria-haspopup="dialog"]').first().click();
  const filters = page.getByRole('dialog', {name: 'Filters'});
  await filters.getByRole('button', {name: 'Add filter'}).click();
  const fields = page.getByRole('dialog', {name: 'Add filter'});
  await fields.getByRole('button', {name: 'Status', exact: true}).click();
  await expect(
    page.getByRole('dialog', {name: 'Status'}).getByRole('radiogroup', {
      name: 'Operator',
    }),
  ).toBeVisible();
}

test('each operator radio in the sheet is a 44 px target at the choice rows’ pitch', async ({
  page,
}) => {
  await openStatusStep(page);
  const rows = await page.evaluate(() => {
    const step = [...document.querySelectorAll('dialog[open]')].pop();
    const operator = step?.querySelector('[role="radiogroup"]');
    const choices = step?.querySelector('[role="group"][aria-label="Status"]');
    if (operator == null || choices == null) {
      throw new Error('The Status step has no operator group or choices');
    }
    const boxes = (elements: Element[]) =>
      elements.map(element => element.getBoundingClientRect());
    return {
      operator: boxes([...operator.children]),
      choices: boxes([...choices.querySelectorAll('[role="checkbox"]')]),
    };
  });
  expect(rows.operator.length).toBeGreaterThan(1);
  for (const row of rows.operator) {
    expect(row.height).toBeGreaterThanOrEqual(44);
  }
  const pitch = (boxes: DOMRect[]) => boxes[1].top - boxes[0].top;
  expect(pitch(rows.operator)).toBeCloseTo(pitch(rows.choices), 0);
});
