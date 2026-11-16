// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(packages/core/src/MobileNav/|packages/core/src/reset\.css|packages/core/src/SideNav/|apps/storybook/stories/MobileNav\.stories)

/**
 * @file MobileNav.textColor.a11y.chromium.spec.ts
 * @input The built MobileNav story and a real Chromium, in light and dark
 * @output Evidence that the open panel's selected row, whose text inherits,
 *   draws in the theme's --color-text-primary and not the browser's dialog
 *   CanvasText, at WCAG 2.2 AA text contrast (1.4.3, 4.5:1) on the panel
 * @position Real-engine proof for component:MobileNav FR15; jsdom has no
 *   browser default style for a dialog
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

/** WCAG 2.2 SC 1.4.3 (Contrast, Minimum): normal-size text. */
const AA_TEXT = 4.5;

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

/** The selected row's color, the panel's --color-text-primary, and its contrast on the panel. */
async function selectedRowColors(page: Page) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-mobilenav--default&viewMode=story`,
  );
  await page.getByRole('button', {name: 'Open Navigation'}).click();
  const nav = page.getByRole('dialog');
  await expect(nav).toBeVisible();
  const row = nav.getByRole('link', {name: 'Dashboard'});
  await expect(row).toBeVisible();
  return row.evaluate(link => {
    const dialog = link.closest('dialog') as HTMLElement;
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-text-primary)';
    dialog.appendChild(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    let panel: Element | null = link;
    let background = 'rgba(0, 0, 0, 0)';
    while (panel && /rgba\(.*, 0\)|transparent/.test(background)) {
      background = getComputedStyle(panel).backgroundColor;
      panel = panel.parentElement;
    }
    const channels = (c: string) =>
      (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (c: string) => {
      const [r, g, b] = channels(c).map(v => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const color = getComputedStyle(link).color;
    const [hi, lo] = [luminance(color), luminance(background)].sort(
      (a, b) => b - a,
    );
    return {color, token, ratio: (hi + 0.05) / (lo + 0.05)};
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the selected row reads the theme's text color on the open panel (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({colorScheme});
    const {color, token, ratio} = await selectedRowColors(page);
    expect(color).toBe(token);
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });
}
