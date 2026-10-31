// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputDisabledFocus.ts
 * @input Uses StyleX and theme tokens
 * @output inputDisabledFocusStyles (internal; not re-exported from Field/index.ts)
 * @position Field wrapper style shared by TextInput and TextArea
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';

export const inputDisabledFocusStyles = stylex.create({
  // The shared disabled style drops the focus ring; restore it while the field's
  // own control, a direct child, has keyboard focus (`spec:AST-085` FR6), so a
  // focused status button keeps only its own outline.
  ring: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':has(> [aria-disabled="true"]:focus-visible)':
        colorVars['--color-accent'],
    },
    boxShadow: {
      default: 'none',
      ':has(> [aria-disabled="true"]:focus-visible)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
});
