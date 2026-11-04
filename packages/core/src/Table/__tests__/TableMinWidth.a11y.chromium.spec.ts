// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y always

/**
 * @file TableMinWidth.a11y.chromium.spec.ts
 * @input resolveTableMinWidth and real Chromium CSS parsing
 * @output Browser evidence that every emitted table min-width is a valid declaration
 * @position Table integration proof; jsdom keeps invalid strings, so validity is checked here
 */

import {expect, test} from '@playwright/test';
import {resolveTableMinWidth} from '../columnUtils';

// Consumer values a caller can pass as `style.minWidth`, including the
// intrinsic-size and global keywords that CSS max() rejects.
const CONSUMER_VALUES: (number | string | undefined)[] = [
  undefined,
  900,
  0,
  '900px',
  '0',
  '0rem',
  '60rem',
  '50%',
  'calc(100% - 2rem)',
  'var(--table-min)',
  'auto',
  'max-content',
  'min-content',
  'fit-content',
  'inherit',
  'unset',
  '12',
];

test('every resolved table min-width is a valid CSS declaration', async ({
  page,
}) => {
  await page.setContent('<table></table>');
  for (const consumer of CONSUMER_VALUES) {
    const resolved = resolveTableMinWidth(consumer, 240);
    const accepted = await page.evaluate(value => {
      const table = document.querySelector('table');
      if (!table) {
        throw new Error('missing table');
      }
      table.style.minWidth = '';
      table.style.minWidth = value;
      return table.style.minWidth !== '';
    }, resolved);
    expect(accepted, `${String(consumer)} -> ${resolved}`).toBe(true);
  }
});

test('a keyword consumer minWidth keeps the column floor in layout', async ({
  page,
}) => {
  await page.setContent(
    '<div style="width: 100px"><table style="table-layout: fixed"><tr><td></td></tr></table></div>',
  );
  for (const consumer of ['auto', 'max-content', 'inherit', '0']) {
    const width = await page.evaluate(
      value => {
        const table = document.querySelector('table');
        if (!table) {
          throw new Error('missing table');
        }
        table.style.minWidth = value;
        return table.getBoundingClientRect().width;
      },
      resolveTableMinWidth(consumer, 240),
    );
    expect(width, consumer).toBeGreaterThanOrEqual(240);
  }
});
