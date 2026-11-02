// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hasSiblingCost.interaction.browser.spec.ts
 * @input Self-contained pages, one per stylesheet case
 * @output Fill times (ms) for 2,000 and 8,000 children with and without each
 *   remaining sibling-relative :has(~ …) rule in Core's CSS, plus ChatMessage's
 *   former rule as a known-superlinear control. A one-off measurement: it
 *   always passes and prints a JSON table; the pull request carrying it is
 *   closed unmerged.
 */

import {test} from '@playwright/test';

// The compiled selectors as Core ships them (read from the built CSSOM).
const RULES = {
  none: '',
  submenuHost:
    '.r-sub:has(~ [data-astryx-submenu-host] > [data-astryx-submenu-regions="view"]:not([hidden])) { outline: 1px solid red; }',
  listDivider:
    '.r-div.r-div:where(:has(~ .r-row:not([data-divider]))) { outline: 1px solid red; }',
  chatControl: '.r-chat:has(~ * [data-chat-name]) { margin-top: 20px; }',
} as const;

// Which class each child carries: an unrelated container's children carry
// none; a menu's or list's rows carry the rule's subject class.
const SHAPES = {
  unrelated: '',
  submenuHost: 'r-sub',
  listDivider: 'r-div r-row',
  chatControl: 'r-chat',
} as const;

test('sibling-relative :has() fill cost', async ({page, browserName}) => {
  test.setTimeout(600_000);
  const results: Record<string, unknown>[] = [];
  for (const [rule, css] of Object.entries(RULES)) {
    for (const shape of ['unrelated', rule === 'none' ? 'unrelated' : rule]) {
      const className = SHAPES[shape as keyof typeof SHAPES] ?? '';
      for (const mode of ['per-insert', 'batch'] as const) {
        for (const count of [2000, 8000]) {
          await page.setContent(`<style>${css}</style><div id="box"></div>`);
          const ms = await page.evaluate(
            ({count, className, mode}) => {
              const box = document.getElementById('box')!;
              void box.offsetHeight;
              const start = performance.now();
              for (let i = 0; i < count; i++) {
                const child = document.createElement('div');
                if (className) child.className = className;
                child.setAttribute('popover', '');
                box.appendChild(child);
                // A style read per insertion, as an incremental render does;
                // batch mode reads once at the end, as one React commit does.
                if (mode === 'per-insert') void child.offsetWidth;
              }
              void box.offsetHeight;
              return performance.now() - start;
            },
            {count, className, mode},
          );
          results.push({
            browserName,
            rule,
            shape,
            mode,
            count,
            ms: Math.round(ms),
          });
        }
      }
    }
  }
  const json = JSON.stringify(results);
  console.log(`HAS_SIBLING_COST ${json}`);
  await test.info().attach('has-sibling-cost.json', {
    body: json,
    contentType: 'application/json',
  });
});
