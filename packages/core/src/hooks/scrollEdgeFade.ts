// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollEdgeFade.ts
 * @input The inline axis state that useScrollableArea publishes
 * @output StyleX styles that fade each inline edge with hidden content
 * @position Shared scroll-edge presenter for useScrollableArea adopters
 *
 * An overflowing viewport at rest gives no sign that it scrolls when nothing
 * shows its scrollbar. The fade is that sign. It masks only an edge that
 * hides content.
 */

import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {ScrollAxisState} from './useScrollableArea';

// An adopter can set two lengths on its viewport. `--_scroll-fade-inset` is a
// clear band at the edge. Tokenizer uses it so a fade never paints into a
// token's focus ring. `--_scroll-fade-length` is how far the fade runs after
// the band.
const INSET = 'var(--_scroll-fade-inset, 0px)';
const FADED = `calc(${INSET} + var(--_scroll-fade-length, ${spacingVars['--spacing-8']}))`;

// Each edge has a clear-band stop and a fade stop. An edge that shows no fade
// sets both to 0px.
const STOPS =
  'transparent var(--_scroll-fade-start-0), black var(--_scroll-fade-start-1), black calc(100% - var(--_scroll-fade-end-1)), transparent calc(100% - var(--_scroll-fade-end-0))';

const FADE = {
  default: `linear-gradient(to right, ${STOPS})`,
  ':dir(rtl)': {
    default: `linear-gradient(to left, ${STOPS})`,
    ':focus-visible': 'none',
    '@media (forced-colors: active)': 'none',
  },
  // The keyboard ring sits inside the viewport, so a fade would hide part of
  // it. Arrow keys scroll a focused viewport, and the ring marks it.
  ':focus-visible': 'none',
  // Forced colors replace the page colours. A mask would hide text the
  // reader set to show.
  '@media (forced-colors: active)': 'none',
} as const;

// A mask on a scroll container also covers its classic scrollbar. Phones and
// tablets overlay their scrollbars and show them only while scrolling. So a
// viewport with its native scrollbar fades only under a coarse primary
// pointer. A mouse or a trackpad sees no fade.
const TOUCH = '@media (pointer: coarse)';

const NATIVE = {
  maskImage: {default: null, [TOUCH]: FADE},
  // Keyboard scrolling brings a focused child clear of the fade.
  scrollPaddingInline: {default: null, [TOUCH]: FADED},
} as const;

// A viewport that hides its native scrollbar has no other sign, so it fades
// with every pointer.
const HIDDEN = {
  maskImage: FADE,
  scrollPaddingInline: FADED,
} as const;

const START = {
  '--_scroll-fade-start-0': INSET,
  '--_scroll-fade-start-1': FADED,
  '--_scroll-fade-end-0': '0px',
  '--_scroll-fade-end-1': '0px',
} as const;
const END = {
  '--_scroll-fade-start-0': '0px',
  '--_scroll-fade-start-1': '0px',
  '--_scroll-fade-end-0': INSET,
  '--_scroll-fade-end-1': FADED,
} as const;
const BOTH = {
  '--_scroll-fade-start-0': INSET,
  '--_scroll-fade-start-1': FADED,
  '--_scroll-fade-end-0': INSET,
  '--_scroll-fade-end-1': FADED,
} as const;

const native = stylex.create({
  start: {...NATIVE, ...START},
  end: {...NATIVE, ...END},
  both: {...NATIVE, ...BOTH},
});

const hidden = stylex.create({
  start: {...HIDDEN, ...START},
  end: {...HIDDEN, ...END},
  both: {...HIDDEN, ...BOTH},
});

/** Whether the viewport shows the platform scrollbar or hides it. */
export type ScrollEdgeFadeScrollbar = 'native' | 'hidden';

/**
 * Styles that fade each inline edge of a scroll viewport that hides content.
 * A viewport whose inline axis does not scroll gets no style, so its paint
 * does not change. With its native scrollbar, a viewport fades only under a
 * coarse primary pointer, where the scrollbar overlays the content.
 */
export function scrollEdgeFadeStyles(
  inline: ScrollAxisState,
  scrollbar: ScrollEdgeFadeScrollbar = 'native',
): StyleXStyles {
  if (!inline.isScrollable || (inline.atStart && inline.atEnd)) {
    return null;
  }
  const set = scrollbar === 'hidden' ? hidden : native;
  if (inline.atStart) {
    return set.end;
  }
  return inline.atEnd ? set.start : set.both;
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
