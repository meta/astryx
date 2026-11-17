// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.mediaTheme.test.tsx
 * @input Tooltip with `Text` content under themes whose inverted surface is
 *   dark or light, in either color mode
 * @output Proves that the supplied content renders inside a MediaTheme whose
 *   side reads on the tooltip's inverted surface, so token-colored content
 *   such as `Text` does not take the surface's own color
 * @position Unit test for the tooltip content's media context
 */

import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Theme, defineTheme} from '../theme';
import {Text} from '../Text/Text';
import {Tooltip} from './Tooltip';
import {pickTooltipSide} from './tooltipMediaMode';

/** A theme whose inverted surface is `surface` in both modes. */
const withSurface = (surface: string) => ({
  ...defineTheme({
    name: `tooltip-surface-${surface.replace(/[^a-z0-9]+/gi, '-')}`,
    tokens: {
      '--color-background-inverted': [surface, surface],
      '--color-on-dark': ['#ffffff', '#ffffff'],
      '--color-on-light': ['#111111', '#111111'],
    },
  }),
  __built: true as const,
});

const mediaOfContent = (
  theme: ReturnType<typeof withSurface>,
  mode: 'light' | 'dark',
) => {
  render(
    <Theme theme={theme} mode={mode}>
      <Tooltip content={<Text type="body">Content text</Text>} isDefaultOpen>
        <button type="button">Trigger</button>
      </Tooltip>
    </Theme>,
  );
  return screen
    .getByText('Content text')
    .closest('[data-astryx-media]')
    ?.getAttribute('data-astryx-media');
};

describe('Tooltip content media context', () => {
  it('a dark inverted surface gives Text content light text in a light page', () => {
    expect(mediaOfContent(withSurface('#0a1317'), 'light')).toBe('dark');
  });

  it('a dark inverted surface in a dark page still gives light text', () => {
    expect(mediaOfContent(withSurface('#0a1317'), 'dark')).toBe('dark');
  });

  it('a light inverted surface gives Text content dark text', () => {
    expect(mediaOfContent(withSurface('#f4f0e8'), 'dark')).toBe('light');
  });

  it('a surface the theme cannot resolve starts from the color mode', () => {
    expect(mediaOfContent(withSurface('oklch(0.2 0.01 230)'), 'light')).toBe(
      'dark',
    );
  });

  it('the surface text color never turns the media context off', () => {
    const white = {r: 255, g: 255, b: 255, a: 1};
    const black = {r: 17, g: 17, b: 17, a: 1};
    const surface = {r: 10, g: 19, b: 23, a: 1};
    expect(pickTooltipSide(surface, white, white, black)).toBe('dark');
  });
});
