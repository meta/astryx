// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: three labelled switches and a live count, by mouse and by Space
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, one, press, shown} from '../../lib/probe-kit.mjs';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const toggle = name => page.getByRole('switch', {name, exact: true});
  const email = toggle('Email notifications');
  const push = toggle('Push notifications');
  const sms = toggle('SMS alerts');
  const count = n => page.getByText(`${n} of 3 notifications on`, {exact: true}).filter({visible: true});
  const isOn = async locator => locator.isChecked();
  return [
    ['three labelled switches', async () => {
      await one(email, 'Email notifications switch');
      await one(push, 'Push notifications switch');
      await one(sms, 'SMS alerts switch');
    }],
    ['Email starts on, the others off', async () => {
      assert(await isOn(email), 'Email notifications is not on at load');
      assert(!(await isOn(push)), 'Push notifications is on at load');
      assert(!(await isOn(sms)), 'SMS alerts is on at load');
      await shown(count(1), '"1 of 3 notifications on"');
    }],
    ['a click turns Push on', async () => {
      await push.click();
      await eventually(() => isOn(push), 'Push notifications is not on after a click');
      await shown(count(2), '"2 of 3 notifications on" after the click');
    }],
    ['Space turns the focused SMS switch on', async () => {
      await sms.focus();
      await press(page, ' ');
      await eventually(() => isOn(sms), 'SMS alerts is not on after Space');
      await shown(count(3), '"3 of 3 notifications on" after Space');
    }],
    ['Space turns the focused Email switch off', async () => {
      await email.focus();
      await press(page, ' ');
      await eventually(async () => !(await isOn(email)), 'Email notifications is still on after Space');
      await shown(count(2), '"2 of 3 notifications on" after Space');
    }],
  ];
}
