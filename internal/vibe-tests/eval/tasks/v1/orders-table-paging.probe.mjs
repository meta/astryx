// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a paged orders table with row selection and bulk delete
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const table = page.getByRole('table');
  const rows = () => table.getByRole('row').filter({hasText: /#10\d\d/});
  const showing = (from, to, total) => page.getByText(new RegExp(`Showing\\s+${from}\\s*[–-]\\s*${to}\\s+of\\s+${total}`));
  const next = page.getByRole('button', {name: 'Next page'});
  const previous = page.getByRole('button', {name: 'Previous page'});
  const select = order => page.getByRole('checkbox', {name: `Select order #${order}`, exact: true});
  const isDisabled = async locator =>
    locator.evaluate(element => element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true');
  const firstRowText = async () => (await rows().first().innerText()).replace(/\s+/g, ' ');
  return [
    ['page 1 shows ten orders with their values', async () => {
      await one(table, 'table');
      for (const name of ['Order', 'Customer', 'Total']) {
        await one(page.getByRole('columnheader', {name: new RegExp(`^\\s*${name}`)}), `${name} column header`);
      }
      await eventually(async () => (await rows().count()) === 10, 'expected 10 order rows');
      const text = await firstRowText();
      assert(/#1001/.test(text) && /Customer 01/.test(text) && /\$10\.00/.test(text), `first row is wrong: ${text}`);
      await shown(showing(1, 10, 30), '"Showing 1–10 of 30"');
      assert(await isDisabled(previous), 'Previous page is not disabled on the first page');
    }],
    ['Next page moves through the pages', async () => {
      await next.click();
      await shown(showing(11, 20, 30), '"Showing 11–20 of 30"');
      assert(/#1011/.test(await firstRowText()), 'page 2 does not start at #1011');
      await next.click();
      await shown(showing(21, 30, 30), '"Showing 21–30 of 30"');
      const rowText = (await rows().last().innerText()).replace(/\s+/g, ' ');
      assert(/#1030/.test(rowText) && /Customer 30/.test(rowText) && /\$300\.00/.test(rowText), `last row is wrong: ${rowText}`);
      assert(await isDisabled(next), 'Next page is not disabled on the last page');
      await previous.click();
      await previous.click();
      await shown(showing(1, 10, 30), '"Showing 1–10 of 30" after going back');
    }],
    ['selecting rows shows the count and Delete selected', async () => {
      await hidden(page.getByRole('button', {name: 'Delete selected'}), 'Delete selected before any selection');
      await select(1002).check();
      await select(1004).check();
      await shown(page.getByText(/2 selected/), '"2 selected"');
      await one(page.getByRole('button', {name: 'Delete selected'}), 'Delete selected button');
    }],
    ['Delete selected removes those orders', async () => {
      await page.getByRole('button', {name: 'Delete selected'}).click();
      await shown(showing(1, 10, 28), '"Showing 1–10 of 28"');
      await hidden(table.getByText('#1002', {exact: true}), '#1002');
      await hidden(table.getByText('#1004', {exact: true}), '#1004');
      await eventually(async () => (await rows().count()) === 10, 'page 1 does not refill to 10 rows');
      await hidden(page.getByRole('button', {name: 'Delete selected'}), 'Delete selected after deleting');
    }],
  ];
}
