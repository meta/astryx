// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenuTouchLoader.boundary.test.ts
 * @input The static import graphs of the ContextMenu entry and of Table's
 *   context-menu module, and every core source file
 * @output The source boundary check for ContextMenu's touch layer. No entry's
 *   static graph reaches the layer, its recognizer or the gesture code under
 *   it. Only the loader imports the layer, through `import()`.
 * @position Testing; the before-load behavior is in ContextMenu.test.tsx
 */

import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const coreSrc = join(here, '..');

/** The touch modules no ContextMenu entry may import statically. */
const TOUCH_MODULES = [
  'ContextMenu/ContextMenuTouchLayer.tsx',
  'ContextMenu/contextMenuPress.ts',
  'gestures/GestureHost.ts',
  'gestures/GestureArena.ts',
];

/** The source with its comments removed, so prose cannot pass or fail it. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** The relative modules a file imports statically, types left out. */
function staticImports(file: string): string[] {
  const body = code(readFileSync(file, 'utf8'));
  const specifiers = [
    ...body.matchAll(
      /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm,
    ),
  ].map(match => match[1]);
  return specifiers.flatMap(specifier => {
    if (!specifier.startsWith('.')) {
      return [];
    }
    const base = resolve(dirname(file), specifier);
    const found = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      join(base, 'index.ts'),
      join(base, 'index.tsx'),
    ].find(path => existsSync(path) && statSync(path).isFile());
    return found == null ? [] : [found];
  });
}

/** Each touch module the entry reaches, with the chain that brings it. */
function touchChains(entry: string): string[] {
  const start = join(coreSrc, entry);
  const parent = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  const chains: string[] = [];
  while (queue.length > 0) {
    const file = queue.shift()!;
    const name = relative(coreSrc, file);
    if (TOUCH_MODULES.includes(name)) {
      const chain: string[] = [];
      for (let at: string | null = file; at != null; at = parent.get(at)!) {
        chain.unshift(relative(coreSrc, at));
      }
      chains.push(chain.join(' → '));
      continue;
    }
    for (const next of staticImports(file)) {
      if (!parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return chains;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'node_modules') {
        out.push(...sourceFiles(path));
      }
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !/\.(test|spec)\.(ts|tsx)$/.test(name)
    ) {
      out.push(path);
    }
  }
  return out;
}

describe('ContextMenu loads its touch layer after first paint', () => {
  it.each(['ContextMenu/index.ts', 'Table/tableContextMenu.tsx'])(
    '%s reaches no touch module statically',
    entry => {
      expect(touchChains(entry)).toEqual([]);
    },
  );

  it('imports the touch layer only from its loader, through import()', () => {
    const layer = join(coreSrc, 'ContextMenu/ContextMenuTouchLayer.tsx');
    const importers = sourceFiles(coreSrc)
      .filter(file => staticImports(file).includes(layer))
      .map(file => relative(coreSrc, file));
    expect(importers).toEqual([]);
    const loaderPath = join(here, 'contextMenuTouchLoader.ts');
    expect(existsSync(loaderPath)).toBe(true);
    const loader = code(readFileSync(loaderPath, 'utf8'));
    expect(loader).toMatch(/import\(\s*'\.\/ContextMenuTouchLayer'\s*\)/);
  });
});
