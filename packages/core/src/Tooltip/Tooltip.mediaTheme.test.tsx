// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.mediaTheme.test.tsx
 * @input Tooltip with `Text` content under themes whose inverted surface is
 *   dark or light, in either color mode
 * @output Proves that the supplied content renders with a media side, so
 *   token-colored content such as `Text` does not take the surface's own
 *   color. jsdom paints no surface, so these cases read the side before a
 *   measurement; the Chromium contrast spec measures every shipped theme
 * @position Unit test for the tooltip content's media context
 */

import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Theme, defineTheme} from '../theme';
import {Text} from '../Text/Text';
import {MediaTheme} from '../theme/MediaTheme';
import {Tooltip} from './Tooltip';

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

  it('a light inverted surface gives Text content dark text', () => {
    expect(mediaOfContent(withSurface('#f4f0e8'), 'dark')).toBe('light');
  });

  it('before a measurement the side is the one opposite the color mode', () => {
    expect(mediaOfContent(withSurface('oklch(0.2 0.01 230)'), 'light')).toBe(
      'dark',
    );
  });

  it('content that holds a MediaTheme keeps its own side for what it holds', () => {
    render(
      <Theme theme={withSurface('#0a1317')} mode="light">
        <Tooltip
          content={
            <MediaTheme mode="light">
              <Text type="body">Own context</Text>
            </MediaTheme>
          }
          isDefaultOpen>
          <button type="button">Trigger</button>
        </Tooltip>
      </Theme>,
    );
    const text = screen.getByText('Own context');
    const media = text.closest('[data-astryx-media]');
    expect(media?.getAttribute('data-astryx-media')).toBe('light');
  });
});
