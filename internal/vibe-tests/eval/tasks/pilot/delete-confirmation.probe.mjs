// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a confirmation dialog that returns focus and deletes one file
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {dialogNamed, eventually, hidden, isFocusedWithin, one, press, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const opener = page.getByRole('button', {name: 'Delete Q2 report.pdf', exact: true});
  const dialog = dialogNamed(page, /Delete file\?/);
  const open = async () => {
    await opener.click();
    await one(dialog, 'dialog named "Delete file?"');
  };
  return [
    ['rows and delete buttons', async () => {
      for (const file of ['Q1', 'Q2', 'Q3']) {
        await one(page.getByRole('button', {name: `Delete ${file} report.pdf`, exact: true}), `Delete ${file} button`);
      }
    }],
    ['opens a named dialog with the message', async () => {
      await open();
      await shown(dialog.getByText('Are you sure you want to delete Q2 report.pdf?'), 'confirmation text');
      await one(dialog.getByRole('button', {name: 'Cancel', exact: true}), 'Cancel button');
      await one(dialog.getByRole('button', {name: 'Delete', exact: true}), 'Delete button');
    }],
    ['Escape closes, keeps the file, returns focus', async () => {
      await press(page, 'Escape');
      await hidden(dialog, 'dialog');
      await one(opener, 'Delete Q2 button after Escape');
      await eventually(() => isFocusedWithin(opener), 'focus did not return to the opener after Escape');
    }],
    ['Cancel closes, keeps the file, returns focus', async () => {
      await open();
      await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
      await hidden(dialog, 'dialog');
      await one(opener, 'Delete Q2 button after Cancel');
      await eventually(() => isFocusedWithin(opener), 'focus did not return to the opener after Cancel');
    }],
    ['Delete removes only that file', async () => {
      await open();
      await dialog.getByRole('button', {name: 'Delete', exact: true}).click();
      await hidden(dialog, 'dialog');
      await hidden(opener, 'Delete Q2 button');
      await hidden(page.getByText('Q2 report.pdf', {exact: true}), 'Q2 row');
      await one(page.getByRole('button', {name: 'Delete Q1 report.pdf', exact: true}), 'Delete Q1 button');
      await one(page.getByRole('button', {name: 'Delete Q3 report.pdf', exact: true}), 'Delete Q3 button');
    }],
  ];
}
