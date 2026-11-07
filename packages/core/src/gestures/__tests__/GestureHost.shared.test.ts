// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A swizzled copy carries its own copy of the gesture modules. The package's
 * and the copy's gesture code must still share one gesture host per
 * document, so a copied component and a package component do not each claim
 * the same touches.
 */

import {describe, expect, it, vi} from 'vitest';

describe('the gesture host a swizzled copy shares', () => {
  it('gives two copies of the gesture modules one host per document', async () => {
    const pkg = await import('../GestureHost');
    vi.resetModules();
    const copy = await import('../GestureHost');
    expect(copy).not.toBe(pkg);
    expect(copy.getGestureHost(document)).toBe(pkg.getGestureHost(document));
  });
});
