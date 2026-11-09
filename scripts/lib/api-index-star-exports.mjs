// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Star re-exports in the CLI's public API entry.
 *
 * `packages/cli/api/index.mjs` names every runtime export, so the structure
 * guard can check each one against its CommandDoc and FunctionDoc and keep
 * internal helpers out of the public API. A star re-export of a runtime module,
 * or a namespace import of one that the entry can re-export by name, would
 * publish everything that module exports past both checks, so only type modules
 * (`*.type.mjs`) may be star exported or namespace imported.
 */

/**
 * The module specifiers of every `export * from`, `export * as name from`, and
 * `import * as name from` in `source` whose target is not a `*.type.mjs`
 * module, in source order. Comments are ignored.
 * @param {string} source contents of packages/cli/api/index.mjs
 * @returns {string[]}
 */
export function runtimeStarExports(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  /** @type {string[]} */
  const offenders = [];
  for (const match of code.matchAll(
    /(?:export\s*\*\s*(?:as\s+[\w$]+\s+)?|import\s*\*\s*as\s+[\w$]+\s+)from\s*['"]([^'"]+)['"]/g,
  )) {
    const modulePath = match[1].split(/[?#]/)[0];
    if (!modulePath.endsWith('.type.mjs')) offenders.push(match[1]);
  }
  return offenders;
}
