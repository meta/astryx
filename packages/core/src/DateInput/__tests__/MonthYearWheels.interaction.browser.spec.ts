// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MonthYearWheels.interaction.browser.spec.ts
 * @input The built "Bottom Sheet Narrow Range" DateInput story (March 15,
 *   2026 in a 2026–2027 range), real touch input and the interaction harness
 * @output Interaction proofs for the month/year wheels behind the calendar
 *   title moving the date like UIDatePicker's: a drag of the month wheel moves
 *   the chosen date to the next month keeping its day. They run under a
 *   finger in Chromium (as on Android) and WebKit alike; with a mouse the scrolling
 *   wheels move only the calendar.
 * @position Interaction tests of MonthYearWheels.tsx and TouchDateField.tsx
 *   (`*.interaction.browser.spec.ts`, run by `pnpm test:interaction`)
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
  type TouchDriver,
} from '@astryxdesign/interaction-harness';
import {WHEEL_ROW_HEIGHT} from '../wheelOptions';

const storybook = withStorybook(test);

/**
 * Resolves once `locator`'s element shows `property` at `value` and no
 * animation inside it is left unfinished. The page checks the value once a
 * frame, then awaits each animation's own `finished` promise. It sets no
 * deadline of its own, so a starved runner only makes it later.
 */
async function settlesAt(locator: Locator, property: string, value: string) {
  await locator.evaluate(
    async (element, [name, expected]) => {
      await new Promise<void>(resolve => {
        const check = () => {
          if (getComputedStyle(element).getPropertyValue(name) === expected) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        check();
      });
      for (;;) {
        const unfinished = element
          .getAnimations({subtree: true})
          .filter(animation => animation.playState !== 'finished');
        if (unfinished.length === 0) {
          return;
        }
        await Promise.all(
          unfinished.map(async animation =>
            animation.finished.catch(() => undefined),
          ),
        );
      }
    },
    [property, value] as const,
  );
}

async function openWheels(page: Page) {
  await openStory(
    page,
    storybook(),
    'core-dateinput--bottom-sheet-narrow-range',
  );
  const driver = await touchDriver(page);
  const tapCenter = async (locator: Locator) => {
    const box = await locator.boundingBox();
    if (box == null) {
      throw new Error('no box');
    }
    await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  };
  await tapCenter(page.getByRole('button', {name: /calendar/i}).first());
  const sheet = page
    .getByRole('dialog')
    .locator('.astryx-bottom-sheet')
    .first();
  // The sheet rises to its open position, where its transform is the identity.
  await settlesAt(sheet, 'transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await tapCenter(page.locator('[data-title="month-year"]'));
  const months = page.getByRole('listbox', {name: 'Month'});
  await expect(months).toBeVisible();
  await settlesAt(
    page.locator('[data-panel="wheels"]').first(),
    'opacity',
    '1',
  );
  return {driver, months, field: page.locator('input').first()};
}

/** A slow drag of `rows` rows up (later months), resting before the lift. */
async function turnRows(driver: TouchDriver, column: Locator, rows: number) {
  const box = await column.boundingBox();
  if (box == null) {
    throw new Error('no column');
  }
  const from = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  // Whole rows plus the pan's hysteresis.
  await driver.play(
    drag(
      from,
      {x: from.x, y: from.y - rows * WHEEL_ROW_HEIGHT - 10},
      {durationMs: 250 + rows * 100, restMs: 150},
    ),
  );
}

async function restingLabel(column: Locator): Promise<string | null> {
  return column.evaluate(element => {
    const id = element.getAttribute('aria-activedescendant');
    return id == null
      ? null
      : (document.getElementById(id)?.textContent ?? null);
  });
}

test('a turn of the month wheel moves the chosen date, keeping its day', async ({
  page,
}) => {
  const {driver, months, field} = await openWheels(page);
  expect(await restingLabel(months)).toBe('March');
  await turnRows(driver, months, 1);
  await expect.poll(async () => restingLabel(months)).toBe('April');
  await expect(field).toHaveValue('April 15, 2026');
});

test.describe('with a mouse', () => {
  test.use({hasTouch: false, isMobile: false});

  test('the scrolling month wheel moves only the calendar, not the date', async ({
    page,
  }) => {
    await openStory(
      page,
      storybook(),
      'core-dateinput--bottom-sheet-narrow-range',
    );
    expect(
      await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page
      .getByRole('button', {name: /calendar/i})
      .first()
      .click();
    await page.locator('[data-title="month-year"]').click();
    const months = page.getByRole('listbox', {name: 'Month'});
    await expect(months).toBeVisible();
    expect(await restingLabel(months)).toBe('March');
    await months.press('ArrowDown');
    await expect.poll(async () => restingLabel(months)).toBe('April');
    await expect(page.locator('input').first()).toHaveValue('March 15, 2026');
  });
});
