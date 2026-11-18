// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: search and name sort in a real table
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, one, shown} from '../../lib/probe-kit.mjs';

const NAMES = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Katherine Johnson', 'Linus Torvalds', 'Margaret Hamilton'];

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const table = page.getByRole('table');
  const dataRows = () => table.getByRole('row').filter({hasText: /@example\.com/});
  const search = page
    .getByRole('textbox', {name: /Search users/})
    .or(page.getByRole('searchbox', {name: /Search users/}));
  const nameHeader = page.getByRole('columnheader', {name: /^\s*Name/});
  const rowCount = async expected => {
    let found = -1;
    await eventually(async () => (found = await dataRows().count()) === expected, () => `expected ${expected} data rows, found ${found}`);
  };
  const nameOrder = async () => {
    const rows = await dataRows().allInnerTexts();
    return rows.map(row => NAMES.find(name => row.includes(name)) ?? '?').join(', ');
  };
  return [
    ['a table with four column headers and six rows', async () => {
      await one(table, 'table');
      for (const name of ['Name', 'Email', 'Role', 'Joined']) {
        await one(page.getByRole('columnheader', {name: new RegExp(`^\\s*${name}`)}), `${name} column header`);
      }
      await rowCount(6);
      assert((await table.getByRole('cell').count()) >= 24, 'expected at least 24 cells');
    }],
    ['search filters by name and email, ignoring case', async () => {
      await one(search, '"Search users" field');
      await search.fill('GRACE');
      await rowCount(1);
      await shown(table.getByText('Grace Hopper'), 'Grace Hopper row');
      await search.fill('linus@');
      await rowCount(1);
      await shown(table.getByText('Linus Torvalds'), 'Linus Torvalds row');
    }],
    ['no match shows the empty message', async () => {
      await search.fill('zzzz');
      await rowCount(0);
      await shown(page.getByText('No users found', {exact: true}), '"No users found"');
      await search.fill('');
      await rowCount(6);
    }],
    ['the Name button sorts A to Z, then Z to A', async () => {
      const button = nameHeader.getByRole('button');
      await one(button, 'button in the Name header');
      await button.click();
      await eventually(async () => (await nameHeader.getAttribute('aria-sort')) === 'ascending', 'Name header is not aria-sort="ascending" after one press');
      const ascending = NAMES.join(', ');
      let order;
      await eventually(async () => (order = await nameOrder()) === ascending, () => `A to Z order is wrong: ${order}`);
      await button.click();
      await eventually(async () => (await nameHeader.getAttribute('aria-sort')) === 'descending', 'Name header is not aria-sort="descending" after two presses');
      const descending = NAMES.toReversed().join(', ');
      await eventually(async () => (order = await nameOrder()) === descending, () => `Z to A order is wrong: ${order}`);
    }],
  ];
}
