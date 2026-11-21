// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file snap-paging-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 * @output Proves snap paging's module boundary. Carousel alone bundles no
 *   pager code, and Carousel with `useSnapPaging` does. Importing the
 *   snap-paging module does no DOM work
 * @position Node test over source, so it needs no build. The import runs in
 *   a child Node process, so it makes no request to Vitest's main process
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const CORE_SRC = path.join(REPO, 'packages/core/src');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');

/**
 * The pager and the code only it runs on: its gestures, its settle's motion,
 * and the gesture support beside them. Carousel's own parts carry other
 * motion, such as a button's press, which is not the pager's.
 */
const PAGER_CODE = new RegExp(
  `^packages/core/src/(${[
    'hooks/usePager\\.ts',
    'SnapPaging/SnapPaging\\.ts',
    'gestures/',
    'motion/(animator|paging|presentation|progress|projection|reducedMotionPlan|resolveMotion|resolveSnapPoint|roleValue|rubberBand|spring|themeTempo)\\.ts',
    'motion/uikit/(gestures|paging|scroll)\\.ts',
    'Layer/inputHold\\.ts',
    // primaryClick and isApplePlatform are the press controller's too.
    'utils/(clickGuard|selectionLock)\\.ts',
    'privateAttributes/(hapticSwitch|reducedMotion)\\.stylex\\.ts',
  ].join('|')})`,
);

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-snap-paging-'));
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/**
 * The modules that put bytes in one import, built as the size report builds
 * a component import.
 */
function modules(name, source) {
  const entry = path.join(scratch, `${name}.mjs`);
  fs.writeFileSync(entry, source);
  const result = esbuild.buildSync({
    absWorkingDir: REPO,
    entryPoints: [entry],
    outdir: path.join(scratch, 'out'),
    bundle: true,
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
  const [output] = Object.values(result.metafile.outputs);
  return Object.entries(output.inputs)
    .filter(([, {bytesInOutput}]) => bytesInOutput > 0)
    .map(([input]) => input);
}

/** The pager code in one import. */
function build(name, source) {
  return modules(name, source).filter(input => PAGER_CODE.test(input));
}

const from = file => JSON.stringify(path.join(CORE_SRC, file));

describe('snap paging bundle', () => {
  it('Carousel alone bundles no pager code', () => {
    expect(
      build('carousel', `export {Carousel} from ${from('Carousel/index.ts')};`),
    ).toEqual([]);
  });

  it('Carousel with useSnapPaging bundles the pager', () => {
    const pager = build(
      'carousel-paging',
      `export {Carousel} from ${from('Carousel/index.ts')};
export {useSnapPaging} from ${from('SnapPaging/index.ts')};`,
    );
    expect(pager).toContain('packages/core/src/hooks/usePager.ts');
  });

  it('lists every module the hook adds over Carousel alone as pager code', () => {
    const carousel = new Set(
      modules(
        'carousel-only',
        `export {Carousel} from ${from('Carousel/index.ts')};`,
      ),
    );
    const added = modules(
      'carousel-hook',
      `export {Carousel} from ${from('Carousel/index.ts')};
export {useSnapPaging} from ${from('SnapPaging/index.ts')};`,
    ).filter(input => !carousel.has(input));
    expect(added).toContain('packages/core/src/hooks/usePager.ts');
    expect(added.filter(input => !PAGER_CODE.test(input))).toEqual([]);
  });

  it('imports with no DOM: a server import does no DOM work', () => {
    // Vitest transforms each source module of an import in its main process,
    // one request at a time behind every worker's. On a loaded machine, the
    // module's 58 files then take more than the test's 30 s. One esbuild
    // bundle, loaded by a plain Node process, runs the same module code.
    const result = esbuild.buildSync({
      absWorkingDir: REPO,
      entryPoints: [path.join(CORE_SRC, 'SnapPaging/index.ts')],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      // A package stays a real Node import, as in a server import.
      packages: 'external',
      // Every module runs as it does when loaded one by one, so a call at
      // load in an unused module still runs.
      treeShaking: false,
      loader: {'.css': 'empty'},
      logLevel: 'silent',
    });
    // Beside core, so its packages resolve from core's node_modules.
    const dir = path.join(
      REPO,
      'packages/core/node_modules/.cache/snap-paging-bundle',
    );
    fs.mkdirSync(dir, {recursive: true});
    const file = path.join(dir, `server-${process.pid}.mjs`);
    fs.writeFileSync(file, result.outputFiles[0].text);
    try {
      const out = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const module = await import(${JSON.stringify(pathToFileURL(file).href)});
           console.log(JSON.stringify({
             document: typeof globalThis.document,
             exports: Object.keys(module),
           }));`,
        ],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
      );
      expect(JSON.parse(out.trim().split('\n').at(-1))).toEqual({
        document: 'undefined',
        exports: ['useSnapPaging'],
      });
    } finally {
      fs.rmSync(file, {force: true});
    }
  });
});
