// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every `@astryxdesign/core` import the CLI teaches must work in an app.
 *
 * The CLI prints code in its docs and in command output (`init` next steps,
 * `theme add`, `theme build`, doctor fixes, `build` help). A specifier that
 * names a subpath Core does not export, or names it with the wrong case, fails
 * in the user's app, so every specifier must match an entry in Core's
 * package.json `exports`. Wherever command output shows the `<Theme>` wrapper,
 * it also shows that `Theme` comes from `@astryxdesign/core/theme`, the path
 * `astryx component Theme` prints, and so does every doc page that shows it.
 *
 * @position packages/cli/test — taught imports
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

const CLI = path.resolve(import.meta.dirname, '..');
const CORE_PACKAGE = path.resolve(CLI, '..', 'core', 'package.json');

/** Command modules whose printed text shows app code. */
const OUTPUT_MODULES = [
  'api/init/run/run.mjs',
  'clients/cli/commands/theme.mjs',
  'api/theme/build/build.mjs',
  'api/doctor/theme-checks.mjs',
  'api/build/help/help.mjs',
];

/** @param {string} dir @returns {string[]} */
function docFiles(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...docFiles(file));
    else if (entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs')) {
      files.push(file);
    }
  }
  return files;
}

/**
 * Whether `subpath` (e.g. `./theme`) is exported by Core, matching export
 * keys exactly and `*` patterns the way Node does: case-sensitive, with `*`
 * standing for any string.
 * @param {string[]} keys
 * @param {string} subpath
 */
function isExported(keys, subpath) {
  return keys.some(key => {
    if (!key.includes('*')) return key === subpath;
    const [before, after] = key.split('*');
    return (
      subpath.length > before.length + after.length &&
      subpath.startsWith(before) &&
      subpath.endsWith(after)
    );
  });
}

const THEME_IMPORT = /\{\s*Theme\s*\}\s+from\s+'@astryxdesign\/core\/theme'/;

/**
 * Every code block (`{type: 'code', code}`) reachable from a doc module.
 * @param {unknown} value
 * @param {string[]} [found]
 * @returns {string[]}
 */
function codeBlocks(value, found = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return found;
  seen.add(value);
  const node = /** @type {Record<string, unknown>} */ (value);
  if (node.type === 'code' && typeof node.code === 'string')
    found.push(node.code);
  for (const child of Object.values(node)) codeBlocks(child, found, seen);
  return found;
}

/** @param {string} source */
function coreSpecifiers(source) {
  return [
    ...source.matchAll(
      /(?:from\s+|import\s+|import\(\s*)['"](@astryxdesign\/core(?:\/[^'"\s]*)?)['"]/g,
    ),
  ].map(match => match[1]);
}

describe('taught @astryxdesign/core imports', () => {
  const exportKeys = Object.keys(
    JSON.parse(fs.readFileSync(CORE_PACKAGE, 'utf8')).exports,
  );
  const files = [
    ...docFiles(path.join(CLI, 'assets', 'docs')),
    ...OUTPUT_MODULES.map(file => path.join(CLI, file)),
  ];

  it('resolve against the exports in Core package.json, case included', () => {
    /** @type {string[]} */
    const unresolved = [];
    let count = 0;
    for (const file of files) {
      for (const specifier of coreSpecifiers(fs.readFileSync(file, 'utf8'))) {
        count++;
        const subpath =
          specifier === '@astryxdesign/core'
            ? '.'
            : `./${specifier.slice('@astryxdesign/core/'.length)}`;
        if (!isExported(exportKeys, subpath)) {
          unresolved.push(`${path.relative(CLI, file)}: ${specifier}`);
        }
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(unresolved).toEqual([]);
  });

  it('rejects a subpath Core does not export, or the wrong case', () => {
    expect(isExported(exportKeys, './theme')).toBe(true);
    expect(isExported(exportKeys, './Theme')).toBe(false);
    expect(isExported(exportKeys, './locales/fr-FR.generated.js')).toBe(true);
  });

  it.each(OUTPUT_MODULES)(
    '%s shows where Theme comes from wherever it shows the <Theme> wrapper',
    file => {
      const source = fs.readFileSync(path.join(CLI, file), 'utf8');
      const wrappers = [...source.matchAll(/<Theme theme=/g)].map(
        match => match.index ?? 0,
      );
      expect(wrappers.length).toBeGreaterThan(0);
      wrappers.forEach((index, n) => {
        // Look back from this wrapper, but not past the previous one, so one
        // example's import cannot stand in for another's. A sentence can name
        // the import after the wrapper on the same line.
        const previous = n > 0 ? wrappers[n - 1] + 1 : 0;
        const lineEnd = source.indexOf('\n', index);
        const nearby = source.slice(
          Math.max(previous, index - 400),
          lineEnd === -1 ? source.length : lineEnd,
        );
        expect(nearby, `${file} at offset ${index}`).toMatch(THEME_IMPORT);
      });
    },
  );
  it('every doc page that shows the <Theme> wrapper shows where Theme comes from', () => {
    const pages = docFiles(path.join(CLI, 'assets', 'docs')).filter(file =>
      /<Theme[\s>]/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(pages.length).toBeGreaterThan(0);
    const missing = pages
      .filter(file => !THEME_IMPORT.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(CLI, file));
    expect(missing).toEqual([]);
  });

  it('every doc example with imports and the wrapper imports Theme', async () => {
    /** @type {string[]} */
    const missing = [];
    for (const file of docFiles(path.join(CLI, 'assets', 'docs'))) {
      const blocks = codeBlocks(await import(pathToFileURL(file).href));
      for (const block of blocks) {
        // A continuation snippet (no imports) builds on the page's full example.
        if (!/<Theme theme=/.test(block) || !/^\s*import\s/m.test(block))
          continue;
        if (!THEME_IMPORT.test(block)) {
          missing.push(`${path.relative(CLI, file)}: ${block.split('\n')[0]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
