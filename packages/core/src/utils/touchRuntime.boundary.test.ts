// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchRuntime.boundary.test.ts
 * @input The static import graphs of the SegmentedControl, Switch and
 *   BottomSheet entries, and every core source file
 * @output The source boundary check for `architecture:react-component-runtime`
 *   INV13's shared touch loader: no entry's static graph reaches the animator
 *   or the gesture host, and only the loader imports the runtime module
 * @position Testing; the loader's timing is in touchRuntime.test.tsx
 */

import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const coreSrc = join(here, '..');

/** The touch modules no component may import statically. */
const TOUCH_MODULES = ['motion/animator.ts', 'gestures/GestureHost.ts'];

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

describe('architecture:react-component-runtime INV13 shared touch loader', () => {
  it.each([
    'SegmentedControl/index.ts',
    'Switch/index.ts',
    'BottomSheet/index.ts',
    'Toast/index.ts',
    'Popover/index.ts',
  ])('%s reaches no touch module statically', entry => {
    expect(touchChains(entry)).toEqual([]);
  });

  it('loads the runtime module only from the loader, through import()', () => {
    const importers = sourceFiles(coreSrc)
      .filter(file =>
        /['"]\.{1,2}\/(?:utils\/)?touchRuntimeModules['"]/.test(
          code(readFileSync(file, 'utf8')),
        ),
      )
      .map(file => relative(coreSrc, file));
    expect(importers).toEqual(['utils/touchRuntime.ts']);
    const loader = code(readFileSync(join(here, 'touchRuntime.ts'), 'utf8'));
    expect(loader).toMatch(/import\(\s*'\.\/touchRuntimeModules'\s*\)/);
    expect(loader).not.toMatch(
      /^\s*import\s+(?!type\b)[^;]*['"]\.\/touchRuntimeModules['"]/m,
    );
  });
});
