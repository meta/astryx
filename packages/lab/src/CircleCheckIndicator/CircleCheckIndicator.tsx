// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircleCheckIndicator.tsx
 * @input Indicator state props, the theme's colour and radius tokens, Core's
 *   indicator press marker, and the circle's styles (circleCheck.stylex.ts)
 * @output Exports CircleCheckIndicator, the iOS multiple-selection mark
 * @position Lab. A multiSelection-family indicator that a theme maps to
 *   `checkbox`
 *
 * SYNC: When modified, update CircleCheckIndicator.doc.mjs,
 *   CircleCheckIndicator.test.tsx, index.ts and the story.
 */

import * as stylex from '@stylexjs/stylex';
import type {IndicatorProps} from '@astryxdesign/core/Indicator';
import {indicatorScope} from '@astryxdesign/core/Indicator/indicator.markers.stylex';
import {indicatorPressScope} from '@astryxdesign/core/internal/indicatorPress.stylex';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {isRenderable, mergeProps, themeProps} from '@astryxdesign/core/utils';
import {
  circleCheckMotionStyles,
  circleCheckSizeStyles,
} from './circleCheck.stylex';

const styles = stylex.create({
  circle: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: radiusVars['--radius-full'],
    // Forced colors drops the inset-shadow ring, so a system-coloured border
    // draws it there.
    borderStyle: {default: 'none', '@media (forced-colors: active)': 'solid'},
    borderWidth: {default: 0, '@media (forced-colors: active)': '1px'},
    borderColor: {
      default: 'transparent',
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
  // The empty circle is a ring with a clear centre, as UIKit's is. A selected
  // edit-mode row keeps its background behind the mark.
  unchecked: {
    boxShadow: {
      default: `inset 0 0 0 var(--_circle-stroke) ${colorVars['--color-border-emphasized']}`,
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': `inset 0 0 0 var(--_circle-stroke) color-mix(in srgb, ${colorVars['--color-border-emphasized']}, ${colorVars['--color-tint-hover']} 20%)`,
      },
    },
    backgroundColor: 'transparent',
  },
  checked: {
    // An inherit-shade loading spinner reads this colour as currentColor.
    color: colorVars['--color-on-accent'],
    boxShadow: 'none',
    backgroundColor: {
      default: colorVars['--color-accent'],
      [stylex.when.ancestor(':hover', indicatorScope)]: {
        '@media (hover: hover)': `color-mix(in srgb, ${colorVars['--color-accent']}, ${colorVars['--color-tint-hover']} 15%)`,
      },
    },
  },
  disabled: {
    opacity: 0.5,
  },
  // The press paints on the circle itself. The host's rounded-square layer
  // would tint past the circle, so the host leaves it off here. A press the
  // controller paints arrives as `--_indicator-press-image`, which only a
  // CheckboxInput row declares, so a menu row's own press never paints twice.
  ownPress: {
    position: 'relative',
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: radiusVars['--radius-full'],
      pointerEvents: 'none',
      backgroundColor: {
        default: 'transparent',
        // A press the controller does not paint. While the controller paints
        // the row's press, the row hands down `--_indicator-active-press` as
        // transparent and the image below paints it.
        [stylex.when.ancestor(':active', indicatorScope)]: {
          default: `var(--_indicator-active-press, ${colorVars['--color-overlay-pressed']})`,
          '@media (pointer: coarse)': 'transparent',
        },
      },
      // The controller's press on every pointer, as CheckboxInput's own layer
      // paints it.
      backgroundImage: 'var(--_indicator-press-image, none)',
    },
  },
  checkmark: {
    display: 'none',
    flexShrink: 0,
    overflow: 'visible',
    color: {
      default: colorVars['--color-on-accent'],
      // Forced colors flattens the fill to Canvas and may not force an SVG
      // stroke drawn with currentColor. CanvasText keeps the check visible on
      // it (WCAG 1.4.11).
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
  checkmarkVisible: {
    display: 'block',
  },
  bar: {
    display: 'none',
    flexShrink: 0,
    backgroundColor: {
      default: colorVars['--color-on-accent'],
      '@media (forced-colors: active)': 'CanvasText',
    },
    borderRadius: radiusVars['--radius-full'],
  },
  barVisible: {
    display: 'block',
  },
});

const CIRCLE = {
  sm: circleCheckSizeStyles.smCircle,
  md: circleCheckSizeStyles.mdCircle,
} as const;
const CHECK = {
  sm: circleCheckSizeStyles.smCheck,
  md: circleCheckSizeStyles.mdCheck,
} as const;
const BAR = {
  sm: circleCheckSizeStyles.smBar,
  md: circleCheckSizeStyles.mdBar,
} as const;

/**
 * The iOS multiple-selection mark. It shows an empty circle when unchecked
 * and a filled circle with a checkmark when checked. The partial state fills
 * the circle with a bar.
 *
 * Decorative and non-interactive, like every indicator: it renders
 * `aria-hidden` and owns no input, role, or focus behavior. Map it to
 * `checkbox` in a theme, and every CheckboxInput and CheckboxList draws it.
 * The owning control keeps its semantics and paints its focus ring on the
 * circle. Its colours fade over the theme duration on every pointer, and
 * change at once under Reduce Motion. It draws the circle everywhere, so
 * map it only in a theme meant for iOS.
 *
 * @example
 * ```
 * const theme = defineTheme({
 *   name: 'circle-checks',
 *   indicators: {checkbox: CircleCheckIndicator},
 * });
 * ```
 */
export function CircleCheckIndicator({
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
  const isFilled = isChecked || isIndeterminate;

  return (
    <span
      // `{...rest}` goes first, so a caller cannot un-hide this decorative
      // element (see IndicatorProps).
      {...rest}
      ref={ref}
      aria-hidden="true"
      {...mergeProps(
        themeProps('circle-check-indicator', {
          size,
          checked: isChecked
            ? 'checked'
            : isIndeterminate
              ? 'indeterminate'
              : null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          // Marks the circle as painting its own press (styles.ownPress), so
          // the host leaves its square layer off.
          indicatorPressScope,
          styles.circle,
          !isDisabled && styles.ownPress,
          circleCheckMotionStyles.mark,
          CIRCLE[size],
          isFilled ? styles.checked : styles.unchecked,
          isDisabled && styles.disabled,
          xstyle,
        ),
        className,
        style,
      )}>
      {isRenderable(children) ? (
        children
      ) : (
        <>
          {/* The check's ink fills its box: the round caps reach the edges. */}
          <svg
            viewBox="0 0 10 10"
            {...mergeProps(
              themeProps('circle-check-indicator-check', {size}),
              stylex.props(
                styles.checkmark,
                CHECK[size],
                isChecked && styles.checkmarkVisible,
              ),
            )}>
            <path
              d="M0.75 5.25L3.75 9.25L9.25 0.75"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            {...mergeProps(
              themeProps('circle-check-indicator-dash', {size}),
              stylex.props(
                styles.bar,
                BAR[size],
                isIndeterminate && styles.barVisible,
              ),
            )}
          />
        </>
      )}
    </span>
  );
}

CircleCheckIndicator.displayName = 'CircleCheckIndicator';
