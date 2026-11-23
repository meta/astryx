// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liveTooltips.ts
 * @input A Playwright page and a control in it that has a tooltip
 * @output expectTooltipsLive, which resolves once a named control's tooltip
 *   opens on a hover
 * @position Shared by the docsite hydration specs. A closed tooltip has no
 *   layer until its first show, so its server HTML and its live page look the
 *   same; only a hover tells them apart.
 */

import {expect, type Locator, type Page} from '@playwright/test';

/**
 * Hovers `trigger` until its tooltip opens. The trigger answers a hover only
 * once its script has hydrated it, so each try moves the pointer away first
 * and enters again.
 */
export async function expectTooltipsLive(
  page: Page,
  trigger: Locator,
): Promise<void> {
  await expect(async () => {
    await page.mouse.move(0, 0);
    await trigger.hover();
    await expect(
      page.locator('[role="tooltip"]:popover-open').first(),
    ).toBeVisible({timeout: 2000});
  }).toPass();
  await page.mouse.move(0, 0);
}
