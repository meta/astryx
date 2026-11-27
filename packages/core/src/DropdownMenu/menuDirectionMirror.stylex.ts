// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuDirectionMirror.stylex.ts
 * @input None
 * @output Exports menuDirectionMirror: a StyleX style that flips an icon when
 *   the menu's own direction is right-to-left
 * @position Used by the sub-menu row's flyout chevron and its Back chevron
 *
 * The open and close keys read the menu's own direction. `:dir(rtl)`
 * follows the nearest `dir`. `rtlStyles.mirror` matches any RTL ancestor, so
 * it flips the icon in an LTR menu inside an RTL page.
 *
 * A layer that portals out of an unsafe ancestor copies the direction it would
 * lose, on `dir` as well as in CSS, so this style follows it there too.
 */

import * as stylex from '@stylexjs/stylex';

export const menuDirectionMirror = stylex.create({
  mirror: {
    transform: {default: null, ':dir(rtl)': 'scaleX(-1)'},
  },
});
