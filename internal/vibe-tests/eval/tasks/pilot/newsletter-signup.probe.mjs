// Copyright (c) Meta Platforms, Inc. and affiliates.

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
    ['invalid email shows a connected error', async () => {
      await email.fill('not-an-email');
      await subscribe.click();
      await shown(page.getByText(ERROR, {exact: true}), 'error text');
      await eventually(
        async () => (await email.getAttribute('aria-invalid')) === 'true',
        'the field is not marked aria-invalid="true"',
      );
      assert((await describedText(email)).includes(ERROR), 'the error is not referenced by aria-describedby or aria-errormessage');
    }],
    ['empty email shows the error', async () => {
      await email.fill('');
      await subscribe.click();
      await shown(page.getByText(ERROR, {exact: true}), 'error text for an empty field');
    }],
    ['valid email shows the thank-you message', async () => {
      await email.fill('ada@example.com');
      await subscribe.click();
      await shown(page.getByText('Thanks for subscribing!', {exact: true}), 'thank-you message');
      await hidden(email, 'Email textbox');
    }],
  ];
}
