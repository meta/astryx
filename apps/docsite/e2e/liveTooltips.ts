// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file liveTooltips.ts
 * @input A Playwright page and a region of it with tooltip triggers
 * @output tooltipTrigger, a region's first visible tooltip trigger, and
 *   expectTooltipsLive, which resolves once a trigger's tooltip opens on a
 *   hover
 * @position Shared by the docsite hydration specs. A closed tooltip has no
 *   layer until its first show, so its server HTML and its live page look the
 *   same; only a hover tells them apart.
 */

import {expect, type Locator, type Page} from '@playwright/test';

/** The region's first visible element that a tooltip describes. */
export function tooltipTrigger(region: Locator): Locator {
  return region.locator('[aria-describedby]').filter({visible: true}).first();
}

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
