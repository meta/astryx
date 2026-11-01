// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Heading.tsx
 * @input Uses React, HTMLAttributes, ReactNode
 * @output Exports Heading component, HeadingProps, HeadingLevel types
 * @position Core implementation; lives in own Heading/ dir, re-exported by Text/
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Text/Text.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Heading/Heading.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Text/index.ts (exports if types change)
 * - /apps/storybook/stories/Text.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Heading/ (showcase blocks)
 * - /packages/cli/assets/templates/blocks/components/Text/ (showcase blocks)
 */

import {lazy, Suspense, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  TextColor,
  TextDisplay,
  TextJustify,
  WordBreak,
  TextWrap,
  TextWeight,
} from '../theme/types';
import {
  colorStyles,
  sizeByLevelStyles,
  sizeByTypeStyles,
  defaultWeightByTypeStyles,
  weightStyles,
  displayStyles,
  justifyStyles,
  truncationStyles,
  wordBreakStyles,
  textWrapStyles,
  capsizeStyles,
  decorationStyles,
  truncationTooltipStyles,
} from '../Text/text.stylex';
import {useTruncation} from '../Text/useTruncation';
import {resolveStyleColor} from '../Text/Text';
import type {LayerPlacement} from '../Layer';
import {mergeProps} from '../utils/mergeProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import type {HeadingTypeMap} from './index';

const LazyXDSTooltip = lazy(async () =>
  import('../Tooltip/Tooltip').then(mod => ({default: mod.Tooltip})),
);

/**
 * Heading level (1-6). Determines both visual styling and semantic HTML element.
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Display type variants for headings. Applies display-scale sizing
 * (larger, lighter) while preserving the semantic heading element.
 */
export type HeadingType = keyof HeadingTypeMap;

type BuiltinHeadingType = 'display-1' | 'display-2' | 'display-3';

function isBuiltinHeadingType(type: HeadingType): type is BuiltinHeadingType {
  return type === 'display-1' || type === 'display-2' || type === 'display-3';
}

export interface HeadingProps extends Omit<
  BaseProps<HTMLHeadingElement>,
  'children'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLHeadingElement>;
  /**
   * Heading level (1-6). Determines the semantic HTML element (h1–h6).
   * Also determines visual styling unless `type` is set.
   */
  level: HeadingLevel;

  /**
   * Display type variant. When set, overrides the visual styling from `level`
   * with display-scale sizing (larger, lighter weight, tighter line-height).
   * The `level` still determines the HTML element for accessibility.
   *
   * Use for hero banners, marketing headlines, and data callouts that need
   * heading semantics.
   *
   * @example
   * ```
   * <Heading level={1} type="display-1">Hero Title</Heading>
   * <Heading level={2} type="display-2">$1.2M Revenue</Heading>
   * ```
   */
  type?: HeadingType;

  /**
   * Explicit font-weight override. The active theme controls the numeric value
   * behind each name. When omitted, the selected visual type or heading level
   * supplies the default.
   */
  weight?: TextWeight;

  /**
   * Accessibility level override. When set, the `aria-level` will differ
   * from the visual `level`. Use this when the visual hierarchy doesn't
   * match the document outline (e.g., sidebar headings, reused components).
   *
   * @default Same as `level`
   *
   * @example
   * ```
   * <Heading level={2} accessibilityLevel={3}>Sidebar Section</Heading>
   * ```
   */
  accessibilityLevel?: HeadingLevel;

  /**
   * Text color.
   * @default 'primary'
   */
  color?: TextColor;

  /**
   * Display type. Headings default to block.
   * Note: Silently overridden to 'block' when maxLines > 0 or hasCapsize is true.
   * @default 'block'
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
   * Heading content
   */
  children: ReactNode;
}

const levelToTag = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
} as const;

/**
 * Heading - Semantic heading component
 *
 * Renders headings with semantic HTML (h1-h6) and themed styling.
 *
 * @example
 * ```
 * <Heading level={1}>Page Title</Heading>
 * <Heading level={2}>Section</Heading>
 * <Heading level={2} accessibilityLevel={3}>Sidebar Section</Heading>
 * <Heading level={1} type="display-1">Hero Title</Heading>
 * <Heading level={2} type="display-2">$1.2M Revenue</Heading>
 * <Heading level={2} maxLines={1}>Very Long Section Title...</Heading>
 * <Heading level={3} color="secondary">Muted Heading</Heading>
 * ```
 */
export function Heading({
  level,
  type,
  weight,
  accessibilityLevel,
  color = 'primary',
  display = 'block',
  maxLines = 0,
  hasTruncateTooltip = true,
  wordBreak,
  textWrap,
  justify = 'start',
  hasCapsize = false,
  hasStrikethrough = false,
  xstyle,
  className,
  style,
  children,
  ref,
  ...props
}: HeadingProps) {
  const Component = levelToTag[level];

  // If accessibilityLevel differs from visual level, use aria-level
  const ariaProps =
    accessibilityLevel && accessibilityLevel !== level
      ? {'aria-level': accessibilityLevel}
      : {};

  // Resolve wordBreak with smart default
  const resolvedWordBreak =
    wordBreak ?? (maxLines === 1 ? 'break-all' : 'break-word');

  // Resolve display - force block when maxLines > 0 or hasCapsize
  const resolvedDisplay = maxLines > 0 || hasCapsize ? 'block' : display;

  // A custom type receives its visual treatment from theme CSS. Keep the
  // semantic level's baseline until that CSS is available instead of indexing
  // the closed built-in StyleX maps with an unknown name.
  const builtinType = type && isBuiltinHeadingType(type) ? type : undefined;

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

  // Ref for the heading element (used as tooltip anchor)
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Keep the merged ref stable across rerenders.
  const mergedRef = useMergedRefs(ref, truncation.ref, headingRef);

  // Build inline style for -webkit-line-clamp (dynamic value)
  const inlineStyle = maxLines > 1 ? {WebkitLineClamp: maxLines} : undefined;

  return (
    <>
      <Component
        ref={mergedRef}
        {...mergeProps(
          themeProps('heading', {
            level,
            color,
            type,
            weight,
          }),
          stylex.props(
            colorStyles[resolveStyleColor(color)],
            builtinType
              ? sizeByTypeStyles[builtinType]
              : sizeByLevelStyles[level],
            builtinType && defaultWeightByTypeStyles[builtinType],
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
            // User xstyle
            xstyle,
          ),
          className,
          {...style, ...inlineStyle},
        )}
        {...ariaProps}
        {...props}>
        {children}
      </Component>
      {tooltipEnabled && (
        <Suspense fallback={null}>
          <LazyXDSTooltip
            anchorRef={headingRef}
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

Heading.displayName = 'Heading';
