// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file tokenizer-presentation.test.ts
 * @input The internal `internal/tokenizer-presentation` entry and the
 *   Tokenizer module
 * @output Proof that the entry re-exports the same component the public
 *   Tokenizer entry ships, by name, and that the public Tokenizer barrel
 *   names no presentation
 * @position Unit tests of packages/core/src/internal/tokenizer-presentation.ts
 */
import {describe, expect, it} from 'vitest';

describe('internal/tokenizer-presentation', () => {
  it('re-exports the one Tokenizer component under the sheet-capable name, the same value the public entry ships', async () => {
    const entry: Record<string, unknown> =
      await import('./tokenizer-presentation');
    const tokenizer = await import('../Tokenizer/Tokenizer');
    expect(entry.TokenizerWithPresentation).toBe(tokenizer.Tokenizer);
    // Named re-exports only, nothing else.
    expect(Object.keys(entry).sort()).toEqual(['TokenizerWithPresentation']);
  });

  it('the public Tokenizer barrel exports no presentation surface', async () => {
    const pub: Record<string, unknown> = await import('../Tokenizer');
    expect(Object.keys(pub).sort()).toEqual(['Tokenizer']);
    expect(pub).not.toHaveProperty('TokenizerWithPresentation');
    expect(pub).not.toHaveProperty('TokenizerBottomSheet');
  });
});
