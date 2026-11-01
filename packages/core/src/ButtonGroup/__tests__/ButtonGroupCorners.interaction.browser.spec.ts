// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ButtonGroupCorners.interaction.browser.spec.ts
 * @input Storybook story a11y-buttongroup-corners--shapes
 * @output ButtonGroup FR3 in a real browser: in every member shape, only the
 *   group's last member (the last sibling that is not a popover, template or
 *   dialog) rounds its trailing corners, and an InputGroup button addon
 *   rounds its trailing corners only when no member follows it. Plus the
 *   cost of the group rules themselves: filling one container takes about as
 *   long with them on the page as with them removed (the old sibling-relative
 *   `:has()` rule made WebKit re-evaluate every earlier sibling on each
 *   insertion). Other rules on the page cost the same in both measurements,
 *   so only the group rules are measured
 * @position ButtonGroup FR3 and InputGroup end-cap evidence, run in the
 *   Chromium interaction lane; the jsdom tests assert membership only, since
 *   jsdom never receives these rules
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

async function openShapes(page: Page): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=a11y-buttongroup-corners--shapes&viewMode=story`,
  );
  await page.locator('[data-corner-shape="input-group-addon"]').waitFor();
}

interface Corner {
  shape: string;
  label: string;
  expected: 'round' | 'square';
  trailing: string[];
}

/** Each marked member's two trailing-corner radii, for its orientation. */
async function trailingCorners(page: Page): Promise<Corner[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>('[data-corner-case]'),
    ).map(element => {
      const style = getComputedStyle(element);
      const vertical = element.closest('[data-orientation="vertical"]') != null;
      const trailing = vertical
        ? [style.borderEndStartRadius, style.borderEndEndRadius]
        : [style.borderStartEndRadius, style.borderEndEndRadius];
      return {
        shape: element.dataset.cornerCase ?? '',
        label: element.textContent?.trim() ?? '',
        expected: element.dataset.trailing as 'round' | 'square',
        trailing,
      };
    }),
  );
}

test('only the last member rounds its trailing corners, in every shape', async ({
  page,
}) => {
  await openShapes(page);
  const corners = await trailingCorners(page);
  expect(corners.length).toBeGreaterThanOrEqual(22);
  for (const {shape, label, expected, trailing} of corners) {
    const rounded = trailing.map(value => parseFloat(value) > 0);
    expect(rounded, `${shape} / ${label}`).toEqual(
      expected === 'round' ? [true, true] : [false, false],
    );
  }
  await page.screenshot({
    path: `test-results/interaction-evidence/buttongroup-corners/shapes-${test.info().project.name}.png`,
    fullPage: true,
  });
});

/** The group last-member predicate's skip list, in both its old and new form. */
const GROUP_RULE_MARK = ':not([popover]):not(template):not(dialog)';

/**
 * Inserts `count` closed popovers into one rendered container, reading layout
 * every 50 insertions as a page that renders as it fills does; returns the
 * time in ms.
 */
async function insertionMs(page: Page, count: number): Promise<number> {
  return page.evaluate(total => {
    const container = document.createElement('div');
    document.body.append(container);
    void container.offsetHeight;
    const start = performance.now();
    for (let index = 0; index < total; index += 1) {
      const piece = document.createElement('div');
      piece.setAttribute('popover', 'manual');
      container.append(piece);
      if (index % 50 === 0) {
        void container.offsetHeight;
      }
    }
    void container.offsetHeight;
    const elapsed = performance.now() - start;
    container.remove();
    return elapsed;
  }, count);
}

/** Removes every stylesheet rule that carries the group predicate; returns how many. */
async function removeGroupRules(page: Page): Promise<number> {
  return page.evaluate(mark => {
    let removed = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index];
        if (rule instanceof CSSStyleRule && rule.selectorText.includes(mark)) {
          sheet.deleteRule(index);
          removed += 1;
        }
      }
    }
    return removed;
  }, GROUP_RULE_MARK);
}

test('the group rules add no cost to filling a container', async ({page}) => {
  await openShapes(page);
  const count = 8_000;
  const median = async () => {
    const runs = [];
    for (let run = 0; run < 3; run += 1) {
      runs.push(await insertionMs(page, count));
    }
    return runs.sort((a, b) => a - b)[1];
  };
  // Warm up, so neither measurement pays for the first run.
  await insertionMs(page, count);
  const withRules = await median();
  expect(await removeGroupRules(page)).toBeGreaterThan(0);
  const withoutRules = await median();
  test.info().annotations.push({
    type: 'insertion-ms',
    description: `${count} popovers: ${withRules.toFixed(1)} ms with the group rules, ${withoutRules.toFixed(1)} ms without`,
  });
  // The old rule more than doubled this in WebKit at 8,000 (#9281 measured
  // 45 ms at 2,000 and 1,152 ms at 10,000 against 10 ms without it); the
  // slack absorbs timing noise on a shared runner.
  expect(withRules).toBeLessThan(withoutRules * 1.5 + 25);
});
