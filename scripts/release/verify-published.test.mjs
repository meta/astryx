// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, expect, it} from 'vitest';
import {comparePackageTrees} from './verify-published.mjs';

/**
 * Every package tree below lives here, removed once the tests finish. It is
 * made in beforeAll, not when the module loads: Vitest skips both hooks when a
 * run filters out every test here.
 */
let TEMP_ROOT = '';
beforeAll(() => {
  TEMP_ROOT = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-verify-published-test-'),
  );
});
afterAll(() => {
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

function tree(entries) {
  const root = fs.mkdtempSync(path.join(TEMP_ROOT, 'astryx-package-parity-'));
  for (const [file, contents] of Object.entries(entries)) {
    const absolute = path.join(root, file);
    fs.mkdirSync(path.dirname(absolute), {recursive: true});
    fs.writeFileSync(absolute, contents);
  }
  return root;
}

it('accepts byte-identical package trees', () => {
  const local = tree({'package.json': '{}\n', 'dist/index.js': 'export {};\n'});
  const published = tree({
    'package.json': '{}\n',
    'dist/index.js': 'export {};\n',
  });
  expect(comparePackageTrees(local, published)).toEqual([]);
});

it('reports missing, unexpected, and changed package bytes', () => {
  const local = tree({
    'package.json': '{}\n',
    'dist/index.js': 'local\n',
    'dist/only-local.js': 'local\n',
  });
  const published = tree({
    'package.json': '{}\n',
    'dist/index.js': 'published\n',
    'dist/only-published.js': 'published\n',
  });
  expect(comparePackageTrees(local, published)).toEqual([
    'published package differs at dist/index.js',
    'published package is missing dist/only-local.js',
    'published package has unexpected dist/only-published.js',
  ]);
});

it('ignores package.json object-key insertion order only', () => {
  const local = tree({
    'package.json': JSON.stringify({
      name: '@astryxdesign/core',
      devDependencies: {react: '19.2.7', cli: '0.6.5'},
    }),
  });
  const published = tree({
    'package.json': JSON.stringify({
      devDependencies: {cli: '0.6.5', react: '19.2.7'},
      name: '@astryxdesign/core',
    }),
  });
  expect(comparePackageTrees(local, published)).toEqual([]);
});

it('still rejects package.json value and array-order changes', () => {
  const local = tree({
    'package.json': JSON.stringify({files: ['dist', 'src'], version: '0.6.5'}),
  });
  const published = tree({
    'package.json': JSON.stringify({files: ['src', 'dist'], version: '0.6.4'}),
  });
  expect(comparePackageTrees(local, published)).toEqual([
    'published package differs at package.json',
  ]);
});
