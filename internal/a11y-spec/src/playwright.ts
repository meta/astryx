// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playwright.ts
 * @input Uses @playwright/test and .github/scripts/lib/offline-media.js
 * @output `test`: Playwright's base test with hermetic browser contexts, and
 *   every other export of @playwright/test unchanged. `keepRequestsLocal`:
 *   the same network rule for a context the spec makes from its own browser.
 * @position The one base test for the browser specs that playwright.config.ts
 *   and playwright.interaction.config.ts run. Specs import `test` from here,
 *   not from @playwright/test; a lint rule enforces it.
 *
 * In a hermetic context, a remote image gets a local stand-in and any other
 * remote request fails at once. Requests to the loopback host pass: the
 * Storybook and fixture servers of the specs listen there.
 */

import {
  test as base,
  type Browser,
  type BrowserContext,
} from '@playwright/test';
import {routeRemoteImages} from '../../../.github/scripts/lib/offline-media.js';

export * from '@playwright/test';

/** Makes `context` hermetic. Await it before the first navigation. */
export async function keepRequestsLocal(
  context: BrowserContext,
): Promise<void> {
  await routeRemoteImages(context, undefined, {abortOther: true});
}

/**
 * Every context starts from `browser.newContext`: the `context` and `page`
 * fixtures, `browser.newPage`, and a spec's own call. So the rule is set at
 * that one point, once per worker. A browser that the spec launches itself is
 * a different `Browser`: call `keepRequestsLocal` on each of its contexts.
 */
function makeContextsHermetic(browser: Browser): void {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext(options);
    await keepRequestsLocal(context);
    return context;
  };
}

export const test = base.extend({
  browser: [
    async ({browser}, use) => {
      makeContextsHermetic(browser);
      await use(browser);
    },
    {scope: 'worker'},
  ],
});
