// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAppShellMainId.shared.test.tsx
 * @input Two loads of useAppShellMainId, as the package's AppShell and a
 *   swizzled AppShell each carry one
 * @output Proves only one outermost shell on the page keeps the fixed main id
 * @position Shared-state test for useAppShellMainId.ts (spec:AST-110 FR3)
 */

import {renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of the hook, as the package or a copy has. */
async function load() {
  vi.resetModules();
  return import('./useAppShellMainId');
}

afterEach(async () => {
  (await import('../utils/sharedRealm')).resetSharedStateForTest('app-shell/');
  vi.resetModules();
});

describe('main-region ids shared by the package and a swizzled AppShell', () => {
  it('gives the fixed id to one outermost shell only', async () => {
    const pkg = await load();
    const copy = await load();
    const first = renderHook(() => pkg.useAppShellMainId());
    const second = renderHook(() => copy.useAppShellMainId());
    const ids = [first.result.current, second.result.current];
    // Two shells with the fixed id would put a duplicate id on the page.
    expect(ids.filter(id => id === pkg.MAIN_CONTENT_ID)).toHaveLength(1);
    expect(ids[0]).toBe(pkg.MAIN_CONTENT_ID);
    first.unmount();
    second.unmount();
  });
});
