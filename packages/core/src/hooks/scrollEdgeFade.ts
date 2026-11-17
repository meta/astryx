// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollEdgeFade.ts
 * @input The inline axis state that useScrollableArea publishes
 * @output StyleX styles that fade each inline edge with hidden content
 * @position Shared scroll-edge presenter for useScrollableArea adopters
 *
 * Phone browsers show an overlay scrollbar only while the person scrolls, so
 * an overflowing viewport at rest gives no sign that it scrolls. The fade is
 * that sign. It masks only an edge that hides content.
 */

import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {ScrollAxisState} from './useScrollableArea';

/** How far a fade runs from its edge, unless the adopter sets a length. */
const DEFAULT_LENGTH = spacingVars['--spacing-8'];

// An adopter can tune the geometry on the viewport: `--_scroll-fade-inset` is
// a clear band at the edge (a focus-ring bleed), and `--_scroll-fade-length`
// is how far the fade runs after it.
const INSET = 'var(--_scroll-fade-inset, 0px)';
const FADED = `calc(${INSET} + var(--_scroll-fade-length, ${DEFAULT_LENGTH}))`;

// Each edge has a clear-band stop and a fade stop. An edge that shows no fade
// sets both to 0px.
const STOPS =
  'transparent var(--_scroll-fade-start-0), black var(--_scroll-fade-start-1), black calc(100% - var(--_scroll-fade-end-1)), transparent calc(100% - var(--_scroll-fade-end-0))';

// Three mask layers, each excluding the ones below it. The bottom two are the
// border box less the padding box: the band where a classic scrollbar sits.
// The fade covers only the padding box, so it does not meet that band, and
// the scrollbar never fades.
const RING = 'linear-gradient(black, black), linear-gradient(black, black)';
const MASK = {
  default: `linear-gradient(to right, ${STOPS}), ${RING}`,
  ':dir(rtl)': {
    default: `linear-gradient(to left, ${STOPS}), ${RING}`,
    ':focus-visible': 'none',
    '@media (forced-colors: active)': 'none',
  },
  // The keyboard ring sits inside the viewport, so a fade would hide part of
  // it. Arrow keys scroll a focused viewport, and the ring marks it.
  ':focus-visible': 'none',
  // Forced colors use system colours, and a mask cannot follow them.
  '@media (forced-colors: active)': 'none',
} as const;

const LAYERS = {
  maskImage: MASK,
  maskClip: 'padding-box, border-box, padding-box',
  maskComposite: 'exclude',
  // Keyboard scrolling brings a focused child clear of the fade.
  scrollPaddingInline: FADED,
} as const;

const styles = stylex.create({
  fadeStart: {
    ...LAYERS,
    '--_scroll-fade-start-0': INSET,
    '--_scroll-fade-start-1': FADED,
    '--_scroll-fade-end-0': '0px',
    '--_scroll-fade-end-1': '0px',
  },
  fadeEnd: {
    ...LAYERS,
    '--_scroll-fade-start-0': '0px',
    '--_scroll-fade-start-1': '0px',
    '--_scroll-fade-end-0': INSET,
    '--_scroll-fade-end-1': FADED,
  },
  fadeBoth: {
    ...LAYERS,
    '--_scroll-fade-start-0': INSET,
    '--_scroll-fade-start-1': FADED,
    '--_scroll-fade-end-0': INSET,
    '--_scroll-fade-end-1': FADED,
  },
});

/**
 * Styles that fade each inline edge of a scroll viewport that hides content.
 * A viewport whose inline axis does not scroll gets no style, so its paint
 * does not change.
 */
export function scrollEdgeFadeStyles(inline: ScrollAxisState): StyleXStyles {
  if (!inline.isScrollable || (inline.atStart && inline.atEnd)) {
    return null;
  }
  if (inline.atStart) {
    return styles.fadeEnd;
  }
  return inline.atEnd ? styles.fadeStart : styles.fadeBoth;
}

/** Turns off the fade on one inline edge that marks its overflow another way. */
export const scrollEdgeFadeOff = stylex.create({
  start: {
    '--_scroll-fade-start-0': '0px',
    '--_scroll-fade-start-1': '0px',
  },
  end: {
    '--_scroll-fade-end-0': '0px',
    '--_scroll-fade-end-1': '0px',
  },
});
