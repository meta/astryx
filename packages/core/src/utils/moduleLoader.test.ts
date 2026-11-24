// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file moduleLoader.test.ts
 * @input createModuleLoader with an import that fails once, then loads
 * @output Tests that a failed tryLoad reports the failure and resolves false,
 *   that the next one asks again, and that a completed load tells its
 *   subscribers
 * @position Unit test of utils/moduleLoader
 */

import {describe, expect, it, vi} from 'vitest';
import {createModuleLoader} from './moduleLoader';

describe('createModuleLoader', () => {
  it('reports a failed tryLoad, asks again on the next one, and tells subscribers when it loads', async () => {
    const importModule = vi
      .fn<() => Promise<{value: number}>>()
      .mockRejectedValueOnce(new Error('The network dropped the chunk.'))
      .mockResolvedValue({value: 1});
    const onLoadFailure = vi.fn();
    const loader = createModuleLoader(importModule, {onLoadFailure});
    const listener = vi.fn();
    const unsubscribe = loader.subscribe(listener);

    await expect(loader.tryLoad()).resolves.toBe(false);
    expect(onLoadFailure).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    expect(loader.loaded()).toBeNull();

    await expect(loader.tryLoad()).resolves.toBe(true);
    expect(importModule).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loader.loaded()).toEqual({value: 1});

    unsubscribe();
    await loader.tryLoad();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
