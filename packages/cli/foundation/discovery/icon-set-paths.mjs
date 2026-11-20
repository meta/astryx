// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file icon-set-paths.mjs
 * @input A generated icon module's path
 * @output generatedTypesPath: the declaration file beside it
 * @position packages/cli/foundation/discovery: a path helper with no imports,
 *   so the contribution inventory reads it without icon-set-writer.mjs and
 *   that module's parser and manifest writer. icon-set-writer.mjs re-exports it.
 */

/**
 * The declaration file beside a generated module (`x.generated.js` →
 * `x.generated.d.ts`, `.mjs` → `.d.mts`); null for a TypeScript module.
 * @param {string} generated
 * @returns {string | null}
 */
export function generatedTypesPath(generated) {
  if (/\.m?tsx?$/u.test(generated)) return null;
  if (generated.endsWith('.mjs')) return generated.replace(/\.mjs$/u, '.d.mts');
  if (generated.endsWith('.cjs')) return generated.replace(/\.cjs$/u, '.d.cts');
  return generated.replace(/\.jsx?$/u, '.d.ts');
}
