// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file clipboard-copy.test.ts
 * @input The internal `internal/clipboard-copy` entry and the clipboard hook
 * @output Proof that the entry re-exports the same hook Core's copy buttons
 *   use, by name, and that the public hooks barrel does not export it
 * @position Unit tests of packages/core/src/internal/clipboard-copy.ts
 */
import {describe, expect, it} from 'vitest';

describe('internal/clipboard-copy', () => {
  it('re-exports the one internal clipboard hook', async () => {
    const entry: Record<string, unknown> = await import('./clipboard-copy');
    const hook = await import('../hooks/useClipboard');
    expect(entry.useClipboardCopy).toBe(hook.useClipboardCopy);
    // Named re-exports only, nothing else.
    expect(Object.keys(entry).sort()).toEqual(['useClipboardCopy']);
  });

  it('the public hooks barrel does not export it', async () => {
    const pub: Record<string, unknown> = await import('../hooks');
    expect(pub).not.toHaveProperty('useClipboardCopy');
  });
});
