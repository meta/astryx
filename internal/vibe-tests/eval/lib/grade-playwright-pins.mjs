// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Checks in Chromium the two Playwright behaviors that the grader's font abort relies on.
 * @input Chromium, from VIBE_EVAL_CHROMIUM or Playwright's own install
 * @output exit 0 when both behaviors hold; a failed assertion that names the change otherwise
 * @position Run with `pnpm -F @astryxdesign/vibe-tests eval:playwright-pins`; grade.test.mjs tests the grader itself with a browser double
 */

import assert from 'node:assert/strict';
import {ALREADY_HANDLED, firstLine, isAlreadyHandled, launchBrowser} from './grade.mjs';

// Each route answers or aborts in its handler, so no request leaves the browser.
const ADDRESS = 'https://docs.example.com/route-abort';

const CLOSES = {
  page: ({page}) => page.close(),
  context: ({context}) => context.close(),
  browser: ({browser}) => browser.close(),
};

/** The error a promise rejects with, or undefined when it resolves. */
const rejection = promise => promise.then(
  () => undefined,
  error => error,
);

/** Answers a route, then aborts it in the same handler; resolves to the error of each, or undefined. */
async function abortAnsweredRoute() {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    let settle;
    const handled = new Promise(resolve => (settle = resolve));
    await page.route(ADDRESS, async route => {
      const fulfillError = await rejection(route.fulfill({contentType: 'text/html', body: '<p>answered</p>'}));
      settle({fulfillError, abortError: await rejection(route.abort())});
    });
    await page.goto(ADDRESS);
    return await handled;
  } finally {
    await browser.close();
  }
}

/**
 * Closes the page, its context or the browser in a route handler, then aborts
 * that route. Resolves to the error of the close and of the abort, or
 * undefined, and to the error of the navigation that the close ends.
 */
async function abortAfterClosing(closed) {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    let settle;
    const handled = new Promise(resolve => (settle = resolve));
    await page.route(ADDRESS, async route => {
      const closeError = await rejection(CLOSES[closed]({browser, context, page}));
      settle({closeError, abortError: await rejection(route.abort())});
    });
    const navigation = rejection(page.goto(ADDRESS));
    const {closeError, abortError} = await handled;
    return {closeError, abortError, navigationError: await navigation};
  } finally {
    if (closed !== 'browser') await browser.close();
  }
}

const {fulfillError, abortError: refusal} = await abortAnsweredRoute();
assert.ok(fulfillError === undefined, `route.fulfill() failed, so the answered-route case did not run: ${firstLine(fulfillError)}`);
assert.ok(refusal !== undefined, 'route.abort() on an answered route now resolves. The grader expects a refusal there.');
assert.ok(
  isAlreadyHandled(refusal),
  `Playwright's refusal for an answered route no longer starts with "${ALREADY_HANDLED}": ${firstLine(refusal)}`,
);

for (const closed of Object.keys(CLOSES)) {
  const {closeError, abortError, navigationError} = await abortAfterClosing(closed);
  assert.ok(closeError === undefined, `Closing the ${closed} failed, so its case did not run: ${firstLine(closeError)}`);
  assert.ok(abortError === undefined, `route.abort() after its ${closed} closed now fails: ${firstLine(abortError)}`);
  assert.ok(navigationError !== undefined, `page.goto() resolved although its ${closed} closed during the request.`);
  console.log(`After its ${closed} closed: route.abort() resolved, and page.goto() failed: ${firstLine(navigationError)}`);
}

console.log("Playwright's route.abort() behaves as the grader expects: it refuses an answered route, and it resolves after a close.");
