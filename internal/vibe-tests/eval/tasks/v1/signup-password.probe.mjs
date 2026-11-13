// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Probe: password visibility, three field errors and a success message
 * @input a page with the built app
 * @output named steps for runSteps in lib/probe-kit.mjs
 * @position Read by the grader for the task of the same name
 */

import {assert, eventually, hidden, one, shown} from '../../lib/probe-kit.mjs';

const EMAIL_ERROR = 'Enter a valid email address';
const LENGTH_ERROR = 'Use at least 8 characters';
const MATCH_ERROR = 'Passwords do not match';

/** @param {import('playwright-core').Page} page */
export default function steps(page) {
  const email = page.getByRole('textbox', {name: /^\s*Email/});
  const password = page.getByLabel(/^\s*Password/);
  // Masked or plain text is the input type; there is no role or text for it.
  const isMasked = () => password.evaluate(element => element instanceof HTMLInputElement && element.type === 'password');
  const confirm = page.getByLabel(/^\s*Confirm password/);
  const submit = page.getByRole('button', {name: 'Create account', exact: true});
  const show = page.getByRole('button', {name: 'Show password', exact: true});
  const hide = page.getByRole('button', {name: 'Hide password', exact: true});
  const invalid = async locator => (await locator.first().getAttribute('aria-invalid')) === 'true';
  const error = text => page.getByText(text, {exact: true});
  return [
    ['three labelled fields and the button', async () => {
      await one(email, 'Email textbox');
      await one(password, 'Password field');
      await one(confirm, 'Confirm password field');
      await one(submit, 'Create account button');
    }],
    ['Show password reveals the text, Hide password hides it', async () => {
      await password.fill('secret12');
      await one(show, 'Show password button');
      assert(await isMasked(), 'the password is not hidden before Show password');
      await show.click();
      await eventually(async () => !(await isMasked()), 'the password is still hidden after Show password');
      assert((await password.inputValue()) === 'secret12', 'the password value changed when it was shown');
      await one(hide, 'Hide password button');
      await hidden(show, 'Show password button while the password is visible');
      await hide.click();
      await eventually(isMasked, 'the password is not hidden after Hide password');
      await one(show, 'Show password button after hiding');
    }],
    ['bad email and short password show errors and mark the fields', async () => {
      await page.reload({waitUntil: 'load'});
      await email.fill('not-an-email');
      await password.fill('short');
      await confirm.fill('short');
      await submit.click();
      await shown(error(EMAIL_ERROR), `"${EMAIL_ERROR}"`);
      await shown(error(LENGTH_ERROR), `"${LENGTH_ERROR}"`);
      await hidden(error(MATCH_ERROR), `"${MATCH_ERROR}" for matching passwords`);
      await eventually(() => invalid(email), 'Email is not marked aria-invalid="true"');
      await eventually(() => invalid(password), 'Password is not marked aria-invalid="true"');
      assert(!(await invalid(confirm)), 'Confirm password is marked invalid although it matches');
    }],
    ['a different confirmation shows only the match error', async () => {
      await email.fill('ada@example.com');
      await password.fill('longenough');
      await confirm.fill('longenougg');
      await submit.click();
      await shown(error(MATCH_ERROR), `"${MATCH_ERROR}"`);
      await eventually(() => invalid(confirm), 'Confirm password is not marked aria-invalid="true"');
      await hidden(error(EMAIL_ERROR), `stale "${EMAIL_ERROR}"`);
      await hidden(error(LENGTH_ERROR), `stale "${LENGTH_ERROR}"`);
      await eventually(async () => !(await invalid(email)), 'Email stays marked invalid');
      await eventually(async () => !(await invalid(password)), 'Password stays marked invalid');
    }],
    ['valid values replace the form', async () => {
      await confirm.fill('longenough');
      await submit.click();
      await shown(page.getByText('Account created', {exact: true}), '"Account created"');
      await hidden(email, 'Email textbox');
      await hidden(submit, 'Create account button');
    }],
  ];
}
