// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Badge.tsx
 * @input Uses React, HTMLAttributes
 * @output Exports Badge component, BadgeProps, BadgeVariant types
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Badge/Badge.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Badge/Badge.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Badge/index.ts (exports if types change)
 * - /apps/storybook/stories/Badge.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Badge/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import type {BadgeVariantMap} from './index';

/**
 * Base badge styles
 */
const styles = stylex.create({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-1'],
    height: spacingVars['--spacing-5'],
    paddingBlock: 0,
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-full'],
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    whiteSpace: 'nowrap',
    // A badge is one line by construction — fixed height, `nowrap` — so a
    // label wider than the space available has to go somewhere. Without these
    // it went *outside* its container: `nowrap` with nothing to clip it
    // neither wraps nor truncates, it just escapes, and lands on whatever sits
    // beside it. `minWidth: 0` matters as much as the max: as a flex item the
    // automatic minimum size would otherwise hold the badge at its full text
    // width and push the clamp back out again.
    maxWidth: '100%',
    minWidth: 0,
  },
  // The ellipsis goes on the label rather than the badge itself, because
  // `text-overflow` needs a block container and taking the root off
  // `inline-flex` to get one would cost the icon its centring. The label is a
  // flex item, so it needs its own `minWidth: 0` for the same reason as above.
  label: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
});

/**
 * Variant styles for different badge appearances.
 * Semantic variants use solid backgrounds; non-semantic use tinted backgrounds.
 */
const variants = stylex.create({
  // Semantic variants
  neutral: {
    backgroundColor: colorVars['--color-neutral'],
    color: colorVars['--color-text-primary'],
  },
  info: {
    backgroundColor: colorVars['--color-info'],
    color: colorVars['--color-on-info'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  success: {
    backgroundColor: colorVars['--color-success'],
    color: colorVars['--color-on-success'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  warning: {
    backgroundColor: colorVars['--color-warning'],
    color: colorVars['--color-on-warning'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  error: {
    backgroundColor: colorVars['--color-error'],
    color: colorVars['--color-on-error'],
    // Forced colors replace status fills with Canvas; this boundary keeps the
    // fill's shape visible (architecture:theme-tokens INV11).
    outlineWidth: {default: null, '@media (forced-colors: active)': '1px'},
    outlineStyle: {default: null, '@media (forced-colors: active)': 'solid'},
    outlineColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
    outlineOffset: {default: null, '@media (forced-colors: active)': '-1px'},
  },
  // Non-semantic color variants — tinted backgrounds with colored text
  blue: {
    backgroundColor: colorVars['--color-background-blue'],
    color: colorVars['--color-text-blue'],
  },
  cyan: {
    backgroundColor: colorVars['--color-background-cyan'],
    color: colorVars['--color-text-cyan'],
  },
  green: {
    backgroundColor: colorVars['--color-background-green'],
    color: colorVars['--color-text-green'],
  },
  orange: {
    backgroundColor: colorVars['--color-background-orange'],
    color: colorVars['--color-text-orange'],
  },
  pink: {
    backgroundColor: colorVars['--color-background-pink'],
    color: colorVars['--color-text-pink'],
  },
  purple: {
    backgroundColor: colorVars['--color-background-purple'],
    color: colorVars['--color-text-purple'],
  },
  red: {
    backgroundColor: colorVars['--color-background-red'],
    color: colorVars['--color-text-red'],
  },
  teal: {
    backgroundColor: colorVars['--color-background-teal'],
    color: colorVars['--color-text-teal'],
  },
  yellow: {
    backgroundColor: colorVars['--color-background-yellow'],
    color: colorVars['--color-text-yellow'],
  },
});

/**
 * Badge variant type derived from BadgeVariantMap.
 * Extensible via module augmentation of BadgeVariantMap.
 */
export type BadgeVariant = keyof BadgeVariantMap;

export interface BadgeProps extends BaseProps<HTMLSpanElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLSpanElement>;
  /**
   * The visual style variant of the badge.
   * @default 'neutral'
   */
  variant?: BadgeVariant;
  /**
   * The badge label text.
   */
  label: ReactNode;

  /**
   * Optional icon to display before the label.
   */
  icon?: ReactNode;
}

/**
 * A badge component for displaying status indicators, counts, or labels.
 *
 * Styles use Astryx theme tokens via StyleX.
 * Wrap your app in <Theme> to apply a theme.
 *
 * @example
 * ```
 * <Badge label="Active" />
 * <Badge variant="success" label="Active" />
 * <Badge variant="error" label="3" />
 * <Badge variant="purple" label="Engineering" />
 * ```
 */
export function Badge({
  variant = 'neutral',
  label,
  icon,
  xstyle,
  className,
  style,
  ref,
  ...props
}: BadgeProps) {
  // Clipping a label makes its tail unrecoverable, so the full text has to
  // stay reachable somewhere. `title` is the half of that answer which costs
  // nothing: no measurement, no hook, so `Badge` renders the same on the
  // server and stays usable in a server component. It follows the shape
  // `BaseTable` already uses for a truncated header cell (BaseTable.tsx) —
  // string content only, and only when there is something to show.
  //
  // A rich label is left alone: it is a subtree whose text would have to be
  // flattened to a string, and flattening renders a guess — an icon, a
  // `<strong>`, a nested element all read differently.
  //
  // It is set whether or not the label actually fits, because knowing that
  // requires measuring. The refinement — a tooltip only when the text is
  // really cut, reachable by hover and by focus — needs that measurement and
  // a client component, so it is tracked in #5585.
  const labelTitle =
    typeof label === 'number'
      ? String(label)
      : typeof label === 'string' && label.length > 0
        ? label
        : undefined;

  return (
    <span
      ref={ref}
      {...mergeProps(
        themeProps('badge', {variant}),
        stylex.props(styles.base, variants[variant], xstyle),
        className,
        style,
      )}
      title={labelTitle}
      {...props}>
      {icon}
      <span {...stylex.props(styles.label)}>{label}</span>
    </span>
  );
}

Badge.displayName = 'Badge';
