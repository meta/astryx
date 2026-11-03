// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope core/Tokenizer ^apps/storybook/stories/BaseTypeahead

/**
 * @file BaseTypeahead.emptyState.a11y.chromium.spec.ts
 * @input Checked-in empty-to-pending Storybook fixture and real Chromium
 * @output Query/debounce/pending/final row, busy, accessibility-tree and selection evidence
 * @position Browser regression for AST-092 FR5 and AST-056 AR1 (#8903)
 */

import {expect, test} from '@playwright/test';
import {
  serveStorybook,
  DEFAULT_STORYBOOK_DIR,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => storybook?.close());

for (const label of [
  'Bare framework',
  'Single framework',
  'Framework tokens',
]) {
  for (const query of ['react', 'xxx']) {
    test(`${label}: empty → debounce → pending → ${query === 'react' ? 'results' : 'empty'}`, async ({
      page,
    }, testInfo) => {
      await page.goto(
        `${storybook.origin}/iframe.html?id=core-basetypeahead--empty-then-pending&viewMode=story`,
      );
      const input = page.getByRole('combobox', {name: label});
      await input.waitFor();
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      const listbox = page.locator(
        `[id="${await input.getAttribute('aria-controls')}"]`,
      );
      await input.fill('zzz');
      await page.clock.runFor(150);
      await expect(input).toHaveAttribute('aria-busy', 'true');
      await expect(input).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('img', {name: 'Loading'})).toBeVisible();
      await expect(listbox).not.toBeVisible();
      await testInfo.attach('first-pending', {
        body: await page.screenshot({
          path: testInfo.outputPath('first-pending.png'),
        }),
        contentType: 'image/png',
      });
      await page.clock.runFor(1000);
      await expect(listbox).toBeVisible();
      await expect(listbox.getByRole('option')).toHaveText('No results found');
      await page.clock.runFor(32);
      await expect(
        page.locator('[data-astryx-live-region="polite"]'),
      ).toHaveText('No results found');
      // Clear the settled announcement through its normal lifetime.
      await page.clock.runFor(2000);

      await input.fill(query);
      await page.clock.runFor(149);
      await testInfo.attach('debounce', {
        body: await page.screenshot({
          path: testInfo.outputPath('debounce.png'),
        }),
        contentType: 'image/png',
      });
      await expect(listbox).not.toContainText('No results found');
      await expect(listbox.getByRole('option')).toHaveCount(0);
      await expect(input).not.toHaveAttribute('aria-busy');
      await expect(
        page.locator('[data-astryx-live-region="polite"]'),
      ).toBeEmpty();
      await page.clock.runFor(1);
      await expect(input).toHaveAttribute('aria-busy', 'true');
      await expect(listbox.getByRole('option')).toHaveCount(0);
      await expect(listbox).toBeEmpty();
      await expect(page.getByRole('img', {name: 'Loading'})).toBeVisible();
      await expect(input).not.toHaveAttribute('aria-activedescendant');
      await expect(listbox).toMatchAriaSnapshot('- listbox "Search results"');
      await testInfo.attach('pending', {
        body: await page.screenshot({path: testInfo.outputPath('pending.png')}),
        contentType: 'image/png',
      });
      await page.clock.runFor(999);
      await expect(listbox).not.toContainText('No results found');
      await expect(input).toHaveAttribute('aria-busy', 'true');
      await page.clock.runFor(1);
      await page.clock.runFor(32);
      await expect(input).not.toHaveAttribute('aria-busy');
      await expect(page.getByRole('img', {name: 'Loading'})).toHaveCount(0);
      if (query === 'react') {
        await expect(listbox.getByRole('option')).toHaveText('React');
        await expect(
          page.locator('[data-astryx-live-region="polite"]'),
        ).toHaveText('1 result');
        await testInfo.attach('settled', {
          body: await page.screenshot({
            path: testInfo.outputPath('settled.png'),
          }),
          contentType: 'image/png',
        });
        await input.press('Enter');
        await expect(input).toHaveValue('');
        await expect(input).toHaveAttribute('aria-expanded', 'false');
        if (label === 'Framework tokens') {
          await expect(
            page.getByRole('button', {name: 'Remove React'}),
          ).toBeVisible();
        }
      } else {
        await expect(listbox.getByRole('option')).toHaveText(
          'No results found',
        );
        await expect(listbox.getByRole('option')).toHaveAttribute(
          'aria-disabled',
          'true',
        );
        await expect(
          page.locator('[data-astryx-live-region="polite"]'),
        ).toHaveText('No results found');
        await testInfo.attach('settled', {
          body: await page.screenshot({
            path: testInfo.outputPath('settled.png'),
          }),
          contentType: 'image/png',
        });
      }
    });
  }
}
