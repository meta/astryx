// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hasSiblingCost.interaction.browser.spec.ts
 * @input Self-contained pages, one per stylesheet case
 * @output Fill times (ms) for 2,000 and 8,000 children with and without each
 *   remaining sibling-relative :has(~ …) rule in Core's CSS, plus ChatMessage's
 *   former rule as a known-superlinear control. A one-off measurement: each
 *   case prints one HAS_SIBLING_COST line as it finishes and always passes;
 *   the pull request carrying it is closed unmerged.
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

// An unrelated container's children carry no class; a menu's or list's rows
// carry the rule's subject class.
const ROW_CLASS: Record<keyof typeof RULES, string> = {
  none: '',
  submenuHost: 'r-sub',
  listDivider: 'r-div r-row',
  chatControl: 'r-chat',
};

test.describe.configure({mode: 'serial'});

for (const [rule, css] of Object.entries(RULES) as [
  keyof typeof RULES,
  string,
][]) {
  for (const shape of rule === 'none' ? ['unrelated'] : ['unrelated', 'rows']) {
    test(`fill cost: ${rule} / ${shape}`, async ({page, browserName}) => {
      test.setTimeout(240_000);
      const className = shape === 'rows' ? ROW_CLASS[rule] : '';
      for (const count of [2000, 8000]) {
        await page.setContent(`<style>${css}</style><div id="box"></div>`);
        const ms = await page.evaluate(
          ({count, className}) => {
            const box = document.getElementById('box')!;
            getComputedStyle(box).color;
            const start = performance.now();
            for (let i = 0; i < count; i++) {
              const child = document.createElement('div');
              if (className) child.className = className;
              child.setAttribute('popover', '');
              box.appendChild(child);
              // A style read (no layout) per insertion, so each insertion's
              // invalidation is paid as it happens.
              getComputedStyle(child).outlineStyle;
            }
            return performance.now() - start;
          },
          {count, className},
        );
        console.log(
          `HAS_SIBLING_COST ${JSON.stringify({browserName, rule, shape, count, ms: Math.round(ms)})}`,
        );
      }
    });
  }
}
