// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a labelled price slider that moves by $10 and jumps with Home and End
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, press, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const slider = page.getByRole('slider', {name: /Maximum price/});
  const valueText = n => page.getByText(new RegExp(`Up to \\$${n}(?![\\d.,])`));
  /** An ARIA value, or the native range input's own value when the attribute is absent. */
  const read = (aria, native) =>
    slider.evaluate((element, [ariaName, nativeName]) => Number(element.getAttribute(ariaName) ?? element[nativeName]), [aria, native]);
  const now = () => read('aria-valuenow', 'value');
  /** The slider is at n, its text says so, and the previous text is gone. */
  const at = async (n, previous, description) => {
    let found;
    await eventually(async () => (found = await now()) === n, () => `the value is ${found}, expected ${n} ${description}`);
    await shown(valueText(n), `"Up to $${n}" ${description}`);
    if (previous !== undefined) await hidden(valueText(previous), `stale "Up to $${previous}" ${description}`);
  };
  return [
    ['a labelled slider from 0 to 500 at 250', async () => {
      await one(slider, 'slider named "Maximum price"');
      assert((await read('aria-valuemin', 'min')) === 0, 'the minimum is not 0');
      assert((await read('aria-valuemax', 'max')) === 500, 'the maximum is not 500');
      await at(250, undefined, 'on load');
    }],
    ['arrow keys move by $10', async () => {
      await slider.focus();
      await press(page, 'ArrowRight');
      await at(260, 250, 'after ArrowRight');
      await press(page, 'ArrowLeft');
      await press(page, 'ArrowLeft');
      await at(240, 260, 'after ArrowLeft twice');
    }],
    ['End jumps to $500', async () => {
      await press(page, 'End');
      await at(500, 240, 'after End');
    }],
    ['Home jumps to $0', async () => {
      await press(page, 'Home');
      await at(0, 500, 'after Home');
    }],
  ];
}
