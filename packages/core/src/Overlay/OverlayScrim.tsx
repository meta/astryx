// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file OverlayScrim.tsx
 * @input Scrim props (mode, position, align, visibility)
 * @output Renders the scrim div with background, media theme, transitions
 * @position Internal rendering primitive; used by Overlay and useOverlay
 *
 * Not exported directly — consumers use Overlay (component) or
 * useOverlay (hook), both of which render this internally.
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  durationVars,
  easeVars,
  spacingVars,
} from '../theme/tokens.stylex';
import {MediaTheme} from '../theme/MediaTheme';
import {mergeProps} from '../utils';
import {overlayScope} from './overlay.markers.stylex';
import {themeProps} from '../utils/themeProps';
import {transformMotion} from '../privateAttributes/transformMotion.stylex';

// =============================================================================
// Types (re-exported from index.ts for consumers)
// =============================================================================

export type OverlayScrimMode = 'dark' | 'light' | false;
export type OverlayPosition = 'fill' | 'bottom' | 'top';
export type OverlayAlign = 'start' | 'center' | 'end';
export type OverlayShowOn = 'hover' | 'always' | 'focus' | 'hover-or-focus';

export interface OverlayScrimProps {
  scrim: OverlayScrimMode;
  position: OverlayPosition;
  align: OverlayAlign;
  showOn: OverlayShowOn;
  isOpen: boolean | undefined;
  children: ReactNode;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  base: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-2'],
    padding: spacingVars['--spacing-3'],
    pointerEvents: 'none',
    transitionProperty: 'opacity, visibility, transform',
    transitionDuration: {
      default: `calc(${durationVars['--duration-fast']} * ${transformMotion.factor})`,
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },

  // Position variants
  fill: {inset: 0},
  bottom: {insetInline: 0, bottom: 0},
  top: {insetInline: 0, top: 0},

  // Alignment
  alignStart: {alignItems: 'flex-start', justifyContent: 'flex-start'},
  alignCenter: {alignItems: 'center', justifyContent: 'center'},
  alignEnd: {alignItems: 'flex-end', justifyContent: 'flex-start'},

  // Scrim backgrounds
  scrimDark: {backgroundColor: colorVars['--color-overlay']},
  // TODO: Replace with --color-overlay-light token when added
  scrimLight: {backgroundColor: 'color-mix(in srgb, white 60%, transparent)'},

  // Hidden: strips slide out, fill fades
  hidden: {opacity: 0, visibility: 'hidden'},
  hiddenBottom: {transform: 'translateY(100%)'},
  hiddenTop: {transform: 'translateY(-100%)'},

  // Visible
  visible: {
    opacity: 1,
    visibility: 'visible',
    pointerEvents: 'auto',
    transform: 'translateY(0)',
    '@starting-style': {
      opacity: 0,
    },
  },

  // @starting-style for strips: slide in on mount
  visibleFromBottom: {
    '@starting-style': {
      opacity: 0,
      transform: 'translateY(100%)',
    },
  },
  visibleFromTop: {
    '@starting-style': {
      opacity: 0,
      transform: 'translateY(-100%)',
    },
  },

  // CSS-driven: ancestor hover + focus (accessible default)
  hoverReveal: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(':hover', overlayScope)]: {
        '@media (hover: hover)': 1,
      },
      [stylex.when.ancestor(':focus-within', overlayScope)]: 1,
    },
    visibility: {
      default: 'hidden',
      [stylex.when.ancestor(':hover', overlayScope)]: {
        '@media (hover: hover)': 'visible',
      },
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'visible',
    },
    pointerEvents: {
      default: 'none',
      [stylex.when.ancestor(':hover', overlayScope)]: {
        '@media (hover: hover)': 'auto',
      },
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'auto',
    },
  },

  // Slide transform for strip hover reveal
  hoverRevealBottom: {
    transform: {
      default: 'translateY(100%)',
      [stylex.when.ancestor(':hover', overlayScope)]: {
        '@media (hover: hover)': 'translateY(0)',
      },
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'translateY(0)',
    },
  },
  hoverRevealTop: {
    transform: {
      default: 'translateY(-100%)',
      [stylex.when.ancestor(':hover', overlayScope)]: {
        '@media (hover: hover)': 'translateY(0)',
      },
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'translateY(0)',
    },
  },

  // CSS-driven: focus-within only
  focusReveal: {
    opacity: {
      default: 0,
      [stylex.when.ancestor(':focus-within', overlayScope)]: 1,
    },
    visibility: {
      default: 'hidden',
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'visible',
    },
    pointerEvents: {
      default: 'none',
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'auto',
    },
  },

  focusRevealBottom: {
    transform: {
      default: 'translateY(100%)',
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'translateY(0)',
    },
  },
  focusRevealTop: {
    transform: {
      default: 'translateY(-100%)',
      [stylex.when.ancestor(':focus-within', overlayScope)]: 'translateY(0)',
    },
  },
});

const alignMap = {
  start: styles.alignStart,
  center: styles.alignCenter,
  end: styles.alignEnd,
} as const;

const positionMap = {
  fill: styles.fill,
  bottom: styles.bottom,
  top: styles.top,
} as const;

// =============================================================================
// Visibility style helpers — extract branching logic from render
// =============================================================================

/**
 * Returns visibility/animation styles for JS-controlled overlays (isOpen defined).
 * Uses position to determine slide direction for strips.
 */
function getControlledVisibility(isOpen: boolean, position: OverlayPosition) {
  if (isOpen) {
    return {
      base: styles.visible,
      bottom: position === 'bottom' && styles.visibleFromBottom,
      top: position === 'top' && styles.visibleFromTop,
    };
  }
  return {
    base: styles.hidden,
    bottom: position === 'bottom' && styles.hiddenBottom,
    top: position === 'top' && styles.hiddenTop,
  };
}

/**
 * Returns visibility/animation styles for CSS-driven overlays (showOn mode).
 * Each mode has a base reveal style + optional position-based slide.
 */
function getShowOnVisibility(showOn: OverlayShowOn, position: OverlayPosition) {
  switch (showOn) {
    case 'always':
      return {
        base: styles.visible,
        bottom: position === 'bottom' && styles.visibleFromBottom,
        top: position === 'top' && styles.visibleFromTop,
      };
    case 'hover':
    case 'hover-or-focus':
      return {
        base: styles.hoverReveal,
        bottom: position === 'bottom' && styles.hoverRevealBottom,
        top: position === 'top' && styles.hoverRevealTop,
      };
    case 'focus':
      return {
        base: styles.focusReveal,
        bottom: position === 'bottom' && styles.focusRevealBottom,
        top: position === 'top' && styles.focusRevealTop,
      };
  }
}

// =============================================================================
// Component (internal)
// =============================================================================

export function OverlayScrim({
  scrim,
  position,
  align,
  showOn,
  isOpen,
  children,
}: OverlayScrimProps) {
  const isControlled = isOpen !== undefined;

  const themeMode =
    scrim === 'dark' ? 'dark' : scrim === 'light' ? 'light' : null;

  const content = themeMode ? (
    <MediaTheme mode={themeMode}>{children}</MediaTheme>
  ) : (
    children
  );

  const visibility = isControlled
    ? getControlledVisibility(isOpen, position)
    : getShowOnVisibility(showOn, position);

  return (
    <div
      {...mergeProps(
        themeProps('overlay-scrim', {position}),
        stylex.props(
          styles.base,
          positionMap[position],
          alignMap[align],
          scrim === 'dark' && styles.scrimDark,
          scrim === 'light' && styles.scrimLight,
          visibility.base,
          visibility.bottom,
          visibility.top,
        ),
      )}
      inert={isControlled && !isOpen ? true : undefined}>
      {content}
    </div>
  );
}
