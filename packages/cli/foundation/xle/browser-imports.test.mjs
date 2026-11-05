// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * `@astryxdesign/cli/xle` (browser.mjs) runs in browsers: nothing it imports,
 * directly or through other modules, may load a Node built-in.
 */

import {describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ENTRY = path.join(import.meta.dirname, 'browser.mjs');

/** Every module specifier a file imports or re-exports, static or dynamic. */
const SPECIFIER =
  /(?:\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bexport\s*[\w*{}\s,$]+\s*from\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/gu;

/**
 * The files `entry` reaches through relative imports, with the bare and
 * `node:` specifiers each one names.
 * @param {string} entry
 * @returns {Map<string, string[]>}
 */
function importGraph(entry) {
  /** @type {Map<string, string[]>} */
  const graph = new Map();
  const queue = [entry];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop());
    if (graph.has(file)) continue;
    // Comments hold JSDoc type imports (`import('./x').T`), which load nothing.
    const source = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//gu, '')
      .replace(/^\s*\/\/.*$/gmu, '');
    /** @type {string[]} */
    const external = [];
    for (const [, spec] of source.matchAll(SPECIFIER)) {
      if (spec.startsWith('.')) {
        queue.push(path.resolve(path.dirname(file), spec));
      } else {
        external.push(spec);
      }
    }
    graph.set(file, external);
  }
  return graph;
}

describe('the xle browser export', () => {
  it('reaches no Node built-in and no AsyncLocalStorage', () => {
    const graph = importGraph(ENTRY);
    // The walk reaches the parser, validator and expander.
    expect(graph.size).toBeGreaterThan(3);
    const builtins = [...graph].flatMap(([file, specs]) =>
      specs
        .filter(
          spec =>
            spec.startsWith('node:') ||
            /^(?:fs|path|os|child_process|async_hooks|url)$/u.test(spec),
        )
        .map(
          spec => `${path.relative(import.meta.dirname, file)} imports ${spec}`,
        ),
    );
    expect(builtins).toEqual([]);
    const storage = [...graph.keys()]
      .filter(file =>
        fs.readFileSync(file, 'utf8').includes('AsyncLocalStorage'),
      )
      .map(file => path.relative(import.meta.dirname, file));
    expect(storage).toEqual([]);
  });
});
