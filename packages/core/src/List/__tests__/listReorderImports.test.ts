// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listReorderImports.test.ts
 * @input List's and ListItem's source files and the modules they import
 * @output Checks that a List without `reorderable` loads no reorder code:
 *   the handle, its room styles and the session come only with
 *   createReorderable
 * @position Test for the reorder capability's module boundary
 *   (`architecture:component-import-boundaries` INV7)
 */

import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '../..');

/**
 * The relative modules `file` loads when it runs: its value imports and
 * re-exports, not `import type` / `export type`, not `import()`.
 */
function staticImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const pattern =
    /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm;
  const specifiers: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[1] == null) {
      specifiers.push(match[2]);
    }
  }
  return specifiers;
}

function resolve(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`cannot resolve ${specifier} from ${from}`);
}

/** Every module `entries` load statically, as paths relative to src. */
function staticGraph(...entries: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = entries.map(entry => path.join(SRC, entry));
  while (stack.length > 0) {
    const file = stack.pop() as string;
    const key = path.relative(SRC, file);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    for (const specifier of staticImports(file)) {
      stack.push(resolve(file, specifier));
    }
  }
  return seen;
}

const REORDER_ONLY = [
  'List/ListReorderHandle.tsx',
  'List/listReorderEngine.tsx',
  'List/ListReorderTouch.ts',
  'reorderable/createReorderable.ts',
  'hooks/containerReveal.stylex.ts',
];

describe('a List without reorderable loads no reorder code', () => {
  it('reaches none of the handle, its styles or the session from List and ListItem', () => {
    const graph = staticGraph('List/List.tsx', 'List/ListItem.tsx');
    expect(graph.has('Item/Item.tsx')).toBe(true);
    expect(REORDER_ONLY.filter(file => graph.has(file))).toEqual([]);
  });

  it('finds them from createReorderable (the walk sees them)', () => {
    const graph = staticGraph('reorderable/createReorderable.ts');
    expect(graph.has('List/ListReorderHandle.tsx')).toBe(true);
    expect(graph.has('List/listReorderEngine.tsx')).toBe(true);
  });
});
