// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motion-node-load.test.mjs
 *
 * The touch motion foundation loads in plain Node, without React, the theme or
 * a StyleX compile: Node-side specs and browser proofs bundle it with esbuild
 * and import it as is. A module in its graph that calls StyleX at load (a
 * theme's `defineVars`) throws there, so the foundation must reach no StyleX
 * module. This bundles it the way such a spec does, with every package left as
 * a real Node import, checks the graph, and imports it in a child Node process
 * (no Vite transform).
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {describe, expect, it} from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreSrc = path.join(root, 'packages/core/src');

/**
 * What a Node-side spec imports from the foundation: the motion modules, and
 * each gesture recognizer by its own module (the gestures barrel also carries
 * the press paint's styles).
 */
const ENTRY = `
export {createAnimator, animatorFor, SETTLE_THRESHOLD} from './motion/animator';
export {reducedMotionFade} from './motion/reducedMotion';
export {resolveMotion} from './motion/resolveMotion';
export {solveSpring, toSpring} from './motion/spring';
export {registerSpringsTable, springs} from './motion/uikit/springs';
export {registerTimingTable, timing} from './motion/uikit/timing';
export {registerScrollTable, scroll} from './motion/uikit/scroll';
export {GestureRecognizer} from './gestures/GestureRecognizer';
export {TapGestureRecognizer} from './gestures/TapGestureRecognizer';
export {LongPressGestureRecognizer} from './gestures/LongPressGestureRecognizer';
export {PanGestureRecognizer} from './gestures/PanGestureRecognizer';
export {ScreenEdgePanGestureRecognizer} from './gestures/ScreenEdgePanGestureRecognizer';
export {SwipeGestureRecognizer} from './gestures/SwipeGestureRecognizer';
export {PinchGestureRecognizer} from './gestures/PinchGestureRecognizer';
`;

async function bundleFoundation() {
  return build({
    stdin: {contents: ENTRY, resolveDir: coreSrc, loader: 'ts'},
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    // A package stays a real Node import, as in a spec: @stylexjs/stylex
    // would run its runtime, which throws on an uncompiled call.
    packages: 'external',
    // Every module runs as it would loaded one by one (a spec runner does
    // not tree-shake), so a call at load in an unused module still runs.
    treeShaking: false,
    metafile: true,
    logLevel: 'silent',
  });
}

describe('the touch motion foundation in plain Node', () => {
  it('reaches no StyleX module and no theme module', async () => {
    const {metafile} = await bundleFoundation();
    const inputs = Object.keys(metafile.inputs);
    const stylex = inputs.filter(file => /\.stylex\.[cm]?[jt]sx?$/.test(file));
    const theme = inputs.filter(file => file.includes('/src/theme/'));
    const stylexImports = inputs.flatMap(file =>
      metafile.inputs[file].imports
        .filter(entry => entry.path.startsWith('@stylexjs/'))
        .map(entry => `${file} -> ${entry.path}`),
    );
    expect({stylex, theme, stylexImports}).toEqual({
      stylex: [],
      theme: [],
      stylexImports: [],
    });
  });

  it('loads in a child Node process and creates an animator', async () => {
    const result = await bundleFoundation();
    // Beside core, so its packages resolve from core's node_modules.
    const dir = path.join(
      root,
      'packages/core/node_modules/.cache/motion-node-load',
    );
    fs.mkdirSync(dir, {recursive: true});
    const file = path.join(dir, `foundation-${process.pid}.mjs`);
    fs.writeFileSync(file, result.outputFiles[0].text);
    try {
      const out = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `const m = await import(${JSON.stringify(pathToFileURL(file).href)});
           m.registerSpringsTable();
           const animator = m.createAnimator(null);
           const pan = new m.PanGestureRecognizer({});
           console.log(JSON.stringify({
             createAnimator: typeof m.createAnimator,
             set: typeof animator.set,
             sheet: m.springs.sheetPresent != null,
             pan: typeof pan.state,
           }));`,
        ],
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']},
      );
      expect(JSON.parse(out.trim().split('\n').at(-1))).toEqual({
        createAnimator: 'function',
        set: 'function',
        sheet: true,
        pan: 'string',
      });
    } finally {
      fs.rmSync(file, {force: true});
    }
  });
});
