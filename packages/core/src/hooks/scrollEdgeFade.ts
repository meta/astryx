// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollEdgeFade.ts
 * @input The inline axis state that useScrollableArea publishes
 * @output StyleX styles that fade each inline edge with hidden content
 * @position Shared scroll-edge presenter for useScrollableArea adopters
 *
 * Phone browsers show an overlay scrollbar only while the person scrolls, so
 * an overflowing viewport at rest gives no sign that it scrolls. The fade is
 * that sign. It masks only an edge that hides content, and it uses the look
 * of the TabList and Tokenizer strip fades.
 */

import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {ScrollAxisState} from './useScrollableArea';

/** How far a fade runs from its edge. */
const FADE_LENGTH = spacingVars['--spacing-8'];

// Each edge's fade length is 0px unless that edge hides content. An adopter
// that marks an edge some other way (a pinned column's shadow) sets that
// edge's length back to 0px.
const STOPS =
  'transparent, black var(--_scroll-fade-start), black calc(100% - var(--_scroll-fade-end)), transparent';

const MASK = {
  default: `linear-gradient(to right, ${STOPS})`,
  ':dir(rtl)': `linear-gradient(to left, ${STOPS})`,
  // The keyboard ring sits inside the viewport, so a fade would hide part of
  // it. Arrow keys scroll a focused viewport, and the ring marks it.
  ':focus-visible': 'none',
  // Forced colors use system colours, and a mask cannot follow them.
  '@media (forced-colors: active)': 'none',
} as const;

const styles = stylex.create({
  fadeStart: {
    maskImage: MASK,
    '--_scroll-fade-start': FADE_LENGTH,
    '--_scroll-fade-end': '0px',
  },
  fadeEnd: {
    maskImage: MASK,
    '--_scroll-fade-start': '0px',
    '--_scroll-fade-end': FADE_LENGTH,
  },
  fadeBoth: {
    maskImage: MASK,
    '--_scroll-fade-start': FADE_LENGTH,
    '--_scroll-fade-end': FADE_LENGTH,
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
  start: {'--_scroll-fade-start': '0px'},
  end: {'--_scroll-fade-end': '0px'},
});
