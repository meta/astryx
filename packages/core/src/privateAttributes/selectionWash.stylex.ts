// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/selectionWash.stylex.ts
 * @input None.
 * @output `selectionWashTextStyles`, the selected table row's secondary text
 *   while the row paints the selection wash.
 * @position Style sibling of privateAttributes/selectionWash.ts. TableRow
 *   spreads it. No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';
import {selectedTintTextVars} from '../theme/selectedTintText.stylex';

// The measured text is for the wash; a row selected without it keeps its own
// text. A theme's own selected-row text wins, because theme rules sit in a
// later layer.
export const selectionWashTextStyles = stylex.create({
  row: {
    '--color-text-secondary': {
      default: null,
      ':is([aria-selected="true"][data-astryx-selection-wash])':
        selectedTintTextVars['--_selected-text-secondary'],
    },
  },
});
