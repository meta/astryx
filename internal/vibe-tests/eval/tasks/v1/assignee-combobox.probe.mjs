// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a filtering combobox picked with the keyboard
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, press, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const combobox = page.getByRole('combobox', {name: /^\s*Assignee/});
  const options = () => page.getByRole('option').filter({visible: true});
  /** The option the combobox highlights, by aria-activedescendant, focus, or aria-selected. */
  const highlighted = () =>
    page.evaluate(() => {
      const id = document.activeElement?.getAttribute('aria-activedescendant');
      const byId = id ? document.getElementById(id) : null;
      const focused = document.activeElement?.getAttribute('role') === 'option' ? document.activeElement : null;
      const selected = [...document.querySelectorAll('[role="option"][aria-selected="true"]')].find(o => o.checkVisibility());
      return (byId ?? focused ?? selected)?.textContent.trim() ?? null;
    });
  return [
    ['a labelled combobox starts unassigned', async () => {
      await one(combobox, 'Assignee combobox');
      await shown(page.getByText(/(^|:\s*)Unassigned\s*$/), '"Unassigned"');
    }],
    ['typing filters the options, ignoring case', async () => {
      await combobox.click();
      await page.keyboard.type('AN', {delay: 50});
      await eventually(async () => (await options().count()) === 2, async () => `expected 2 options for "AN", found ${await options().count()}`);
      const names = await options().allInnerTexts();
      assert(names.some(n => n.includes('Alan Turing')) && names.some(n => n.includes('Radia Perlman')), `wrong options: ${names.join(', ')}`);
    }],
    ['Escape closes the list', async () => {
      await press(page, 'Escape');
      await hidden(page.getByRole('option'), 'options after Escape');
    }],
    ['ArrowDown and Enter pick Radia Perlman', async () => {
      await combobox.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('an', {delay: 50});
      await eventually(async () => (await options().count()) === 2, 'the options did not come back for "an"');
      for (let tries = 0; tries < 3 && !(await highlighted())?.includes('Radia Perlman'); tries++) {
        await press(page, 'ArrowDown');
        await page.waitForTimeout(100);
      }
      assert((await highlighted())?.includes('Radia Perlman'), 'ArrowDown never highlighted Radia Perlman');
      await press(page, 'Enter');
      await shown(page.getByText(/Assigned to:\s*Radia Perlman/), '"Assigned to: Radia Perlman"');
    }],
  ];
}
