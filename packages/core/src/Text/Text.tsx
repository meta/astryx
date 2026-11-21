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

import {use, useCallback, useRef, useState, type ReactNode} from 'react';
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
import {TextFocusOwnerContext} from './TextFocusOwnerContext';
import {
  TruncationTooltip,
  useTruncationTooltipInterest,
} from './TruncationTooltip';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import type {LayerPlacement} from '../Layer';
import {mergeProps} from '../utils/mergeProps';
import {useMergedRefs} from '../hooks/useMergedRefs';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {TextClampContext} from './textClampContext';

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
   * When set, truncated content shows its full text in a tooltip on hover,
   * and is a tab stop so the tooltip opens on keyboard focus too.
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

// Controls that already take focus or act as one item; a truncated Text inside
// one leaves keyboard focus to it. Only interactive elements and widget roles:
// a focusable region such as a main landmark or a scroll container is not a
// control, so a Text inside it still becomes a tab stop.
// Text inside (or itself) hidden from assistive technology takes no stop.
const HIDDEN_SELECTOR = '[aria-hidden="true"], [inert]';

const CONTROL_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="treeitem"]',
  '[role="gridcell"]',
  '[role="row"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
].join(', ');

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
  // The tooltip mounts on the first hover, tap or focus, not with the text.
  const tooltipInterest = useTruncationTooltipInterest(tooltipEnabled);

  // Ref for the text element (used as tooltip anchor)
  const textRef = useRef<HTMLElement>(null);

  // A truncated Text is a tab stop, so its tooltip opens from the keyboard.
  // It takes no stop when a control already takes the focus: one that wraps
  // it in the DOM (a link, a button, a menu item), one it holds (a link or a
  // field inside it), or one that provides TextFocusOwnerContext (a clickable
  // card). A second, unnamed stop in such a control would confuse keyboard
  // users. Text hidden from assistive technology (`aria-hidden`, `inert`)
  // takes no stop either, because focus would land on content a screen
  // reader cannot perceive. The stop is a prop, so it is in the DOM before
  // the tooltip attaches its focus trigger. A caller's own tabIndex wins.
  const isInsideFocusOwner = use(TextFocusOwnerContext);
  const [isExcludedByAncestor, setIsExcludedByAncestor] = useState(false);
  const controlRef = useCallback((element: HTMLElement | null) => {
    if (element == null) {
      return;
    }
    const sharesControl =
      element.parentElement?.closest(CONTROL_SELECTOR) != null ||
      element.querySelector(CONTROL_SELECTOR) != null;
    const update = () =>
      setIsExcludedByAncestor(
        sharesControl || element.closest(HIDDEN_SELECTOR) != null,
      );
    update();
    // Content revealed later (a closed Overlay's inert scrim, a collapsed
    // drawer) gets its stop when the hiding attribute goes away.
    const hiddenAncestors: Element[] = [];
    for (
      let node = element.closest(HIDDEN_SELECTOR);
      node != null;
      node = node.parentElement?.closest(HIDDEN_SELECTOR) ?? null
    ) {
      hiddenAncestors.push(node);
    }
    if (hiddenAncestors.length === 0) {
      return;
    }
    const observer = new MutationObserver(update);
    for (const node of hiddenAncestors) {
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['aria-hidden', 'inert'],
      });
    }
    return () => observer.disconnect();
  }, []);
  const callerTabIndex = props.tabIndex;
  const isTabStop =
    tooltipEnabled && !isExcludedByAncestor && !isInsideFocusOwner;

  // Keep the merged ref stable across rerenders.
  const mergedRef = useMergedRefs(
    ref,
    truncation.ref,
    textRef,
    maxLines > 0 && hasTruncateTooltip !== false ? controlRef : undefined,
  );
  const isInClampedText = use(TextClampContext);
  // A capsize block removes a multi-line clamp.
  const isClamped = maxLines === 1 || (maxLines > 1 && !hasCapsize);

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
        tabIndex={isTabStop ? 0 : undefined}
        {...props}
        onPointerEnter={composeEventHandlers(
          tooltipInterest.onPointerEnter,
          props.onPointerEnter,
        )}
        onPointerLeave={composeEventHandlers(
          tooltipInterest.onPointerLeave,
          props.onPointerLeave,
        )}
        onPointerDown={composeEventHandlers(
          tooltipInterest.onPointerDown,
          props.onPointerDown,
        )}
        onFocus={composeEventHandlers(tooltipInterest.onFocus, props.onFocus)}
        onBlur={composeEventHandlers(tooltipInterest.onBlur, props.onBlur)}>
        {/* Always mounted, so a change of maxLines keeps every child mounted. */}
        <TextClampContext value={isClamped || isInClampedText}>
          {children}
        </TextClampContext>
      </Component>
      {tooltipEnabled && tooltipInterest.isWanted && (
        <TruncationTooltip
          anchorRef={textRef}
          content={
            <span {...stylex.props(truncationTooltipStyles.content)}>
              {truncation.fullText}
            </span>
          }
          placement={tooltipPlacement}
          interest={tooltipInterest}
          // The tooltip decides once, when it attaches, whether to listen
          // for focus; a stop added later (revealed content) re-attaches it.
          focusTrigger={isTabStop && callerTabIndex == null ? 'always' : 'auto'}
        />
      )}
    </>
  );
}

Text.displayName = 'Text';
