// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file example-block-pointer.test.mjs
 * @input withExampleBlockPointer, with block discovery made to throw
 * @output Proof that a block doc that fails to load keeps the
 *   unknown-component error, its code and its suggestions
 * @position Unit test beside the component adapter
 */

import {describe, expect, it, vi} from 'vitest';
import {AstryxError} from '../error.mjs';

vi.mock(
  '../../foundation/discovery/template-adapter.mjs',
  async importOriginal => {
    const actual = await importOriginal();
    return {
      ...actual,
      discoverAll: async () => {
        throw new Error('Cannot load block doc: Broken.doc.mjs');
      },
    };
  },
);

const {withExampleBlockPointer} = await import('./_adapter.mjs');

describe('withExampleBlockPointer', () => {
  it('keeps the unknown-component error when a block doc fails to load', async () => {
    const original = new AstryxError(
      'No component named "Tabel"',
      [{name: 'Table', reason: 'close spelling'}],
      'ERR_UNKNOWN_COMPONENT',
    );
    const result = await withExampleBlockPointer(original, 'Tabel', {
      coreDir: '/missing-core',
      cwd: '/missing-project',
    });
    expect(result).toBe(original);
  });

  it('passes any other error through without a lookup', async () => {
    const other = new AstryxError('boom', undefined, 'ERR_UNKNOWN');
    expect(
      await withExampleBlockPointer(other, 'Tabel', {
        coreDir: '/missing-core',
        cwd: '/missing-project',
      }),
    ).toBe(other);
  });
});
