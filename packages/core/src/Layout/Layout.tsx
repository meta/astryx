// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Layout.tsx
 * @input Uses React, stack/stackItem utilities, LayoutAreaContext, LayoutSlotsContext
 * @output Exports Layout component and LayoutProps, LayoutHeight types
 * @position General five-slot layout primitive for arranging header, start, content, end, and footer regions.
 *   Building a page area with a side panel? Use Layout with start/end slots.
 *   Need a header + scrollable content? Use Layout with header + content slots.
 *   AppShell owns the page shell and app-wide navigation behavior.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Layout/Layout.doc.mjs
 * - /apps/storybook/stories/Layout.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Layout/ (showcase blocks)
 */

import {type ReactNode, useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {LayoutAreaContext, type LayoutArea} from './LayoutAreaContext';
import {LayoutSlotsContext, type LayoutSlots} from './LayoutSlotsContext';
import {LayoutDividerContext} from './LayoutDividerContext';
import {stack} from '../Stack/stack.stylex';
import {stackItem} from '../Stack/stackItem.stylex';
import {mergeProps} from '../utils';
import {layoutFooterMarker, layoutHeaderMarker} from './layoutEdges.stylex';
import type {BaseProps} from '../BaseProps';
import type {SizeValue, SpacingStep} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {
  layoutPaddingOuterXVarStyles,
  layoutPaddingOuterYVarStyles,
} from './padding.stylex';

/**
 * Height behavior for the layout.
 * - `fill`: Layout fills container height, content scrolls internally (default)
 * - `auto`: Layout grows with content, container/page scrolls
 */
export type LayoutHeight = 'fill' | 'auto';

/**
 * Internal alignment subtracts contentWidth in CSS. Intrinsic values and bare
 * variables cannot participate in that arithmetic, so they keep the released
 * constrained-composition path.
 */
function supportsInternalContentWidthAlignment(
  width: SizeValue | undefined,
): boolean {
  if (width == null || typeof width === 'number') {
    return true;
  }

  const value = width.trim().toLowerCase();
  if (value.includes('%')) {
    return false;
  }
  return (
    value === '0' ||
    /^-?(?:\d+(?:\.\d+)?|\.\d+)[a-z]+$/.test(value) ||
    /^(?:calc|min|max|clamp)\(/.test(value)
  );
}

const styles = stylex.create({
  // Outer wrapper uses negative margin to escape container padding
  layoutOuter: {
    marginInlineStart: 'calc(-1 * var(--container-padding-inline-start, 0px))',
    marginInlineEnd: 'calc(-1 * var(--container-padding-inline-end, 0px))',
    marginBlockStart: 'calc(-1 * var(--container-padding-block-start, 0px))',
    marginBlockEnd: 'calc(-1 * var(--container-padding-block-end, 0px))',
  },
  // Inner wrapper resets container padding vars for descendants
  layoutInner: {
    '--container-padding-inline-start': '0px',
    '--container-padding-inline-end': '0px',
    '--container-padding-block-start': '0px',
    '--container-padding-block-end': '0px',
    // Reset inherited width so nested Layouts without contentWidth keep their
    // released padding. An explicit contentWidth overrides this on the same node.
    '--layout-content-width': '100cqi',
    '--layout-alignment-width': '100cqi',
    // A Layout's `padding` belongs to its own regions. Clear an ancestor
    // Layout's value so a nested Layout without `padding` takes the nearest
    // padding container's inset (Card, Section, Dialog) or the default,
    // instead of inheriting, e.g., AppShell's internal padding={0}. An
    // explicit `padding` on this Layout overrides this on the same node.
    '--layout-padding-own-outer-x': 'initial',
    '--layout-padding-own-outer-y': 'initial',
  },
  fill: {
    // Add 2x container block padding to compensate for negative block margins
    height:
      'calc(100% + var(--container-padding-block-start, 0px) + var(--container-padding-block-end, 0px))',
    maxHeight: 'var(--container-max-height, none)',
  },
  auto: {
    minHeight: '100%',
  },
  middle: {
    flex: 1,
    minHeight: 0,
    // A LayoutHeader without a divider right before this row, or a
    // LayoutFooter without one right after it, removes the matching inner
    // padding of LayoutContent (it reads these, falling back to its padding).
    // Sibling relations on this row only: a `:has()` on the layout followed
    // by `*` restyles everything inside it on any change. Unset otherwise, so
    // a nested Layout's content inherits an outer row's value, as the
    // ancestor rule this replaces matched any enclosing layout.
    '--_layout-flush-block-start': {
      default: null,
      [stylex.when.siblingBefore(':not([data-divider])', layoutHeaderMarker)]:
        '0px',
    },
    '--_layout-flush-block-end': {
      default: null,
      [stylex.when.siblingAfter(':not([data-divider])', layoutFooterMarker)]:
        '0px',
    },
  },
  middleQuery: {
    containerType: {
      default: null,
      ':has(> div > .astryx-layout-content)': 'inline-size',
    },
  },
  // Without side panels, LayoutContent owns the full-width scrollport and
  // aligns its children internally. Arbitrary content keeps the existing
  // constrained-lane behavior.
  singleColumnContent: {
    width: '100%',
    maxWidth: {
      default: 'var(--layout-content-width, none)',
      ':has(> .astryx-layout-content)': 'none',
    },
    marginInline: 'auto',
  },
  // With one side panel, keep that panel aligned to the content-width frame
  // while allowing LayoutContent to occupy the opposite open side.
  singlePanelMiddle: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: {
      default: 'var(--layout-content-width, none)',
      ':has(> div > .astryx-layout-content)': 'none',
    },
    marginInline: {
      default: 'auto',
      ':has(> div > .astryx-layout-content)': 0,
    },
  },
  singleStartPanel: {
    paddingInlineStart: {
      default: null,
      ':has(> div > .astryx-layout-content)':
        'max(0px, calc((100% - var(--layout-content-width)) / 2))',
    },
  },
  singleEndPanel: {
    paddingInlineEnd: {
      default: null,
      ':has(> div > .astryx-layout-content)':
        'max(0px, calc((100% - var(--layout-content-width)) / 2))',
    },
  },
  // When full bleed, set this Layout's outer padding to 0 so its regions touch container edges
  fullBleed: {
    '--layout-padding-own-outer-x': '0px',
    '--layout-padding-own-outer-y': '0px',
  },
});

const dynamicStyles = stylex.create({
  contentWidthVar: (width: SizeValue) => ({
    '--layout-content-width': typeof width === 'number' ? `${width}px` : width,
  }),
  contentAlignmentWidthVar: (width: SizeValue) => ({
    '--layout-alignment-width':
      typeof width === 'number' ? `${width}px` : width,
  }),
  contentWidth: (width: SizeValue) => ({
    width: '100%',
    maxWidth: typeof width === 'number' ? `${width}px` : width,
    marginInline: 'auto',
  }),
});

export interface LayoutProps extends Omit<BaseProps, 'content'> {
  /**
   * Ref forwarded to the root DOM element.
   */
  ref?: React.Ref<HTMLDivElement>;

  /**
   * Main content area (center).
   */
  content?: ReactNode;

  /**
   * Maximum width of the aligned content within each slot (header, content,
   * footer, panels). Dividers remain full-bleed. Content is centered with
   * `margin-inline: auto` when narrower than the available space.
   *
   * In a layout without start or end panels, LayoutContent spans the available
   * width so its scrollbar stays at the outer edge, while its children align
   * internally to `contentWidth`. With exactly one panel, that panel remains
   * aligned to the `contentWidth` frame while LayoutContent extends to the
   * opposite open edge. With both panels, `contentWidth` includes the complete
   * start + content + end composition. Intrinsic widths such as `fit-content`
   * retain the constrained composition because they cannot participate in the
   * internal alignment arithmetic. Percentage widths, including
   * percentage-bearing `calc()`, `min()`, `max()`, and `clamp()` values, use the
   * constrained fallback because they cannot share one arithmetic basis. Bare
   * `var(...)` values also use that fallback because their resolved value may be
   * intrinsic; wrap a variable guaranteed to resolve to a length in `calc(...)`
   * to opt into edge scrolling.
   *
   * Numbers are treated as pixels, strings are used as-is (e.g., '60ch').
   * Common page widths:
   * - `640` — forms, settings, text-focused pages
   * - `960` — content pages, component demos, wider layouts
   */
  contentWidth?: SizeValue;

  /**
   * End panel slot (right in LTR, left in RTL).
   */
  end?: ReactNode;

  /**
   * Footer slot.
   */
  footer?: ReactNode;

  /**
   * Header slot.
   */
  header?: ReactNode;

  /**
   * Controls the height behavior:
   * - `fill`: Layout fills container height, content scrolls internally (default)
   * - `auto`: Layout grows with content, container/page scrolls
   * @default 'fill'
   */
  height?: LayoutHeight;

  /**
   * Padding at the layout's outer edges using the spacing scale.
   * Applies to this Layout's own header, footer, panels, and content; a nested
   * Layout does not inherit it. Without `padding`, regions use the enclosing
   * Card, Section, or Dialog padding, or the default inset.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  padding?: SpacingStep;

  /**
   * Start panel slot (left in LTR, right in RTL).
   */
  start?: ReactNode;
  /**
   * Default divider visibility for LayoutHeader and LayoutFooter children.
   * When set, headers/footers that don't explicitly pass `hasDivider` will use this value.
   * When not set, nested layouts inherit from their parent context.
   */
  defaultHasDividers?: boolean;

  /**
   * Children are a shorthand for the `content` slot:
   * `<Layout>{main}</Layout>` is equivalent to `<Layout content={main} />`.
   * The surrounding zones (`header`/`start`/`end`/`footer`) stay explicit
   * props. If both `content` and `children` are provided, `content` wins.
   * Accepting children keeps the natural `<Layout>…</Layout>` form from
   * rendering a blank shell.
   */
  children?: ReactNode;
}

/**
 * Helper component to wrap content in layout area context.
 */
function AreaProvider({
  area,
  children,
}: {
  area: LayoutArea;
  children: ReactNode;
}) {
  if (children == null) {
    return null;
  }
  return <LayoutAreaContext value={area}>{children}</LayoutAreaContext>;
}

/**
 * General layout primitive with header, start, content, end, and footer slots.
 * Use it to arrange regions within a page or bounded container. AppShell owns
 * the page shell, app-wide navigation, responsive shell behavior, skip link,
 * and main landmark.
 *
 * Handles padding collapse between adjacent slots, scroll containment in the
 * content area, and automatic RTL support via CSS logical properties.
 *
 * Structure:
 * ```
 * ┌─────────────────────────────────────────┐
 * │                 header                  │
 * ├──────┬─────────────────────────┬────────┤
 * │      │                         │        │
 * │start │        content          │  end   │
 * │      │                         │        │
 * ├──────┴─────────────────────────┴────────┤
 * │                 footer                  │
 * └─────────────────────────────────────────┘
 * ```
 *
 * When to use Layout vs raw flexbox:
 * - Page with a sidebar → Layout with `start` slot
 * - Dashboard with header + scrollable body → Layout with `header` + `content`
 * - Settings page with nav panel → Layout with `start` + `content`
 * - Simple vertical stack of items → use VStack instead
 *
 * @example
 * ```
 * <Layout
 *   header={<LayoutHeader hasDivider>App Name</LayoutHeader>}
 *   start={
 *     <LayoutPanel hasDivider width={240} role="navigation">
 *       <Navigation />
 *     </LayoutPanel>
 *   }
 *   content={
 *     <LayoutContent role="main">
 *       <MainContent />
 *     </LayoutContent>
 *   }
 * />
 * ```
 */
export function Layout({
  children,
  content,
  contentWidth,
  defaultHasDividers,
  end,
  footer,
  header,
  height = 'fill',
  padding,
  ref,
  start,
  xstyle,
  className,
  style,
  ...restProps
}: LayoutProps) {
  const isFill = height === 'fill';
  // Children are a shorthand for the content slot; an explicit `content` prop
  // wins when both are provided.
  const resolvedContent = content ?? children;

  const dividerCtxValue = useMemo(
    () => (defaultHasDividers != null ? {defaultHasDividers} : null),
    [defaultHasDividers],
  );

  // Memoize slots info to avoid unnecessary re-renders
  const hasHeader = header != null;
  const hasFooter = footer != null;
  const hasStart = start != null;
  const hasEnd = end != null;
  const hasBothPanels = hasStart && hasEnd;
  const hasSinglePanel = hasStart !== hasEnd;
  const usesInternalContentWidth =
    contentWidth != null && supportsInternalContentWidthAlignment(contentWidth);
  const slotsValue = useMemo<LayoutSlots>(
    () => ({hasHeader, hasFooter, hasStart, hasEnd}),
    [hasHeader, hasFooter, hasStart, hasEnd],
  );

  const tree = (
    <LayoutSlotsContext value={slotsValue}>
      <div
        {...restProps}
        ref={ref}
        {...mergeProps(
          themeProps('layout', {height}),
          stylex.props(
            styles.layoutOuter,
            isFill ? styles.fill : styles.auto,
            xstyle,
          ),
          className,
          style,
        )}>
        <div
          {...stylex.props(
            stylex.defaultMarker(),
            styles.layoutInner,
            ...stack({direction: 'vertical'}),
            isFill ? styles.fill : styles.auto,
            padding === 0 && styles.fullBleed,
            padding != null && layoutPaddingOuterXVarStyles[padding],
            padding != null && layoutPaddingOuterYVarStyles[padding],
            contentWidth != null && dynamicStyles.contentWidthVar(contentWidth),
            usesInternalContentWidth &&
              dynamicStyles.contentAlignmentWidthVar(contentWidth),
          )}>
          <AreaProvider area="header">{header}</AreaProvider>
          <div
            {...stylex.props(
              ...stack({direction: 'horizontal'}),
              styles.middle,
              contentWidth != null &&
                (!usesInternalContentWidth || hasBothPanels) &&
                dynamicStyles.contentWidth(contentWidth),
              usesInternalContentWidth && !hasBothPanels && styles.middleQuery,
              usesInternalContentWidth &&
                hasSinglePanel &&
                styles.singlePanelMiddle,
              usesInternalContentWidth &&
                hasStart &&
                !hasEnd &&
                styles.singleStartPanel,
              usesInternalContentWidth &&
                !hasStart &&
                hasEnd &&
                styles.singleEndPanel,
            )}>
            <AreaProvider area="start">{start}</AreaProvider>
            <div
              {...stylex.props(
                ...stackItem({size: 'fill'}),
                usesInternalContentWidth &&
                  !hasStart &&
                  !hasEnd &&
                  styles.singleColumnContent,
              )}>
              <AreaProvider area="content">{resolvedContent}</AreaProvider>
            </div>
            <AreaProvider area="end">{end}</AreaProvider>
          </div>
          <AreaProvider area="footer">{footer}</AreaProvider>
        </div>
      </div>
    </LayoutSlotsContext>
  );

  if (dividerCtxValue != null) {
    return (
      <LayoutDividerContext value={dividerCtxValue}>
        {tree}
      </LayoutDividerContext>
    );
  }

  return tree;
}

Layout.displayName = 'Layout';
