// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file template-gallery-charts.spec.ts
 * @input Production docsite's template gallery, which shows each template
 *   scaled down in a tile
 * @output App-level proof that the Dashboard tile shows its chart lines
 *   complete on every frame, and that a dash pattern stays on a line that
 *   does not draw in
 * @position Docsite integration regression. A chart that draws its lines in
 *   draws them to a wrong length in a scaled tile, so the tile shows the
 *   lines complete at once.
 */

import {expect, test} from '@playwright/test';

type LineFrames = {
  withLine: number;
  partlyDrawn: number;
  longest: number;
  // The frames in a row, up to now, where no line had a draw-in in progress.
  settled: number;
};

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
    const frames: LineFrames = {
      withLine: 0,
      partlyDrawn: 0,
      longest: 0,
      settled: 0,
    };
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
        if (
          lines.some(line => getComputedStyle(line).strokeDasharray !== 'none')
        ) {
          frames.partlyDrawn += 1;
        }
        // Recharts keeps the attribute on a line for as long as it draws the
        // line in. These three series set no pattern of their own.
        frames.settled = lines.some(line =>
          line.hasAttribute('stroke-dasharray'),
        )
          ? 0
          : frames.settled + 1;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }, SERIES);

  await page.goto('/templates');

  // The draw-in starts on the chart's first frame. The read waits until the
  // draw-in has ended, so the counts hold every frame of it. The gallery
  // renders its tiles one at a time in idle time, so a slow machine shows
  // this tile late.
  await expect
    .poll(() => page.evaluate(() => window.galleryLineFrames.settled), {
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(10);
  const frames = await page.evaluate(() => window.galleryLineFrames);

  expect(frames.longest).toBeGreaterThan(0);
  expect(frames.partlyDrawn).toBe(0);

  // A dashed series that does not draw in, such as a target line, has a
  // pattern with no unit. A dashed series that draws in is not covered: the
  // tile shows that line solid until its draw-in ends.
  const ownPattern = await page.evaluate(() => {
    const line = document.querySelector<SVGPathElement>(
      '[inert] path.recharts-line-curve',
    );
    if (line == null) {
      throw new Error('no chart line in a gallery tile');
    }
    const dashed = line.cloneNode() as SVGPathElement;
    dashed.setAttribute('stroke-dasharray', '4 4');
    line.after(dashed);
    const pattern = getComputedStyle(dashed).strokeDasharray;
    dashed.remove();
    return pattern;
  });
  expect(ownPattern).toBe('4px, 4px');
});
