// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CarouselSnapPagingEdges.interaction.browser.spec.ts
 * @input Carousel's three-up snap paging story in paging mode, harness touch
 *   flicks and a press, a per-frame sampler and a record of each button
 *   change
 * @output Proves the edge scroll buttons follow the row as shown while snap
 *   paging holds it. Each button comes back within two frames of the row
 *   leaving its edge, no later than the settle's hand-back. After a press on
 *   the end button, the start button comes back the same way.
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

/**
 * An edge button's change, whether the paging held the row then, and the
 * observer batch it came in: one batch per task.
 */
interface Flip {
  readonly button: 'start' | 'end';
  readonly disabled: boolean;
  readonly held: boolean;
  readonly batch: number;
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
// button is disabled and whether the paging holds the row. A frame's sample
// can come before that frame's change to a button. So each change is also
// recorded as it happens, with whether the paging holds the row then. The
// task in which the paging hands the row back is recorded too.
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
      const flips: Flip[] = [];
      const log = {flips, handBack: -1};
      (window as unknown as {__edgeLog: typeof log}).__edgeLog = log;
      const translateX = (el: Element) =>
        Number.parseFloat(getComputedStyle(el).translate.split(' ')[0]) || 0;
      const isHeld = () =>
        Array.from(row.children).some(
          child => (child as HTMLElement).style.translate !== '',
        );
      let batch = 0;
      let wasHeld = isHeld();
      const observer = new MutationObserver(records => {
        batch += 1;
        const held = isHeld();
        for (const record of records) {
          const target = record.target as Element;
          if (target === startButton || target === endButton) {
            flips.push({
              button: target === startButton ? 'start' : 'end',
              disabled: target.getAttribute('aria-disabled') === 'true',
              held,
              batch,
            });
          }
        }
        if (wasHeld && !held) {
          log.handBack = batch;
        }
        wasHeld = held;
      });
      for (const button of [startButton, endButton]) {
        if (button != null) {
          observer.observe(button, {attributeFilter: ['aria-disabled']});
        }
      }
      observer.observe(row, {subtree: true, attributeFilter: ['style']});
      const tick = () => {
        const lead = row.children[0];
        const held = isHeld();
        samples.push({
          shown:
            Math.abs(row.scrollLeft) - (lead == null ? 0 : translateX(lead)),
          travel: row.scrollWidth - row.clientWidth,
          startDisabled:
            (startButton as HTMLButtonElement).getAttribute('aria-disabled') ===
            'true',
          endDisabled:
            (endButton as HTMLButtonElement).getAttribute('aria-disabled') ===
            'true',
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

// Whether the first change that brings `button` back came while the paging
// held the row, or in the task that handed it back. No frame paints between
// two changes in one task.
async function cameBackHeld(page: Page, button: Flip['button']) {
  const log = await page.evaluate(
    () =>
      (window as unknown as {__edgeLog: {flips: Flip[]; handBack: number}})
        .__edgeLog,
  );
  const flip = log.flips.find(
    change => change.button === button && !change.disabled,
  );
  return {
    held: flip != null && (flip.held || flip.batch === log.handBack),
    detail: JSON.stringify(log),
  };
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
  const {held, detail: changes} = await cameBackHeld(page, 'start');
  expect(held, changes).toBe(true);
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
  const {held, detail: changes} = await cameBackHeld(page, 'end');
  expect(held, changes).toBe(true);
});

test('after a press on the end button, the start button comes back within two frames of the held row leaving the start', async ({
  page,
}) => {
  const {scroller, start, end} = await open(page);
  await expect(start).toBeDisabled();
  await startSampling(scroller, start, end);
  await end.click();
  await settled(scroller);
  await expect(start).toBeEnabled();
  // The button can change after its frame's sample, so wait for a sample
  // that shows it back.
  await expect
    .poll(async () =>
      (await samplesOf(page)).some(sample => !sample.startDisabled),
    )
    .toBe(true);
  const samples = await samplesOf(page);
  const detail = JSON.stringify(samples.slice(0, 40));
  const left = samples.findIndex(sample => sample.shown > 1);
  const back = samples.findIndex(sample => !sample.startDisabled);
  test.info().annotations.push({
    type: 'frames from leaving the start to the start button, after a press',
    description: String(back - left),
  });
  expect(left, detail).toBeGreaterThanOrEqual(0);
  expect(back, detail).toBeGreaterThanOrEqual(left);
  expect(back - left, detail).toBeLessThanOrEqual(2);
  // The press moves the row through the paging, so the paging still holds
  // the row when the button comes back.
  const {held, detail: changes} = await cameBackHeld(page, 'start');
  expect(held, changes).toBe(true);
});
