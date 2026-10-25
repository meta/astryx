// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableImports.test.ts
 * @input Core's source files and their relative runtime imports
 * @output Fails when a component's import graph reaches a motion table it
 *   only reaches through a barrel or a namespace object, when anything imports
 *   a table as a namespace object, or when a shared module imports a table
 *   that belongs to one component
 * @position Keeps a page to the motion tables it animates with: a namespace
 *   object (`export * as uikit`) keeps every table, every register function
 *   and the role registry in the bundle of anything that reads one table.
 */

import {existsSync, readdirSync, readFileSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

/** The tables every touch module may share: the animator and gestures read them. */
const SHARED_TABLES = new Set([
  'motion/uikit/gestures.ts',
  'motion/uikit/navigation.ts',
  'motion/uikit/scroll.ts',
  'motion/uikit/springs.ts',
  'motion/uikit/timing.ts',
]);

const BARREL = 'motion/uikit/index.ts';

/** A source file of the package, not a test, story or fixture. */
function isSource(path: string): boolean {
  return (
    /\.(ts|tsx)$/.test(path) &&
    !path.endsWith('.d.ts') &&
    !/(\.test|\.spec|\.stories|\.test-violations)\.tsx?$/.test(path) &&
    !/(^|\/)__tests__\//.test(path)
  );
}

/** A table: a data module directly under motion/uikit, not the barrel. */
function isTable(path: string): boolean {
  return (
    /^motion\/uikit\/[^/]+\.ts$/.test(path) &&
    path !== BARREL &&
    isSource(path) &&
    !path.endsWith('.generated.ts')
  );
}

/** The component a file belongs to (a PascalCase top-level directory), or null. */
function componentOf(path: string): string | null {
  const top = path.split('/')[0] ?? '';
  return path.includes('/') && /^[A-Z]/.test(top) ? top : null;
}

interface Edge {
  readonly to: string;
  readonly namespace: boolean;
}

const IMPORT =
  /(?:^|[\s;])(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const DYNAMIC = /import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
const BARE = /(?:^|[\s;])import\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** The runtime edges of one file; type-only imports load nothing. */
function edgesOf(
  path: string,
  source: string,
  resolveSpecifier: (from: string, specifier: string) => string | null,
): Edge[] {
  const edges: Edge[] = [];
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const match of text.matchAll(IMPORT)) {
    const [, , typeOnly, clause = '', specifier = ''] = match;
    if (typeOnly != null) {
      continue;
    }
    const named = /^\{([\s\S]*)\}$/.exec(clause.trim());
    if (
      named != null &&
      (named[1] ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .every(part => part.startsWith('type '))
    ) {
      continue;
    }
    const to = resolveSpecifier(path, specifier);
    if (to != null) {
      edges.push({to, namespace: /\*\s+as\s+\w+/.test(clause)});
    }
  }
  for (const pattern of [DYNAMIC, BARE]) {
    for (const match of text.matchAll(pattern)) {
      const to = resolveSpecifier(path, match[1] ?? '');
      if (to != null) {
        edges.push({to, namespace: false});
      }
    }
  }
  return edges;
}

/**
 * Every leak in a package, given its source files by path (relative to the
 * package's src directory). Pure, so the rule can be checked on a made-up
 * package too.
 */
function findTableLeaks(files: ReadonlyMap<string, string>): string[] {
  const resolveSpecifier = (from: string, specifier: string): string | null => {
    const base = join(dirname(from), specifier).replace(/\\/g, '/');
    const stem = base.replace(/\.js$/, '');
    for (const candidate of [
      base,
      `${stem}.ts`,
      `${stem}.tsx`,
      `${stem}/index.ts`,
      `${stem}/index.tsx`,
    ]) {
      if (files.has(candidate)) {
        return candidate;
      }
    }
    return null;
  };
  const graph = new Map<string, Edge[]>();
  for (const [path, source] of files) {
    if (isSource(path)) {
      graph.set(path, edgesOf(path, source, resolveSpecifier));
    }
  }

  const leaks: string[] = [];
  for (const [path, edges] of graph) {
    for (const edge of edges) {
      if (edge.namespace && (isTable(edge.to) || edge.to === BARREL)) {
        leaks.push(
          `${path} imports ${edge.to} as a namespace object, which keeps every table it reaches; import the tables by name`,
        );
      }
      if (
        isTable(edge.to) &&
        !SHARED_TABLES.has(edge.to) &&
        componentOf(path) == null &&
        path !== BARREL
      ) {
        leaks.push(
          `${path} (shared code) imports ${edge.to}, a component's table; import it in that component's touch module`,
        );
      }
    }
  }

  const entries = [...graph.keys()].filter(path =>
    /^[A-Z][^/]*\/index\.tsx?$/.test(path),
  );
  for (const entry of entries) {
    const reached = new Set<string>([entry]);
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      for (const edge of graph.get(file) ?? []) {
        if (!reached.has(edge.to)) {
          reached.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    for (const table of reached) {
      if (!isTable(table) || SHARED_TABLES.has(table)) {
        continue;
      }
      // Reached the way a page needs it: some component file this entry
      // loads imports the table itself.
      const direct = [...reached].some(
        file =>
          componentOf(file) != null &&
          (graph.get(file) ?? []).some(edge => edge.to === table),
      );
      if (!direct) {
        leaks.push(
          `${entry} reaches ${table} only through a barrel or shared module; a component's table must be imported by the component that animates with it`,
        );
      }
    }
  }
  return leaks;
}

function readPackage(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) {
        continue;
      }
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(name)) {
        files.set(
          relative(root, full).replace(/\\/g, '/'),
          readFileSync(full, 'utf8'),
        );
      }
    }
  };
  walk(root);
  return files;
}

describe('motion table imports', () => {
  const src = resolve(__dirname, '../..');

  it('core imports each motion table by name, from the component that animates with it', () => {
    expect(existsSync(join(src, BARREL))).toBe(true);
    expect(findTableLeaks(readPackage(src))).toEqual([]);
  });

  it('catches a table reached through the barrel, a namespace object or shared code', () => {
    const files = new Map([
      [
        'motion/uikit/index.ts',
        "export {springs} from './springs';\nexport {refresh} from './refresh';\n",
      ],
      ['motion/uikit/springs.ts', 'export const springs = {};\n'],
      ['motion/uikit/refresh.ts', 'export const refresh = {};\n'],
      ['motion/uikit/wheel.ts', 'export const wheel = {};\n'],
      [
        'Refresh/index.ts',
        "import {refresh} from '../motion/uikit/refresh';\nexport {refresh};\n",
      ],
      [
        'Button/index.ts',
        "import {springs} from '../motion/uikit';\nexport {springs};\n",
      ],
      [
        'Picker/index.ts',
        "import * as uikit from '../motion/uikit';\nimport type {Wheel} from '../motion/uikit/wheel';\nexport const p = uikit;\n",
      ],
      [
        'motion/animator.ts',
        "import {wheel} from './uikit/wheel';\nexport {wheel};\n",
      ],
      [
        'Sheet/index.ts',
        "import {wheel} from '../motion/animator';\nexport {wheel};\n",
      ],
    ]);
    const leaks = findTableLeaks(files);
    // The barrel re-exports a component's table, so Button reaches it.
    expect(
      leaks.some(leak =>
        leak.startsWith('Button/index.ts reaches motion/uikit/refresh.ts'),
      ),
    ).toBe(true);
    // A namespace object, and everything it keeps.
    expect(
      leaks.some(leak =>
        leak.startsWith(
          'Picker/index.ts imports motion/uikit/index.ts as a namespace object',
        ),
      ),
    ).toBe(true);
    expect(
      leaks.some(leak =>
        leak.startsWith('Picker/index.ts reaches motion/uikit/refresh.ts'),
      ),
    ).toBe(true);
    // Shared code importing one component's table, and what that leaks.
    expect(
      leaks.some(leak =>
        leak.startsWith(
          'motion/animator.ts (shared code) imports motion/uikit/wheel.ts',
        ),
      ),
    ).toBe(true);
    expect(
      leaks.some(leak =>
        leak.startsWith('Sheet/index.ts reaches motion/uikit/wheel.ts'),
      ),
    ).toBe(true);
    // The owner reaching its own table directly is fine; a type import loads nothing.
    expect(leaks.some(leak => leak.startsWith('Refresh/index.ts'))).toBe(false);
    expect(
      leaks.some(leak =>
        leak.includes('Picker/index.ts reaches motion/uikit/wheel.ts'),
      ),
    ).toBe(false);
  });
});
