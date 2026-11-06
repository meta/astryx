// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file snap-paging-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 * @output Proves snap paging's module boundary. Carousel alone bundles no
 *   pager code, and Carousel with `useSnapPaging` does. Importing the
 *   snap-paging module does no DOM work
 * @position Node test over source, so it needs no build
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
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
    'motion/(animator|paging|presentation|projection|reducedMotionPlan|resolveMotion|resolveSnapPoint|roleValue|rubberBand|spring|themeTempo)\\.ts',
    'motion/uikit/(gestures|paging|scroll)\\.ts',
    'Layer/inputHold\\.ts',
    'utils/(clickGuard|isApplePlatform|primaryClick|selectionLock)\\.ts',
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

  it('imports with no DOM: a server import does no DOM work', async () => {
    expect(typeof globalThis.document).toBe('undefined');
    const module = await import('../packages/core/src/SnapPaging/index.ts');
    expect(Object.keys(module)).toEqual(['useSnapPaging']);
  });
});
