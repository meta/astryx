// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a modal dialog that traps focus, validates and returns focus
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, dialogNamed, eventually, hidden, isFocusedWithin, one, press, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const opener = page.getByRole('button', {name: 'New project', exact: true});
  const dialog = dialogNamed(page, /Create project/);
  const name = dialog.getByRole('textbox', {name: /^\s*Project name/});
  const open = async () => {
    await opener.click();
    await one(dialog, 'dialog named "Create project"');
  };
  return [
    ['the dialog opens with focus in Project name', async () => {
      await open();
      await one(name, 'Project name field');
      await eventually(() => name.evaluate(element => element === document.activeElement), 'Project name does not have focus');
      await one(dialog.getByRole('button', {name: 'Cancel', exact: true}), 'Cancel button');
      await one(dialog.getByRole('button', {name: 'Create', exact: true}), 'Create button');
    }],
    ['Tab and Shift+Tab stay inside the dialog', async () => {
      for (let count = 1; count <= 5; count++) {
        await press(page, 'Tab');
        assert(await isFocusedWithin(dialog), `focus left the dialog after Tab ${count}`);
      }
      await page.keyboard.down('Shift');
      for (let count = 1; count <= 5; count++) {
        await press(page, 'Tab');
        assert(await isFocusedWithin(dialog), `focus left the dialog after Shift+Tab ${count}`);
      }
      await page.keyboard.up('Shift');
    }],
    ['an empty name shows the error and keeps the dialog', async () => {
      await name.fill('');
      await dialog.getByRole('button', {name: 'Create', exact: true}).click();
      await shown(page.getByText('Enter a project name', {exact: true}), 'error text');
      await one(dialog, 'dialog after an empty Create');
    }],
    ['a name adds the project and returns focus', async () => {
      await name.fill('Atlas');
      await dialog.getByRole('button', {name: 'Create', exact: true}).click();
      await hidden(dialog, 'dialog');
      await shown(page.getByText('Atlas', {exact: true}), 'Atlas in the project list');
      await eventually(() => isFocusedWithin(opener), 'focus did not return to New project');
    }],
    ['Cancel closes without adding', async () => {
      await open();
      await name.fill('Cosmos');
      await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
      await hidden(dialog, 'dialog after Cancel');
      await hidden(page.getByText('Cosmos', {exact: true}), 'Cosmos');
    }],
    ['Escape closes without adding', async () => {
      await open();
      await name.fill('Borealis');
      await press(page, 'Escape');
      await hidden(dialog, 'dialog after Escape');
      await hidden(page.getByText('Borealis', {exact: true}), 'Borealis');
    }],
  ];
}
