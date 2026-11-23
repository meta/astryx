// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file AdaptationScopeRoot.a11y.chromium.spec.ts
 * @input A themed page on a coarse pointer (a touch device profile) with an
 *   adaptation block written the way the theme compiler writes it, for one
 *   theme and for a theme family that shares one block, with a nested theme
 * @output Real-Chromium evidence that the scope root selector the compiler
 *   writes sets the same values on the same elements as a bare `:scope`, and
 *   that Chromium does not try it on the elements under the root
 * @position Browser evidence for generateAdaptationCSS's scope root selector
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';

test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});

const ONE = '[data-astryx-theme="coarse"]';
const FAMILY =
  ':where([data-astryx-theme="coarse"], [data-astryx-theme="other"])';
const BARE = ':scope';
const ROOT = ':scope:where([data-astryx-theme])';

function block(scope: string, selector: string): string {
  return `@media (pointer: coarse) {\n  @scope (${scope}) to ([data-astryx-theme]) {\n    ${selector} {\n      --size-element-md: 40px;\n    }\n  }\n}`;
}

async function mount(page: Page, css: string): Promise<void> {
  await page.setContent(
    `<style>:root { --size-element-md: 32px; } .probe span { color: blue }</style><style>${css}</style>` +
      '<div id="root" data-astryx-theme="coarse"><span id="inside">a</span>' +
      '<div id="nested" data-astryx-theme="plain"><span id="deep">b</span></div></div>' +
      '<div id="peer" data-astryx-theme="other"><span>c</span></div>',
  );
}

/** Each element's resolved --size-element-md. */
async function sizes(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries(
      ['root', 'inside', 'nested', 'deep', 'peer'].map(id => [
        id,
        getComputedStyle(document.getElementById(id) as Element)
          .getPropertyValue('--size-element-md')
          .trim(),
      ]),
    ),
  );
}

for (const [label, scope] of [
  ['one theme', ONE],
  ['a theme family', FAMILY],
] as const) {
  test(`the scope root selector sets what a bare :scope sets (${label})`, async ({
    page,
  }) => {
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(true);
    await mount(page, block(scope, BARE));
    const bare = await sizes(page);
    await mount(page, block(scope, ROOT));
    expect(await sizes(page)).toEqual(bare);
    // The root takes 40px and its subtree inherits it; a theme outside the
    // scope's names keeps the default.
    expect(bare.root).toBe('40px');
    expect(bare.inside).toBe('40px');
    expect(bare.peer).toBe(scope === FAMILY ? '40px' : '32px');
  });
}

test('Chromium does not try the scope root selector on the elements under a family root', async ({
  page,
  browser,
}) => {
  /** Selectors tried during one style recalc, with their attempt counts. */
  async function attempts(selector: string): Promise<Record<string, number>> {
    await mount(page, block(FAMILY, selector));
    await browser.startTracing(page, {
      categories: ['disabled-by-default-blink.debug'],
    });
    await page.evaluate(() => {
      document.getElementById('root')?.classList.toggle('probe');
      return getComputedStyle(document.getElementById('inside') as Element)
        .color;
    });
    const trace = JSON.parse((await browser.stopTracing()).toString()) as {
      traceEvents: {
        args?: {
          selector_stats?: {
            selector_timings?: {selector: string; match_attempts: number}[];
          };
        };
      }[];
    };
    const tried: Record<string, number> = {};
    for (const event of trace.traceEvents) {
      for (const timing of event.args?.selector_stats?.selector_timings ?? []) {
        tried[timing.selector] =
          (tried[timing.selector] ?? 0) + timing.match_attempts;
      }
    }
    return tried;
  }

  // A bare :scope under a list of theme names is tried on every element.
  expect((await attempts(BARE))[BARE] ?? 0).toBeGreaterThan(0);
  expect((await attempts(ROOT))[ROOT] ?? 0).toBe(0);
});
