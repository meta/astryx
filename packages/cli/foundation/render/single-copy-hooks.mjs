// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Module resolve hooks for a render outside a project: every ES module
 * the page loads, a library in the page's folder included, takes React,
 * React DOM and StyleX from the package set the CLI runs from, so the page
 * runs on one copy of each. CommonJS goes through the same rule in
 * page-worker.mjs.
 *
 * @input `initialize` data: `parent`, the URL to resolve from (the served
 *   Core's package.json), and `names`, the packages to take from there.
 * @output A `resolve` hook.
 * @position foundation/render — registered by page-worker.mjs.
 */

/** @type {string} */
let parent = '';
/** @type {string[]} */
let names = [];

/**
 * @param {{parent: string, names: string[]}} data
 */
export function initialize(data) {
  parent = data.parent;
  names = data.names;
}

/**
 * @param {string} specifier
 * @param {{parentURL?: string}} context
 * @param {(specifier: string, context?: object) => Promise<unknown>} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  const named = names.some(name => specifier === name || specifier.startsWith(`${name}/`));
  if (named) {
    try {
      return await nextResolve(specifier, {...context, parentURL: parent});
    } catch {
      // The set has no such file: the importer's own copy serves.
    }
  }
  return nextResolve(specifier, context);
}
