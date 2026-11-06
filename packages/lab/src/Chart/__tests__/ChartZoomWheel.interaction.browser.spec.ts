// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartZoomWheel.interaction.browser.spec.ts
 * @input The built "Zoom & Pan" chart story and a real mouse wheel
 * @output Interaction proof that a wheel over the chart zooms it and cancels
 *   the page's own scroll
 * @position Interaction test of ChartZoom.tsx (`*.interaction.browser.spec.ts`,
 *   run by `pnpm test:interaction`)
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);
const STORY = 'lab-chart-interactions--zoom-pan';
/**
 * The story loads its points from a CDN, which a hermetic run cannot reach.
 * This stand-in has the two fields it plots.
 */
const CARS = Array.from({length: 24}, (_, index) => ({
  Horsepower: 50 + index * 7,
  Miles_per_Gallon: 40 - index,
}));

test.use({hasTouch: false, isMobile: false});

test('a wheel over the chart zooms it and does not scroll the page', async ({
  page,
}) => {
  await page.route('**/vega-datasets@*/data/cars.json', async route =>
    route.fulfill({json: CARS}),
  );
  await openStory(page, storybook(), STORY);
  const label = page.getByText(/^Scroll to zoom, drag to pan\. x: /);
  await expect(label).toBeVisible();
  const before = await label.textContent();
  // A page taller than the window, so a wheel the chart lets through scrolls
  // it. A window listener reads each wheel after the chart's own listeners.
  await page.evaluate(() => {
    document.body.style.minHeight = '300vh';
    const w = window as unknown as {wheels: boolean[]};
    w.wheels = [];
    window.addEventListener('wheel', event => {
      w.wheels.push(event.defaultPrevented);
    });
  });
  await page.locator('rect[fill="transparent"][style*="grab"]').hover();
  await page.mouse.wheel(0, 100);

  // The chart zooms.
  await expect.poll(async () => label.textContent()).not.toBe(before);
  // The wheel was cancelled, so the page stays where it was. Ten frames give
  // an uncancelled wheel's scroll time to land.
  const wheels = await page.evaluate(
    () => (window as unknown as {wheels: boolean[]}).wheels,
  );
  expect(wheels.length).toBeGreaterThan(0);
  expect(wheels, 'defaultPrevented of each wheel').not.toContain(false);
  const scrollY = await page.evaluate(
    async () =>
      new Promise<number>(resolve => {
        let left = 10;
        const step = () => {
          left -= 1;
          if (left === 0) {
            resolve(window.scrollY);
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
  );
  expect(scrollY).toBe(0);
});
