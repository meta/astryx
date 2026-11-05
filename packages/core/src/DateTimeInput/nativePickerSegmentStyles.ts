// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file nativePickerSegmentStyles.ts
 * @input Uses StyleX and Astryx typography, color, and radius tokens
 * @output Exports styles shared by DateTimeInput's native date and time controls
 * @position Internal styling shared by NativeDateSegment and NativeTimeSegment
 */

import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  radiusVars,
  typeScaleVars,
  typographyVars,
} from '../theme/tokens.stylex';

export const nativePickerSegmentStyles = stylex.create({
  iconButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    borderRadius: radiusVars['--radius-element'],
  },
  iconButtonDisabled: {
    cursor: 'default',
  },
  input: {
    display: 'block',
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    borderStyle: 'none',
    padding: 0,
    fontFamily: typographyVars['--font-family-body'],
    // Below 16px iOS zooms the page when the field takes focus. Only iOS
    // WebKit implements -webkit-touch-callout, so the coarse-pointer floor is
    // keyed to iOS alone.
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
    outline: 'none',
    // Native date/time controls size from their internal edit fields. Pin the
    // box to one text line so both segments stay aligned. The calc fallback
    // mirrors the iOS-only floor above; browsers with `1lh` track it for free.
    height: {
      default: stylex.firstThatWorks(
        '1lh',
        `calc(${typeScaleVars['--text-body-size']} * ${typeScaleVars['--text-body-leading']})`,
      ),
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': stylex.firstThatWorks(
          '1lh',
          `calc(max(1rem, ${typeScaleVars['--text-body-size']}) * ${typeScaleVars['--text-body-leading']})`,
        ),
      },
    },
    WebkitAppearance: 'none',
    appearance: 'none',
    // DateTimeInput renders its own calendar/clock affordances.
    '::-webkit-calendar-picker-indicator': {
      display: 'none',
    },
    '::-webkit-date-and-time-value': {
      textAlign: 'start',
      marginBlock: 0,
      marginInline: 0,
      paddingBlock: 0,
      paddingInline: 0,
      lineHeight: 'inherit',
      minHeight: 0,
    },
    '::-webkit-datetime-edit': {
      paddingBlock: 0,
      paddingInline: 0,
      lineHeight: 'inherit',
    },
  },
  inputDisabled: {
    cursor: 'default',
  },
  inputInvalid: {
    color: colorVars['--color-text-secondary'],
  },
  inputTextHidden: {
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  },
  slot: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minInlineSize: 0,
  },
  overlay: {
    position: 'absolute',
    insetInlineStart: 0,
    insetInlineEnd: 0,
    insetBlock: 0,
    display: 'block',
    // The same iOS-only floor as the input it covers, shared baselines.
    fontSize: {
      default: typeScaleVars['--text-body-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-body-size']})`,
      },
    },
    lineHeight: typeScaleVars['--text-body-leading'],
    pointerEvents: 'none',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  overlayValue: {
    color: colorVars['--color-text-primary'],
  },
  overlayPlaceholder: {
    color: colorVars['--color-text-secondary'],
  },
});
