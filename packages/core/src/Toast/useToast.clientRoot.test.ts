// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useToast.clientRoot.test.ts
 * @input useToast's module, imported with react-dom/client replaced by a
 *   module that fails when it loads
 * @output Proves that importing useToast, and so the package root that
 *   re-exports it, loads no react-dom/client. Only the first toast with no
 *   LayerProvider loads it.
 * @position Unit test for useToast.tsx's import boundary
 */

import {describe, expect, it, vi} from 'vitest';

vi.mock('react-dom/client', () => {
  throw new Error('react-dom/client was loaded');
});

describe('useToast and react-dom/client', () => {
  // The first import transforms useToast's whole module graph, which is slow
  // under a loaded run.
  it(
    'loads no react-dom/client when its module is imported',
    {timeout: 60_000},
    async () => {
      const {useToast} = await import('./useToast');
      expect(typeof useToast).toBe('function');
    },
  );
});
