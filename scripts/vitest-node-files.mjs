// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which files are the Vitest `node` project's tests.
 * @input Repository-relative paths (for example `git ls-files`).
 * @output The include and exclude globs vitest.config.ts gives the `node`
 *   project, and the paths among a list that the project collects.
 * @position vitest.config.ts reads the globs from here, and the Node leg
 *   planner (scripts/vitest-node-legs.mjs) lists the project's files with
 *   them where Vitest is not installed, so both see the same files. It
 *   matches them with the repository's one glob matcher
 *   (.github/scripts/lib/a11y-spec-files.mjs); no dependencies.
 */

import {globToRegExp} from '../.github/scripts/lib/a11y-spec-files.mjs';

export const NODE_TEST_INCLUDE = [
  'packages/**/src/**/*.test.{ts,tsx,mjs}',
  // The CLI dissolved its src/ wrapper (pillars live at the package root),
  // so collect its colocated tests wherever they now live.
  'packages/cli/**/*.test.{ts,tsx,mjs}',
  'internal/**/*.test.{ts,tsx,mjs}',
  'scripts/**/*.test.{ts,tsx,mjs}',
  '.github/scripts/**/*.test.{ts,tsx,mjs}',
  // Storybook config invariants (no DOM needed) — e.g. the workspace
  // source-alias guard in .storybook/main.test.ts.
  'apps/storybook/.storybook/**/*.test.{ts,tsx,mjs}',
  // Sandbox page logic (palette generation, colour maths) — pure modules
  // with no DOM, so they run here rather than in `ui`.
  'apps/sandbox/src/**/*.test.{ts,tsx,mjs}',
];

// Beside Vitest's own default excludes.
export const NODE_TEST_EXCLUDE = [
  'packages/core/**',
  'packages/lab/**',
  'packages/charts/**',
  'packages/richtext/**',
  'packages/vega/**',
];

// CI runs the swizzle proof's slices in legs of their own (ci.yml
// swizzle-proof), so its Node legs leave them out.
export const SWIZZLE_PROOF_SLICES =
  'packages/cli/test/swizzle-proof/swizzle-proof.*.test.mjs';

// Vitest's default excludes (configDefaults.exclude), for a reader without
// Vitest.
export const VITEST_DEFAULT_EXCLUDE = ['**/node_modules/**', '**/.git/**'];

/**
 * The paths among `paths` that the `node` project collects.
 * @param {string[]} paths repository-relative, `/`-separated
 * @param {{swizzleProofOwnJob?: boolean}} [options] as
 *   VITEST_SWIZZLE_PROOF_OWN_JOB=1 sets it
 * @returns {string[]} sorted
 */
export function nodeTestFiles(paths, {swizzleProofOwnJob = false} = {}) {
  const include = NODE_TEST_INCLUDE.map(globToRegExp);
  const exclude = [
    ...VITEST_DEFAULT_EXCLUDE,
    ...NODE_TEST_EXCLUDE,
    ...(swizzleProofOwnJob ? [SWIZZLE_PROOF_SLICES] : []),
  ].map(globToRegExp);
  return [...new Set(paths)]
    .filter(
      file =>
        include.some(glob => glob.test(file)) &&
        !exclude.some(glob => glob.test(file)),
    )
    .sort();
}
