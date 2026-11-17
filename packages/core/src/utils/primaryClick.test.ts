// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file primaryClick.test.ts
 * @input isPrimaryClick over button presses on Apple and other platforms
 * @output Tests that only the main button, and not a ctrl-click on macOS,
 *   is a primary click (spec:AST-094 FR43)
 * @position Unit tests of packages/core/src/utils/primaryClick.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {isPrimaryClick} from './primaryClick';

function onPlatform(platform: string) {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isPrimaryClick (spec:AST-094 FR43)', () => {
  it('takes the main button, and no right click or pen barrel button', () => {
    onPlatform('Win32');
    expect(isPrimaryClick({button: 0, ctrlKey: false})).toBe(true);
    expect(isPrimaryClick({button: 2, ctrlKey: false})).toBe(false);
    expect(isPrimaryClick({button: 1, ctrlKey: false})).toBe(false);
  });

  it("takes no ctrl-click on macOS, that platform's context click, and a ctrl-click elsewhere", () => {
    onPlatform('MacIntel');
    expect(isPrimaryClick({button: 0, ctrlKey: true})).toBe(false);
    expect(isPrimaryClick({button: 0, ctrlKey: false})).toBe(true);
    vi.restoreAllMocks();
    onPlatform('Win32');
    expect(isPrimaryClick({button: 0, ctrlKey: true})).toBe(true);
  });
});
