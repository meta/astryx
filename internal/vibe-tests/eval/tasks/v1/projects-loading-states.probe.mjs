// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a loading status, the list, a failed load alert and recovery
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, ProbeFailure, shown} from '../../lib/probe-kit.mjs';

const LOADING = /Loading projects(…|\.\.\.)/;
const PROJECTS = ['Atlas', 'Borealis', 'Cosmos'];
const LOADING_SHOWN_MS = 500;

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  // The loading text must be in a status region: role=status or an aria-live region.
  const loading = page
    .getByRole('status')
    .or(page.locator('[aria-live]:not([aria-live="off"])'))
    .filter({hasText: LOADING})
    .filter({visible: true});
  const loadingText = page.getByText(LOADING).filter({visible: true});
  const project = name => page.getByText(name, {exact: true});
  const failSwitch = page.getByRole('switch', {name: /Fail loads/});
  const reload = page.getByRole('button', {name: 'Reload', exact: true});
  const tryAgain = page.getByRole('button', {name: 'Try again', exact: true});
  const alert = page.getByRole('alert').filter({hasText: 'Could not load projects'});
  const loadingSoon = async description => {
    try {
      await loading.first().waitFor({state: 'visible', timeout: LOADING_SHOWN_MS});
      await loadingText.first().waitFor({state: 'visible', timeout: LOADING_SHOWN_MS});
    } catch {
      throw new ProbeFailure(`${description}: visible "Loading projects…" in a status region did not appear within ${LOADING_SHOWN_MS} ms`);
    }
  };
  const listShown = async description => {
    for (const name of PROJECTS) await shown(project(name), `${name} ${description}`);
    await hidden(loadingText, `loading text after the list ${description}`);
  };
  return [
    ['loading status on open, then the list', async () => {
      await page.reload({waitUntil: 'load'});
      await loadingSoon('on open');
      await listShown('after the first load');
    }],
    ['Fail loads switch, off, and a Reload button', async () => {
      await one(failSwitch, 'switch named "Fail loads"');
      assert(!(await failSwitch.isChecked()), 'Fail loads is on at first');
      await one(reload, 'Reload button');
    }],
    ['Reload shows loading and loads the list again', async () => {
      await reload.click();
      await loadingSoon('after Reload');
      await listShown('after Reload');
    }],
    ['a failed load ends in an alert with Try again', async () => {
      await failSwitch.click();
      await eventually(() => failSwitch.isChecked(), 'Fail loads is not on after a click');
      await reload.click();
      await loadingSoon('after Reload with Fail loads on');
      await shown(alert, 'alert "Could not load projects"');
      await one(tryAgain, 'Try again button');
      await hidden(loadingText, 'loading text after the failed load');
    }],
    ['Try again loads again and fails again while Fail loads is on', async () => {
      await tryAgain.click();
      await loadingSoon('after Try again');
      await shown(alert, 'alert "Could not load projects" after Try again');
    }],
    ['with Fail loads off, Try again recovers the list', async () => {
      await failSwitch.click();
      await eventually(async () => !(await failSwitch.isChecked()), 'Fail loads is still on after a click');
      await one(tryAgain, 'Try again button');
      await tryAgain.click();
      await loadingSoon('after Try again with Fail loads off');
      await listShown('after recovery');
      await hidden(alert, 'alert after recovery');
    }],
  ];
}
