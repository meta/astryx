// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: three tabs, by mouse and by keyboard
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, press} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const tab = name => page.getByRole('tab', {name, exact: true});
  const heading = name => page.getByRole('heading', {name, exact: true});
  const selected = async name => (await tab(name).getAttribute('aria-selected')) === 'true';
  return [
    ['three tabs', async () => {
      for (const name of ['Overview', 'Activity', 'Settings']) await one(tab(name), `${name} tab`);
      assert((await page.getByRole('tab').count()) === 3, 'expected exactly 3 tabs');
    }],
    ['Overview selected on load', async () => {
      assert(await selected('Overview'), 'Overview tab is not selected');
      await one(heading('Overview'), 'Overview heading');
      await hidden(heading('Account settings'), 'Account settings heading');
    }],
    ['mouse shows Settings', async () => {
      await tab('Settings').click();
      await eventually(() => selected('Settings'), 'Settings tab is not selected after click');
      await one(heading('Account settings'), 'Account settings heading');
      await hidden(heading('Overview'), 'Overview heading');
    }],
    ['keyboard shows Activity', async () => {
      await tab('Overview').click();
      await eventually(() => selected('Overview'), 'Overview tab is not selected after click');
      await press(page, 'ArrowRight');
      await eventually(
        () => tab('Activity').evaluate(element => element === document.activeElement),
        'ArrowRight did not move focus to Activity',
      );
      if (!(await selected('Activity'))) await press(page, 'Enter');
      await eventually(() => selected('Activity'), 'Activity tab is not selected');
      await one(heading('Recent activity'), 'Recent activity heading');
      await hidden(heading('Overview'), 'Overview heading');
    }],
  ];
}
