// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reset.hidden.a11y.browser.spec.ts
 * @input packages/core/src/reset.css, alone on a blank page
 * @output Browser evidence that a `hidden` element stays hidden whatever
 *   `display` its own styles set
 * @position reset.css integration proof. Whether the reset's `[hidden]` rule
 *   beats a class, a later layer or an unlayered rule is a cascade question,
 *   and only a shipping engine resolves the cascade.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';

const RESET_CSS = fs.readFileSync(
  fileURLToPath(new URL('./reset.css', import.meta.url)),
  'utf8',
);

test.beforeEach(async ({page}) => {
  await page.setContent(`
    <div id="layered" hidden class="flex">A component class sets display</div>
    <div id="unlayered" hidden class="grid">An unlayered rule sets display</div>
    <div id="inline" hidden style="display: block">An inline style sets display</div>
    <div id="forced" hidden style="display: block !important">Inline !important</div>
    <div id="early" hidden class="early">An earlier layer's !important</div>
    <div id="until-found" hidden="until-found" class="flex">Findable</div>
    <div id="shown" class="flex">Not hidden</div>
  `);
  // A layer declared before `reset`, as an app may declare for legacy CSS.
  await page.addStyleTag({content: '@layer early, reset, astryx-base;'});
  await page.addStyleTag({content: RESET_CSS});
  await page.addStyleTag({
    content: `
      @layer early { .early { display: flex !important; } }
      @layer astryx-base { .flex { display: flex; } }
      .grid { display: grid; }
    `,
  });
});

async function displays(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(
      [
        'layered',
        'unlayered',
        'inline',
        'forced',
        'early',
        'until-found',
        'shown',
      ].map(id => {
        const element = document.getElementById(id);
        if (!element) {
          throw new Error(`missing #${id}`);
        }
        const style = getComputedStyle(element);
        return [id, `${style.display} / ${style.contentVisibility}`] as const;
      }),
    ),
  );
}

test('hidden beats display from a class, a later layer, an unlayered rule and an inline style', async ({
  page,
}) => {
  const computed = await displays(page);
  expect(computed.layered).toBe('none / visible');
  expect(computed.unlayered).toBe('none / visible');
  expect(computed.inline).toBe('none / visible');
});

test('an inline or earlier-layer !important display still wins, and until-found keeps the browser rendering', async ({
  page,
}) => {
  const computed = await displays(page);
  expect(computed.forced).toBe('block / visible');
  expect(computed.early).toBe('flex / visible');
  expect(computed['until-found']).toBe('flex / hidden');
  expect(computed.shown).toBe('flex / visible');
});
