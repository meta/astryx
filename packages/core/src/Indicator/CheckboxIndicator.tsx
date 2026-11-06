// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CheckboxIndicator.tsx
 * @input Indicator state props
 * @output Exports CheckboxIndicator — the default checkbox selection visual
 * @position Decorative checkbox visual shared by CheckboxInput, CheckboxList,
 *           and decorative menu markers
 */

import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
  radiusVars,
} from '../theme/tokens.stylex';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {indicatorScope} from './indicator.markers.stylex';
import type {IndicatorProps} from './types';

const styles = stylex.create({
  box: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    borderRadius: radiusVars['--radius-inner'],
    transitionProperty: 'background-color, border-color',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  // State-dependent colors with ancestor hover behavior
  unchecked: {
    // Foreground for the inherit-shade loading spinner (reads currentColor):
    // brand accent on the light surface fill.
    color: colorVars['--color-accent'],
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': `color-mix(in srgb, ${colorVars['--color-border-emphasized']}, ${colorVars['--color-tint-hover']} 20%)`,
      },
    },
    backgroundColor: {
      default: colorVars['--color-background-surface'],
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': `color-mix(in srgb, ${colorVars['--color-background-surface']}, ${colorVars['--color-tint-hover']} 5%)`,
      },
    },
  },
  checked: {
    // Foreground for the inherit-shade loading spinner (reads currentColor):
    // on-accent color against the accent fill.
    color: colorVars['--color-on-accent'],
    borderColor: {
      default: colorVars['--color-accent'],
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': `color-mix(in srgb, ${colorVars['--color-accent']}, ${colorVars['--color-tint-hover']} 15%)`,
      },
    },
    backgroundColor: {
      default: colorVars['--color-accent'],
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': `color-mix(in srgb, ${colorVars['--color-accent']}, ${colorVars['--color-tint-hover']} 15%)`,
      },
    },
  },
  disabled: {
    opacity: 0.5,
    borderColor: {
      default: colorVars['--color-border'],
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': colorVars['--color-border'],
      },
    },
  },
  disabledUnchecked: {
    backgroundColor: {
      default: colorVars['--color-background-muted'],
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': colorVars['--color-background-muted'],
      },
    },
  },
  checkmark: {
    display: 'none',
    color: {
      default: colorVars['--color-on-accent'],
      // Forced colors (Windows High Contrast) does not reliably force an SVG
      // stroke painted with currentColor, so the check stays the same white as
      // the flattened (Canvas) box fill — a white check on a white box.
      // CanvasText keeps it perceivable on the Canvas box, matching the
      // indeterminate mark (WCAG 1.4.11).
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
  checkmarkVisible: {
    display: 'block',
  },
  indeterminateMark: {
    display: 'none',
    backgroundColor: {
      default: colorVars['--color-on-accent'],
      // Forced colors (Windows High Contrast) strips painted backgrounds,
      // which would make the indeterminate bar invisible; CanvasText keeps it
      // perceivable on the Canvas box fill (WCAG 1.4.11). The checkmark carries
      // the matching CanvasText treatment on its own style.
      '@media (forced-colors: active)': 'CanvasText',
    },
    borderRadius: radiusVars['--radius-full'],
  },
  indeterminateMarkVisible: {
    display: 'block',
  },
});

const boxSizeStyles = stylex.create({
  sm: {
    width: 20,
    height: 20,
  },
  md: {
    width: 24,
    height: 24,
  },
});

const checkmarkSizeStyles = stylex.create({
  sm: {
    width: 12,
    height: 12,
  },
  md: {
    width: 14,
    height: 14,
  },
});

const indeterminateSizeStyles = stylex.create({
  sm: {
    width: 10,
    height: 2,
  },
  md: {
    width: 12,
    height: 2,
  },
});

/**
 * The default checkbox visual: a square box with a checkmark or an
 * indeterminate bar.
 *
 * Decorative and non-interactive — it renders `aria-hidden` and owns no input,
 * role, or focus behavior. The owning control keeps focus semantics and paints its
 * standard focus ring onto this indicator element (see CheckboxInput), so a
 * replacement's root radius determines the ring shape. Themes replace it
 * wholesale through `defineTheme({indicators: {checkbox: MyCheckbox}})`, or
 * restyle it through the canonical `checkbox-indicator` theme target.
 *
 * @example
 * ```
 * <CheckboxIndicator state="indeterminate" size="sm" />
 * ```
 */
export function CheckboxIndicator({
  state,
  size = 'md',
  isDisabled = false,
  children,
  ref,
  className,
  style,
  xstyle,
  ...rest
}: IndicatorProps<'multiSelection'>) {
  const isChecked = state === 'checked';
  const isIndeterminate = state === 'indeterminate';
  const isCheckedOrIndeterminate = isChecked || isIndeterminate;

  return (
    <span
      // `{...rest}` first, own contract after. TypeScript cannot reject a
      // hyphenated JSX attribute (see IndicatorProps), so attribute order is
      // what actually keeps a caller from un-hiding a decorative element —
      // rubric P3, "owned aria-* set after {...rest}".
      {...rest}
      ref={ref}
      aria-hidden="true"
      {...mergeProps(
        themeProps('checkbox-indicator', {
          size,
          checked: isChecked
            ? 'checked'
            : isIndeterminate
              ? 'indeterminate'
              : null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          styles.box,
          boxSizeStyles[size],
          isCheckedOrIndeterminate ? styles.checked : styles.unchecked,
          isDisabled && styles.disabled,
          isDisabled && !isCheckedOrIndeterminate && styles.disabledUnchecked,
          xstyle,
        ),
        className,
        style,
      )}>
      {isRenderable(children) ? (
        children
      ) : (
        <>
          <svg
            viewBox="0 0 10 10"
            {...mergeProps(
              themeProps('checkbox-indicator-check', {size}),
              stylex.props(
                styles.checkmark,
                checkmarkSizeStyles[size],
                isChecked && styles.checkmarkVisible,
              ),
            )}>
            <path
              d="M8.5 2.5L4 7.5L1.5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            {...mergeProps(
              themeProps('checkbox-indicator-dash', {size}),
              stylex.props(
                styles.indeterminateMark,
                indeterminateSizeStyles[size],
                isIndeterminate && styles.indeterminateMarkVisible,
              ),
            )}
          />
        </>
      )}
    </span>
  );
}

CheckboxIndicator.displayName = 'CheckboxIndicator';
