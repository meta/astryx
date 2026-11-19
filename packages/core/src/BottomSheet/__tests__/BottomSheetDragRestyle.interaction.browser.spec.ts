// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file BottomSheetDragRestyle.interaction.browser.spec.ts
 * @input The built "Tall sheet" BottomSheet story, real touch input (Chromium
 *   CDP) and the interaction harness's rendering trace
 * @output A proof of the style work a touch drag does. A move restyles the
 *   dialog and the panel, never the sheet's content.
 * @position An interaction proof beside
 *   BottomSheetDetent.interaction.browser.spec.ts, on the same harness.
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
  traceRendering,
  waitForRest,
  withStorybook,
  type TouchDriver,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

// The most elements one style recalculation may restyle between two moves.
// A move restyles the dialog, its backdrop, the panel and the edge tint. The
// limit leaves room for an engine's own boxes. A restyle of the sheet's
// content counts every element in it.
const RESTYLED_PER_MOVE = 6;

interface OpenSheet {
  driver: TouchDriver;
  sheet: Locator;
  handle: {x: number; y: number};
}

async function openSheet(page: Page): Promise<OpenSheet> {
  await openStory(page, storybook(), 'core-bottomsheet--tall-sheet');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open nearby places'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const sheet = page
    .getByRole('dialog', {name: 'Nearby places'})
    .locator('.astryx-bottom-sheet')
    .first();
  await expect(sheet).toBeVisible();
  await waitForRest(sheet);
  const rect = await sheet.boundingBox();
  if (rect == null) {
    throw new Error('no sheet');
  }
  return {
    driver,
    sheet,
    handle: {x: rect.x + rect.width / 2, y: rect.y + 12},
  };
}

test("a move of a drag restyles the dialog and the panel, not the sheet's content", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'rendering traces are Chromium-only');
  const {driver, sheet, handle} = await openSheet(page);
  // The proof needs content that a restyle of the whole sheet would count.
  const contentElements = await sheet.evaluate(
    element => element.querySelectorAll('*').length,
  );
  expect(contentElements).toBeGreaterThan(4 * RESTYLED_PER_MOVE);
  let steady = {from: 0, to: 0};
  const trace = await traceRendering(page, async () => {
    const played = await driver.play(
      drag(
        handle,
        {x: handle.x, y: handle.y + 240},
        {durationMs: 600, hz: 60, restMs: 150},
      ),
    );
    const moves = played.filter(event => event.type === 'touchMove');
    // The steady part of the drag: its first moves commit the drag's start,
    // and the lift commits its release.
    steady = {
      from: moves[4].returnedAt,
      to: moves[moves.length - 1].dispatchedAt,
    };
    await waitForRest(sheet);
  });
  const restyled = trace.events
    .filter(
      event =>
        event.name === 'UpdateLayoutTree' &&
        event.t >= steady.from &&
        event.t <= steady.to,
    )
    .map(event => event.elements ?? 0);
  // The drag wrote the scrim: a move's recalculation restyles the dialog too.
  expect(Math.max(...restyled), JSON.stringify(restyled)).toBeGreaterThan(1);
  expect(Math.max(...restyled), JSON.stringify(restyled)).toBeLessThanOrEqual(
    RESTYLED_PER_MOVE,
  );
});
