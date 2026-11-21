// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputStyles.stylex.ts
 * @input Uses theme tokens (color, spacing, radius, shadow, transition)
 * @output Exports shared input wrapper appearance styles, and the text field
 *   timing that shows the focus look at once under a coarse pointer
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
  sizeVars,
  typeScaleVars,
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
      default: colorVars['--color-border-control'],
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
          '@media (hover: hover)': `inset 0px 0px 0px 2px color-mix(in srgb, ${colorVars['--color-border-control']} 30%, transparent)`,
        },
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
    outline: 'none',
  },
  disabled: {
    cursor: 'default',
    opacity: 0.5,
    borderColor: colorVars['--color-border-control'],
    // Suppress the base hover ring — a disabled control must not react to hover.
    boxShadow: 'none',
  },
  // Text fields apply this after `base`. A tap on one raises the keyboard,
  // and a fade would repaint the field on each frame of that rise.
  textField: {
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
      '@media (pointer: coarse)': '0s',
    },
  },
});

// One bordered body text line, as the input's own font sets it: on the iOS
// touch path the font has a 16px floor.
const BORDERS = `2 * ${borderVars['--border-width']}`;
const LINE_ROW = `calc(${typeScaleVars['--text-body-size']} * ${typeScaleVars['--text-body-leading']} + ${BORDERS})`;
const IOS_LINE_ROW = `calc(max(1rem, ${typeScaleVars['--text-body-size']}) * ${typeScaleVars['--text-body-leading']} + ${BORDERS})`;
// A NumberInput stepper column: two Icon `xsm` glyphs (0.75rem each, so they
// grow with the text) and the divider between them, inside the borders.
const STEPPER_ROW = `calc(2 * 0.75rem + ${borderVars['--border-width']} + ${BORDERS})`;
const SM = sizeVars['--size-element-sm'];
const MD = sizeVars['--size-element-md'];
const LG = sizeVars['--size-element-lg'];

/**
 * The row height of a one-line text field, by size: the larger of the size
 * and one bordered body text line. At the theme's default text size that is
 * the size, as before; larger text grows the row to hold its line inside the
 * borders. The height stays definite, so a theme's block padding cannot grow
 * the row at the default text size, and group members can still fill a row.
 * The coarse-pointer line follows the iOS 16px floor the input's own font
 * size has.
 */
export const inputRowSizeStyles = stylex.create({
  sm: {
    height: {
      default: `max(${SM}, ${LINE_ROW})`,
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(${SM}, ${IOS_LINE_ROW})`,
      },
    },
  },
  md: {
    height: {
      default: `max(${MD}, ${LINE_ROW})`,
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(${MD}, ${IOS_LINE_ROW})`,
      },
    },
  },
  lg: {
    height: {
      default: `max(${LG}, ${LINE_ROW})`,
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(${LG}, ${IOS_LINE_ROW})`,
      },
    },
  },
});

/**
 * The same row for a field with a stepper column, which is at least the
 * column's height, so stepper glyphs that grow with the text are not cut.
 * Under a coarse pointer the steppers are hidden and the row is the plain one.
 */
export const inputRowStepperSizeStyles = stylex.create({
  sm: {
    height: {
      default: `max(${SM}, ${LINE_ROW}, ${STEPPER_ROW})`,
      '@media (pointer: coarse)': {
        default: `max(${SM}, ${LINE_ROW})`,
        '@supports (-webkit-touch-callout: none)': `max(${SM}, ${IOS_LINE_ROW})`,
      },
    },
  },
  md: {
    height: {
      default: `max(${MD}, ${LINE_ROW}, ${STEPPER_ROW})`,
      '@media (pointer: coarse)': {
        default: `max(${MD}, ${LINE_ROW})`,
        '@supports (-webkit-touch-callout: none)': `max(${MD}, ${IOS_LINE_ROW})`,
      },
    },
  },
  lg: {
    height: {
      default: `max(${LG}, ${LINE_ROW}, ${STEPPER_ROW})`,
      '@media (pointer: coarse)': {
        default: `max(${LG}, ${LINE_ROW})`,
        '@supports (-webkit-touch-callout: none)': `max(${LG}, ${IOS_LINE_ROW})`,
      },
    },
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
 * Status hover shadow styles for input wrappers. Each keeps the base focus
 * ring.
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
      // This boxShadow replaces the base one whole, so it keeps the base
      // focus ring: the status border does not change on focus, and the ring
      // is the only sign of keyboard focus.
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
  error: {
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': shadowVars['--shadow-inset-error'],
        },
      // This boxShadow replaces the base one whole, so it keeps the base
      // focus ring: the status border does not change on focus, and the ring
      // is the only sign of keyboard focus.
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
  success: {
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': shadowVars['--shadow-inset-success'],
        },
      // This boxShadow replaces the base one whole, so it keeps the base
      // focus ring: the status border does not change on focus, and the ring
      // is the only sign of keyboard focus.
      ':focus-within': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
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
