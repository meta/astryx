// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuDirectionMirror.stylex.ts
 * @input None
 * @output Exports menuDirectionMirror: a StyleX style that flips an icon when
 *   the menu's own direction is right-to-left
 * @position Used by the sub-menu row's flyout chevron and its Back chevron
 *
 * The open and close keys read the menu's own direction. `:dir(rtl)`
 * follows the same `dir`. `rtlStyles.mirror` matches any RTL ancestor, so it
 * flips the icon in an LTR menu inside an RTL page.
 */

import * as stylex from '@stylexjs/stylex';

export const menuDirectionMirror = stylex.create({
  mirror: {
    transform: {default: null, ':dir(rtl)': 'scaleX(-1)'},
  },
});
