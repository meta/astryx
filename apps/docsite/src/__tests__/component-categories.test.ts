// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {normalizeComponentCategory} from '../lib/componentCategories';

describe('normalizeComponentCategory', () => {
  it('maps legacy Data Input metadata to Form Controls', () => {
    expect(normalizeComponentCategory('Data Input')).toBe('Form Controls');
  });

  it('preserves current category names', () => {
    expect(normalizeComponentCategory('Navigation')).toBe('Navigation');
  });
});
