// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file reset.a11y.chromium.spec.ts
 * @input packages/core/src/reset.css, alone on a blank Chromium page
 * @output Browser evidence that the reset reaches ::before, ::after,
 *   ::placeholder, the search field's cancel button and the dropdown marker
 *   of a field with a list
 * @position reset.css integration proof. A pseudo-element inside :where() is
 *   invalid, and the forgiving list drops it without an error, so only a
 *   shipping engine shows which of the reset's rules still match.
 */

import * as fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, test, type Page} from '@playwright/test';
// @ts-expect-error -- pngjs ships no declarations; runtime support is pinned.
import {PNG} from 'pngjs';

const RESET_CSS = fs.readFileSync(
  fileURLToPath(new URL('./reset.css', import.meta.url)),
  'utf8',
);

// No Astryx CSS is loaded, so --color-text-secondary is undefined and a
// placeholder takes the reset's fallback: the token's own light-dark() default.
const PLACEHOLDER_FALLBACK = {
  light: 'rgb(78, 96, 111)',
  dark: 'rgb(170, 175, 181)',
};

/** Every style rule's selector, in source order, comments stripped. */
function sourceSelectors(css: string): string[] {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...stripped.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(([, selector]) =>
    selector.trim(),
  );
}

/** Whitespace and quote style are the only differences serialization adds. */
function normalize(selector: string): string {
  return selector.replace(/\s+/g, '').replace(/'/g, '"');
}

async function loadReset(page: Page) {
  await page.setContent(`
    <div id="probe"></div>
    <input id="name" placeholder="Name">
    <textarea id="notes" placeholder="Notes"></textarea>
    <input id="query" type="search" value="query" style="width: 200px">
  `);
  await page.addStyleTag({content: RESET_CSS});
  // Width 100 plus 10px padding a side: 100 wide under border-box, 120
  // under content-box. The ::before border sets only its width.
  await page.addStyleTag({
    content: `
      #probe { display: inline-block; }
      #probe::before, #probe::after {
        content: '';
        display: block;
        width: 100px;
        height: 20px;
        padding: 10px;
      }
      #probe::before { border-width: 5px; }
    `,
  });
}

test.beforeEach(async ({page}) => {
  await loadReset(page);
});

test('Chromium keeps every selector the reset writes', async ({page}) => {
  // A forgiving list drops an invalid entry instead of the whole rule, so a
  // dropped pseudo-element shows up as a shorter serialized selector.
  const parsed = await page.evaluate(() => {
    // The sheet opens with the `@layer` order statement; the rules live in
    // the `reset` layer block after it.
    const layer = [...document.styleSheets[0].cssRules].find(
      (rule): rule is CSSLayerBlockRule =>
        rule instanceof CSSLayerBlockRule && rule.name === 'reset',
    );
    if (layer == null) {
      throw new Error('reset.css has no @layer reset block');
    }
    return [...layer.cssRules].map(rule => (rule as CSSStyleRule).selectorText);
  });
  expect(parsed.map(normalize)).toEqual(
    sourceSelectors(RESET_CSS).map(normalize),
  );
});

test('::before and ::after are border-box and take the border reset', async ({
  page,
}) => {
  const measured = await page.evaluate(() => {
    const probe = document.getElementById('probe');
    if (!probe) {
      throw new Error('missing probe');
    }
    const before = getComputedStyle(probe, '::before');
    const after = getComputedStyle(probe, '::after');
    return {
      beforeBoxSizing: before.boxSizing,
      afterBoxSizing: after.boxSizing,
      beforeBorderStyle: before.borderTopStyle,
      beforeBorderWidth: before.borderTopWidth,
      afterBorderWidth: after.borderTopWidth,
      width: probe.getBoundingClientRect().width,
    };
  });
  expect(measured).toEqual({
    beforeBoxSizing: 'border-box',
    afterBoxSizing: 'border-box',
    beforeBorderStyle: 'solid',
    beforeBorderWidth: '5px',
    afterBorderWidth: '0px',
    width: 100,
  });
});

test('input and textarea placeholders take the reset color in both schemes', async ({
  page,
}) => {
  const readPlaceholders = async () =>
    page.evaluate(() =>
      ['name', 'notes'].map(id => {
        const field = document.getElementById(id);
        if (!field) {
          throw new Error(`missing #${id}`);
        }
        const placeholder = getComputedStyle(field, '::placeholder');
        return {color: placeholder.color, opacity: placeholder.opacity};
      }),
    );
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({colorScheme: scheme});
    const color = PLACEHOLDER_FALLBACK[scheme];
    expect(await readPlaceholders(), scheme).toEqual([
      {color, opacity: '1'},
      {color, opacity: '1'},
    ]);
  }
});

test('a search field has no cancel button to clear it', async ({page}) => {
  // Chromium draws the cancel button at the inline end of a focused search
  // field that has a value, and a click on it empties the field.
  const query = page.locator('#query');
  await query.focus();
  const box = await query.boundingBox();
  if (!box) {
    throw new Error('missing search field box');
  }
  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  await expect(query).toHaveValue('query');
});

test('the dropdown marker of a field with a list sits in its middle', async ({
  page,
}) => {
  // Chromium shows the marker while the pointer is over the field and draws
  // it as a glyph set on the field's line-height, the 1.5 the reset inherits.
  await page.evaluate(() => {
    const field = document.createElement('input');
    field.id = 'fruit';
    field.setAttribute('list', 'fruits');
    const options = document.createElement('datalist');
    options.id = 'fruits';
    options.append(new Option('Apple'));
    document.body.append(field, options);
  });
  await page.addStyleTag({
    content: `
      #fruit {
        display: block;
        width: 240px;
        padding: 7px 11px;
        border: 1px solid;
        line-height: 1.5;
      }
    `,
  });
  const field = page.locator('#fruit');
  await field.hover();
  const png = PNG.sync.read(await field.screenshot({caret: 'hide'}));
  // The marker is the only ink in the field's last 32px, inside the border.
  const inkRows: number[] = [];
  for (let y = 2; y < png.height - 2; y++) {
    for (let x = png.width - 32; x < png.width - 2; x++) {
      const offset = (y * png.width + x) * 4;
      const luminance =
        (png.data[offset] + png.data[offset + 1] + png.data[offset + 2]) / 3;
      if (luminance < 160) {
        inkRows.push(y);
        break;
      }
    }
  }
  expect(inkRows.length, 'the hovered field shows its marker').toBeGreaterThan(
    0,
  );
  const markerMiddle = (inkRows[0] + inkRows[inkRows.length - 1] + 1) / 2;
  expect(Math.abs(markerMiddle - png.height / 2)).toBeLessThanOrEqual(1);
});

test('a later layer and an unlayered rule still override the reset', async ({
  page,
}) => {
  // Same 0,0,1 specificity as the reset's own selectors, so only the cascade
  // layer decides.
  await page.addStyleTag({
    content: `
      @layer reset, astryx-base;
      @layer astryx-base {
        :where(textarea)::placeholder { color: rgb(0, 128, 0); }
      }
      :where(#probe)::after { box-sizing: content-box; }
    `,
  });
  const overridden = await page.evaluate(() => {
    const probe = document.getElementById('probe');
    const notes = document.getElementById('notes');
    if (!probe || !notes) {
      throw new Error('missing probe or textarea');
    }
    return {
      placeholderColor: getComputedStyle(notes, '::placeholder').color,
      afterBoxSizing: getComputedStyle(probe, '::after').boxSizing,
    };
  });
  expect(overridden).toEqual({
    placeholderColor: 'rgb(0, 128, 0)',
    afterBoxSizing: 'content-box',
  });
});
