// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputStyles.stylex.ts
 * @input Uses theme tokens (color, spacing, radius, shadow, transition)
 * @output Exports shared input wrapper appearance styles
 * @position Shared styles consumed by TextInput, TextArea, NumberInput, DateInput,
 *   TimeInput, Selector, Typeahead, and Tokenizer
 *
 * Centralizes the input wrapper appearance (borders, focus outlines, hover shadows,
 * disabled state, status variants) so all input components stay in sync.
 * Individual components layer their own overrides (padding, alignment, etc.)
 * via stylex.props composition.
 */

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  shadowVars,
  durationVars,
  easeVars,
  borderVars,
} from '../theme/tokens.stylex';

/**
 * Base wrapper styles shared by all input components.
 * Components apply these as a foundation and override specific properties
 * (e.g. padding, alignItems, gap) as needed.
 */
export const inputWrapperStyles = stylex.create({
  base: {
    boxSizing: 'border-box',
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    // Forced colors drop the inset shadow below and repaint author border
    // colors in one system color, so the field-focus treatment would vanish
    // there. A focused field's border takes the system Highlight color instead
    // (`spec:AST-020` FR1).
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':focus-within': {
        default: colorVars['--color-accent'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
    '--_field-radius': radiusVars['--radius-element'],
    borderRadius: 'var(--_field-radius)',
    backgroundColor: colorVars['--color-background-surface'],
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': `inset 0px 0px 0px 2px color-mix(in srgb, ${colorVars['--color-border-emphasized']} 30%, transparent)`,
        },
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
    outline: 'none',
  },
  disabled: {
    cursor: 'default',
    opacity: 0.5,
    borderColor: colorVars['--color-border-emphasized'],
    // Suppress the base hover ring — a disabled control must not react to hover.
    boxShadow: 'none',
  },
});

/**
 * Status border colors for input wrappers.
 * Keyed by InputStatusType. Under forced colors a focused field's border is
 * Highlight, as in the base style, for wrappers that apply no status focus
 * style of their own (Selector, MultiSelector).
 */
export const inputStatusBorderStyles = stylex.create({
  warning: {
    borderColor: {
      default: colorVars['--color-border-warning'],
      ':focus-within': {
        default: colorVars['--color-border-warning'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
  },
  error: {
    borderColor: {
      default: colorVars['--color-border-error'],
      ':focus-within': {
        default: colorVars['--color-border-error'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
  },
  success: {
    borderColor: {
      default: colorVars['--color-border-success'],
      ':focus-within': {
        default: colorVars['--color-border-success'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
  },
});

/**
 * Status hover shadow styles for input wrappers.
 * Keyed by InputStatusType.
 */
export const inputStatusHoverShadowStyles = stylex.create({
  warning: {
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': shadowVars['--shadow-inset-warning'],
        },
    },
  },
  error: {
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': shadowVars['--shadow-inset-error'],
        },
    },
  },
  success: {
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': shadowVars['--shadow-inset-success'],
        },
    },
  },
});

/**
 * Status focus border styles using :focus-within. Under forced colors the
 * focused border is Highlight, as in the base style.
 * Used by input wrappers that contain a child input/textarea element.
 * Keyed by InputStatusType.
 */
export const inputStatusFocusWithinStyles = stylex.create({
  warning: {
    borderColor: {
      default: colorVars['--color-border-warning'],
      ':focus-within': {
        default: colorVars['--color-border-warning'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
  },
  error: {
    borderColor: {
      default: colorVars['--color-border-error'],
      ':focus-within': {
        default: colorVars['--color-border-error'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
  },
  success: {
    borderColor: {
      default: colorVars['--color-border-success'],
      ':focus-within': {
        default: colorVars['--color-border-success'],
        '@media (forced-colors: active)': 'Highlight',
      },
    },
  },
});

/**
 * Status focus border styles using :focus.
 * Used by components where the wrapper itself receives focus (e.g. Selector button).
 * Keyed by InputStatusType.
 */
export const inputStatusFocusStyles = stylex.create({
  warning: {
    borderColor: {
      default: colorVars['--color-border-warning'],
      ':focus': colorVars['--color-border-warning'],
    },
  },
  error: {
    borderColor: {
      default: colorVars['--color-border-error'],
      ':focus': colorVars['--color-border-error'],
    },
  },
  success: {
    borderColor: {
      default: colorVars['--color-border-success'],
      ':focus': colorVars['--color-border-success'],
    },
  },
});
