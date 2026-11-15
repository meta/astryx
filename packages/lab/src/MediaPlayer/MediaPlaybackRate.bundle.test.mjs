// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MediaPlaybackRate.bundle.test.mjs
 * @input The Lab MediaPlayer entry, bundled with the size report's options
 * @output Proof that a page importing only MediaPlaybackRate loads no
 *   DropdownMenu module, and that MediaPlaybackRateMenu does
 * @position Size check for the two speed parts
 *   (`architecture:component-import-boundaries` INV10). esbuild runs in a
 *   child process, outside the test's DOM environment
 */

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '../../../..');
const ENTRY = path.join(import.meta.dirname, 'index.ts');

// Prints the source files that a page importing one export loads eagerly.
const BUILD = `
const path = require('node:path');
const [repo, entry, name] = process.argv.slice(1);
const {reachableChunks, sizeBuildOptions} = require(
  path.join(repo, '.github/scripts/lib/component-size.js'),
);
const esbuild = require(require.resolve('esbuild', {paths: [repo]}));
const result = esbuild.buildSync({
  ...sizeBuildOptions(repo),
  conditions: ['source'],
  external: ['react', 'react-dom', 'react/jsx-runtime', '@stylexjs/stylex'],
  stdin: {
    contents: 'export {' + name + '} from ' + JSON.stringify(entry) + ';',
    resolveDir: path.dirname(entry),
    sourcefile: '__media-rate-page__.mjs',
    loader: 'js',
  },
});
const outputs = result.metafile.outputs;
const entryOutput = Object.keys(outputs).find(key =>
  (outputs[key].entryPoint || '').endsWith('__media-rate-page__.mjs'),
);
const modules = [];
for (const key of reachableChunks(outputs, entryOutput, ['import-statement'])) {
  for (const [file, input] of Object.entries(outputs[key].inputs)) {
    if (input.bytesInOutput > 0) modules.push(file);
  }
}
process.stdout.write(JSON.stringify(modules));
`;

function eagerModules(exportName) {
  const run = spawnSync(
    process.execPath,
    ['-e', BUILD, REPO, ENTRY, exportName],
    {encoding: 'utf8'},
  );
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout);
}

const isDropdownMenu = file => file.includes('/core/src/DropdownMenu/');

describe('the speed parts and DropdownMenu', () => {
  it('a page with only MediaPlaybackRate loads no DropdownMenu module', () => {
    expect(eagerModules('MediaPlaybackRate').filter(isDropdownMenu)).toEqual(
      [],
    );
  });

  it('a page with MediaPlaybackRateMenu loads DropdownMenu', () => {
    expect(eagerModules('MediaPlaybackRateMenu').some(isDropdownMenu)).toBe(
      true,
    );
  });
});
