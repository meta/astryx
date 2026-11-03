// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/Table/|apps/storybook/stories/TableActivation)
/** The current-row inline mark remains distinct from keyboard focus in forced colours. */
import {expect, test} from '@playwright/test';
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
for (const direction of ['ltr', 'rtl'] as const) {
  test(`current-row inline mark stays separate from focus in ${direction} forced colours`, async ({
    page,
  }) => {
    await page.emulateMedia({forcedColors: 'active'});
    await page.goto(
      `${storybook.origin}/iframe.html?id=core-table-activation--controlled-activation&viewMode=story`,
    );
    await page.evaluate(direction => {
      document.documentElement.dir = direction;
    }, direction);
    const rows = page.locator('#storybook-root tbody tr');
    await rows.nth(1).click();
    const current = rows.nth(1),
      cell = current.locator('td').first();
    await expect(current).toHaveAttribute('aria-current', 'true');
    await expect(cell).toHaveCSS('outline-style', 'none');
    const cue = await cell.evaluate(node => {
      const style = getComputedStyle(node, '::before');
      return {
        width: style.borderInlineStartWidth,
        form: style.borderInlineStartStyle,
        color: style.borderInlineStartColor,
        pointer: style.pointerEvents,
      };
    });
    expect(cue.width).toBe('3px');
    expect(cue.form).toBe('solid');
    expect(cue.pointer).toBe('none');
    await expect(rows.nth(0).locator('td').first()).toHaveCSS(
      'outline-style',
      'none',
    );
    const inactiveWidth = await rows
      .nth(0)
      .locator('td')
      .first()
      .evaluate(
        node => getComputedStyle(node, '::before').borderInlineStartWidth,
      );
    expect(inactiveWidth).toBe('0px');
    await rows.nth(2).focus();
    await expect(rows.nth(2)).toBeFocused();
    await expect(current).toHaveAttribute('aria-current', 'true');
    const focusedCueWidth = await rows
      .nth(2)
      .locator('td')
      .first()
      .evaluate(
        node => getComputedStyle(node, '::before').borderInlineStartWidth,
      );
    expect(focusedCueWidth).toBe('0px');
    await page.keyboard.press('Enter');
    await expect(rows.nth(2)).toBeFocused();
    await expect(rows.nth(2)).toHaveAttribute('aria-current', 'true');
    await expect(current).not.toHaveAttribute('aria-current');
    const widths = await rows.evaluateAll(nodes =>
      nodes.map(row => {
        const cell = row.querySelector('td');
        return cell
          ? getComputedStyle(cell, '::before').borderInlineStartWidth
          : undefined;
      }),
    );
    expect(widths[1]).toBe('0px');
    expect(widths[2]).toBe('3px');
  });
}
