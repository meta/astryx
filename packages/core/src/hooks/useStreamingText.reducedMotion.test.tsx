// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useStreamingText.reducedMotion.test.tsx
 * @input useStreamingText under a theme, React Testing Library
 * @output Verifies streaming text snaps to the full text under a theme with
 *   `reducedMotion: 'always'` with the person's setting off, as it does under
 *   the setting
 * @position Companion to useStreamingText.test.ts for the theme's mark
 */

import type {ReactElement, ReactNode} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
import {defineTheme} from '../theme/defineTheme';
import {ALWAYS_TEMPO} from '../theme/reducedMotionAlways.testing';
import {Theme} from '../theme/Theme';
import {useStreamingText} from './useStreamingText';

// No public theme can set reducedMotion yet: a theme with ALWAYS_TEMPO
// resolves to 'always' through this mock.
vi.mock('../theme/themeMotion', async importOriginal => {
  const {resolvingAlways} =
    await import('../theme/reducedMotionAlways.testing');
  return resolvingAlways(await importOriginal());
});

const still = defineTheme({
  name: 'StreamStill',
  motion: {tempo: ALWAYS_TEMPO},
});
const moving = defineTheme({name: 'StreamMoving', motion: {tempo: 1.2}});

function under(theme: typeof still) {
  return function ThemeWrapper({
    children,
  }: {
    children: ReactNode;
  }): ReactElement {
    return <Theme theme={theme}>{children}</Theme>;
  };
}

describe('useStreamingText and reduced motion', () => {
  it("snaps to the full text under a theme with reducedMotion: 'always', with the setting off", () => {
    const {result} = renderHook(() => useStreamingText('Hello world', true), {
      wrapper: under(still),
    });
    expect(result.current).toBe('Hello world');
  });

  it('reveals progressively under a theme that leaves reduced motion to the setting', () => {
    const {result} = renderHook(() => useStreamingText('Hello world', true), {
      wrapper: under(moving),
    });
    expect(result.current).toBe('');
  });
});
