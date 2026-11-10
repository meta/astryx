// Copyright (c) Meta Platforms, Inc. and affiliates.

import {assert, eventually, one, press, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const radio = name => page.getByRole('radio', {name: new RegExp(`^\\s*${name}`)});
  const total = text => page.getByText(new RegExp(`Shipping:\\s*${text}`));
  return [
    ['three radio options', async () => {
      await one(radio('Standard'), 'Standard radio');
      await one(radio('Express'), 'Express radio');
      await one(radio('Overnight'), 'Overnight radio');
      assert((await page.getByRole('radio').count()) === 3, 'expected exactly 3 radios');
    }],
    ['Standard selected on load', async () => {
      assert(await radio('Standard').isChecked(), 'Standard is not checked');
      await shown(total('Free'), '"Shipping: Free"');
    }],
    ['mouse selects Express', async () => {
      await radio('Express').click();
      await eventually(() => radio('Express').isChecked(), 'Express is not checked after click');
      assert(!(await radio('Standard').isChecked()), 'Standard stays checked');
      await shown(total('\\$9\\.99'), '"Shipping: $9.99"');
    }],
    ['arrow key selects Overnight', async () => {
      await radio('Express').focus();
      await press(page, 'ArrowDown');
      await eventually(() => radio('Overnight').isChecked(), 'Overnight is not checked after ArrowDown');
      assert(!(await radio('Express').isChecked()), 'Express stays checked');
      await shown(total('\\$24\\.99'), '"Shipping: $24.99"');
    }],
  ];
}
