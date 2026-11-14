// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: category and search filters that apply together, with a count
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, shown} from '../../lib/probe-kit.mjs';

const PRODUCTS = ['Notebook', 'Pen set', 'Desk lamp', 'Throw blanket', 'Headphones', 'Phone stand', 'Water bottle', 'Trail map'];

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  // A select is a combobox, native or custom, or a button that opens a listbox.
  const category = page
    .getByRole('combobox', {name: /^\s*Category/})
    .or(page.getByRole('button', {name: /^\s*Category/}).and(page.locator('[aria-haspopup="listbox"]')))
    .first();
  const search = page
    .getByRole('textbox', {name: /^\s*Search/})
    .or(page.getByRole('searchbox', {name: /^\s*Search/}));
  const product = name => page.getByText(name, {exact: true});
  const count = n => page.getByText(new RegExp(`(^|\\D)${n} products\\b`));
  const empty = page.getByText('No products match', {exact: true});
  const isNative = () => category.evaluate(element => element.tagName === 'SELECT');
  const currentCategory = async () =>
    (await isNative())
      ? category.evaluate(element => element.selectedOptions[0]?.textContent?.trim() ?? '')
      : (await category.innerText()).trim();
  const choose = async option => {
    if (await isNative()) {
      await category.selectOption({label: option});
    } else {
      await category.click();
      const item = page.getByRole('option', {name: option, exact: true});
      await one(item, `option "${option}"`);
      await item.click();
    }
    await eventually(async () => (await currentCategory()).includes(option), `Category does not show "${option}" after choosing it`);
  };
  /** Exactly these products are shown, with the matching count. */
  const showsOnly = async (names, description) => {
    for (const name of names) await shown(product(name), `${name} ${description}`);
    for (const name of PRODUCTS.filter(other => !names.includes(other))) await hidden(product(name), `${name} ${description}`);
    if (names.length === 0) {
      await shown(empty, `"No products match" ${description}`);
    } else {
      await shown(count(names.length), `"${names.length} products" ${description}`);
      await hidden(empty, `"No products match" ${description}`);
    }
    for (const n of [0, 2, 8].filter(n => n !== names.length)) await hidden(count(n), `stale "${n} products" ${description}`);
  };
  return [
    ['eight products and both filters', async () => {
      await one(category, 'Category select');
      await one(search, 'Search field');
      assert((await currentCategory()).includes('All'), 'Category does not start at All');
      await showsOnly(PRODUCTS, 'on load');
    }],
    ['Category filters the grid', async () => {
      await choose('Home');
      await showsOnly(['Desk lamp', 'Throw blanket'], 'for Home');
    }],
    ['Search filters by name, ignoring case', async () => {
      await choose('All');
      await search.fill('PH');
      await showsOnly(['Headphones', 'Phone stand'], 'for search "PH"');
    }],
    ['both filters apply together', async () => {
      await choose('Home');
      await showsOnly([], 'for Home and "PH"');
      await choose('Electronics');
      await showsOnly(['Headphones', 'Phone stand'], 'for Electronics and "PH"');
      await choose('Outdoor');
      await search.fill('');
      await showsOnly(['Water bottle', 'Trail map'], 'for Outdoor and no search');
    }],
  ];
}
