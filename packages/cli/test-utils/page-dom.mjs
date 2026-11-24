// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A rendered page opened in JSDOM with its scripts run as a browser
 * runs them. JSDOM runs classic scripts but not module scripts, and a
 * rendered page's script is an inline module: this runs each inline module
 * once the document is parsed (readyState interactive, before
 * DOMContentLoaded), as a function body with no `this` at its top level,
 * and reports what it throws as the window's `error` event, as a browser
 * does. It does not give a module's strict-mode semantics: JSDOM's eval lets
 * through what strict mode refuses, such as a write to an undeclared name.
 * Tests only; a rendered file never holds this.
 *
 * @position test-utils — used by the render tests that run a page's script
 */

import {JSDOM} from 'jsdom';
import {vi} from 'vitest';

/**
 * The page in JSDOM, once its module scripts have run.
 * @param {string} html
 * @param {import('jsdom').ConstructorOptions} [options]
 * @returns {Promise<JSDOM>}
 */
export function pageDom(html, options = {}) {
  const dom = new JSDOM(html, {runScripts: 'dangerously', pretendToBeVisual: true, ...options});
  const {window} = dom;
  const {document} = window;
  const runModules = () => {
    for (const script of document.querySelectorAll('script[type="module"]:not([src])')) {
      try {
        window.eval(`(function () {'use strict';\n${script.textContent}\n}).call(undefined);`);
      } catch (error) {
        window.dispatchEvent(new window.ErrorEvent('error', {error, message: String(/** @type {any} */ (error)?.message ?? error)}));
      }
    }
  };
  // A browser runs a page's module scripts once the document is parsed:
  // readyState is 'interactive' and DOMContentLoaded has not fired yet.
  if (document.readyState !== 'loading') {
    runModules();
    return Promise.resolve(dom);
  }
  return new Promise(resolve => {
    document.addEventListener('readystatechange', function ready() {
      if (document.readyState !== 'interactive') return;
      document.removeEventListener('readystatechange', ready);
      runModules();
      resolve(dom);
    });
  });
}

/**
 * Resolves once React has drawn the page: an element in it carries React's
 * props. React draws after the module script runs, so a test that acts on
 * the page waits for this.
 * @param {JSDOM} dom
 * @returns {Promise<void>}
 */
export async function pageDrawn(dom) {
  await pageWaitFor(() => {
    const drawn = [...dom.window.document.querySelectorAll('body *')].some(el =>
      Object.keys(el).some(key => key.startsWith('__reactProps$')),
    );
    if (!drawn) throw new Error('React has not drawn the page');
  });
}

/**
 * How long a page test waits for a value the page produces. A loaded CI
 * machine can take longer than Vitest's 1 s default.
 */
export const PAGE_WAIT = {timeout: 10_000, interval: 10};

/**
 * Runs `check` until it stops throwing, as `vi.waitFor` does, for as long as
 * {@link PAGE_WAIT} allows.
 * @template T
 * @param {() => T} check
 * @returns {Promise<T>}
 */
export function pageWaitFor(check) {
  return vi.waitFor(check, PAGE_WAIT);
}

/**
 * Resolves after every task the page has queued with no delay so far, such
 * as a decision the page defers with `setTimeout(fn)`. Timers of the same
 * delay run in the order they were set, so this is an order, not a wait for
 * time; a test that reads something React draws waits for it with
 * `vi.waitFor` instead.
 * @param {JSDOM} dom
 * @returns {Promise<void>}
 */
export function pageTasks(dom) {
  return new Promise(resolve => dom.window.setTimeout(resolve, 0));
}
