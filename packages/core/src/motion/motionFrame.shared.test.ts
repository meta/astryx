// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motionFrame.shared.test.ts
 * @input Two loads of the motion modules, as the package and a swizzled copy
 *   each carry one
 * @output Proves both loads read one layout-change start per frame, pin
 *   spinners in one batch, and see one gesture sync
 * @position Shared-state tests for animatedLayout.ts, spinnerRotor.ts and
 *   gestureSync.ts (spec:AST-110 FR3)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {LATE_START_MS} from './frameBlock';

/** One load of a module, as the package or a copy has. */
async function load<T>(importModule: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return importModule();
}

function setTimeline(currentTime: number): void {
  Object.defineProperty(document, 'timeline', {
    configurable: true,
    value: {currentTime},
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  const realm = await import('../utils/sharedRealm');
  realm.resetSharedStateForTest('motion/');
  realm.resetSharedStateForTest('spinner/');
  realm.resetSharedStateForTest('gestures/');
  vi.resetModules();
});

describe('the motion frame, shared by the package and a swizzled copy', () => {
  it("starts a copy's layout change at the package's start in one frame", async () => {
    const pkg = await load(async () => import('./animatedLayout'));
    const copy = await load(async () => import('./animatedLayout'));
    setTimeline(1000);
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const start = pkg.layoutStartFor(document);
    // A block runs past the frame before the copy's change reads its start.
    now.mockReturnValue(1000 + LATE_START_MS + 50);
    expect(copy.layoutStartFor(document)).toBe(start);
  });

  it('pins the rotors of both loads in one frame', async () => {
    const pkg = await load(async () => import('../Spinner/spinnerRotor'));
    const copy = await load(async () => import('../Spinner/spinnerRotor'));
    const frame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1);
    const rotor = () =>
      Object.assign(document.createElement('div'), {
        getAnimations: () => [],
      });
    pkg.syncRotationPhase(rotor());
    copy.syncRotationPhase(rotor());
    expect(frame).toHaveBeenCalledTimes(1);
  });

  it("sees a copy's gesture sync from the package", async () => {
    const pkg = await load(async () => import('../gestures/gestureSync'));
    const copy = await load(async () => import('../gestures/gestureSync'));
    expect(copy.syncingGestures(() => pkg.isSyncingGestures())).toBe(true);
    expect(pkg.isSyncingGestures()).toBe(false);
  });
});
