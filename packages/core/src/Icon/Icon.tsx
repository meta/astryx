// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Icon.tsx
 * @input Uses ReactSVGProps, icon components or semantic icon names, and an
 *   optional IconVariant request
 * @output Exports Icon component, IconProps, IconColor, IconSize, IconType types
 * @position Core implementation; consumed by index.ts, tested by Icon.test.tsx
 *
 * Supports two modes:
 * - Component mode: Pass an SVG icon component (e.g. from @heroicons/react) — rendered
 *   directly with and spread SVG props.
 * - String mode: Pass a semantic name (e.g. 'close', 'chevronDown') — resolved from the
 *   theme's icon registry (or built-in fallback SVGs) and wrapped in a styled span.
 *   A function registry entry receives `{size, variant}`: the size resolved by
 *   ORD1 and the requested variant when the entry can receive it.
 *
 * Both modes size the glyph from the `icon` target's private size vars
 * (`iconSizeStyles` in IconSize.stylex.ts, `registrySizeStyles` below), so a
 * theme's `width` and `height` on that target's size selector set the size's
 * glyph dimension, including the font size 1em-based registry artwork follows.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Icon/Icon.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Icon/Icon.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Icon/index.ts (exports if types change)
 * - /apps/storybook/stories/Icon.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Icon/ (showcase blocks)
 */

import React, {type ComponentType, type SVGProps} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import {useThemeName} from '../theme/useTheme';
import {resolveIcon} from './globalIconRegistry';
import type {IconName, NamespacedIconName} from './globalIconRegistry';
import type {IconVariant} from './index';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import {useIconSize} from './IconDefaultSizeContext';
import {iconSizeStyles, type IconSize} from './IconSize.stylex';

export type {IconSize} from './IconSize.stylex';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    flexShrink: 0,
  },
  /** Wrapper for string-based (registry) icons */
  span: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

/**
 * Size styles for string-based registry icons: the glyph dimensions
 * `iconSizeStyles` reads from the `icon` target's private vars, plus a
 * `fontSize`, because registry artwork is 1em-based. `fontSize` is the smaller
 * side, which fits square artwork into a non-square box the way an SVG viewBox
 * does.
 */
const registrySizeStyles = stylex.create({
  xsm: {
    width: 'var(--_icon-width, 0.75rem)',
    height: 'var(--_icon-height, 0.75rem)',
    fontSize: 'min(var(--_icon-width, 0.75rem), var(--_icon-height, 0.75rem))',
  },
  sm: {
    width: 'var(--_icon-width, 1rem)',
    height: 'var(--_icon-height, 1rem)',
    fontSize: 'min(var(--_icon-width, 1rem), var(--_icon-height, 1rem))',
  },
  md: {
    width: 'var(--_icon-width, 1.25rem)',
    height: 'var(--_icon-height, 1.25rem)',
    fontSize: 'min(var(--_icon-width, 1.25rem), var(--_icon-height, 1.25rem))',
  },
  lg: {
    width: 'var(--_icon-width, 1.5rem)',
    height: 'var(--_icon-height, 1.5rem)',
    fontSize: 'min(var(--_icon-width, 1.5rem), var(--_icon-height, 1.5rem))',
  },
});

const colorStyles = stylex.create({
  primary: {
    color: colorVars['--color-icon-primary'],
  },
  secondary: {
    color: colorVars['--color-icon-secondary'],
  },
  tertiary: {
    color: colorVars['--color-icon-secondary'],
  },
  disabled: {
    color: colorVars['--color-icon-disabled'],
  },
  accent: {
    color: colorVars['--color-accent'],
  },
  info: {
    color: colorVars['--color-icon-info'],
  },
  success: {
    color: colorVars['--color-icon-success'],
  },
  error: {
    color: colorVars['--color-icon-error'],
  },
  warning: {
    color: colorVars['--color-icon-warning'],
  },
  inherit: {
    color: 'inherit',
  },
  // Non-semantic colors
  blue: {
    color: colorVars['--color-icon-blue'],
  },
  red: {
    color: colorVars['--color-icon-red'],
  },
  green: {
    color: colorVars['--color-icon-green'],
  },
  gray: {
    color: colorVars['--color-icon-gray'],
  },
  cyan: {
    color: colorVars['--color-icon-cyan'],
  },
  teal: {
    color: colorVars['--color-icon-teal'],
  },
  yellow: {
    color: colorVars['--color-icon-yellow'],
  },
  orange: {
    color: colorVars['--color-icon-orange'],
  },
  pink: {
    color: colorVars['--color-icon-pink'],
  },
  purple: {
    color: colorVars['--color-icon-purple'],
  },
});

// =============================================================================
// Types
// =============================================================================

export type IconColor = keyof typeof colorStyles;

/**
 * Type for icon components that can be passed to Icon.
 * Use this type when accepting an icon prop in other components.
 */
export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Props for Icon component.
 * Extends SVGProps to allow passing additional SVG attributes (used when icon is a component).
 */
export interface IconProps extends Omit<
  SVGProps<SVGSVGElement>,
  'ref' | 'color'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<SVGSVGElement>;
  /**
   * Icon to render. Can be:
   * - A semantic name string (e.g. 'close', 'chevronDown') — resolved from theme or built-in fallback
   * - A namespaced extension key (e.g. 'richtext:bold') for a glyph owned by
   *   one component or library — resolved the same way, themeable by key
   * - An SVG icon component (e.g. from @heroicons/react) — rendered directly
   */
  icon: IconType | IconName | NamespacedIconName;
  /**
   * The color variant of the icon.
   * @default 'inherit'
   */
  color?: IconColor;
  /**
   * The size of the icon.
   * - 'xsm': 0.75rem (12px at a 16px root)
   * - 'sm': 1rem (16px at a 16px root)
   * - 'md': 1.25rem (20px at a 16px root)
   * - 'lg': 1.5rem (24px at a 16px root)
   *
   * A theme sets a size's glyph dimension with `width` and `height`, in `px`
   * or `rem`, on `components.icon['size:sm']` (and the other sizes).
   *
   * An explicit value wins. When omitted, Icon uses the nearest default supplied
   * by an owning Astryx component for its icon slot, then falls back to 'md'.
   */
  size?: IconSize;
  /**
   * Requests the active theme's alternate artwork for a semantic icon name,
   * such as `'filled'`. Names come from the augmentable `IconVariantMap`.
   *
   * The theme's icon entry receives the variant only when the active theme
   * lists it in `iconVariants` and, for an entry a theme supplied, the theme
   * that defined the entry lists it too. Otherwise the entry receives
   * `undefined` and draws its normal artwork. An icon component passed
   * directly renders as given and never receives `variant`, and `variant` is
   * never written to the DOM or reflected on the `icon` theming target.
   *
   * @example
   * ```
   * <Icon icon="info" variant="filled" />
   * ```
   */
  variant?: IconVariant;
  /**
   * Accessible name for the icon. Set this only when the icon is MEANINGFUL on
   * its own — a standalone status glyph or an icon-only indicator with no
   * adjacent text conveying the same information. Providing it exposes the icon
   * to assistive tech as `role="img"` with this string as the accessible name
   * (via `aria-label`) and drops the default `aria-hidden="true"`.
   *
   * Omit it (the default) for decorative icons — the common case, e.g. an icon
   * beside a text label — and the icon stays hidden from assistive tech
   * (`aria-hidden="true"`). An empty string (`''`) is treated the same as
   * omitting it (decorative), since an empty accessible name is meaningless.
   *
   * Don't set `label` when an interactive parent (Button, IconButton, link)
   * already names the control — that produces a duplicate announcement.
   *
   * Meaningful, standalone icon: give it a label.
   *
   * @example
   * ```
   * <Icon icon="success" label="Completed" />
   * ```
   *
   * Decorative icon (the default): omit label.
   *
   * @example
   * ```
   * <Icon icon="search" />
   * ```
   */
  label?: string;
  /**
   * StyleX styles created via `stylex.create()`. Folded into the icon's own
   * `stylex.props()` call (as the last argument) so it merges with the base
   * color/size styles for optimal deduplication, matching how other Astryx
   * components accept `xstyle`.
   *
   * @example
   * ```
   * const overrides = stylex.create({ root: { opacity: 0.5 } });
   * <Icon icon="search" xstyle={overrides.root} />
   * ```
   */
  xstyle?: StyleXStyles;
}

/**
 * Derives the ARIA attributes for an icon from its `label` prop.
 *
 * - Non-empty `label` → meaningful image: `role="img"` + `aria-label`, and no
 *   `aria-hidden` (an `aria-hidden` element is removed from the accessibility
 *   tree, so its accessible name would be ignored).
 * - Omitted or empty `label` → decorative default: `aria-hidden="true"`.
 *
 * The result is spread BEFORE `{...props}` in both render modes so an explicit
 * `aria-hidden` / `role` / `aria-label` from the consumer always wins.
 */
function getIconA11yProps(
  label: string | undefined,
): {role: 'img'; 'aria-label': string} | {'aria-hidden': 'true'} {
  return label != null && label !== ''
    ? {role: 'img', 'aria-label': label}
    : {'aria-hidden': 'true'};
}

// =============================================================================
// Component
// =============================================================================

/**
 * Renders an icon from the icon registry or a custom SVG component.
 *
 * @example
 * ```
 * <Icon icon="close" size="md" color="primary" />
 * ```
 */
export function Icon({
  icon,
  color = 'inherit',
  size: sizeProp,
  variant,
  label,
  ref,
  className,
  style,
  xstyle,
  ...props
}: IconProps) {
  const size = useIconSize(sizeProp);
  // Derive ARIA from `label`: decorative (aria-hidden) by default, or a
  // meaningful image (role="img" + aria-label) when `label` is non-empty.
  const a11yProps = getIconA11yProps(label);

  // String mode: resolve from icon registry, wrap in styled span
  if (typeof icon === 'string') {
    return (
      <IconFromRegistry
        name={icon}
        color={color}
        size={size}
        variant={variant}
        a11yProps={a11yProps}
        className={className}
        style={style}
        xstyle={xstyle}
        spanProps={props}
      />
    );
  }

  // Component mode: render SVG component directly with ref forwarding. A
  // supplied component never receives `variant`; it was destructured above.
  const IconComponent = icon;
  return (
    <IconComponent
      ref={ref}
      // Derived a11y (decorative default or meaningful `label`) is spread
      // BEFORE {...props} so an explicit aria-hidden/role/aria-label from the
      // consumer still wins as an escape hatch.
      {...a11yProps}
      // The styling props (className, style, xstyle) are handled here so they
      // COMPOSE with the internal classes/styles instead of clobbering them:
      // xstyle folds into stylex.props, and className/style merge via
      // mergeProps. The remaining rest props keep their prior last-spread
      // precedence as escape hatches.
      {...mergeProps(
        themeProps('icon', {size, color}),
        stylex.props(
          styles.root,
          colorStyles[color],
          iconSizeStyles[size],
          xstyle,
        ),
        className ?? undefined,
        style,
      )}
      {...props}
    />
  );
}

Icon.displayName = 'Icon';

// =============================================================================
// Internal: Registry Icon Renderer
// =============================================================================

/**
 * Internal component that resolves a semantic icon name from the registry
 * and renders it in a styled span with proper sizing.
 *
 * Extracted as a separate component so the registry is only read when the
 * icon prop is a string. A function entry receives the resolved size and the
 * requested variant when the entry can receive it.
 */
function IconFromRegistry({
  name,
  color,
  size,
  variant,
  a11yProps,
  className,
  style,
  xstyle,
  spanProps,
}: {
  name: IconName | NamespacedIconName;
  color: IconColor;
  size: IconSize;
  variant: IconVariant | undefined;
  a11yProps: {role: 'img'; 'aria-label': string} | {'aria-hidden': 'true'};
  className?: string;
  style?: React.CSSProperties;
  xstyle?: StyleXStyles;
  spanProps?: Omit<SVGProps<SVGSVGElement>, 'ref' | 'color'>;
}) {
  const themeName = useThemeName();
  const resolvedIcon = resolveIcon(name, themeName, {size, variant});

  if (resolvedIcon == null) {
    return null;
  }

  // The styling props (className, style, xstyle) are handled here so they
  // COMPOSE with the internal astryx-icon + StyleX classes/styles instead of
  // being shadowed by the later spread: xstyle folds into stylex.props, and
  // className/style merge via mergeProps. Other span props keep their prior
  // precedence (spread before the internal merge).
  const restSpanProps =
    (spanProps as React.HTMLAttributes<HTMLSpanElement>) ?? {};

  return (
    <span
      // Derived a11y — decorative (aria-hidden) by default, or a meaningful
      // image (role="img" + aria-label) when `label` is set. Placed BEFORE the
      // prop spread so consumers can still override it with explicit
      // aria-hidden/role/aria-label. This mirrors component-mode Icon.
      {...a11yProps}
      {...restSpanProps}
      {...mergeProps(
        themeProps('icon', {size, color}),
        stylex.props(
          styles.span,
          colorStyles[color],
          registrySizeStyles[size],
          xstyle,
        ),
        className ?? undefined,
        style,
      )}>
      {resolvedIcon}
    </span>
  );
}

/**
 * Renders an icon slot value. Handles semantic names, ReactNode values, and
 * component types:
 * - If the value is a semantic icon name string, wraps it in Icon.
 * - If the value is a component (function or forwardRef object), wraps it in Icon.
 * - Otherwise, renders the ReactNode directly.
 */
export function renderIconSlot(
  icon: React.ReactNode | IconType,
  props?: {size?: IconSize; color?: IconColor},
): React.ReactNode {
  if (typeof icon === 'string') {
    return <Icon icon={icon as IconName} {...props} />;
  }

  if (
    typeof icon === 'function' ||
    (typeof icon === 'object' && icon !== null && 'render' in icon)
  ) {
    return <Icon icon={icon as unknown as IconType} {...props} />;
  }
  return icon;
}
