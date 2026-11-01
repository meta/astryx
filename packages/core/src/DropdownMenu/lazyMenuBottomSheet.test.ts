// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file lazyMenuBottomSheet.test.ts
 * @input lazyMenuBottomSheet's action-list preload, with the list's module
 *   failing to load once
 * @output A failed preload is the preload's result, with the loader's error,
 *   never an unhandled rejection, and is not kept: the next load asks the
 *   module loader again
 * @position Unit test of ./lazyMenuBottomSheet; the hydration case is in
 *   DropdownMenu.ssr.test.tsx
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

afterEach(() => {
  vi.doUnmock('./MenuBottomSheetActionList');
  vi.resetModules();
});

describe('preloadMenuBottomSheetActionList', () => {
  it('reports a failed preload in its result, never as an unhandled rejection, and asks the module loader again on the next call', async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock('./MenuBottomSheetActionList', () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('the connection dropped');
      }
      return {MenuBottomSheetActionList: () => null};
    });
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const {preloadMenuBottomSheetActionList} =
        await import('./lazyMenuBottomSheet');
      const failed = await preloadMenuBottomSheetActionList();
      expect(attempts).toBe(1);
      // The failure is the preload's result, with the loader's error.
      expect(failed.isLoaded).toBe(false);
      expect(failed.isLoaded === false ? failed.error : null).toBeInstanceOf(
        Error,
      );
      // An unhandled rejection is reported after the rejecting task's
      // microtasks: give it two macrotasks.
      await new Promise(resolve => setTimeout(resolve, 0));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);

      // The failed load was not kept: the next call asks the loader again.
      expect(await preloadMenuBottomSheetActionList()).toEqual({
        isLoaded: true,
      });
      expect(attempts).toBe(2);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
