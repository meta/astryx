// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuBottomSheet.stylex.ts
 * @input Uses StyleX and the spacing tokens
 * @output Exports menuBottomSheetStyles, the content box of a menu's sheet
 * @position Shared by DropdownMenu and ContextMenu sheet content
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';

export const menuBottomSheetStyles = stylex.create({
  // The menu's own content element carries the inset a wrapper used to:
  // MenuBottomSheet gives the sheet no content padding, and this element
  // keeps 16px above the first row and 4px at the sides. The container
  // variables tell bleeding children the padding actually applied.
  content: {
    boxSizing: 'border-box',
    paddingBlockStart: spacingVars['--spacing-4'],
    paddingBlockEnd: 0,
    paddingInline: spacingVars['--spacing-1'],
    '--container-padding-inline-start': spacingVars['--spacing-1'],
    '--container-padding-inline-end': spacingVars['--spacing-1'],
    '--container-padding-block-start': spacingVars['--spacing-4'],
    '--container-padding-block-end': '0px',
  },
  // The heading alone, without a back button beside it, keeps the row's gap
  // to the actions.
  headingAlone: {
    marginBottom: spacingVars['--spacing-2'],
  },
});
