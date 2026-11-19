// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file template-gallery-charts.spec.ts
 * @input Production docsite's template gallery, which shows each template
 *   scaled down in a tile
 * @output App-level proof that the Dashboard tile shows its chart lines
 *   complete on every frame
 * @position Docsite integration regression. A chart that draws its lines in
 *   draws them to a wrong length in a scaled tile, so the tile needs the lines
 *   complete at once.
 */

import {expect, test} from '@playwright/test';

type LineFrames = {withLine: number; partlyDrawn: number; longest: number};

declare global {
  interface Window {
    galleryLineFrames: LineFrames;
  }
}

// The three series of the Dashboard template's main chart.
const SERIES = ['All Users', 'Desktop', 'Mobile'];

test('the Dashboard tile shows complete chart lines on every frame', async ({
  page,
}) => {
  await page.setViewportSize({width: 1440, height: 900});
  await page.addInitScript(series => {
    const frames: LineFrames = {withLine: 0, partlyDrawn: 0, longest: 0};
    window.galleryLineFrames = frames;
    const watch = () => {
      // A gallery tile is inert. Recharts draws a line in with a dash
      // pattern, which it sets again on each frame of the animation.
      const lines = series.flatMap(name => [
        ...document.querySelectorAll<SVGPathElement>(
          `[inert] path.recharts-line-curve[name="${name}"]`,
        ),
      ]);
      if (lines.length > 0) {
        frames.withLine += 1;
        frames.longest = Math.max(
          frames.longest,
          ...lines.map(line => line.getTotalLength()),
        );
        if (lines.some(line => line.hasAttribute('stroke-dasharray'))) {
          frames.partlyDrawn += 1;
        }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }, SERIES);

  await page.goto('/templates');

  // The animation, when a chart has one, starts on the chart's first frame.
  // The gallery renders its tiles one at a time in idle time, so a slow
  // machine shows this tile late.
  await expect
    .poll(() => page.evaluate(() => window.galleryLineFrames.withLine), {
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(30);
  const frames = await page.evaluate(() => window.galleryLineFrames);

  expect(frames.longest).toBeGreaterThan(0);
  expect(frames.partlyDrawn).toBe(0);
});
