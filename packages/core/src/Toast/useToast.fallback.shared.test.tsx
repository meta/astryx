// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useToast.fallback.shared.test.tsx
 * @input Two loads of useToast with no LayerProvider, as the package and a
 *   swizzled copy each carry one
 * @output Proves both loads add their toasts to one fallback viewport
 * @position Shared-state test for useToast.tsx's fallback (spec:AST-110 FR3)
 */

import {act, renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of useToast, as the package or a copy has. */
async function load() {
  vi.resetModules();
  return import('./useToast');
}

afterEach(async () => {
  (await import('../utils/sharedRealm')).resetSharedStateForTest('react/');
  for (const container of document.querySelectorAll(
    '[data-astryx-toast-fallback]',
  )) {
    container.remove();
  }
  vi.resetModules();
});

describe('the toast fallback shared by the package and a swizzled copy', () => {
  it('mounts one fallback viewport for toasts from two loads', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pkg = await load();
    const copy = await load();
    const showPkg = renderHook(() => pkg.useToast()).result.current;
    const showCopy = renderHook(() => copy.useToast()).result.current;
    act(() => {
      showPkg({body: 'Saved'});
      showCopy({body: 'Synced'});
    });
    // Two fallback containers would give the page two toast stacks.
    expect(
      document.querySelectorAll('[data-astryx-toast-fallback]'),
    ).toHaveLength(1);
  });
});
