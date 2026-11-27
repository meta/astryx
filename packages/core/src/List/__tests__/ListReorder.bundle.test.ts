// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ListReorder.bundle.test.ts
 * @input List.tsx and ListItem.tsx, and ListReorderHandle.tsx, bundled and
 *   minified by esbuild
 * @output A List without `reorderable` carries none of the reorder handle's
 *   layout: its placement, its reveal, and the room rows keep for it ship
 *   with the reorder machinery, which createReorderable carries
 *   (spec:AST-103 FR2)
 * @position Bundle evidence for packages/core/src/List: every List page
 *   loads List and ListItem, so what they import ships with every list
 */

import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, describe, expect, it} from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const list = path.resolve(here, '..');
const repoRoot = path.resolve(here, '../../../../..');
// Inside the repo so the script resolves `esbuild` by bare specifier, and
// under node_modules so it is ignored and swept with the install.
const workspace = mkdtempSync(
  path.join(repoRoot, 'node_modules', '.astryx-list-reorder-bundle-'),
);
afterAll(() => {
  rmSync(workspace, {recursive: true, force: true});
});

const script = path.join(workspace, 'bundle.mjs');
writeFileSync(
  script,
  [
    "import {build} from 'esbuild';",
    'const [dir, contents] = process.argv.slice(2);',
    'const out = await build({',
    "  stdin: {contents, resolveDir: dir, loader: 'tsx'},",
    "  bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent',",
    "  jsx: 'automatic', external: ['react', 'react-dom', 'react/jsx-runtime'],",
    '});',
    'console.log(JSON.stringify(out.outputFiles[0].text));',
  ].join('\n'),
);

/** The minified bundle of a module that imports `contents`. */
function bundle(contents: string): string {
  return JSON.parse(
    execFileSync(process.execPath, [script, list, contents], {
      encoding: 'utf8',
      timeout: 120_000,
    })
      .trim()
      .split('\n')
      .pop() ?? '""',
  ) as string;
}

/** Names only the reorder handle's layout styles write. */
const LAYOUT_MARKERS = [
  '--_reorder-shown',
  '--_reorder-reach',
  '--_reorder-bleed-start',
];

describe('the reorder handle layout bundle', () => {
  it('ships with the reorder machinery', () => {
    const machinery = bundle(
      "import {reorderRowLayout} from './ListReorderHandle'; console.log(reorderRowLayout);",
    );
    for (const marker of LAYOUT_MARKERS) {
      expect(machinery).toContain(marker);
    }
  });

  it('stays out of a List without reorderable', () => {
    const plain = bundle(
      "import {List} from './List'; import {ListItem} from './ListItem'; console.log(List, ListItem);",
    );
    for (const marker of LAYOUT_MARKERS) {
      expect(plain).not.toContain(marker);
    }
  });
});
