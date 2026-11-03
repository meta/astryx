// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file mediaGlyphs.tsx
 * @input SVG props that Icon passes to a component icon
 * @output Glyphs for the media controls: play, pause, replay, skip, volume,
 *   fullscreen, and captions
 * @position Internal to MediaPlayer; Icon renders them through its `icon` prop
 */

import type {SVGProps} from 'react';

type GlyphProps = SVGProps<SVGSVGElement>;

const strokeProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  width: '1em',
  height: '1em',
  'aria-hidden': true,
} as const;

const solidProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'currentColor',
  width: '1em',
  height: '1em',
  'aria-hidden': true,
} as const;

export function PlayGlyph(props: GlyphProps) {
  return (
    <svg {...solidProps} {...props}>
      <path d="M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5z" />
    </svg>
  );
}

export function PauseGlyph(props: GlyphProps) {
  return (
    <svg {...solidProps} {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1.25" />
      <rect x="14" y="5" width="4" height="14" rx="1.25" />
    </svg>
  );
}

export function ReplayGlyph(props: GlyphProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M5 12a7 7 0 1 0 2.05-4.95L5 9" />
      <path d="M5 5v4h4" />
    </svg>
  );
}

function SkipGlyph({
  direction,
  seconds,
  ...props
}: GlyphProps & {direction: 'back' | 'forward'; seconds: number}) {
  const isForward = direction === 'forward';
  return (
    <svg {...strokeProps} {...props}>
      <g transform={isForward ? 'matrix(-1 0 0 1 24 0)' : undefined}>
        <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
        <path d="M4.5 4.5V9H9" />
      </g>
      <text
        x="12.5"
        y="15.25"
        fill="currentColor"
        stroke="none"
        fontSize="7.5"
        fontWeight="600"
        textAnchor="middle">
        {Math.abs(Math.round(seconds))}
      </text>
    </svg>
  );
}

/**
 * Builds a skip glyph that shows its number of seconds. Callers memoize the
 * result, because Icon treats each new component type as a new icon.
 */
export function createSkipGlyph(seconds: number) {
  const direction = seconds < 0 ? 'back' : 'forward';
  function SkipSecondsGlyph(props: GlyphProps) {
    return <SkipGlyph {...props} direction={direction} seconds={seconds} />;
  }
  return SkipSecondsGlyph;
}

export function VolumeHighGlyph(props: GlyphProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

export function VolumeLowGlyph(props: GlyphProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

export function VolumeOffGlyph(props: GlyphProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  );
}

export function FullscreenEnterGlyph(props: GlyphProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  );
}

export function FullscreenExitGlyph(props: GlyphProps) {
  return (
    <svg {...strokeProps} {...props}>
      <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />
    </svg>
  );
}

export function CaptionsGlyph(props: GlyphProps) {
  return (
    <svg {...strokeProps} {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M7 11h4M13 11h4M7 14.5h7M16 14.5h1" />
    </svg>
  );
}
