// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {editorBaseFor} from './theme.mjs';

describe('the theme editor line after theme eject', () => {
  it('starts from the ejected theme only when the editor can build on it', () => {
    // The editor's --like takes only an Astryx theme package.
    expect(
      editorBaseFor({slug: 'butter', package: '@astryxdesign/theme-butter'}),
    ).toBe('butter');
    expect(editorBaseFor({slug: 'ocean', package: '@acme/themes'})).toBe(
      'neutral',
    );
    expect(editorBaseFor({slug: 'ocean', package: '@astryxdesign/cli'})).toBe(
      'neutral',
    );
    expect(editorBaseFor({})).toBe('neutral');
  });
});
