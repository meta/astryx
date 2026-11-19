// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {storyPadding} from './storyFrame';

describe('storyPadding', () => {
  it('leaves page-frame stories edge to edge', () => {
    expect(storyPadding({pageFrame: true})).toBe(0);
  });

  it('keeps the 16 px gutter around every other story, whatever its layout', () => {
    expect(storyPadding({})).toBe(16);
    expect(storyPadding(undefined)).toBe(16);
    expect(storyPadding({pageFrame: false})).toBe(16);
    // The global layout is fullscreen: that alone keeps the gutter.
    expect(storyPadding({layout: 'fullscreen'} as {pageFrame?: boolean})).toBe(
      16,
    );
  });
});
