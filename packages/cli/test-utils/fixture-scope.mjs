// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fixtures one test made, kept apart from every other test's while
 * tests run side by side.
 * @input A test body that {@link inFixtureScope} runs.
 * @output The scope's own lists of temp folders, placed CLI copies and private
 *   computers, which the fixture builders fill and its teardown empties.
 * @position Test support for packages/cli/test-utils/release-fixtures.mjs,
 *   global-local-fixtures.mjs and test/global-local.shared.mjs. A test that
 *   runs alone uses their module lists, emptied after each test.
 */

import {AsyncLocalStorage} from 'node:async_hooks';

/**
 * @typedef {{made: string[], placed: any[], computers: any[]}} FixtureLists
 */

/** @type {AsyncLocalStorage<FixtureLists>} */
const scope = new AsyncLocalStorage();

/**
 * Run `fn` with lists of its own: every fixture it makes, including after
 * an await, goes on them and on no other test's.
 * @template T
 * @param {FixtureLists} lists
 * @param {() => T} fn
 * @returns {T}
 */
export function inFixtureScope(lists, fn) {
  return scope.run(lists, fn);
}

/**
 * The running scope's list `name`, or `fallback` outside any scope.
 * @template T
 * @param {keyof FixtureLists} name
 * @param {T[]} fallback
 * @returns {T[]}
 */
export function scopedList(name, fallback) {
  return scope.getStore()?.[name] ?? fallback;
}
