// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {y2kTheme} from './y2kTheme';

const ROOT_FONT_SIZE_PX = 16;

// The pixel values these steps had before they moved to rem.
const previousPx: Record<string, number> = {
  '--spacing-0-5': 3,
  '--spacing-1': 6,
  '--spacing-1-5': 9,
  '--spacing-2': 12,
  '--spacing-3': 18,
  '--spacing-4': 24,
  '--spacing-5': 30,
  '--spacing-6': 36,
  '--spacing-7': 42,
  '--spacing-8': 48,
};

describe('y2k spacing steps', () => {
  const tokens = y2kTheme.tokens as Record<string, string>;
  const spacingSteps = Object.entries(tokens).filter(([name]) =>
    name.startsWith('--spacing-'),
  );

  it('are rem, so they follow the root font size', () => {
    expect(spacingSteps.length).toBe(Object.keys(previousPx).length);
    for (const [name, value] of spacingSteps) {
      expect(value, name).toMatch(/^\d+(\.\d+)?rem$/);
    }
  });

  it('keep their previous pixel values at the default 16px root', () => {
    for (const [name, px] of Object.entries(previousPx)) {
      expect(Number.parseFloat(tokens[name]) * ROOT_FONT_SIZE_PX, name).toBe(
        px,
      );
    }
  });
});
