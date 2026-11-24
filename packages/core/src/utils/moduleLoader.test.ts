// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file moduleLoader.test.ts
 * @input createModuleLoader with an import that fails once, then loads
 * @output Tests that `load` keeps the behaviour its existing callers use (one
 *   shared import, a failure not kept, the module once loaded), that a failed
 *   tryLoad reports the failure and resolves false, that the next one asks
 *   again, and that a completed load tells its subscribers
 * @position Unit test of utils/moduleLoader
 */

import {describe, expect, it, vi} from 'vitest';
import {createModuleLoader} from './moduleLoader';

describe('createModuleLoader', () => {
  it('keeps load as its existing callers use it: one shared import, a failure not kept, the module once loaded', async () => {
    const importModule = vi
      .fn<() => Promise<{value: number}>>()
      .mockRejectedValueOnce(new Error('The network dropped the chunk.'))
      .mockResolvedValue({value: 2});
    const loader = createModuleLoader(importModule);

    await expect(loader.load()).rejects.toThrow(
      'The network dropped the chunk.',
    );
    expect(loader.loaded()).toBeNull();

    const [first, second] = await Promise.all([loader.load(), loader.load()]);
    expect(first).toBe(second);
    expect(importModule).toHaveBeenCalledTimes(2);
    expect(loader.loaded()).toEqual({value: 2});
    await loader.load();
    expect(importModule).toHaveBeenCalledTimes(2);
  });

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
