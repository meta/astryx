// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file mediaIcons.tsx
 * @input The active theme's icon registry
 * @output MEDIA_ICON_KEYS and useMediaIcon: the glyphs the media control
 *   parts draw
 * @position Internal to MediaPlayer; a theme restyles a glyph by its key
 */

import type {ReactNode} from 'react';
import {getExtendedIcon} from '@astryxdesign/core/Icon';
import {useThemeName} from '@astryxdesign/core/theme';

/**
 * Icon-registry keys for the media glyphs. A theme restyles any of them by
 * key: `defineTheme({icons: {'media:play': <MyPlayIcon />}})`.
 */
export const MEDIA_ICON_KEYS = {
  play: 'media:play',
  pause: 'media:pause',
  replay: 'media:replay',
  skipBack: 'media:skip-back',
  skipForward: 'media:skip-forward',
  volumeHigh: 'media:volume-high',
  volumeLow: 'media:volume-low',
  volumeOff: 'media:volume-off',
  fullscreenEnter: 'media:fullscreen-enter',
  fullscreenExit: 'media:fullscreen-exit',
  captions: 'media:captions',
  previousTrack: 'media:previous-track',
  nextTrack: 'media:next-track',
  audioFile: 'media:audio-file',
} as const;

export type MediaIconName = keyof typeof MEDIA_ICON_KEYS;

const svgProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  width: '1em',
  height: '1em',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

// The fallback glyphs are Lucide's drawings (ISC license), so a theme that
// maps no media keys still matches the Lucide icons of the neutral theme.
const SPEAKER =
  'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z';

const FALLBACK_ICONS: Record<MediaIconName, ReactNode> = {
  play: (
    <svg {...svgProps}>
      <path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />
    </svg>
  ),
  pause: (
    <svg {...svgProps}>
      <rect x="14" y="3" width="5" height="18" rx="1" />
      <rect x="5" y="3" width="5" height="18" rx="1" />
    </svg>
  ),
  replay: (
    <svg {...svgProps}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  ),
  skipBack: (
    <svg {...svgProps}>
      <path d="M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18z" />
      <path d="M22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z" />
    </svg>
  ),
  skipForward: (
    <svg {...svgProps}>
      <path d="M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18z" />
      <path d="M2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z" />
    </svg>
  ),
  volumeHigh: (
    <svg {...svgProps}>
      <path d={SPEAKER} />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </svg>
  ),
  volumeLow: (
    <svg {...svgProps}>
      <path d={SPEAKER} />
      <path d="M16 9a5 5 0 0 1 0 6" />
    </svg>
  ),
  volumeOff: (
    <svg {...svgProps}>
      <path d={SPEAKER} />
      <line x1="22" x2="16" y1="9" y2="15" />
      <line x1="16" x2="22" y1="9" y2="15" />
    </svg>
  ),
  fullscreenEnter: (
    <svg {...svgProps}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  ),
  fullscreenExit: (
    <svg {...svgProps}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  captions: (
    <svg {...svgProps}>
      <rect width="18" height="14" x="3" y="5" rx="2" ry="2" />
      <path d="M7 15h4M15 15h2M7 11h2M13 11h4" />
    </svg>
  ),
  previousTrack: (
    <svg {...svgProps}>
      <path d="M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z" />
      <path d="M3 20V4" />
    </svg>
  ),
  nextTrack: (
    <svg {...svgProps}>
      <path d="M21 4v16" />
      <path d="M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z" />
    </svg>
  ),
  audioFile: (
    <svg {...svgProps}>
      <path d="M11.65 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v10.35" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M8 20v-7l3 1.474" />
      <circle cx="6" cy="20" r="2" />
    </svg>
  ),
};

/**
 * Resolves a media glyph: the active theme's icon for its key, then a
 * globally registered one, then the Lucide-drawn fallback.
 */
export function useMediaIcon(name: MediaIconName): ReactNode {
  const themeName = useThemeName();
  return getExtendedIcon(
    MEDIA_ICON_KEYS[name],
    FALLBACK_ICONS[name],
    themeName,
  );
}
