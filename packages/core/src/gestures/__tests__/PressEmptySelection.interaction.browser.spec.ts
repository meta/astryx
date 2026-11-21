// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PressEmptySelection.interaction.browser.spec.ts
 * @input SegmentedControl's Default story, with 3,000 rows whose styles a
 *   capture-phase pointerdown listener changes, and no text selected
 * @output Proves a mouse press on a segment brings no pending styles up to
 *   date inside the press: Chromium's trace shows no restyle of the rows in
 *   the pointerdown dispatch
 * @position Interaction proof for utils/selectionLock.ts selectionRangesOf,
 *   which GestureHost calls at each mouse or pen press
 */

import {expect, test} from '@astryxdesign/a11y-spec/playwright';
import {withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

interface TraceEvent {
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  args?: {elementCount?: number; data?: {type?: string}};
}

test('a mouse press with no text selected restyles no unrelated rows inside the press', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'reads a Chromium trace');
  await page.goto(
    `${storybook()}/iframe.html?id=core-segmentedcontrol--default&viewMode=story`,
  );
  const segment = page.getByRole('radio', {name: 'List'});
  await segment.waitFor();
  await page.evaluate(() => {
    const rows = document.createElement('div');
    rows.innerHTML = Array.from(
      {length: 3000},
      (_, index) => `<div class="result">Document ${index}</div>`,
    ).join('');
    const style = document.createElement('style');
    style.textContent =
      '.result { color: rgb(34, 51, 68) } html.alternate .result { color: rgb(221, 238, 255) }';
    document.body.append(style, rows);
    // An unrelated style change waits when the press reaches the gesture host.
    window.addEventListener(
      'pointerdown',
      event => {
        if ((event.target as Element).closest('[role="radio"]') != null) {
          document.documentElement.classList.toggle('alternate');
        }
      },
      {capture: true},
    );
    getSelection()?.removeAllRanges();
  });
  const box = await segment.boundingBox();
  if (box == null) {
    throw new Error('no box for the List segment');
  }
  const cdp = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on('Tracing.dataCollected', ({value}) => {
    events.push(...(value as TraceEvent[]));
  });
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline',
    transferMode: 'ReportEvents',
  });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.evaluate(
    async () =>
      new Promise(resolve => {
        requestAnimationFrame(resolve);
      }),
  );
  const complete = new Promise(resolve => {
    cdp.once('Tracing.tracingComplete', resolve);
  });
  await cdp.send('Tracing.end');
  await complete;
  const press = events.find(
    event =>
      event.name === 'EventDispatch' &&
      event.ph === 'X' &&
      event.args?.data?.type === 'pointerdown',
  );
  expect(press).toBeDefined();
  const start = press?.ts ?? 0;
  const end = start + (press?.dur ?? 0);
  // The rows restyle later, before the next frame, not inside the press.
  const inPress = events.filter(
    event =>
      event.name === 'UpdateLayoutTree' &&
      event.ts >= start &&
      event.ts <= end &&
      (event.args?.elementCount ?? 0) >= 1000,
  );
  expect(inPress).toEqual([]);
  await expect(segment).toBeChecked();
});
