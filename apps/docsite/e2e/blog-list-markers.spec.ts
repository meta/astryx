// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-list-markers.spec.ts
 * @input Production docsite's 0.7.0 release post and its 26-item migration list
 * @output App-level proof of unwrapped counters, aligned item text, no overlap,
 *   and a bullet dot before each bulleted item
 * @position Docsite integration regression; screenshots stay in test-results
 */

import {expect, test} from '@playwright/test';

// The docsite has no right-to-left mode, so the cases cover width and color
// scheme only.
for (const {width, colorScheme} of [
  {width: 1280, colorScheme: 'light'},
  {width: 390, colorScheme: 'light'},
  {width: 1280, colorScheme: 'dark'},
  {width: 390, colorScheme: 'dark'},
] as const) {
  test(`release list markers stay intact (${width}px, ${colorScheme})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({width, height: 900});
    await page.emulateMedia({colorScheme, reducedMotion: 'reduce'});
    await page.goto('/blog/astryx-v0-7-0');
    await page.evaluate(async () => document.fonts.ready);

    const migrations = page.locator('ol').filter({
      hasText: 'Phone typography starts at 16px',
    });
    await expect(migrations.locator(':scope > li')).toHaveCount(26);
    const geometry = await migrations
      .locator(':scope > li')
      .evaluateAll(items =>
        items.map(item => {
          const marker = item.firstElementChild;
          const content = marker?.nextElementSibling;
          if (marker == null || content == null) {
            throw new Error('missing marker or content');
          }
          const markerBox = marker.getBoundingClientRect();
          const contentBox = content.getBoundingClientRect();
          return {
            direction: getComputedStyle(item).direction,
            markerHeight: markerBox.height,
            lineHeight: Number.parseFloat(getComputedStyle(marker).lineHeight),
            textStart: contentBox.left,
            gap: contentBox.left - markerBox.right,
            markerWidth: markerBox.width,
            markerScrollWidth: marker.scrollWidth,
          };
        }),
      );
    const starts = geometry.map(item => item.textStart);
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(1);
    for (const item of geometry) {
      expect(item.direction).toBe('ltr');
      expect(item.markerHeight).toBeLessThanOrEqual(item.lineHeight + 1);
      expect(item.markerScrollWidth).toBeLessThanOrEqual(item.markerWidth + 1);
      expect(item.gap).toBeGreaterThan(0);
    }

    // Preserve the adjacent article structures, not just the long list.
    const steps = page.locator('ol').filter({hasText: 'Pin Core and the CLI'});
    await expect(steps.locator(':scope > li')).toHaveCount(3);
    // Each bulleted item keeps its marker: a text-free element before the
    // content whose box is the small dot. A list without bullets fails here,
    // because the item's first element is then its label.
    const bullets = await page
      .locator('ul')
      .filter({hasText: 'Core spacing uses rem'})
      .locator(':scope > li')
      .evaluateAll(items =>
        items.map(item => {
          const marker = item.firstElementChild;
          const content = marker?.nextElementSibling;
          const dot = marker?.firstElementChild;
          if (marker == null || content == null || dot == null) {
            return null;
          }
          const dotBox = dot.getBoundingClientRect();
          const contentBox = content.getBoundingClientRect();
          return {
            text: (marker.textContent ?? '').trim(),
            color: getComputedStyle(dot).backgroundColor,
            width: dotBox.width,
            height: dotBox.height,
            isBeforeContent: dotBox.right <= contentBox.left,
          };
        }),
      );
    expect(bullets.length).toBeGreaterThan(0);
    for (const bullet of bullets) {
      expect(bullet).not.toBeNull();
      expect(bullet?.text).toBe('');
      // A transparent dot is an invisible bullet.
      expect(bullet?.color).not.toMatch(/^(transparent|rgba\(.*,\s*0\))$/);
      expect(Math.abs((bullet?.width ?? 0) - 6)).toBeLessThanOrEqual(1);
      expect(Math.abs((bullet?.height ?? 0) - 6)).toBeLessThanOrEqual(1);
      expect(bullet?.isBeforeContent).toBe(true);
    }

    await migrations.locator(':scope > li').nth(20).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `migration-markers-${width}-${colorScheme}.png`,
      ),
    });
  });
}
