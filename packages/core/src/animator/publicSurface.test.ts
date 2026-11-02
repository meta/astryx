// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file publicSurface.test.ts
 * @input The package root, the hooks barrel, Core's package.json
 * @output Checks `spec:AST-107` FR4 and FR6 for the animator: the package
 *   root hands out `createAnimator`, and only the root (no subpath of its
 *   own, one API with one entry), the hooks barrel hands out
 *   `useAnimator` and nothing of the motion module beneath, and no internal
 *   factory takes the public factory's name
 * @position Public API test; enforced by Vitest and Core typecheck
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import * as root from '..';
import * as hooks from '../hooks';

const SRC = path.join(__dirname, '..');

/** Names of the motion module beneath the public animator. */
const INTERNAL = [
  'createMotionAnimator',
  'createAttachableAnimator',
  'animatorFor',
  'coast',
  'resolveMotion',
  'registerSpringsTable',
  'springs',
];

describe('the public animator surface', () => {
  it('the package root exports createAnimator, and nothing of the motion module', () => {
    expect(typeof root.createAnimator).toBe('function');
    for (const name of INTERNAL) {
      expect(root).not.toHaveProperty(name);
    }
  });

  it('the hooks barrel exports useAnimator, and nothing of the motion module', () => {
    expect(typeof hooks.useAnimator).toBe('function');
    for (const name of INTERNAL) {
      expect(hooks).not.toHaveProperty(name);
    }
  });

  it('the package root names createAnimator and re-exports no motion or gesture module whole', () => {
    const source = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
    expect(source).toContain("from './animator/createAnimator';");
    // A public factory may be named from its module, as createPanGesture is
    // from gestures/; the runtime case above keeps the internals out.
    expect(source).not.toMatch(/export \* from '\.\/(motion|gestures)(\/|')/);
  });

  it('createAnimator ships from the package root only: no `./animator` subpath (one API, one entry)', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'),
    ) as {exports: Record<string, unknown>};
    expect(Object.keys(pkg.exports)).not.toContain('./animator');
    expect(fs.existsSync(path.join(__dirname, 'index.ts'))).toBe(false);
  });

  it('no internal factory takes the public factory\u2019s name', () => {
    const motion = fs.readFileSync(
      path.join(SRC, 'motion', 'animator.ts'),
      'utf8',
    );
    expect(motion).not.toMatch(/export function createAnimator\b/);
    expect(motion).toMatch(/export function createMotionAnimator\b/);
  });
});
