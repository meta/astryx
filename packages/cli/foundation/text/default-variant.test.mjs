// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {defaultVariantText} from './default-variant.mjs';

describe('defaultVariantText', () => {
  it('names the default look by its variant', () => {
    expect(defaultVariantText({variant: 'outline'})).toBe('outline');
  });

  it('has no text for a default that names no variant, or no default', () => {
    expect(defaultVariantText({})).toBeUndefined();
    expect(defaultVariantText({variant: ''})).toBeUndefined();
    expect(defaultVariantText(undefined)).toBeUndefined();
    expect(defaultVariantText(null)).toBeUndefined();
  });
});
