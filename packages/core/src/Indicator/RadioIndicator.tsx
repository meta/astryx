// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioIndicator.tsx
 * @input Indicator state props
 * @output Exports RadioIndicator — the default radio selection visual
 * @position Decorative radio visual shared by RadioList, decorative menu
 *           markers, and any selection slot themed to use a radio
 */

import * as stylex from '@stylexjs/stylex';
import {
  borderVars,
  colorVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {indicatorScope} from './indicator.markers.stylex';
import type {IndicatorProps} from './types';

const styles = stylex.create({
  circle: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: borderVars['--border-width'],
    borderStyle: 'solid',
    // The circle marks a radio, so it ignores --radius-full.
    // 50% draws a circle on the square box the size styles set.
    borderRadius: '50%',
    transitionProperty: 'background-color, border-color',
    transitionDuration: {
      default: durationVars['--duration-fast'],
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  unchecked: {
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
  dot: {
    borderRadius: '50%',
    backgroundColor: {
      default: colorVars['--color-on-accent'],
      // Forced colors (Windows High Contrast) strips painted backgrounds,
      // which would make the selected dot invisible — checked and unchecked
      // radios would look identical. CanvasText keeps the dot perceivable on
      // the Canvas circle fill (WCAG 1.4.11).
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
});

const circleSizeStyles = stylex.create({
  sm: {
    width: 20,
    height: 20,
  },
  md: {
    width: 24,
    height: 24,
  },
});

// The dot keeps its share of the circle, so a theme that sizes the circle
// (`radio-indicator` width and height) gets a dot that stays centered inside
// it. A percentage reads the circle's content box, so the border is added back
// first: at the shipped 20px and 24px circles the dot stays exactly 8px and
// 10px, whatever `--border-width` a theme sets. Where the browser has
// `round()`, the share is rounded to whole pixels: Chromium draws a dot of a
// fractional size (a 13px circle, or a border set directly rather than through
// the token) as a rounded square despite its 50% radius. The rounded value
// sits behind `@supports`, so a browser without `round()` keeps the exact
// share instead of dropping the declaration (a value holding `var()` is only
// checked once the variable is substituted).
const share = (s: string) =>
  `calc((100% + 2 * ${borderVars['--border-width']}) * ${s})`;
const ROUND = '@supports (width: round(1px, 1px))';

const dotSizeStyles = stylex.create({
  sm: {
    width: {
      default: share('8 / 20'),
      [ROUND]: `round(${share('8 / 20')}, 1px)`,
    },
    height: {
      default: share('8 / 20'),
      [ROUND]: `round(${share('8 / 20')}, 1px)`,
    },
  },
  md: {
    width: {
      default: share('10 / 24'),
      [ROUND]: `round(${share('10 / 24')}, 1px)`,
    },
    height: {
      default: share('10 / 24'),
      [ROUND]: `round(${share('10 / 24')}, 1px)`,
    },
  },
});

/**
 * The default radio visual: a circle with a filled inner dot when selected.
 *
 * Decorative and non-interactive — it renders `aria-hidden` and owns no input,
 * role, or focus behavior. Themes replace it wholesale through
 * `defineTheme({indicators: {radio: MyRadio}})`, or restyle it through the
 * `radio-indicator` / `radio-indicator-dot` theme targets like any other
 * component.
 *
 * Unlike an icon, a radio draws in *both* states — an empty circle when
 * unchecked. That is what makes it usable as a selection indicator in
 * components whose default is "a checkmark when selected, nothing otherwise".
 *
 * @example
 * ```
 * <RadioIndicator state="checked" size="md" />
 * ```
 */
export function RadioIndicator({
  state,
  size = 'md',
  isDisabled = false,
  children,
  ref,
  className,
  style,
  xstyle,
  ...rest
}: IndicatorProps<'singleSelection'>) {
  // A radio has no partial state; anything other than unchecked reads as
  // selected.
  const isChecked = state !== 'unchecked';

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
        themeProps('radio-indicator', {
          size,
          checked: isChecked ? 'checked' : null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          styles.circle,
          circleSizeStyles[size],
          isChecked ? styles.checked : styles.unchecked,
          isDisabled && styles.disabled,
          isDisabled && !isChecked && styles.disabledUnchecked,
          xstyle,
        ),
        className,
        style,
      )}>
      {isRenderable(children)
        ? children
        : isChecked && (
            <span
              {...mergeProps(
                themeProps('radio-indicator-dot', {size}),
                stylex.props(styles.dot, dotSizeStyles[size]),
              )}
            />
          )}
    </span>
  );
}

RadioIndicator.displayName = 'RadioIndicator';
