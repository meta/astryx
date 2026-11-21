// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^packages/core/src/Table/plugins/rowExpansion/ ^packages/core/src/Icon/ComponentIcon ^apps/storybook/stories/TableRowExpansion

/**
 * @file TableRowExpandSlot.a11y.browser.spec.ts
 * @input The built TableRowExpansion IconSlotRowHeight story in real Chromium
 *   and WebKit
 * @output Browser evidence that a theme's `table-row-expand` size request or
 *   `null` changes only the glyph (component:Table FR7): every expandable row
 *   keeps the height it has with the default glyph; and that a collapsed
 *   toggle has no positioned box, and no transform outside RTL's mirror
 * @position Regression proof for the expansion toggle's vertical alignment
 *   and its resting boxes
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
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

test('a theme glyph size or a hidden glyph keeps every expandable row height', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-tablerowexpansion--icon-slot-row-height&viewMode=story`,
  );
  const rowHeight = async (label: string) => {
    const toggle = page
      .getByTestId(`row-expand-${label}`)
      .locator('[data-expansion-toggle]')
      .first();
    await expect(toggle).toBeVisible();
    return toggle.evaluate(
      button => button.closest('tr')?.getBoundingClientRect().height ?? 0,
    );
  };

  const expected = await rowHeight('default');
  expect(expected).toBeGreaterThan(0);
  for (const label of ['sm', 'md', 'lg', 'hidden']) {
    expect(await rowHeight(label), label).toBeCloseTo(expected, 1);
  }
  await expect(
    page
      .getByTestId('row-expand-hidden')
      .locator('[data-expansion-toggle] .astryx-icon'),
  ).toHaveCount(0);
});

// WebKit pays for every positioned or transformed box in a table on each
// frame of a row glide, so a long table must not carry one per row at rest.
for (const dir of ['ltr', 'rtl'] as const) {
  test(`a collapsed toggle has no positioned box and turns only when open (${dir})`, async ({
    page,
  }) => {
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-tablerowexpansion--detail-panel&viewMode=story&globals=direction:${dir}`,
    );
    const toggles = page.locator('[data-expansion-toggle]');
    await expect(toggles.first()).toBeVisible();
    const collapsed = await toggles.evaluateAll(all =>
      all.findIndex(button => button.getAttribute('aria-expanded') === 'false'),
    );
    expect(collapsed).toBeGreaterThanOrEqual(0);
    const toggle = toggles.nth(collapsed);
    const boxes = async () =>
      toggle.evaluate(button =>
        [...button.querySelectorAll('*')].map(element => {
          const style = getComputedStyle(element);
          return {position: style.position, transform: style.transform};
        }),
      );
    const atRest = await boxes();
    expect(atRest.map(box => box.position).filter(p => p !== 'static')).toEqual(
      [],
    );
    // RTL mirrors the glyph with a transform: the icon slot has no mirrored
    // artwork.
    expect(atRest.map(box => box.transform).filter(t => t !== 'none')).toEqual(
      dir === 'rtl' ? ['matrix(-1, 0, 0, 1, 0, 0)'] : [],
    );
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect
      .poll(async () => (await boxes())[0]?.transform)
      .toBe(
        dir === 'rtl'
          ? 'matrix(0, 1, 1, 0, 0, 0)'
          : 'matrix(0, 1, -1, 0, 0, 0)',
      );
  });
}
