// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateThemeCSS} from '@astryxdesign/core/theme';
import {probeTheme} from './probeTheme';

const BARE_VALUE_SELECTOR =
  /\.astryx-[a-z0-9-]+\.(?:-?[_a-zA-Z][_a-zA-Z0-9-]*)/;

describe('probe theme selector contract', () => {
  it('emits reflected data attributes, never target-plus-bare-value selectors', () => {
    const css = generateThemeCSS(probeTheme).component;

    expect(css).toContain('[data-');
    expect(css).not.toMatch(BARE_VALUE_SELECTOR);
  });
});
