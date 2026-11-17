// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: one shipping choice, by mouse and by arrow key
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, press, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const radio = name => page.getByRole('radio', {name: new RegExp(`^\\s*${name}`)});
  const total = text => page.getByText(new RegExp(`Shipping:\\s*${text}`));
  const TOTALS = ['Free', '\\$9\\.99', '\\$24\\.99'];
  /** The current total is shown and the other two are not. */
  const onlyTotal = async (text, description) => {
    await shown(total(text), description);
    for (const other of TOTALS.filter(value => value !== text)) await hidden(total(other), `a stale total next to ${description}`);
  };
  return [
    ['three radio options', async () => {
      await one(radio('Standard'), 'Standard radio');
      await one(radio('Express'), 'Express radio');
      await one(radio('Overnight'), 'Overnight radio');
      assert((await page.getByRole('radio').count()) === 3, 'expected exactly 3 radios');
    }],
    ['Standard selected on load', async () => {
      assert(await radio('Standard').isChecked(), 'Standard is not checked');
      await onlyTotal('Free', '"Shipping: Free"');
    }],
    ['mouse selects Express', async () => {
      await radio('Express').click();
      await eventually(() => radio('Express').isChecked(), 'Express is not checked after click');
      assert(!(await radio('Standard').isChecked()), 'Standard stays checked');
      await onlyTotal('\\$9\\.99', '"Shipping: $9.99"');
    }],
    ['arrow key selects Overnight', async () => {
      await radio('Express').focus();
      await press(page, 'ArrowDown');
      await eventually(() => radio('Overnight').isChecked(), 'Overnight is not checked after ArrowDown');
      assert(!(await radio('Express').isChecked()), 'Express stays checked');
      await onlyTotal('\\$24\\.99', '"Shipping: $24.99"');
    }],
  ];
}
