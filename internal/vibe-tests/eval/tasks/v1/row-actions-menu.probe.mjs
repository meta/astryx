// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a row actions menu that works with the keyboard
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, isFocusedWithin, one, press} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const actions = name => page.getByRole('button', {name: `Actions for ${name}`, exact: true});
  const menu = page.getByRole('menu');
  const item = name => page.getByRole('menuitem', {name, exact: true});
  const focusedItem = () =>
    page.evaluate(() => {
      const active = document.activeElement;
      const owner = active?.getAttribute('aria-activedescendant');
      const target = owner ? document.getElementById(owner) : active;
      return target?.getAttribute('role') === 'menuitem' ? target.textContent.trim() : null;
    });
  const before = (a, b) =>
    page.evaluate(([first, second]) => Boolean(first && second && first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING), [a, b]);
  return [
    ['three rows with action buttons', async () => {
      for (const name of ['Apollo', 'Gemini', 'Mercury']) await one(actions(name), `Actions for ${name}`);
    }],
    ['Enter opens the menu with focus on Rename', async () => {
      await actions('Gemini').focus();
      await press(page, 'Enter');
      await one(menu, 'menu');
      for (const name of ['Rename', 'Duplicate', 'Delete']) await one(item(name), `${name} item`);
      await eventually(async () => (await focusedItem())?.startsWith('Rename'), 'focus is not on Rename');
    }],
    ['Escape closes and returns focus', async () => {
      await press(page, 'Escape');
      await hidden(menu, 'menu');
      await eventually(() => isFocusedWithin(actions('Gemini')), 'focus did not return to the Actions button');
    }],
    ['ArrowDown and Enter choose Duplicate', async () => {
      await press(page, 'Enter');
      await one(menu, 'menu');
      await eventually(async () => (await focusedItem())?.startsWith('Rename'), 'focus is not on Rename');
      await press(page, 'ArrowDown');
      await eventually(async () => (await focusedItem())?.startsWith('Duplicate'), 'ArrowDown did not move focus to Duplicate');
      await press(page, 'Enter');
      await hidden(menu, 'menu');
      await one(actions('Gemini copy'), 'Actions for Gemini copy');
      const [original, copy, mercury] = await Promise.all(['Gemini', 'Gemini copy', 'Mercury'].map(name => actions(name).elementHandle()));
      assert(await before(original, copy), 'the copy is not after Gemini');
      assert(await before(copy, mercury), 'the copy is not right after Gemini');
    }],
    ['Delete removes the row', async () => {
      await actions('Mercury').click();
      await one(menu, 'menu');
      await item('Delete').click();
      await hidden(actions('Mercury'), 'Actions for Mercury');
      await one(actions('Apollo'), 'Actions for Apollo');
    }],
  ];
}
