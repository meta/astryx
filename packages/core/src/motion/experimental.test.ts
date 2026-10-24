// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file experimental.test.ts
 * @input The `@astryxdesign/core/motion/experimental` entry, the package
 *   root, the hooks and utils subpaths, and package.json's exports map
 * @output Proof that the experimental motion surface is exported where
 *   spec:AST-017 FR21 puts it and nowhere else
 * @position Testing for /packages/core/src/motion/experimental.ts
 */

import {describe, expect, it} from 'vitest';
import pkg from '../../package.json';
import * as hooks from '../hooks';
import * as root from '../index';
import * as utils from '../utils';
import * as motion from './experimental';

const NAMES = [
  'animatorFor',
  'createAnimator',
  'useAnimator',
  'toSpring',
  'solveSpring',
  'rubberBand',
  'rubberBandInverse',
  'cubicBezier',
  'prefersReducedMotion',
  'resolveMotion',
  'uikit',
] as const;

describe('@astryxdesign/core/motion/experimental', () => {
  it('exports the motion surface', () => {
    for (const name of NAMES) {
      expect(motion[name], name).toBeDefined();
    }
    expect(motion.uikit.springs).toBeDefined();
    expect(motion.uikit.scroll.decelerationRate).toBeDefined();
    expect(motion.uikit.timing.curves).toBeDefined();
    expect(motion.uikit.navigation).toBeDefined();
    expect(motion.uikit.UIKIT_GESTURES.tap.allowableMovement).toBeDefined();
  });

  it('reads the Reduce Motion preference the animator uses', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
    const prefer = (reduce: boolean) =>
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: reduce && query === '(prefers-reduced-motion: reduce)',
          media: query,
        }),
      });
    try {
      prefer(true);
      expect(motion.prefersReducedMotion()).toBe(true);
      prefer(false);
      expect(motion.prefersReducedMotion()).toBe(false);
    } finally {
      if (original == null) {
        Reflect.deleteProperty(window, 'matchMedia');
      } else {
        Object.defineProperty(window, 'matchMedia', original);
      }
    }
  });

  it('is a subpath of its own, never re-exported from the root or an ordinary subpath', () => {
    expect(pkg.exports['./motion/experimental']).toMatchObject({
      source: './src/motion/experimental.ts',
    });
    for (const name of NAMES) {
      expect(name in root, `root re-exports ${name}`).toBe(false);
      expect(name in hooks, `hooks re-exports ${name}`).toBe(false);
      expect(name in utils, `utils re-exports ${name}`).toBe(false);
    }
  });
});
