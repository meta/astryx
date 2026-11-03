// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/press.stylex.ts
 * @input The press attribute that the press controller
 *   (utils/pressFeedback.ts) writes on a pressed element
 * @output rowPressPaintStyles: a CheckboxList row's press paint for its box
 * @position Owner module of the private press attribute, for styles that
 *   read it. No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';

export const rowPressPaintStyles = stylex.create({
  // None at rest. Under a coarse pointer it is the press paint while the row
  // itself is pressed or its press fades out. A box reads its nearest row's
  // value, so a list in a row's content keeps its own rows' paint.
  checkboxRow: {
    '--_checkbox-row-press-paint': {
      default: 'none',
      ':is([data-astryx-press="on"])': {
        default: 'none',
        '@media (pointer: coarse)': 'var(--_press-paint-image)',
      },
      ':is([data-astryx-press="fading"])': {
        default: 'none',
        '@media (pointer: coarse)': 'var(--_press-paint-image)',
      },
    },
  },
});
