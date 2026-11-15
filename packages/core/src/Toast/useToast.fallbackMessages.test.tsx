// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useToast.fallbackMessages.test.tsx
 * @input useToast with no LayerProvider above it
 * @output Unit tests that the fallback viewport's warning and its SSR error
 *   name only LayerProvider, the provider that removes them
 * @position Testing; validates useToast.tsx. A file of its own because the
 *   fallback viewport is a module singleton: its warning and error fire only
 *   on the first toast in a module instance.
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useToast} from './useToast';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useToast fallback messages', () => {
  // AppShell renders no LayerProvider, so advice to wrap the app in AppShell
  // does not remove the warning or the error.
  it('names only LayerProvider when a toast cannot mount during SSR', () => {
    const {result} = renderHook(() => useToast());
    let message = '';
    vi.stubGlobal('document', undefined);
    try {
      result.current({body: 'Saved'});
    } catch (error) {
      message = (error as Error).message;
    }
    vi.unstubAllGlobals();
    expect(message).toContain('<LayerProvider>');
    expect(message).not.toContain('AppShell');
  });

  it('names only LayerProvider in the fallback viewport warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {result} = renderHook(() => useToast());
    result.current({body: 'Saved', isAutoHide: false});
    const messages = warn.mock.calls.map(call => String(call[0]));
    const fallback = messages.find(text => text.includes('fallback viewport'));
    expect(fallback).toBeDefined();
    expect(fallback).toContain('<LayerProvider>');
    expect(fallback).not.toContain('AppShell');
  });
});
