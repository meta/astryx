// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file dialog-context.test.ts
 * @input The internal `internal/dialog-context` entry and the Dialog module
 * @output Proof that the entry re-exports the same hook Dialog provides, by
 *   name, and that the public Dialog barrel names no context
 * @position Unit tests of packages/core/src/internal/dialog-context.ts
 */
import {describe, expect, it} from 'vitest';

describe('internal/dialog-context', () => {
  it('re-exports the one Dialog context hook, the same value Dialog reads', async () => {
    const entry: Record<string, unknown> = await import('./dialog-context');
    const context = await import('../Dialog/DialogContext');
    expect(entry.useDialogContext).toBe(context.useDialogContext);
    // Named re-exports only, nothing else.
    expect(Object.keys(entry).sort()).toEqual(['useDialogContext']);
  });

  it('the public Dialog barrel exports no context surface', async () => {
    const pub: Record<string, unknown> = await import('../Dialog');
    expect(pub).not.toHaveProperty('DialogContext');
    expect(pub).not.toHaveProperty('useDialogContext');
  });
});
