// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MediaPlayerLazyParts.bundle.test.mjs
 * @input The Lab MediaPlayer entry, bundled with the size report's options
 * @output Proof that a page with the media parts or presets loads no
 *   DropdownMenu or Popover module up front: the speed menu and a marker's
 *   popover load on demand
 * @position Size check for two optional features
 *   (`architecture:component-import-boundaries` INV10). esbuild runs in a
 *   child process, outside the test's DOM environment
 */

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '../../../..');
const ENTRY = path.join(import.meta.dirname, 'index.ts');

// Prints the source files that a page importing one export loads up front,
// and those it can load on demand.
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
    sourcefile: '__media-page__.mjs',
    loader: 'js',
  },
});
const outputs = result.metafile.outputs;
const entryOutput = Object.keys(outputs).find(key =>
  (outputs[key].entryPoint || '').endsWith('__media-page__.mjs'),
);
const modulesOf = keys => {
  const modules = [];
  for (const key of keys) {
    for (const [file, input] of Object.entries(outputs[key].inputs)) {
      if (input.bytesInOutput > 0) modules.push(file);
    }
  }
  return modules;
};
const eager = modulesOf(
  reachableChunks(outputs, entryOutput, ['import-statement']),
);
const all = modulesOf(
  reachableChunks(outputs, entryOutput, ['import-statement', 'dynamic-import']),
);
process.stdout.write(JSON.stringify({eager, all}));
`;

function modulesOf(exportName) {
  const run = spawnSync(
    process.execPath,
    ['-e', BUILD, REPO, ENTRY, exportName],
    {encoding: 'utf8'},
  );
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout);
}

const isDropdownMenu = file => file.includes('/core/src/DropdownMenu/');
const isPopover = file => file.includes('/core/src/Popover/');

describe('the speed menu and the marker popover load on demand', () => {
  for (const page of [
    'MediaPlaybackRate',
    'MediaTimeSlider',
    'VideoPlayer',
    'AudioPlayer',
  ]) {
    it(`a page with ${page} loads no DropdownMenu or Popover module up front`, () => {
      const {eager} = modulesOf(page);
      expect(eager.filter(isDropdownMenu)).toEqual([]);
      expect(eager.filter(isPopover)).toEqual([]);
    });
  }

  it('the speed menu and the marker popover still load when needed', () => {
    expect(modulesOf('MediaPlaybackRate').all.some(isDropdownMenu)).toBe(true);
    expect(modulesOf('MediaTimeSlider').all.some(isPopover)).toBe(true);
  });
});
