// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file reset.until-found.a11y.browser.spec.ts
 * @input packages/core/src/reset.css, alone on a blank page
 * @output Browser evidence that `hidden="until-found"` content stays findable
 * @position reset.css integration proof. The browser hides until-found content
 *   with `content-visibility: hidden`, which find in page and text fragments
 *   can search and reveal; `display: none` takes the content out of both, and
 *   only a shipping engine shows which one applies.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test} from '@playwright/test';

const RESET_CSS = fs.readFileSync(
  fileURLToPath(new URL('./reset.css', import.meta.url)),
  'utf8',
);

// Served at a real URL so a text fragment navigation can run against it.
const ORIGIN = 'http://reset.test';
const PAGE = `<!doctype html>
<style>${RESET_CSS}</style>
<div style="height: 3000px">Above the fold</div>
<div id="answer" hidden="until-found">The hidden answer</div>
<div id="closed" hidden>Plain hidden text</div>
<script>
  document.getElementById('answer').addEventListener('beforematch', () => {
    document.body.dataset.beforematch = 'fired';
  });
</script>`;

test.beforeEach(async ({page}) => {
  await page.route(`${ORIGIN}/**`, async route =>
    route.fulfill({contentType: 'text/html', body: PAGE}),
  );
});

test('until-found content keeps the browser rendering', async ({page}) => {
  await page.goto(`${ORIGIN}/`);
  const styles = await page.evaluate(() =>
    ['answer', 'closed'].map(id => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`missing #${id}`);
      }
      const style = getComputedStyle(element);
      return {
        display: style.display,
        contentVisibility: style.contentVisibility,
      };
    }),
  );
  expect(styles).toEqual([
    {display: 'block', contentVisibility: 'hidden'},
    {display: 'none', contentVisibility: 'visible'},
  ]);
});

test('a text fragment finds until-found content and reveals it', async ({
  page,
}) => {
  await page.goto(`${ORIGIN}/#:~:text=hidden%20answer`);
  // The browser removes the attribute and fires beforematch when it reveals.
  await expect(page.locator('#answer')).not.toHaveAttribute('hidden');
  await expect(page.locator('#answer')).toBeInViewport();
  await expect(page.locator('body')).toHaveAttribute(
    'data-beforematch',
    'fired',
  );
  // Plain hidden content stays out of reach.
  await expect(page.locator('#closed')).toBeHidden();
});
