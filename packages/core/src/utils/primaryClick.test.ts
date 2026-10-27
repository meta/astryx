// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {isPrimaryClick} from './primaryClick';

describe('isPrimaryClick', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is the main button', () => {
    expect(isPrimaryClick({button: 0, ctrlKey: false})).toBe(true);
    expect(isPrimaryClick({button: 1, ctrlKey: false})).toBe(false);
    expect(isPrimaryClick({button: 2, ctrlKey: false})).toBe(false);
  });

  it('is not a ctrl-click on macOS, which opens the context menu', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(isPrimaryClick({button: 0, ctrlKey: true})).toBe(false);
  });

  it('is a ctrl-click elsewhere', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(isPrimaryClick({button: 0, ctrlKey: true})).toBe(true);
  });
});
