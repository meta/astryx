// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A docs read of a mistyped topic or namespace that no doc shares a
 * word with suggests every topic and namespace, the one a slip away first
 * (spec:AST-046 FR6). Runs against the real CLI-bundled docs.
 */

import {describe, expect, it} from 'vitest';
import {docs} from './docs.mjs';

const SLOW = 30_000;

/**
 * The names a failed docs read suggests.
 * @param {string} typed
 * @returns {Promise<string[]>}
 */
async function suggested(typed) {
  const error = await docs(typed).catch(e => e);
  expect(error.code).toBe('ERR_UNKNOWN_TOPIC');
  return error.suggestions.map(
    (/** @type {{name: string}} */ suggestion) => suggestion.name,
  );
}

describe('docs() for a mistyped topic or namespace', () => {
  it(
    'lists the namespace or topic one slip away first, the rest in browse order',
    async () => {
      const browse = await suggested('zzzz-nope');
      for (const [typed, meant] of [
        ['tokns', 'tokens'],
        ['colr', 'color'],
      ]) {
        expect(browse).toContain(meant);
        expect(await suggested(typed)).toEqual([
          meant,
          ...browse.filter(name => name !== meant),
        ]);
      }
    },
    SLOW,
  );
});
