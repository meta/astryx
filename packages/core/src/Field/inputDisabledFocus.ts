// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputDisabledFocus.ts
 * @input Uses StyleX and theme tokens
 * @output inputDisabledFocusStyles (internal; not re-exported from Field/index.ts):
 *   the one place every field's disabled focus ring is defined
 * @position Field wrapper style shared by the text-entry fields
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
      ':has(> [aria-disabled="true"]:focus-visible)': {
        default: colorVars['--color-accent'],
        // Forced colors repaint author borders in one system color and drop
        // the inset shadow; Highlight keeps the focused field visible.
        '@media (forced-colors: active)': 'Highlight',
      },
    },
    boxShadow: {
      default: 'none',
      ':has(> [aria-disabled="true"]:focus-visible)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
  // The same ring for a field whose input sits deeper than the wrapper's
  // direct children (Typeahead, Tokenizer). Keyed on the input itself, so a
  // focused token or status button keeps only its own outline.
  nestedRing: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':has(input[aria-disabled="true"]:focus-visible)': {
        default: colorVars['--color-accent'],
        // Forced colors repaint author borders in one system color and drop
        // the inset shadow; Highlight keeps the focused field visible.
        '@media (forced-colors: active)': 'Highlight',
      },
    },
    boxShadow: {
      default: 'none',
      ':has(input[aria-disabled="true"]:focus-visible)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },

  // The same ring for a field that restores it while focus is anywhere inside
  // it (TimeInput, DateRangeInput, DateTimeInput and their touch fields).
  withinRing: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': {
        default: colorVars['--color-accent'],
        // Forced colors repaint author borders in one system color and drop
        // the inset shadow; Highlight keeps the focused field visible.
        '@media (forced-colors: active)': 'Highlight',
      },
    },
    boxShadow: {
      default: 'none',
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
  // The same ring for a field that restores it while its text input has focus
  // (DateInput and its native and touch fields).
  inputFocusRing: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':has(input:focus)': {
        default: colorVars['--color-accent'],
        // Forced colors repaint author borders in one system color and drop
        // the inset shadow; Highlight keeps the focused field visible.
        '@media (forced-colors: active)': 'Highlight',
      },
    },
    boxShadow: {
      default: 'none',
      ':has(input:focus)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
});
