// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file core-internal-modules.test.mjs
 *
 * Lab imports core's internal motion and gesture modules by their module
 * paths, which core's `exports` do not list. The workspace apps that bundle
 * Lab's build resolve them with this module to the file core's own components
 * import, so a page keeps one copy of each.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import coreInternalModules from './core-internal-modules.cjs';

const {CORE_INTERNAL_SPECIFIER, resolveCoreInternal} = coreInternalModules;
const coreDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/core',
);

describe('core internal modules', () => {
  it('names the motion, gesture, touch resolver and isRtlElement paths, and nothing core exports', () => {
    for (const specifier of [
      '@astryxdesign/core/motion/animator',
      '@astryxdesign/core/motion/uikit',
      '@astryxdesign/core/motion/uikit/springs',
      '@astryxdesign/core/gestures',
      '@astryxdesign/core/gestures/haptics',
      '@astryxdesign/core/utils/touchPresentation',
      '@astryxdesign/core/hooks/isRtlElement',
    ]) {
      expect(CORE_INTERNAL_SPECIFIER.test(specifier)).toBe(true);
    }
    const exported = Object.keys(
      JSON.parse(fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'))
        .exports,
    ).map(key => `@astryxdesign/core${key.slice(1)}`);
    for (const specifier of [
      '@astryxdesign/core',
      '@astryxdesign/core/utils',
      '@astryxdesign/core/Button',
      '@astryxdesign/core/motionless',
      // Only isRtlElement among the hooks: the rest are the stable barrel's.
      '@astryxdesign/core/hooks/useLongPress',
      '@astryxdesign/core/hooks/isRtlElementFoo',
      ...exported,
    ]) {
      expect(CORE_INTERNAL_SPECIFIER.test(specifier)).toBe(false);
    }
  });

  it('resolves to the source file a source build compiles, as a real path', () => {
    expect(
      resolveCoreInternal('@astryxdesign/core/motion/animator', {
        coreDir,
        source: true,
      }),
    ).toBe(fs.realpathSync(path.join(coreDir, 'src/motion/animator.ts')));
    expect(
      resolveCoreInternal('@astryxdesign/core/gestures', {
        coreDir,
        source: true,
      }),
    ).toBe(fs.realpathSync(path.join(coreDir, 'src/gestures/index.ts')));
    expect(
      resolveCoreInternal('@astryxdesign/core/utils/touchPresentation', {
        coreDir,
        source: true,
      }),
    ).toBe(
      fs.realpathSync(path.join(coreDir, 'src/utils/touchPresentation.ts')),
    );
    expect(
      resolveCoreInternal('@astryxdesign/core/hooks/isRtlElement', {
        coreDir,
        source: true,
      }),
    ).toBe(fs.realpathSync(path.join(coreDir, 'src/hooks/isRtlElement.ts')));
  });

  it('resolves to the built file core\u2019s own components import', () => {
    const built = path.join(coreDir, 'dist/gestures/index.js');
    if (!fs.existsSync(built)) {
      return; // core is not built in this checkout
    }
    expect(resolveCoreInternal('@astryxdesign/core/gestures', {coreDir})).toBe(
      fs.realpathSync(built),
    );
    expect(
      resolveCoreInternal('@astryxdesign/core/motion/animator', {coreDir}),
    ).toBe(fs.realpathSync(path.join(coreDir, 'dist/motion/animator.js')));
  });

  it('answers null for any other specifier or a missing module', () => {
    expect(resolveCoreInternal('@astryxdesign/core/Button', {coreDir})).toBe(
      null,
    );
    expect(
      resolveCoreInternal('@astryxdesign/core/motion/nothingHere', {
        coreDir,
        source: true,
      }),
    ).toBe(null);
  });
});
