// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file WheelActivation.interaction.browser.spec.ts
 * @input The built DateInput stories "BottomSheetWideRange" (200 years) and
 *   "BottomSheetNarrowRange" (2 years), real touch input
 * @output Proof that showing a touch wheel (a finger gets it on every engine)
 *   costs no more per year than today's column: opening the month and year
 *   wheels writes no element per year, and each year is drawn once, as its
 *   own flat row. Under a mouse the year wheel is today's column, every year
 *   listed natively.
 * @position Browser proof for DateInput/PickerWheel.tsx's rows, run by
 *   playwright.interaction.config.ts. It counts the elements an opening
 *   writes rather than timing it: the load on the machine running it moves
 *   a frame clock, never that count.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  openStory,
  settlesAt,
  touchDriver,
  withStorybook,
} from '@astryxdesign/interaction-harness';
import {WHEEL_ROW_HEIGHT} from '../wheelOptions';

const storybook = withStorybook(test);

interface Activation {
  /** Year options listed, and the year rows drawn (each option is one). */
  yearOptions: number;
  yearRowsDrawn: number;
  /** Year rows painted: a box one row tall. */
  yearRowsPainted: number;
  /**
   * The year wheel's elements the opening wrote (any attribute) or added,
   * from the tap that shows the wheels until the year wheel rests.
   */
  yearElementsWritten: number;
}

async function openMonthYearWheels(
  page: Page,
  storyId: string,
): Promise<Activation> {
  await openStory(page, storybook(), storyId);
  const driver = await touchDriver(page);
  const field = page.getByRole('combobox', {name: 'Date of birth'});
  const fieldBox = await field.boundingBox();
  if (fieldBox == null) {
    throw new Error('no field');
  }
  await driver.tap({
    x: fieldBox.x + fieldBox.width / 2,
    y: fieldBox.y + fieldBox.height / 2,
  });
  const title = page.locator('[data-title="month-year"]');
  await expect(title).toBeVisible();
  // The sheet rises to its open position, where its transform is the identity.
  await settlesAt(
    page.locator('.astryx-bottom-sheet').first(),
    'transform',
    'matrix(1, 0, 0, 1, 0, 0)',
  );
  const titleBox = await title.boundingBox();
  if (titleBox == null) {
    throw new Error('no month and year title');
  }
  // Every element of the year wheel the opening writes or adds, recorded as
  // it happens.
  await page.evaluate(() => {
    const written = new Set<Element>();
    (window as unknown as {__yearWritten: Set<Element>}).__yearWritten =
      written;
    const inYear = (node: Node): node is Element =>
      node instanceof Element &&
      node.closest('[role="listbox"][aria-label="Year"]') != null;
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && inYear(record.target)) {
          written.add(record.target);
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            for (const element of [node, ...node.querySelectorAll('*')]) {
              if (inYear(element)) {
                written.add(element);
              }
            }
          }
        }
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      childList: true,
    });
  });
  await driver.tap({
    x: titleBox.x + titleBox.width / 2,
    y: titleBox.y + titleBox.height / 2,
  });
  const years = page.getByRole('listbox', {name: 'Year'});
  await expect(years).toBeVisible();
  // The wheels fade in over the calendar. The year wheel parks its strip on
  // its year as they show, so it rests once they do.
  await settlesAt(
    page.locator('[data-panel="wheels"]').first(),
    'opacity',
    '1',
  );
  // The committed year is drawn where the wheel shows it.
  await expect(years.getByRole('option', {selected: true})).toBeVisible();
  return {
    yearOptions: await years.getByRole('option').count(),
    // Every row the wheel draws: each option is its own row, and nothing
    // else draws a year.
    yearRowsDrawn: await years.evaluate(
      list => list.querySelectorAll('[data-wheel-row]').length,
    ),
    yearRowsPainted: await years.evaluate(
      (list, rowHeight) =>
        Array.from(list.querySelectorAll('[data-wheel-row]')).filter(row => {
          const box = row.getBoundingClientRect();
          return box.width > 0 && Math.abs(box.height - rowHeight) < 0.5;
        }).length,
      WHEEL_ROW_HEIGHT,
    ),
    yearElementsWritten: await page.evaluate(
      () =>
        (window as unknown as {__yearWritten: Set<Element>}).__yearWritten.size,
    ),
  };
}

test('the month and year wheels draw each year once, and opening them writes no element per year', async ({
  page,
}, testInfo) => {
  const narrow = await openMonthYearWheels(
    page,
    'core-dateinput--bottom-sheet-narrow-range',
  );
  const wide = await openMonthYearWheels(
    page,
    'core-dateinput--bottom-sheet-wide-range',
  );
  testInfo.annotations.push({
    type: 'activation',
    description: JSON.stringify({narrow, wide}),
  });
  expect(narrow.yearOptions).toBe(2);
  expect(wide.yearOptions).toBe(200);
  // The touch column.
  await expect(page.locator('[data-wheel]')).toHaveCount(2);
  // Each year is drawn once, as its own row.
  expect(narrow.yearRowsDrawn).toBe(2);
  expect(wide.yearRowsDrawn).toBe(200);
  // And painted: each one a box one row tall.
  expect(narrow.yearRowsPainted).toBe(2);
  expect(wide.yearRowsPainted).toBe(200);
  // What opening costs, counted: the year wheel parks its strip on its year
  // and marks the band's row, beside what the two-year wheel writes. A cost
  // per year (every row written as the wheel opens) shows here as 200 or
  // more.
  expect(wide.yearElementsWritten).toBeLessThanOrEqual(
    narrow.yearElementsWritten + 2,
  );
});

test.describe('under a mouse', () => {
  // A desktop: today's column, in the sheet the story asks for.
  test.use({hasTouch: false, isMobile: false});

  test('the year wheel is the scrolling column with every year', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'one engine is enough for the fine-pointer path, which is main’s column',
    );
    await openStory(
      page,
      storybook(),
      'core-dateinput--bottom-sheet-wide-range',
    );
    // A mouse case runs under a fine primary pointer: the page agrees.
    expect(
      await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches),
    ).toBe(false);
    await page.getByRole('combobox', {name: 'Date of birth'}).click();
    const title = page.locator('[data-title="month-year"]');
    await expect(title).toBeVisible();
    await title.click();
    const years = page.getByRole('listbox', {name: 'Year'});
    await expect(years).toBeVisible();
    await expect(page.locator('[data-wheel]')).toHaveCount(0);
    expect(await years.getByRole('option').count()).toBe(200);
  });
});
