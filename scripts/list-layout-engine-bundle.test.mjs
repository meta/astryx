// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file list-layout-engine-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 *   (.github/scripts/lib/component-size.js)
 * @output Pins that a List given no `animatedLayout` handle loads no layout
 *   engine: an import of List or CheckboxList carries no
 *   `motion/animatedLayout`, and an app that creates a handle with
 *   `useAnimatedLayout` carries it
 * @position Node test over source, so it needs no build
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');

const ENGINE = 'packages/core/src/motion/animatedLayout.ts';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-list-engine-'));
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/**
 * The bytes each source module puts in what an import of `name` from
 * `entry` loads at once. That is the entry chunk and every chunk it imports
 * statically. It also counts the bytes in the chunks the import loads only
 * through import(). It builds as the size report builds a component import.
 */
function importOf(imports, name) {
  const entryFile = path.join(scratch, `${name}.mjs`);
  fs.writeFileSync(
    entryFile,
    imports
      .map(
        ([exported, entry]) =>
          `export {${exported}} from ${JSON.stringify(path.join(REPO, entry))};`,
      )
      .join('\n'),
  );
  const result = esbuild.buildSync({
    absWorkingDir: REPO,
    entryPoints: [entryFile],
    outdir: path.join(scratch, `out-${name}`),
    bundle: true,
    splitting: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    define: {'process.env.NODE_ENV': '"production"'},
    loader: {'.css': 'empty'},
    external: [
      'react',
      'react/*',
      'react-dom',
      'react-dom/*',
      '@stylexjs/stylex',
    ],
    metafile: true,
    write: false,
    logLevel: 'silent',
  });
  const outputs = result.metafile.outputs;
  const entryOutput = Object.keys(outputs).find(
    key => outputs[key].entryPoint != null,
  );
  const eager = new Set();
  const pending = [entryOutput];
  while (pending.length > 0) {
    const key = pending.pop();
    if (eager.has(key)) {
      continue;
    }
    eager.add(key);
    for (const {path: imported, kind} of outputs[key].imports) {
      if (kind === 'import-statement' && outputs[imported] != null) {
        pending.push(imported);
      }
    }
  }
  const bytesIn = keys => {
    const bytes = {};
    for (const key of keys) {
      for (const [input, {bytesInOutput}] of Object.entries(
        outputs[key].inputs,
      )) {
        bytes[input] = (bytes[input] ?? 0) + bytesInOutput;
      }
    }
    return bytes;
  };
  const onDemand = Object.keys(outputs).filter(
    key => !eager.has(key) && !key.endsWith('.map'),
  );
  return {eager: bytesIn(eager), onDemand: bytesIn(onDemand)};
}

describe('a List given no animatedLayout handle', () => {
  it.each([
    ['List', 'packages/core/src/List/List.tsx'],
    ['CheckboxList', 'packages/core/src/CheckboxList/CheckboxList.tsx'],
  ])('an import of %s carries no layout engine', (name, entry) => {
    const {eager} = importOf([[name, entry]], name);
    expect(eager[ENGINE] ?? 0).toBe(0);
  });

  it('an app that creates a handle carries the layout engine', () => {
    const {eager} = importOf(
      [
        ['List', 'packages/core/src/List/List.tsx'],
        ['useAnimatedLayout', 'packages/core/src/hooks/useAnimatedLayout.ts'],
      ],
      'ListWithHandle',
    );
    expect(eager[ENGINE] ?? 0).toBeGreaterThan(0);
  });
});
