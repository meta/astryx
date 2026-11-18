// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartZoomWheel.interaction.browser.spec.ts
 * @input The built "Zoom & Pan" chart story and a real mouse wheel
 * @output Interaction proof that a vertical wheel over the chart zooms it and
 *   cancels the page's own scroll, and that a sideways wheel scrolls the page
 * @position Interaction test of ChartZoom.tsx (`*.interaction.browser.spec.ts`,
 *   run by `pnpm test:interaction`)
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
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

/**
 * The page's scroll after ten frames, time for a wheel's scroll to land.
 */
const settledScroll = async (page: Page) =>
  page.evaluate(
    async () =>
      new Promise<{x: number; y: number}>(resolve => {
        let left = 10;
        const step = () => {
          left -= 1;
          if (left === 0) {
            resolve({x: window.scrollX, y: window.scrollY});
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
  );

/**
 * Opens the chart on a page larger than the window, so a wheel the chart lets
 * through scrolls it. It puts the mouse over the plot. A window listener
 * records each wheel's `defaultPrevented` after the chart's own listeners.
 * Returns the label and the page's scroll once the hover has scrolled the
 * plot into view.
 */
async function openChart(page: Page) {
  await page.route('**/vega-datasets@*/data/cars.json', async route =>
    route.fulfill({json: CARS}),
  );
  await openStory(page, storybook(), STORY);
  const label = page.getByText(/^Scroll to zoom, drag to pan\. x: /);
  await expect(label).toBeVisible();
  await page.evaluate(() => {
    document.body.style.minHeight = '300vh';
    // A strip wider than the window: the page scrolls sideways, and the chart
    // keeps its own width.
    const strip = document.createElement('div');
    strip.style.width = '300vw';
    strip.style.height = '1px';
    document.body.append(strip);
    const w = window as unknown as {wheels: boolean[]};
    w.wheels = [];
    window.addEventListener('wheel', event => {
      w.wheels.push(event.defaultPrevented);
    });
  });
  await page.locator('rect[fill="transparent"][style*="grab"]').hover();
  return {label, start: await settledScroll(page)};
}

const wheelsPrevented = async (page: Page) =>
  page.evaluate(() => (window as unknown as {wheels: boolean[]}).wheels);

test('a wheel over the chart zooms it and does not scroll the page', async ({
  page,
}) => {
  const {label, start} = await openChart(page);
  const before = await label.textContent();
  await page.mouse.wheel(0, 100);

  // The chart zooms.
  await expect.poll(async () => label.textContent()).not.toBe(before);
  // The wheel was cancelled, so the page stays where it was.
  const wheels = await wheelsPrevented(page);
  expect(wheels.length).toBeGreaterThan(0);
  expect(wheels, 'defaultPrevented of each wheel').not.toContain(false);
  expect(await settledScroll(page)).toEqual(start);
});

test('a sideways wheel over the chart zooms nothing and scrolls the page', async ({
  page,
}) => {
  const {label, start} = await openChart(page);
  const before = await label.textContent();
  await page.mouse.wheel(100, 0);

  // Nothing cancels the wheel, so the page scrolls sideways.
  const wheels = await wheelsPrevented(page);
  expect(wheels.length).toBeGreaterThan(0);
  expect(wheels, 'defaultPrevented of each wheel').not.toContain(true);
  expect(await settledScroll(page)).toEqual({x: start.x + 100, y: start.y});
  expect(await label.textContent()).toBe(before);
});
