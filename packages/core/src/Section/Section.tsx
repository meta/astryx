// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Section.tsx
 * @input Uses container utility, StyleX
 * @output Exports Section component and SectionProps
 * @position Core section container component
 *
 * Two-box anatomy — the props split across them:
 * - OUTER box: the flex child. Sizing (width/height/maxWidth/minHeight) and
 *   the negative margins that escape a parent container's padding.
 * - INNER box: the painted surface. Padding, variant background, dividers,
 *   height:100% — and `overflow`, so the surface scrolls its own content
 *   instead of sliding out from under it.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Section/Section.doc.mjs (props table, features)
 * - /packages/core/src/Section/index.ts (exports if types change)
 * - /apps/storybook/stories/Section.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Section/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {container} from '../Layout/container.stylex';
import type {SpacingToken} from '../Layout/container.stylex';
import {
  paddingStyles,
  paddingInlineStyles,
  paddingInlineStartStyles,
  paddingInlineEndStyles,
  paddingBlockStyles,
  paddingBlockStartStyles,
  paddingBlockEndStyles,
  containerPaddingInlineVarStyles,
  containerPaddingInlineStartVarStyles,
  containerPaddingInlineEndVarStyles,
  containerPaddingBlockStartVarStyles,
  containerPaddingBlockEndVarStyles,
  sectionPaddingPropagationStyles,
  spacingStepToToken,
} from '../Layout/padding.stylex';
import type {SizeValue, SpacingStep} from '../utils/types';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';
import type {SectionVariantMap} from './index';

/**
 * Visual variant for the section.
 * Extensible via module augmentation of SectionVariantMap.
 */
export type SectionVariant = keyof SectionVariantMap;

const variantStyles = stylex.create({
  section: {
    backgroundColor: colorVars['--color-background-surface'],
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  muted: {
    backgroundColor: colorVars['--color-background-muted'],
  },
});

// Styles for escaping parent container padding when nested
const nestedStyles = stylex.create({
  // Outer wrapper escapes parent's container padding
  outer: {
    // Escape horizontal padding using directional vars with shorthand fallback
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    // Escape top padding only if first child
    marginTop: {
      default: null,
      ':first-child': 'calc(-1 * var(--container-padding-block-start, 0px))',
    },
    // Escape bottom padding only if last child
    marginBottom: {
      default: null,
      ':last-child': 'calc(-1 * var(--container-padding-block-end, 0px))',
    },
  },
  // Inner wrapper resets container padding for descendants
  inner: {
    '--container-padding-inline-start': '0px',
    '--container-padding-inline-end': '0px',
    '--container-padding-block-start': '0px',
    '--container-padding-block-end': '0px',
    height: '100%',
  },
});

// Divider styles for each side
const dividerStyles = stylex.create({
  top: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colorVars['--color-border'],
  },
  bottom: {
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colorVars['--color-border'],
  },
  start: {
    borderInlineStartWidth: 1,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
  },
  end: {
    borderInlineEndWidth: 1,
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
});

const scrollableStyles = stylex.create({
  scrollable: {
    overflow: 'auto',
  },
});

/**
 * "Resets" the min-width and min-height of the outer box as a flex item.
 *
 * Flex items have an implicit min size of auto, meaning they will never shrink
 * smaller than their contents. This reset lets a scrollable section be
 * constrained by its flex parent so its surface scrolls instead of growing.
 */
const minSizeResetStyles = stylex.create({
  reset: {
    minHeight: 0,
    minWidth: 0,
  },
});

// Dynamic styles for sizing props.
// One style per property: passing `null` for an unset prop would *remove* that
// property from an earlier style (StyleX null values are removal overrides,
// not no-ops), which would delete the flex min-size reset below.
const dynamicStyles = stylex.create({
  width: (value: SizeValue) => ({width: value}),
  height: (value: SizeValue) => ({height: value}),
  maxWidth: (value: SizeValue) => ({maxWidth: value}),
  minHeight: (value: SizeValue) => ({minHeight: value}),
});

export interface SectionProps extends BaseProps<HTMLElement> {
  ref?: React.Ref<HTMLElement>;
  /**
   * Visual variant of the section.
   * - 'section': Surface background color
   * - 'transparent': Fully transparent background
   * - 'muted': Muted background color
   * @default 'section'
   */
  variant?: SectionVariant;

  /**
   * Width of the section.
   * Numbers are treated as pixels, strings are used as-is.
   */
  width?: SizeValue;

  /**
   * Height of the section.
   * Numbers are treated as pixels, strings are used as-is.
   */
  height?: SizeValue;

  /**
   * Maximum width of the section.
   * Numbers are treated as pixels, strings are used as-is.
   */
  maxWidth?: SizeValue;

  /**
   * Minimum height of the section.
   * Numbers are treated as pixels, strings are used as-is.
   */
  minHeight?: SizeValue;

  /**
   * Content to render inside the section.
   * Should typically be Layout child components.
   */
  children?: ReactNode;

  /**
   * Which sides should have divider borders.
   * Use 'start'/'end' for horizontal (respects RTL).
   * @example
   * ```
   * dividers={['top', 'bottom']}
   * ```
   */
  dividers?: ('top' | 'bottom' | 'start' | 'end')[];

  /**
   * Internal padding of the section using the spacing scale.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * @default 4 (16px)
   */
  padding?: SpacingStep;
  /**
   * Inline (horizontal) padding override. When set, overrides only the inline
   * axis padding while preserving block padding from `padding` or the
   * container theme default.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  paddingInline?: SpacingStep;
  /**
   * Inline-start padding override. Logical: the left edge in LTR, the right
   * edge in RTL. Takes precedence over `paddingInline` and `padding` on that
   * edge only; every other edge is left alone.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  paddingInlineStart?: SpacingStep;
  /**
   * Inline-end padding override. Logical: the right edge in LTR, the left
   * edge in RTL. Takes precedence over `paddingInline` and `padding` on that
   * edge only; every other edge is left alone.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  paddingInlineEnd?: SpacingStep;
  /**
   * Block (vertical) padding override. When set, overrides only the block
   * axis padding while preserving inline padding from `padding` or the
   * container theme default.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  paddingBlock?: SpacingStep;
  /**
   * Block-start (top) padding override. Takes precedence over `paddingBlock`
   * and `padding` on that edge only; the block-end edge and both inline edges
   * are left alone.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  paddingBlockStart?: SpacingStep;
  /**
   * Block-end (bottom) padding override. Takes precedence over `paddingBlock`
   * and `padding` on that edge only; the block-start edge and both inline
   * edges are left alone.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  paddingBlockEnd?: SpacingStep;

  /**
   * Makes the section scroll its own overflow (`overflow: auto`) — the
   * "this pane scrolls on its own" prop. Matches `isScrollable` on
   * `LayoutContent` and `LayoutPanel`.
   *
   * Applied to the padded surface, so the background and dividers stay put
   * while the content scrolls under them, and the section's own padding is
   * respected at the scroll extremes. It also applies the flex
   * `min-height: 0` / `min-width: 0` reset, so the section can actually
   * shrink (and therefore scroll) inside a Stack.
   *
   * The section still needs a bounded height to scroll against: give it a
   * `height`, or put it in a Stack that has one. Wrapped in a `StackItem`
   * (a plain block box), give it `height="100%"` so it fills the item.
   * @default false
   */
  isScrollable?: boolean;
}

/**
 * A section container with background variants.
 *
 * Applies section-specific appearance based on the variant prop
 * and sets CSS variables for child layout components.
 *
 * @compositionHint Use inside Card to create visually distinct regions.
 * Sections automatically escape parent container padding for edge-to-edge fills.
 *
 * @example
 * ```
 * <Section variant="muted" width={300} height={250}>
 *   <Layout
 *     content={<LayoutContent>Content in muted section</LayoutContent>}
 *   />
 * </Section>
 *
 * // Multi-pane: fixed column + detail column that takes the rest,
 * // each scrolling on its own inside a horizontally scrolling strip.
 * // StackItem sizes each pane; height="100%" bounds the section to it.
 * <HStack height="100%" isScrollable>
 *   <StackItem size="static">
 *     <Section width={240} height="100%" isScrollable dividers={['end']}>
 *       <List>{items}</List>
 *     </Section>
 *   </StackItem>
 *   <StackItem size="fill" minWidth={320}>
 *     <Section height="100%" isScrollable>
 *       <Detail />
 *     </Section>
 *   </StackItem>
 * </HStack>
 * ```
 */
export function Section({
  variant = 'section',
  width,
  height,
  maxWidth,
  minHeight,
  children,
  dividers,
  padding,
  paddingInline,
  paddingInlineStart,
  paddingInlineEnd,
  paddingBlock,
  paddingBlockStart,
  paddingBlockEnd,
  isScrollable,
  xstyle,
  className,
  style,
  ref,
  ...props
}: SectionProps) {
  // When no explicit padding prop, use theme default (set via container tokens)
  const useThemeDefault = padding == null;
  const effectivePadding = padding ?? 4;
  const paddingToken = spacingStepToToken[effectivePadding] as SpacingToken;

  // A flex item's automatic minimum size (`min-height: auto`) refuses to shrink
  // below its content, so a section inside a Stack would grow instead of
  // scrolling. Scroll containers reset it — but the scroll container here is
  // the INNER box, and the flex item is the OUTER one, so it needs the reset
  // explicitly.
  const needsMinSizeReset = isScrollable === true;

  // The OUTER box is the flex child: sizing belongs here.
  // The reset goes first so an explicit `minHeight` still wins over it.
  const outerStylex = stylex.props(
    nestedStyles.outer,
    needsMinSizeReset && minSizeResetStyles.reset,
    width != null && dynamicStyles.width(width),
    height != null && dynamicStyles.height(height),
    maxWidth != null && dynamicStyles.maxWidth(maxWidth),
    minHeight != null && dynamicStyles.minHeight(minHeight),
    xstyle,
  );

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={
        [outerStylex.className, className].filter(Boolean).join(' ') ||
        undefined
      }
      style={
        style && outerStylex.style
          ? {...outerStylex.style, ...style}
          : style || outerStylex.style
      }
      {...props}>
      <div
        {...mergeProps(
          themeProps('section', {variant}),
          stylex.props(
            nestedStyles.inner,
            ...container(
              useThemeDefault
                ? {useThemeDefault: 'section'}
                : {
                    paddingInnerX: paddingToken,
                    paddingInnerY: paddingToken,
                    paddingOuterX: paddingToken,
                    paddingOuterY: paddingToken,
                  },
            ),
            !useThemeDefault &&
              effectivePadding !== 4 &&
              paddingStyles[effectivePadding],
            !useThemeDefault &&
              effectivePadding !== 4 &&
              containerPaddingInlineVarStyles[effectivePadding],
            !useThemeDefault &&
              effectivePadding !== 4 &&
              containerPaddingBlockStartVarStyles[effectivePadding],
            !useThemeDefault &&
              effectivePadding !== 4 &&
              containerPaddingBlockEndVarStyles[effectivePadding],
            !useThemeDefault &&
              sectionPaddingPropagationStyles[effectivePadding],
            paddingInline != null && paddingInlineStyles[paddingInline],
            paddingInline != null &&
              containerPaddingInlineVarStyles[paddingInline],
            paddingBlock != null && paddingBlockStyles[paddingBlock],
            paddingBlock != null &&
              containerPaddingBlockStartVarStyles[paddingBlock],
            paddingBlock != null &&
              containerPaddingBlockEndVarStyles[paddingBlock],
            // Per-edge overrides come last so they win over `paddingBlock`
            // and `padding` on their own edge. The matching container var is
            // updated alongside so bleed children (Table, Divider, nested
            // Section) compensate against the padding actually applied.
            paddingBlockStart != null &&
              paddingBlockStartStyles[paddingBlockStart],
            paddingBlockStart != null &&
              containerPaddingBlockStartVarStyles[paddingBlockStart],
            paddingBlockEnd != null && paddingBlockEndStyles[paddingBlockEnd],
            paddingBlockEnd != null &&
              containerPaddingBlockEndVarStyles[paddingBlockEnd],
            paddingInlineStart != null &&
              paddingInlineStartStyles[paddingInlineStart],
            paddingInlineStart != null &&
              containerPaddingInlineStartVarStyles[paddingInlineStart],
            paddingInlineEnd != null &&
              paddingInlineEndStyles[paddingInlineEnd],
            paddingInlineEnd != null &&
              containerPaddingInlineEndVarStyles[paddingInlineEnd],
            variantStyles[variant],
            dividers?.includes('top') && dividerStyles.top,
            dividers?.includes('bottom') && dividerStyles.bottom,
            dividers?.includes('start') && dividerStyles.start,
            dividers?.includes('end') && dividerStyles.end,
            // Overflow belongs on the INNER box: it is the painted surface
            // (background, dividers) and it owns the padding. Scrolling the
            // outer box would slide this box — background and dividers with
            // it — out of view, and push content past the bottom padding.
            isScrollable === true && scrollableStyles.scrollable,
          ),
        )}>
        {children}
      </div>
    </div>
  );
}

Section.displayName = 'Section';
