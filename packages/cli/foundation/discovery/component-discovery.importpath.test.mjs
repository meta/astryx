// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Verifies that `.ts`-authored sources (hooks and other functions) are
 * found by `findComponentSource`, so `resolveImportPath` derives a
 * tree-shakeable subpath instead of falling back to the bare package root.
 *
 * Runs against the real packages/core source, not mocks.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {withListingCache} from '../fs/listing-cache.mjs';
import {
  findComponentSource,
  resolveImportPath,
} from './component-discovery.mjs';
import {findCoreDir} from '../fs/paths.mjs';

describe('findComponentSource resolves .ts-authored sources', () => {
  const coreDir = findCoreDir();

  it('finds a hook authored as a .ts file (not just .tsx)', () => {
    const src = findComponentSource(coreDir, 'useMediaQuery');
    expect(src).toBeTruthy();
    expect(src.endsWith('useMediaQuery.ts')).toBe(true);
  });

  it('still finds a component authored as .tsx', () => {
    const src = findComponentSource(coreDir, 'Button');
    expect(src).toBeTruthy();
    expect(src.endsWith('.tsx')).toBe(true);
  });
});

describe('resolveImportPath reproduces authored hook importPaths', () => {
  const coreDir = findCoreDir();

  // Representative sample of core hooks whose sources are `.ts` files. Before
  // the `.ts` fix these fell back to bare `@astryxdesign/core`; the derived
  // subpath must now match the value each hook's doc currently authors.
  const cases = [
    ['useMediaQuery', '@astryxdesign/core/hooks'],
    ['useResizable', '@astryxdesign/core/Resizable'],
    ['useTheme', '@astryxdesign/core/theme'],
    ['useFocusTrap', '@astryxdesign/core/hooks'],
    ['useOverflow', '@astryxdesign/core/hooks'],
  ];

  for (const [name, expected] of cases) {
    it(`${name} derives ${expected}`, () => {
      expect(resolveImportPath(coreDir, name)).toBe(expected);
    });
  }

  it('never falls back to the bare package root for a .ts hook', () => {
    for (const [name] of cases) {
      expect(resolveImportPath(coreDir, name)).not.toBe('@astryxdesign/core');
    }
  });
});

describe('findComponentSource inside an operation', () => {
  const coreDir = findCoreDir();

  it('finds every Core component and hook as outside one', () => {
    /** @type {Set<string>} */
    const names = new Set();
    /** @param {string} dir */
    const visit = dir => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isDirectory()) {
          visit(path.join(dir, entry.name));
          // A folder's name is also a lookup: nested folders are found by it.
          names.add(entry.name);
          continue;
        }
        const stem = /^(?:XDS)?(.+)\.tsx?$/.exec(entry.name)?.[1];
        if (stem) names.add(stem);
      }
    };
    visit(path.join(coreDir, 'src'));
    const sorted = [...names].sort();
    expect(sorted.length).toBeGreaterThan(200);
    const outside = sorted.map(name => findComponentSource(coreDir, name));
    const inside = withListingCache(() =>
      sorted.map(name => findComponentSource(coreDir, name)),
    );
    expect(inside).toEqual(outside);
  });

  it('takes the first parent folder in listing order that holds the name', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nested-source-'));
    try {
      for (const parent of ['Alpha', 'Beta']) {
        fs.mkdirSync(path.join(root, 'src', parent, 'Panel'), {
          recursive: true,
        });
        fs.writeFileSync(
          path.join(root, 'src', parent, 'Panel', 'Panel.tsx'),
          'export function Panel() {}\n',
        );
      }
      const outside = findComponentSource(root, 'Panel');
      expect(withListingCache(() => findComponentSource(root, 'Panel'))).toBe(
        outside,
      );
      expect(outside).toBe(
        path.join(
          root,
          'src',
          fs.readdirSync(path.join(root, 'src'))[0],
          'Panel',
          'Panel.tsx',
        ),
      );
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
