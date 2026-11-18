// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Toast.mediaFallback.test.tsx
 * @input Toast server markup under themes whose inverted surface is dark or
 *   light in either mode
 * @output Proves that before the surface is measured (a server render, a
 *   static page), the Toast's media side comes from the theme's resolved
 *   surface color by the measurement's own rule, not from the color mode
 * @position SSR test for the Toast's pre-measurement media side
 */

import {describe, expect, it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {Theme, defineTheme} from '../theme';
import {Toast} from './Toast';

/** A theme whose inverted surface is `surface` in both modes. */
const withSurface = (
  surface: string,
  onDark = '#ffffff',
  onLight = '#111111',
) => ({
  ...defineTheme({
    name: `toast-surface-${surface.replace(/[^a-z0-9]+/gi, '-')}`,
    tokens: {
      '--color-background-inverted': [surface, surface],
      '--color-on-dark': [onDark, onDark],
      '--color-on-light': [onLight, onLight],
    },
  }),
  __built: true as const,
});

const media = (theme: ReturnType<typeof withSurface>, mode: 'light' | 'dark') =>
  /data-astryx-media="([a-z]+)"/.exec(
    renderToStaticMarkup(
      <Theme theme={theme} mode={mode}>
        <Toast
          type="info"
          body="Changes saved"
          isAutoHide={false}
          autoHideDuration={0}
          onDismiss={() => {}}
        />
      </Theme>,
    ),
  )?.[1];

describe('Toast media side before measurement', () => {
  it('a light inverted surface takes dark text, in a light page too', () => {
    expect(media(withSurface('#f4f0e8'), 'light')).toBe('light');
    expect(media(withSurface('#f4f0e8'), 'dark')).toBe('light');
  });

  it('a dark inverted surface takes light text, in a dark page too', () => {
    expect(media(withSurface('#0a1317'), 'light')).toBe('dark');
    expect(media(withSurface('#0a1317'), 'dark')).toBe('dark');
  });

  it('a gothic-like light surface in a light page takes dark text', () => {
    // Gothic's inverted surface and its on-dark / on-light text colors.
    expect(media(withSurface('#e8f1f6', '#e8f1f6', '#101314'), 'light')).toBe(
      'light',
    );
  });

  it('a surface parseColor cannot read starts from the color mode', () => {
    expect(media(withSurface('oklch(0.95 0.01 230)'), 'light')).toBe('dark');
    expect(media(withSurface('hsl(200 30% 95%)'), 'dark')).toBe('light');
  });

  it('a translucent on-color is composited over the surface, as the measurement does', () => {
    expect(
      media(
        withSurface('#f4f0e8', 'rgba(255, 255, 255, 0.6)', '#111111'),
        'light',
      ),
    ).toBe('light');
  });

  it('a translucent surface, another named color or an unread on-color starts from the color mode', () => {
    expect(media(withSurface('rgba(244, 240, 232, 0.9)'), 'light')).toBe(
      'dark',
    );
    expect(media(withSurface('ivory'), 'light')).toBe('dark');
    expect(
      media(withSurface('#f4f0e8', 'oklch(1 0 0)', '#111111'), 'light'),
    ).toBe('dark');
  });
});
