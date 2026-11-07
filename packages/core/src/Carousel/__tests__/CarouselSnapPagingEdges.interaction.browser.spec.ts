// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CarouselSnapPagingEdges.interaction.browser.spec.ts
 * @input The Core/Carousel three-up snap paging story in paging mode, real
 *   touch flicks from the interaction harness, and a per-frame page sampler
 * @output Proves the edge scroll buttons follow the row as shown while snap
 *   paging holds it. Each button comes back within two frames of the row
 *   leaving its edge, before the settle hands the row back.
 * @position Interaction proofs for Carousel's edge buttons under snap paging,
 *   run in Chromium and WebKit
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  drag,
  openStory,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface Sample {
  readonly shown: number;
  readonly travel: number;
  readonly startDisabled: boolean;
  readonly endDisabled: boolean;
  readonly held: boolean;
}

async function open(page: Page) {
  await openStory(page, storybook(), 'core-carousel--snap-paging-three-up', {
    mode: 'paging',
  });
  const scroller = page.getByRole('region').getByRole('group').first();
  const start = page.getByRole('button', {
    name: 'Scroll left',
    includeHidden: true,
  });
  const end = page.getByRole('button', {
    name: 'Scroll right',
    includeHidden: true,
  });
  await expect(scroller).toBeVisible();
  return {scroller, start, end};
}

// Samples on every frame. It records where the row is shown (its scroll
// offset less the lead item's translate). It also records whether each edge
// button is disabled and whether the paging holds the row.
async function startSampling(
  scroller: Locator,
  start: Locator,
  end: Locator,
): Promise<void> {
  const startHandle = await start.elementHandle();
  const endHandle = await end.elementHandle();
  await scroller.evaluate(
    (row, [startButton, endButton]) => {
      const samples: Sample[] = [];
      (window as unknown as {__edgeSamples: Sample[]}).__edgeSamples = samples;
      const translateX = (el: Element) =>
        Number.parseFloat(getComputedStyle(el).translate.split(' ')[0]) || 0;
      const tick = () => {
        const lead = row.children[0];
        const held = Array.from(row.children).some(
          child => (child as HTMLElement).style.translate !== '',
        );
        samples.push({
          shown:
            Math.abs(row.scrollLeft) - (lead == null ? 0 : translateX(lead)),
          travel: row.scrollWidth - row.clientWidth,
          startDisabled: (startButton as HTMLButtonElement).disabled,
          endDisabled: (endButton as HTMLButtonElement).disabled,
          held,
        });
        if (samples.length < 600) {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    },
    [startHandle, endHandle] as const,
  );
}

async function samplesOf(page: Page): Promise<Sample[]> {
  return page.evaluate(
    () => (window as unknown as {__edgeSamples: Sample[]}).__edgeSamples,
  );
}

// A flick of 80 px in 80 ms, toward the end of the row or back.
async function flick(
  page: Page,
  scroller: Locator,
  {back = false}: {back?: boolean} = {},
): Promise<void> {
  const box = await scroller.boundingBox();
  if (box == null) {
    throw new Error('no scroller');
  }
  const y = box.y + box.height / 2;
  const from = {x: box.x + box.width / 2 + (back ? -40 : 40), y};
  const to = {x: from.x + (back ? 80 : -80), y};
  const driver = await touchDriver(page);
  await driver.play(drag(from, to, {durationMs: 80}));
}

async function settled(scroller: Locator): Promise<void> {
  await expect
    .poll(async () =>
      scroller.evaluate(row =>
        Array.from(row.children).some(
          child => (child as HTMLElement).style.translate !== '',
        ),
      ),
    )
    .toBe(false);
}

test('the start button comes back within two frames of the held row leaving the start', async ({
  page,
}) => {
  const {scroller, start, end} = await open(page);
  await expect(start).toBeDisabled();
  await startSampling(scroller, start, end);
  await flick(page, scroller);
  await settled(scroller);
  await expect(start).toBeEnabled();
  const samples = await samplesOf(page);
  const detail = JSON.stringify(samples.slice(0, 40));
  const left = samples.findIndex(sample => sample.shown > 1);
  const back = samples.findIndex(sample => !sample.startDisabled);
  test.info().annotations.push({
    type: 'frames from leaving the start to the start button',
    description: String(back - left),
  });
  expect(left, detail).toBeGreaterThanOrEqual(0);
  expect(back - left, detail).toBeLessThanOrEqual(2);
  // While the paging still holds the row: before the settle hands it back.
  expect(samples[back]?.held, detail).toBe(true);
});

test('the end button comes back within two frames of the held row leaving the end', async ({
  page,
}) => {
  const {scroller, start, end} = await open(page);
  // Two views on: the end of the row.
  await flick(page, scroller);
  await settled(scroller);
  await flick(page, scroller);
  await settled(scroller);
  await expect(end).toBeDisabled();
  await startSampling(scroller, start, end);
  await flick(page, scroller, {back: true});
  await settled(scroller);
  await expect(end).toBeEnabled();
  const samples = await samplesOf(page);
  const detail = JSON.stringify(samples.slice(0, 40));
  // The travel at rest: a held row's translate can widen its overflow.
  const {travel} = samples[0];
  const left = samples.findIndex(sample => sample.shown < travel - 1);
  const back = samples.findIndex(sample => !sample.endDisabled);
  test.info().annotations.push({
    type: 'frames from leaving the end to the end button',
    description: String(back - left),
  });
  expect(left, detail).toBeGreaterThanOrEqual(0);
  expect(back - left, detail).toBeLessThanOrEqual(2);
  expect(samples[back]?.held, detail).toBe(true);
});
