// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: a connected error for a bad email and a thank-you for a good one
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, describedText, eventually, hidden, one, shown} from '../../lib/probe-kit.mjs';

const ERROR = 'Enter a valid email address';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const email = page.getByRole('textbox', {name: /^\s*Email/});
  const subscribe = page.getByRole('button', {name: 'Subscribe', exact: true});
  return [
    ['labelled field and button', async () => {
      await one(email, 'Email textbox');
      await one(subscribe, 'Subscribe button');
    }],
    ['empty email shows a connected error', async () => {
      await subscribe.click();
      await shown(page.getByText(ERROR, {exact: true}), 'error text for an empty field');
      await eventually(
        async () => (await email.getAttribute('aria-invalid')) === 'true',
        'the field is not marked aria-invalid="true"',
      );
      assert((await describedText(email)).includes(ERROR), 'the error is not referenced by aria-describedby or aria-errormessage');
    }],
    ['invalid email shows the error on a fresh page', async () => {
      await page.reload({waitUntil: 'load'});
      await email.fill('not-an-email');
      await subscribe.click();
      await shown(page.getByText(ERROR, {exact: true}), 'error text for an invalid address');
      await eventually(
        async () => (await email.getAttribute('aria-invalid')) === 'true',
        'the field is not marked aria-invalid="true" for an invalid address',
      );
      assert((await describedText(email)).includes(ERROR), 'the error for an invalid address is not referenced by aria-describedby or aria-errormessage');
    }],
    ['valid email shows the thank-you message', async () => {
      await email.fill('ada@example.com');
      await subscribe.click();
      await shown(page.getByText('Thanks for subscribing!', {exact: true}), 'thank-you message');
      await hidden(email, 'Email textbox');
    }],
  ];
}
