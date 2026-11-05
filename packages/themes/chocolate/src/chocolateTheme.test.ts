// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {generateThemeCSS} from '@astryxdesign/core/theme';
import {chocolateTheme} from './chocolateTheme';

describe('chocolate touch + narrow type pin', () => {
  it('floors body to 16px and holds Display 1 at its desktop size', () => {
    const rule = chocolateTheme.__adaptationRules?.[0];

    expect(chocolateTheme.__adaptations.rules).toHaveLength(1);
    expect(rule?.when).toEqual({pointer: 'coarse', width: {below: 'lg'}});
    expect(rule?.query).toBe('(width < 1024px) and (pointer: coarse)');
    // Pinned ladder: base 16 (was 14), ratio 1.2 -> 1.1736, Display 1 pinned.
    expect(rule?.tokens['--font-size-base']).toBe('1rem');
    expect(rule?.tokens['--font-size-lg']).toBe('1.1875rem');
    expect(rule?.tokens['--font-size-5xl']).toBe('2.625rem');
    // Desktop scale is untouched.
    expect(chocolateTheme.tokens['--font-size-base']).toBe('0.875rem');
    expect(chocolateTheme.tokens['--font-size-5xl']).toBe('2.625rem');
    expect(generateThemeCSS(chocolateTheme).component).toContain(
      '@media (width < 1024px) and (pointer: coarse)',
    );
  });
});
