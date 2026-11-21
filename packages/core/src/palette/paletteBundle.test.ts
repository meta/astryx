// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paletteBundle.test.ts
 * @input An app that defines a theme without a palette, and one with one,
 *   bundled and minified by esbuild from Core's source
 * @output Proof that an app without a palette ships no palette generator or
 *   mapping code, and that the check sees the code when an app does use it
 * @position Bundle evidence for the opt-in palette entry
 */

import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, describe, expect, it} from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..');
const repoRoot = path.resolve(src, '../../..');
// Inside the repo so the script resolves `esbuild` by bare specifier, and
// under node_modules so it is ignored and swept with the install.
const workspace = mkdtempSync(
  path.join(repoRoot, 'node_modules', '.astryx-palette-bundle-'),
);
afterAll(() => {
  rmSync(workspace, {recursive: true, force: true});
});

/** Text only the palette generator and mapping hold. */
const MARKERS = [
  'astryx-oklch-v1',
  'Unknown palette recipe',
  'the accent tint',
  'is not a palette key',
];

const script = path.join(workspace, 'bundle.mjs');
writeFileSync(
  script,
  [
    "import {build} from 'esbuild';",
    'const [dir] = process.argv.slice(2);',
    'async function bundle(contents) {',
    '  const out = await build({',
    "    stdin: {contents, resolveDir: dir, loader: 'ts'},",
    "    bundle: true, minify: true, format: 'esm', write: false, logLevel: 'silent',",
    "    platform: 'neutral', external: ['react', 'react/*', 'react-dom', '@stylexjs/stylex'],",
    '  });',
    '  return out.outputFiles[0].text;',
    '}',
    "const without = await bundle(\"import {defineTheme} from './theme/index'; console.log(defineTheme({name: 'app'}));\");",
    "const withPalette = await bundle(\"import {defineTheme} from './theme/index'; import {themePalette} from './palette/index'; console.log(defineTheme({name: 'app', palette: themePalette({accent: '#5b3cc4'})}));\");",
    `const markers = ${JSON.stringify(MARKERS)};`,
    'console.log(JSON.stringify({',
    '  without: markers.filter(m => without.includes(m)),',
    '  withPalette: markers.filter(m => withPalette.includes(m)),',
    '}));',
  ].join('\n'),
);

describe('the palette entry', () => {
  const result = JSON.parse(
    execFileSync(process.execPath, [script, src], {encoding: 'utf8'}),
  ) as {without: string[]; withPalette: string[]};

  it('ships nothing to an app that defines a theme without a palette', () => {
    expect(result.without).toEqual([]);
  });

  it('is found by the same check in an app that uses a palette', () => {
    expect(result.withPalette).toEqual(MARKERS);
  });
});
