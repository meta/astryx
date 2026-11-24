// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file motionQueries.test.ts
 * @input defaultPrefersReducedMotion, with the shared reduced-motion decision
 *   (reducesMotion) replaced by a stub
 * @output Checks that the animator's default Reduce Motion read answers with
 *   the shared decision, so every reason that decision counts (the person's
 *   setting, a theme's reducedMotion: 'always') reaches the animator
 * @position Unit test beside motionQueries.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';

const shared = vi.hoisted(() => ({
  reducesMotion: vi.fn<(element?: Element | null) => boolean>(),
}));

vi.mock('../privateAttributes/reducedMotion.stylex', () => ({
  reducesMotion: (element?: Element | null) => shared.reducesMotion(element),
}));

import {defaultPrefersReducedMotion} from './motionQueries';

describe('defaultPrefersReducedMotion', () => {
  afterEach(() => {
    shared.reducesMotion.mockReset();
  });

  it('answers with the shared reduced-motion decision', () => {
    shared.reducesMotion.mockReturnValue(true);
    expect(defaultPrefersReducedMotion()).toBe(true);
    shared.reducesMotion.mockReturnValue(false);
    expect(defaultPrefersReducedMotion()).toBe(false);
    expect(shared.reducesMotion).toHaveBeenCalledTimes(2);
  });
});
