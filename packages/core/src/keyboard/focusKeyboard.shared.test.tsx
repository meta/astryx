// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusKeyboard.shared.test.tsx
 * @input Two loads of the focus-trap and keyboard modules, as the package and
 *   a swizzled copy each carry one
 * @output Proves both loads see one set of focus traps, one keyboard layout
 *   guide per window, and one set of keyboard targets
 * @position Shared-state tests for useFocusTrap.ts and the keyboard modules
 *   (spec:AST-110 FR3)
 */

import {cleanup, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of a module, as the package or a copy has. */
async function load<T>(importModule: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return importModule();
}

afterEach(async () => {
  cleanup();
  (await import('../utils/sharedRealm')).resetSharedStateForTest('keyboard/');
  (await import('../utils/sharedRealm')).resetSharedStateForTest('hooks/');
  vi.resetModules();
});

describe('focus traps and the keyboard, shared by the package and a copy', () => {
  it("reports a copy's active Escape trap to the package", async () => {
    const pkg = await load(async () => import('../hooks/useFocusTrap'));
    const copy = await load(async () => import('../hooks/useFocusTrap'));
    const trap = renderHook(() =>
      copy.useFocusTrapEscapeCompatibilitySignal(true),
    );
    expect(pkg.hasActiveFocusTrapEscape()).toBe(true);
    trap.unmount();
    expect(pkg.hasActiveFocusTrapEscape()).toBe(false);
  });

  it('gives both loads one keyboard layout guide per window', async () => {
    const pkg = await load(async () => import('./keyboardLayoutGuide'));
    const copy = await load(async () => import('./keyboardLayoutGuide'));
    expect(copy.getKeyboardLayoutGuide(window)).toBe(
      pkg.getKeyboardLayoutGuide(window),
    );
  });

  it('recognizes a keyboard target a copy registered', async () => {
    const pkg = await load(async () => import('./keyboardTarget'));
    const copy = await load(async () => import('./keyboardTarget'));
    const target = document.createElement('div');
    const field = document.createElement('input');
    target.append(field);
    document.body.append(target);
    const release = copy.registerKeyboardTarget(target);
    expect(pkg.isInsideKeyboardTarget(field)).toBe(true);
    release();
    target.remove();
  });
});
