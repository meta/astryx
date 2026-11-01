// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Text.tsx
 * @input Uses React, HTMLAttributes, ReactNode
 * @output Exports Text component, TextProps, TextType, TextSize types
 * @position Core implementation; consumed by index.ts, tested by Text.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Text/Text.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Text/Text.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Text/index.ts (exports if types change)
 * - /apps/storybook/stories/Text.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Text/ (showcase blocks)
 */

import {lazy, Suspense, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  TextType,
  BuiltinTextType,
  TextSize,
  TextColor,
  BuiltinTextColor,
  TextWeight,
  TextDisplay,
  TextJustify,
  WordBreak,
  TextWrap,
} from '../theme/types';
import {
  colorStyles,
  defaultWeightByTypeStyles,
  sizeStyles,
  sizeByTypeStyles,
  weightStyles,
  displayStyles,
  justifyStyles,
  truncationStyles,
  wordBreakStyles,
  textWrapStyles,
  capsizeStyles,
  decorationStyles,
  tabularNumbersStyle,
  truncationTooltipStyles,
} from './text.stylex';
import {useTruncation} from './useTruncation';
import type {LayerPlacement} from '../Layer';
import {mergeProps} from '../utils/mergeProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';

const LazyXDSTooltip = lazy(async () =>
  import('../Tooltip/Tooltip').then(mod => ({default: mod.Tooltip})),
);

export type {TextType, TextSize};

export interface TextProps extends Omit<BaseProps, 'children'> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLElement>;
  /**
   * Semantic text type. Determines size, weight, and line-height from theme.
   * @default 'body'
   */
  type?: TextType;

  /**
   * Explicit font size override. When set, overrides the size from `type`
   * but preserves other type properties (font-family, default color).
   *
   * ⚠️ Lint rule: Prefer using `type` alone. Use `size` only for custom
   * UI elements that need explicit size control (metrics, callouts).
   */
  size?: TextSize;

  /**
   * Text color. Defaults vary by type:
   * - 'supporting' → 'secondary'
   * - others → 'primary'
   */
  color?: TextColor;

  /**
   * Font weight override.
   */
  weight?: TextWeight;

  /**
   * Display type. Text defaults to inline.
   * Note: Silently overridden to 'block' when maxLines > 0 or hasCapsize is true.
   * @default 'inline'
   */
  display?: TextDisplay;

  /**
   * Maximum lines before truncation. 0 = no truncation.
   * When set, shows tooltip on hover if content is truncated.
   * @default 0
   */
  maxLines?: number;

  /**
   * Control tooltip behavior for truncated text.
   * - `true` (default when maxLines > 0): show tooltip at default position
   * - `false`: disable tooltip
   * - Position value: show tooltip at specific position
   * @default true
   */
  hasTruncateTooltip?: boolean | LayerPlacement;

  /**
   * Word break behavior for truncated text.
   * @default 'break-all' for maxLines=1, 'break-word' otherwise
   */
  wordBreak?: WordBreak;

  /**
   * Text wrapping behavior.
   */
  textWrap?: TextWrap;

  /**
   * Text alignment (justification). Uses logical values (start/end)
   * for i18n/RTL compatibility.
   * @default 'start'
   */
  justify?: TextJustify;

  /**
   * Enable optical alignment (text-box-trim).
   * Forces block display.
   * @default false
   */
  hasCapsize?: boolean;

  /**
   * Strikethrough decoration.
   * @default false
   */
  hasStrikethrough?: boolean;

  /**
   * Use tabular (monospace) numbers for alignment.
   * @default false
   */
  hasTabularNumbers?: boolean;

  /**
   * Text content
   */
  children: ReactNode;

  /**
   * HTML element to render.
   * Includes h1-h3 for display types that need heading semantics.
   * @default 'span'
   */
  as?: 'span' | 'p' | 'div' | 'label' | 'h1' | 'h2' | 'h3';
}

// Default color by text type — custom types fall back to 'primary'
const defaultColorByType: Record<string, TextColor> = {
  body: 'primary',
  large: 'primary',
  label: 'primary',
  supporting: 'secondary',
  code: 'primary',
  'display-1': 'primary',
  'display-2': 'primary',
  'display-3': 'primary',
  inherit: 'inherit',
};

/**
 * Resolve the StyleX style key for a text type.
 * Custom (theme-defined) types fall back to 'body' for baseline StyleX styles;
 * their visual treatment comes from theme CSS overrides (.astryx-text.<type>).
 */
function resolveStyleType(type: TextType): BuiltinTextType {
  if (type in sizeByTypeStyles) {
    return type;
  }
  return 'body';
}

/**
 * Resolve the StyleX baseline color. Built-in colors map to their own color
 * style; custom (theme-defined) colors fall back to the `primary` baseline —
 * their actual color comes from theme CSS (`.astryx-text.<color>` /
 * `.astryx-heading.<color>`), which the rendered `color` class targets.
 *
 * Exported so Heading applies the same custom-color fallback as Text.
 */
export function resolveStyleColor(color: TextColor): BuiltinTextColor {
  // The `in` guard is a runtime check for consumer-augmented custom colors
  // (which widen `TextColor` beyond the built-ins via TextColorMap); within
  // core the two types coincide, so no cast is needed.
  if (color in colorStyles) {
    return color;
  }
  return 'primary';
}

/**
 * Semantic text component. Renders text with type-based styling from the theme.
 *
 * @example
 * ```
 * <Text type="body">Body text</Text>
 * <Text type="large">Large body text</Text>
 * <Text type="label">Form label</Text>
 * <Text type="supporting">Helper text</Text>
 * <Text type="code">{'const x = 1;'}</Text>
 * <Text type="display-1" as="h1">Hero Title</Text>
 * <Text type="display-2">$1.2M Revenue</Text>
 * <Text type="body" maxLines={2}>Clamped text</Text>
 * ```
 */
export function Text({
  type = 'body',
  size,
  color,
  weight,
  display = 'inline',
  maxLines = 0,
  hasTruncateTooltip = true,
  wordBreak,
  textWrap,
  justify = 'start',
  hasCapsize = false,
  hasStrikethrough = false,
  hasTabularNumbers = false,
  xstyle,
  className,
  style,
  as: Component = 'span',
  children,
  ref,
  ...props
}: TextProps) {
  // Resolve color with type-based default
  const resolvedColor = color ?? defaultColorByType[type] ?? 'primary';

  // Resolve style type — custom types fall back to 'body' for StyleX baseline
  const styleType = resolveStyleType(type);

  // Resolve style color — custom colors fall back to 'primary' for StyleX
  // baseline; the real color comes from theme CSS via the rendered `color`
  // class (see themeProps below).
  const styleColor = resolveStyleColor(resolvedColor);

  // Resolve wordBreak with smart default
  const resolvedWordBreak =
    wordBreak ?? (maxLines === 1 ? 'break-all' : 'break-word');

  // Resolve display - force block when maxLines > 0 or hasCapsize
  const resolvedDisplay = maxLines > 0 || hasCapsize ? 'block' : display;

  // Truncation detection. Only the tooltip reads the measured overflow, so
  // with the tooltip off the text is clipped by CSS alone and nothing is
  // measured or observed.
  const truncation = useTruncation({
    maxLines: hasTruncateTooltip === false ? 0 : maxLines,
  });

  // Tooltip for truncated text
  const tooltipPlacement: LayerPlacement =
    typeof hasTruncateTooltip === 'string' ? hasTruncateTooltip : 'above';
  const tooltipEnabled =
    maxLines > 0 && hasTruncateTooltip !== false && truncation.isTruncated;

  // Ref for the text element (used as tooltip anchor)
  const textRef = useRef<HTMLElement>(null);

  // Keep the merged ref stable across rerenders.
  const mergedRef = useMergedRefs(ref, truncation.ref, textRef);

  // Build inline style for -webkit-line-clamp (dynamic value)
  const inlineStyle = maxLines > 1 ? {WebkitLineClamp: maxLines} : undefined;

  return (
    <>
      <Component
        ref={mergedRef}
        {...mergeProps(
          themeProps('text', {type, size, color: resolvedColor}),
          stylex.props(
            colorStyles[styleColor],
            sizeByTypeStyles[styleType],
            size && sizeStyles[size],
            defaultWeightByTypeStyles[styleType],
            weight && weightStyles[weight],
            // Display: use truncation styles when maxLines > 0
            maxLines === 1
              ? truncationStyles.singleLine
              : maxLines > 1
                ? truncationStyles.multiLine
                : displayStyles[resolvedDisplay],
            // Word break when truncating
            maxLines > 0 && wordBreakStyles[resolvedWordBreak],
            // Text wrap
            textWrap && textWrapStyles[textWrap],
            // Justify (text alignment)
            justify !== 'start' && justifyStyles[justify],
            // Capsize
            hasCapsize && capsizeStyles.enabled,
            // Decorations
            hasStrikethrough && decorationStyles.strikethrough,
            hasTabularNumbers && tabularNumbersStyle.enabled,
            // User xstyle
            xstyle,
          ),
          className,
          {...style, ...inlineStyle},
        )}
        {...props}>
        {children}
      </Component>
      {tooltipEnabled && (
        <Suspense fallback={null}>
          <LazyXDSTooltip
            anchorRef={textRef}
            content={
              <span {...stylex.props(truncationTooltipStyles.content)}>
                {truncation.fullText}
              </span>
            }
            placement={tooltipPlacement}
          />
        </Suspense>
      )}
    </>
  );
}

Text.displayName = 'Text';
