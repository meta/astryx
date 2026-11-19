// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MediaMarkerPopover.bundle.test.mjs
 * @input The Lab MediaPlayer entry, bundled with the size report's options
 * @output Proof that a page with the timeline or a preset loads no Popover
 *   component up front: a marker's popover loads on demand
 * @position Size check for an optional feature
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

// The Popover component and its surface. The speed menu still loads up front
// and brings the shared usePopover hook, which is not counted here.
const isPopover = file => file.endsWith('/core/src/Popover/Popover.tsx');

describe('the marker popover loads on demand', () => {
  for (const page of ['MediaTimeSlider', 'VideoPlayer', 'AudioPlayer']) {
    it(`a page with ${page} loads no Popover component up front`, () => {
      expect(modulesOf(page).eager.filter(isPopover)).toEqual([]);
    });
  }

  it('the marker popover still loads when a marker opens', () => {
    expect(modulesOf('MediaTimeSlider').all.some(isPopover)).toBe(true);
  });
});
