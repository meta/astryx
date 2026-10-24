// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file experimental.test.ts
 * @input The `@astryxdesign/core/gestures/experimental` entry, the package
 *   root, the hooks and utils subpaths, and package.json's exports map
 * @output Proof that the experimental gesture surface is exported where
 *   spec:AST-017 FR21 puts it and nowhere else, and that the internal
 *   gestures barrel has no subpath
 * @position Testing for /packages/core/src/gestures/experimental.ts
 */

import {describe, expect, it} from 'vitest';
import pkg from '../../package.json';
import * as hooks from '../hooks';
import * as root from '../index';
import * as utils from '../utils';
import * as gestures from './experimental';

const NAMES = [
  'GestureRecognizer',
  'TapGestureRecognizer',
  'LongPressGestureRecognizer',
  'PanGestureRecognizer',
  'ScreenEdgePanGestureRecognizer',
  'SwipeGestureRecognizer',
  'PinchGestureRecognizer',
  'RotationGestureRecognizer',
  'HoverGestureRecognizer',
  'useGestureRecognizer',
  'usePressTracker',
  'PressTracker',
  'PRESS_PROFILES',
  'useTouchPresentation',
  'readTouchPresentation',
  'playHaptic',
] as const;

describe('@astryxdesign/core/gestures/experimental', () => {
  it('exports the gesture surface', () => {
    for (const name of NAMES) {
      expect(gestures[name], name).toBeDefined();
    }
    // A lab component can subclass a recognizer.
    class NonClaimingPan extends gestures.PanGestureRecognizer {}
    expect(new NonClaimingPan()).toBeInstanceOf(gestures.GestureRecognizer);
  });

  it('is a subpath of its own, never re-exported from the root or an ordinary subpath', () => {
    expect(pkg.exports['./gestures/experimental']).toMatchObject({
      source: './src/gestures/experimental.ts',
    });
    expect('./gestures' in pkg.exports).toBe(false);
    for (const name of NAMES) {
      expect(name in root, `root re-exports ${name}`).toBe(false);
      expect(name in hooks, `hooks re-exports ${name}`).toBe(false);
      expect(name in utils, `utils re-exports ${name}`).toBe(false);
    }
  });
});
