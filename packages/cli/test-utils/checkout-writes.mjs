// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a node-project run wrote into the checkout, which no test may
 *   touch: every fixture lives in a temp folder.
 * @input The checkout's root.
 * @output `checkoutState(root)`: the checkout's changed and new files under
 *   packages/ as git lists them (ignored files left out), or null when the
 *   root is no git work tree; `writtenSince(before, after)`: the entries a
 *   run added.
 * @position Used by vitest.global-setup.node.mjs: its teardown fails the run
 *   when a test wrote into the checkout (a fixture written through a link
 *   to a package of the workspace).
 */

import {execFileSync} from 'node:child_process';

/**
 * @param {string} root
 * @returns {Set<string> | null}
 */
export function checkoutState(root) {
  try {
    const out = execFileSync(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all', '--', 'packages'],
      {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']},
    );
    return new Set(out.split('\n').filter(Boolean));
  } catch {
    return null;
  }
}

/**
 * @param {Set<string> | null} before
 * @param {Set<string> | null} after
 * @returns {string[]}
 */
export function writtenSince(before, after) {
  if (!before || !after) return [];
  return [...after].filter(x => !before.has(x));
}
