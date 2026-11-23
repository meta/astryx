// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuDirectionMirror.stylex.ts
 * @input None
 * @output Exports menuDirectionMirror: a StyleX style that flips an icon when
 *   the menu's own direction is right-to-left
 * @position Used by the sub-menu row's flyout chevron and its Back chevron
 *
 * The menu reads its own direction for the keys that open and close a
 * flyout, and the flyout opens on the side that direction gives. `:dir(rtl)`
 * reads that same direction. `rtlStyles.mirror` reads the nearest
 * `[dir="rtl"]` ancestor, so it flips the icon in a local LTR menu inside an
 * RTL document, against the key and the flyout.
 */

import * as stylex from '@stylexjs/stylex';

export const menuDirectionMirror = stylex.create({
  mirror: {
    transform: {default: null, ':dir(rtl)': 'scaleX(-1)'},
  },
});
