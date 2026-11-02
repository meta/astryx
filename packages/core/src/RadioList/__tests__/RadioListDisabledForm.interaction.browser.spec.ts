// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioListDisabledForm.interaction.browser.spec.ts
 * @input The built "a11y/RadioList disabled in a form" stories, in a real
 *   browser
 * @output Proof that disabled radios submit no value and never block a
 *   submit, while each group stays one native radio group with one Tab stop
 *   (spec:AST-085 FR3; component:RadioListItem FR6). jsdom fires no
 *   `formdata` event, so the submitted entries are read here.
 * @position Form evidence for /packages/core/src/RadioList
 */

import {expect, test, type Page} from '@playwright/test';
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

async function openStory(page: Page, name: string): Promise<void> {
  const params = new URLSearchParams({
    id: `a11y-radiolist-disabled-in-a-form--${name}`,
    viewMode: 'story',
  });
  await page.goto(`${storybook.origin}/iframe.html?${params}`);
  await page.locator('[role="radiogroup"]').first().waitFor();
}

/** Each form's submitted entries and validity, as the browser builds them. */
async function readForms(page: Page) {
  return page.evaluate(() =>
    Array.from(document.forms).map(form => ({
      entries: Array.from(new FormData(form).entries()).map(
        ([name, value]) =>
          `${name}=${typeof value === 'string' ? value : value.name}`,
      ),
      isValid: form.checkValidity(),
    })),
  );
}

test('a selected option that is disabled submits nothing and blocks no submit', async ({
  page,
}) => {
  await openStory(page, 'selected-option-disabled');
  expect(await readForms(page)).toEqual([
    {entries: ['order=1001'], isValid: true},
  ]);
  // One native group: every radio keeps the same form owner and name, so the
  // selected radio stays checked and remains the group's only Tab stop.
  expect(
    await page.evaluate(() => {
      const radios = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
      );
      return {
        owners: new Set(radios.map(radio => radio.form)).size,
        names: new Set(radios.map(radio => radio.name)).size,
        checked: radios
          .filter(radio => radio.checked)
          .map(radio => radio.value),
      };
    }),
  ).toEqual({owners: 1, names: 1, checked: ['express']});
});

test('a required group with every option disabled blocks no submit', async ({
  page,
}) => {
  await openStory(page, 'all-options-disabled-required');
  expect(await readForms(page)).toEqual([{entries: [], isValid: true}]);
});

test('disabled groups that share a field name in two forms stay apart', async ({
  page,
}) => {
  await openStory(page, 'shared-name-in-two-forms');
  await expect(page.getByRole('radio', {name: 'First standard'})).toBeChecked();
  await expect(page.getByRole('radio', {name: 'Second express'})).toBeChecked();
  expect(await readForms(page)).toEqual([
    {entries: [], isValid: true},
    {entries: [], isValid: true},
  ]);
});
