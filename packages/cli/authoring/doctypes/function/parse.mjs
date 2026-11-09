// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Function doc parser (stamped `type: 'function'`). Hooks and CLI/API
 * functions share the discriminant and the sealed schema, so this delegates to
 * the same validator as `parseHook`. Consumers call `parseFunction` or use
 * `parseDoc`.
 *
 * This is a wrapper rather than `export {parseHook as parseFunction}` on
 * purpose: a bare re-export publishes `parseHook`'s narrower `HookDoc` return
 * type under the general name. `label` is forwarded untouched so `parseHook`'s
 * own default still supplies the message prefix.
 */

import {parseHook} from '../hook/parse.mjs';

/** @typedef {import('../types.js').FunctionDoc} FunctionDoc */

/**
 * Validate an unknown value as a stamped function doc, or throw.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {FunctionDoc}
 */
export function parseFunction(input, label) {
  return /** @type {FunctionDoc} */ (
    /** @type {unknown} */ (parseHook(input, label))
  );
}
