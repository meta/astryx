// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * The stored docs routes are the same on every machine that packs the same
 * files, however its Node resolves module imports.
 */

import nodeModule from 'node:module';
import {describe, expect, it} from 'vitest';
import {docsRoutesText} from './generate-docs-routes.mjs';

/** Whether this Node lets a generator keep resolution out of its record. */
const hasModuleHooks =
  typeof (/** @type {any} */ (nodeModule).registerHooks) === 'function';

/**
 * The stored text, made with NODE_OPTIONS set to `options` for the run that
 * works the routes out.
 * @param {string | undefined} options
 * @returns {string}
 */
function routesWith(options) {
  const before = process.env.NODE_OPTIONS;
  if (options === undefined) delete process.env.NODE_OPTIONS;
  else process.env.NODE_OPTIONS = options;
  try {
    return docsRoutesText();
  } finally {
    if (before === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = before;
  }
}

describe.runIf(hasModuleHooks)('stored docs routes', () => {
  it('do not depend on how Node resolves module imports', () => {
    // With --preserve-symlinks, Node resolves imports without looking up
    // real paths, as some Node builds do: a folder that holds only modules
    // must be stored, or left out, the same way either way.
    const plain = routesWith(undefined);
    const preserved = routesWith('--preserve-symlinks');
    const plainRoutes = JSON.parse(plain).routes;
    const preservedRoutes = JSON.parse(preserved).routes;
    expect(plainRoutes.value.length).toBeGreaterThan(0);
    const onlyIn = (
      /** @type {{inputs: object}} */ one,
      /** @type {{inputs: object}} */ other,
    ) => Object.keys(one.inputs).filter(key => !(key in other.inputs));
    expect(onlyIn(plainRoutes, preservedRoutes)).toEqual([]);
    expect(onlyIn(preservedRoutes, plainRoutes)).toEqual([]);
    expect(preserved === plain).toBe(true);
  }, 180_000);
});
