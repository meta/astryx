// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetBodyPull.interaction.browser.spec.ts
 * @input The built "Hug height" and "Tall Sheet" BottomSheet stories, real
 *   touch input (Chromium CDP / WebKit's input command) and the interaction
 *   harness
 * @output Interaction proofs for a finger's pull down on a sheet's content.
 *   The element under the finger keeps the pointer's capture until the lift.
 *   The sheet never steps back toward rest while the finger moves down. A
 *   pull that starts past the drag's slop follows the finger. A fast flick of
 *   three moves closes the sheet.
 * @position Real-engine proof for the body paths of useSheetGestures. An
 *   engine orders a finger's pointer and touch events, and moves the
 *   pointer's implicit capture, itself. jsdom shows neither.
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  frames,
  openStory,
  path,
  toTouchEvents,
  touchDriver,
  waitForRest,
  withStorybook,
  type TouchDriver,
  type TouchScript,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// How far the finger pulls down, px. Under the distance that closes the sheet.
const PULL_PX = 120;

// One entry per pointer-capture change and pointer lift, in order: the event
// and whether its target is the sheet's scrolling body or its content.
type CaptureLog = ReadonlyArray<string>;

interface OpenSheet {
  readonly driver: TouchDriver;
  readonly dialog: Locator;
  readonly sheet: Locator;
}

async function openSheet(
  page: Page,
  story: string,
  triggerName: string,
  sheetName: string,
): Promise<OpenSheet> {
  await openStory(page, storybook(), story);
  const driver = await touchDriver(page);
  const trigger = await page
    .getByRole('button', {name: triggerName})
    .boundingBox();
  if (trigger == null) {
    throw new Error('no trigger');
  }
  await driver.tap({
    x: trigger.x + trigger.width / 2,
    y: trigger.y + trigger.height / 2,
  });
  const dialog = page.getByRole('dialog', {name: sheetName});
  const sheet = dialog.locator('.astryx-bottom-sheet').first();
  await expect(sheet).toBeVisible();
  await waitForRest(sheet);
  return {driver, dialog, sheet};
}

/** A sheet whose content fits, with a log of its pointer-capture changes. */
async function openFittingSheet(page: Page) {
  const {driver, dialog, sheet} = await openSheet(
    page,
    'core-bottomsheet--hug-height',
    'Share page',
    'Share page',
  );
  const heading = await dialog
    .getByRole('heading', {name: 'Share page'})
    .boundingBox();
  if (heading == null) {
    throw new Error('no heading');
  }
  await sheet.evaluate(panel => {
    const log: string[] = [];
    (window as unknown as {captureLog: string[]}).captureLog = log;
    const body = panel.children[1];
    for (const type of [
      'gotpointercapture',
      'lostpointercapture',
      'pointerup',
    ]) {
      window.addEventListener(
        type,
        event => {
          log.push(`${type}:${event.target === body ? 'body' : 'content'}`);
        },
        {capture: true},
      );
    }
  });
  return {
    driver,
    sheet,
    start: {
      x: Math.round(heading.x + heading.width / 2),
      y: Math.round(heading.y + heading.height / 2),
    },
  };
}

const sheetTop = async (sheet: Locator) =>
  sheet.evaluate(element => element.getBoundingClientRect().y);

const captureLog = async (page: Page): Promise<CaptureLog> =>
  page.evaluate(() => (window as unknown as {captureLog: string[]}).captureLog);

for (const pull of [
  // The first moves stay under the drag's 8 px slop, as a finger's do.
  {name: 'a slow start', stepPx: 3},
  // The first move passes the slop.
  {name: 'a start past the slop', stepPx: 15},
]) {
  test(`a pull down on the content with ${pull.name} keeps the pointer's capture under the finger and never steps the sheet back`, async ({
    page,
  }) => {
    const {driver, sheet, start} = await openFittingSheet(page);
    const restTop = await sheetTop(sheet);
    const steps = PULL_PX / pull.stepPx;
    const script = path(
      progress => ({
        x: start.x,
        y: start.y + Math.round(progress * steps) * pull.stepPx,
      }),
      {durationMs: steps * (1000 / 60), hz: 60, restMs: 150},
    );
    const lastMove =
      toTouchEvents(script).filter(step => step.type === 'touchMove').length -
      1;
    const tops: number[] = [];
    let moves = 0;
    await driver.play(script, {
      releaseUnread: true,
      onEvent: async step => {
        if (step.type !== 'touchMove') {
          return;
        }
        tops.push(await sheetTop(sheet));
        // The finger rests 150 ms before the lift: read the last move again
        // once the page has presented it.
        if (moves++ === lastMove) {
          await frames(page, 1);
          tops.push(await sheetTop(sheet));
        }
      },
    });

    // Under a finger that only moves down, the sheet never moves up.
    const stepsBack = tops.filter(
      (top, index) => index > 0 && top < tops[index - 1] - 0.5,
    );
    expect(stepsBack).toEqual([]);
    if (pull.stepPx > 8) {
      expect(Math.max(...tops) - restTop).toBeCloseTo(PULL_PX, 0);
    }

    // The sheet's body takes no capture, so the element under the finger
    // loses the pointer's implicit capture only at the lift.
    const log = await captureLog(page);
    expect(log.filter(entry => entry === 'gotpointercapture:body')).toEqual([]);
    const lift = log.findIndex(entry => entry.startsWith('pointerup'));
    const lossBeforeLift = log.filter(
      (entry, index) =>
        entry.startsWith('lostpointercapture') && (lift === -1 || index < lift),
    );
    expect(lossBeforeLift).toEqual([]);
  });
}

test('a fast flick of three moves on the content closes the sheet', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'WebKit stamps a touch when it arrives, so a three-move flick has no fixed speed there',
  );
  const {driver, dialog, sheet} = await openSheet(
    page,
    'core-bottomsheet--tall-sheet',
    'Open nearby places',
    'Nearby places',
  );
  const box = await sheet.boundingBox();
  if (box == null) {
    throw new Error('no sheet box');
  }
  // A point on the list, which scrolls and rests at its top.
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + 180);
  // 150 px in 48 ms. The last two intervals run at 3,750 and 3,125 px/s, far
  // past the speed a release is a flick from.
  const flick: TouchScript = [
    {t: 0, fingers: [{id: 0, x, y}]},
    {t: 16, fingers: [{id: 0, x, y: y + 40}]},
    {t: 32, fingers: [{id: 0, x, y: y + 90}]},
    {t: 48, fingers: [{id: 0, x, y: y + 150}]},
    {t: 52, fingers: []},
  ];
  await driver.play(flick);
  await expect(dialog).toBeHidden();
});
