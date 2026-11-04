// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Metadata does not supply a transform: owner-only plugins must explain the no-op. */
import {renderHook} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useBaseTablePlugins} from './useBaseTablePlugins';
import type {TablePlugin} from './types';
afterEach(() => vi.restoreAllMocks());
describe('Table metadata-only plugin validation', () => {
  it('warns once for an owner-only plugin without changing its stable pipeline', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base: TablePlugin<Record<string, unknown>>[] = [];
    const owner: TablePlugin<Record<string, unknown>> = {
      wholeRowOwner: 'navigation',
    };
    const {result, rerender} = renderHook(() =>
      useBaseTablePlugins(base, {navigation: owner}),
    );
    expect(warning).toHaveBeenCalledWith(
      'Table: Plugin "navigation" has no transform methods. It will be included in the pipeline but won\'t do anything.',
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(warning).toHaveBeenCalledTimes(1);
  });
});
