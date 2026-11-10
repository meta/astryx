// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollLock.shared.test.ts
 * @input Two loads of useScrollLock and its modules, as the package and a
 *   swizzled copy each carry one
 * @output Proves the page stays locked while a lock from either load holds,
 *   and comes back to its own style after the last release
 * @position Shared-state tests for useScrollLock.ts and rootScrollStyles.ts
 *   (spec:AST-110 FR3)
 */

import {cleanup, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type * as RootStylesModule from './rootScrollStyles';
import type * as ScrollLockModule from './useScrollLock';

/** One load of the scroll-lock modules, as the package or a copy has. */
async function load(): Promise<{
  useScrollLock: typeof ScrollLockModule.useScrollLock;
  isScrollLockActive: typeof RootStylesModule.isScrollLockActive;
}> {
  vi.resetModules();
  const {useScrollLock} = await import('./useScrollLock');
  const {isScrollLockActive} = await import('./rootScrollStyles');
  return {useScrollLock, isScrollLockActive};
}

afterEach(async () => {
  cleanup();
  (await import('../utils/sharedRealm')).resetSharedStateForTest('hooks/');
  vi.resetModules();
  document.documentElement.style.overflow = '';
});

describe('a scroll lock shared by the package and a swizzled copy', () => {
  it('keeps the page locked while the other load still holds a lock', async () => {
    const pkg = await load();
    const copy = await load();
    const pkgLock = renderHook(() => pkg.useScrollLock(true));
    const copyLock = renderHook(() => copy.useScrollLock(true));
    expect(document.documentElement.style.overflow).toBe('hidden');

    pkgLock.unmount();
    // The copy's overlay is still open, so the page must stay locked.
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(pkg.isScrollLockActive()).toBe(true);

    copyLock.unmount();
    expect(document.documentElement.style.overflow).toBe('');
    expect(copy.isScrollLockActive()).toBe(false);
  });

  it("restores the page's own overflow after the last release, in either order", async () => {
    document.documentElement.style.overflow = 'auto';
    const pkg = await load();
    const copy = await load();
    const copyLock = renderHook(() => copy.useScrollLock(true));
    const pkgLock = renderHook(() => pkg.useScrollLock(true));
    copyLock.unmount();
    expect(document.documentElement.style.overflow).toBe('hidden');
    pkgLock.unmount();
    expect(document.documentElement.style.overflow).toBe('auto');
  });
});
