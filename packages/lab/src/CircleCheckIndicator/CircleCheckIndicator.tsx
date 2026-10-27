// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircleCheckIndicator.tsx
 * @input Indicator state props (`@astryxdesign/core/Indicator`), the theme's
 *   colour and radius tokens, the indicator scope marker, and UIKit's
 *   multiselect circle and mark clock as mirrored in circleCheck.stylex.ts
 * @output Exports CircleCheckIndicator — the iOS multiple-selection mark: an
 *   empty circle, a filled circle with a checkmark, or a filled circle with a
 *   bar for the partial state
 * @position Lab experiment. A multiSelection-family indicator: a theme maps
 *   it to `checkbox` (`defineTheme({indicators: {checkbox:
 *   CircleCheckIndicator}})`), and a list's edit mode can render it directly
 *
 * Geometry is UIKit's (`circleCheckTable` in circleCheck.table.ts: the circle's diameter
 * and stroke, the checkmark's ink box, stroke and offset below centre);
 * colours are the theme's: the accent fill, and the emphasized border the
 * checkbox's empty box uses for the empty ring.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/CircleCheckIndicator/CircleCheckIndicator.doc.mjs
 * - /packages/lab/src/CircleCheckIndicator/CircleCheckIndicator.test.tsx
 * - /packages/lab/src/CircleCheckIndicator/index.ts
 * - /apps/storybook/stories/CircleCheckIndicator.stories.tsx
 */

import * as stylex from '@stylexjs/stylex';
import type {IndicatorProps} from '@astryxdesign/core/Indicator';
import {indicatorPressScope} from '@astryxdesign/core/Indicator/indicator.markers.stylex';
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
    // A circle in tokens: --radius-full on a square box.
    borderRadius: radiusVars['--radius-full'],
    // The ring is an inset shadow (circleCheck.stylex.ts); forced colors
    // drops shadows, so there it falls back to a system-coloured border.
    borderStyle: {default: 'none', '@media (forced-colors: active)': 'solid'},
    borderWidth: {default: 0, '@media (forced-colors: active)': '1px'},
    borderColor: {
      default: 'transparent',
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
  // The empty circle is a ring: what is under it shows through, as under
  // UIKit's multiselect circle (a selected edit-mode row keeps its selected
  // background behind the mark).
  //
  // Hover and press come from the host as inherited private properties
  // (CheckboxInput's indicatorStateVars): an ancestor selector on core's
  // scope marker compiles to a different class in this package, so it never
  // matches.
  unchecked: {
    boxShadow: `inset 0 0 0 var(--_circle-stroke) color-mix(in srgb, ${colorVars['--color-border-emphasized']}, ${colorVars['--color-tint-hover']} calc(20% * var(--_indicator-hover, 0)))`,
    backgroundColor: 'transparent',
  },
  checked: {
    // Foreground for an inherit-shade loading spinner (reads currentColor).
    color: colorVars['--color-on-accent'],
    boxShadow: 'none',
    backgroundColor: `color-mix(in srgb, ${colorVars['--color-accent']}, ${colorVars['--color-tint-hover']} calc(15% * var(--_indicator-hover, 0)))`,
  },
  disabled: {
    opacity: 0.5,
  },
  // The press layer, painted on the circle itself: the host's layer is a
  // rounded square that would tint past the circle, and the host leaves it
  // off for an indicator marked `data-astryx-indicator-press="self"`
  // (indicatorPressScope). It reads the press image whose strength the
  // row's `pressedAlpha` drives (`--_press-paint-image`), for every
  // pointer: a mouse and a pen press through the same press controller as a
  // finger (`spec:AST-094` FR11's fine-pointer profile, FR43), so the image
  // is the circle's only press.
  ownPress: {
    position: 'relative',
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: radiusVars['--radius-full'],
      pointerEvents: 'none',
      backgroundImage: 'var(--_press-paint-image, none)',
    },
  },
  checkmark: {
    display: 'none',
    flexShrink: 0,
    overflow: 'visible',
    color: {
      default: colorVars['--color-on-accent'],
      // Forced colors flattens the fill to Canvas and does not reliably force
      // an SVG stroke painted with currentColor: CanvasText keeps the check
      // perceivable on it (WCAG 1.4.11), as on the checkbox.
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
 * The iOS multiple-selection mark: an empty circle when unchecked, a filled
 * circle with a checkmark when checked, and a filled circle with a bar for
 * the partial state.
 *
 * Decorative and non-interactive, like every indicator: it renders
 * `aria-hidden` and owns no input, role, or focus behavior. Map it to
 * `checkbox` in a theme and every CheckboxInput and CheckboxList follows; the
 * owning control keeps its semantics and paints its focus ring onto this
 * circle. Under a finger the mark changes in one frame, as UIKit's
 * selection marks do; with a mouse its colours fade over the theme duration. It draws the circle everywhere: map it only in a
 * theme meant for iOS.
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
      // `{...rest}` first, own contract after: attribute order is what keeps
      // a caller from un-hiding a decorative element (see IndicatorProps).
      {...rest}
      ref={ref}
      aria-hidden="true"
      // Paints its own press (styles.ownPress), so the host leaves its square
      // layer off.
      data-astryx-indicator-press="self"
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
