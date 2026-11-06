// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Toolbar.tsx
 * @input Uses Section, SizeContext, useListFocus, useKeyboardHint, StyleX, spacingVars, sizeVars
 * @output Exports Toolbar component and ToolbarProps
 * @position Core implementation; consumed by index.ts. Owns toolbar focus and
 *   keyboard navigation, excluding nested toolbars and popover contents.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Toolbar/Toolbar.doc.mjs
 * - /packages/core/src/Toolbar/Toolbar.test.tsx
 * - /packages/core/src/Toolbar/index.ts
 * - /apps/storybook/stories/Toolbar.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Toolbar/ (showcase blocks)
 */

import {useCallback, type ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import type {SectionVariant} from '../Section/Section';
import type {SpacingStep} from '../utils/types';
import type {ElementSize} from '../SizeContext/SizeContext';
import * as stylex from '@stylexjs/stylex';
import {spacingVars, sizeVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {Section} from '../Section/Section';
import {useListFocus} from '../hooks/useListFocus';
import {useKeyboardHint} from '../hooks/useKeyboardHint';
import {SizeProvider} from '../SizeContext/SizeContext';
import {edgeCompSlot} from '../Layout/edgeCompensation.stylex';
import {themeProps} from '../utils/themeProps';

/**
 * Map SpacingStep values to spacingVars keys.
 */
const spacingStepToVar: Record<SpacingStep, keyof typeof spacingVars> = {
  0: '--spacing-0',
  0.5: '--spacing-0-5',
  1: '--spacing-1',
  1.5: '--spacing-1-5',
  2: '--spacing-2',
  3: '--spacing-3',
  4: '--spacing-4',
  5: '--spacing-5',
  6: '--spacing-6',
  8: '--spacing-8',
  10: '--spacing-10',
};

const styles = stylex.create({
  // Two-slot layout (no centerContent): flex row, space-between
  baseFlex: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // Three-slot layout (with centerContent): CSS grid 1fr auto 1fr
  baseGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
  },
  // Vertical orientation
  vertical: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  // Slot containers
  startSlot: {
    display: 'flex',
    alignItems: 'center',
  },
  // `minWidth: 0` lets the `auto` track shrink below the content's width, so a
  // wide center never widens the toolbar. The slot deliberately does not clip
  // (`overflow`): clipping would cut off the box-shadow and focus ring of its
  // outermost children, which paint outside their own box.
  centerSlot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  endSlot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  // When only startContent is present, let it fill
  startOnly: {
    flex: '1 1 0%',
  },
  // When only endContent, push to end
  endOnly: {
    marginInlineStart: 'auto',
  },
});

const sizeStyles = stylex.create({
  base: {
    minHeight: sizeVars['--size-element-sm'],
  },
});

// Dynamic styles for configurable gap and tab indicator offset
const dynamicStyles = stylex.create({
  gap: (gapValue: string) => ({
    gap: gapValue,
  }),
  tabIndicatorBottom: (offset: string) => ({
    '--_tab-indicator-bottom': offset,
  }),
});

/**
 * Default block padding per toolbar size. Inline padding comes from the
 * parent container (Card, Section, LayoutHeader) via the Section's
 * theme default — the toolbar only controls its vertical tightness.
 */
const defaultBlockPaddingForSize: Record<ElementSize, SpacingStep> = {
  sm: 2,
  md: 2,
  lg: 2,
};

const blockPaddingVarForSize: Record<ElementSize, string> = {
  sm: spacingVars['--spacing-2'],
  md: spacingVars['--spacing-2'],
  lg: spacingVars['--spacing-2'],
};

/**
 * Edge compensation inset amount per toolbar size.
 * Equals container-inline-padding minus the toolbar's block padding,
 * creating even spacing around edge-compensated items (ghost buttons, tabs).
 */
const edgeCompInsetForSize: Record<ElementSize, string> = {
  sm: `calc(var(--container-padding-inline-start, ${spacingVars['--spacing-4']}) - ${spacingVars['--spacing-2']})`,
  md: `calc(var(--container-padding-inline-start, ${spacingVars['--spacing-4']}) - ${spacingVars['--spacing-2']})`,
  lg: `calc(var(--container-padding-inline-start, ${spacingVars['--spacing-4']}) - ${spacingVars['--spacing-2']})`,
};

export type ToolbarSize = ElementSize;

export interface ToolbarProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root Section element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Content aligned to the start (left in LTR).
   */
  startContent?: ReactNode;
  /**
   * Content centered between start and end.
   * When provided, switches layout to CSS grid (1fr auto 1fr).
   */
  centerContent?: ReactNode;
  /**
   * Content aligned to the end (right in LTR).
   */
  endContent?: ReactNode;
  /**
   * Accessible label for the toolbar.
   * Applied as aria-label on the inner toolbar element.
   */
  label: string;
  /**
   * Size of the toolbar. Coordinates with Button, TextInput, TabList, and Selector —
   * children inherit this size as their default via SizeContext.
   *
   * - `'sm'`: Compact — fits sm buttons/inputs (28px elements)
   * - `'md'`: Standard — fits md buttons/inputs (32px elements)
   * - `'lg'`: Spacious — fits lg buttons/inputs (36px elements)
   * @default 'md'
   */
  size?: ToolbarSize;
  /**
   * Gap between items within each slot, using the spacing scale.
   * @default 1
   */
  gap?: SpacingStep;
  /**
   * Orientation of the toolbar for keyboard navigation.
   * Controls which arrow keys navigate between items.
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
  /**
   * Visual variant passed through to Section.
   * @default 'transparent'
   */
  variant?: SectionVariant;

  /**
   * Which sides should have divider borders.
   * Passed through to Section.
   * @example
   * ```
   * dividers={['bottom']}
   * ```
   */
  dividers?: ('top' | 'bottom' | 'start' | 'end')[];
}

/**
 * General-purpose toolbar with start, center, and end content slots.
 *
 * Built on Section, provides flex/grid layout with roving tabindex
 * keyboard navigation via useListFocus. Cascades `size` to child components
 * (Button, TextInput, TabList, Selector) via SizeContext, and applies
 * edge compensation so ghost buttons align flush at container edges.
 *
 * @example
 * ```
 * <Toolbar label="Actions" size="sm"
 *   startContent={<Button label="Cut" variant="ghost" />}
 *   endContent={<Button label="Settings" variant="ghost" />}
 * />
 * ```
 */
export function Toolbar({
  startContent,
  centerContent,
  endContent,
  label,
  size = 'md',
  gap = 1,
  orientation = 'horizontal',
  variant = 'transparent',
  dividers,
  xstyle,
  className,
  style,
  ref,
  onKeyDown: onKeyDownProp,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  role: _role,
  'aria-label': _ariaLabel,
  'aria-orientation': _ariaOrientation,
  ...props
}: ToolbarProps) {
  const hasCenterContent = centerContent != null;
  const hasStartContent = startContent != null;
  const hasEndContent = endContent != null;
  const hasBottomDivider = dividers?.includes('bottom') ?? false;

  const gapVar = spacingVars[spacingStepToVar[gap]] as string;

  const {listRef, handleKeyDown, handleFocus} = useListFocus<HTMLDivElement>({
    // `a[href]` catches a Button rendered with `href`.
    itemSelector: 'button, input, a[href], [tabindex]',
    boundarySelector: '[role="toolbar"], [popover]',
    orientation,
    hasRovingTabIndex: true,
    hasCaretGuard: true,
  });

  const {
    hintElement,
    onKeyDown: onHintKeyDown,
    onFocus: onHintFocus,
    onBlur: onHintBlur,
  } = useKeyboardHint({orientation});

  const handleToolbarKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      onHintKeyDown(e);
      handleKeyDown(e);
    },
    [onKeyDownProp, onHintKeyDown, handleKeyDown],
  );

  const handleToolbarFocus = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      onFocusProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      onHintFocus(e);
      handleFocus(e);
    },
    [onFocusProp, onHintFocus, handleFocus],
  );

  const handleToolbarBlur = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      onBlurProp?.(e);
      if (e.defaultPrevented) {
        return;
      }
      onHintBlur(e);
    },
    [onBlurProp, onHintBlur],
  );

  return (
    <SizeProvider value={size}>
      <Section
        ref={ref}
        variant={variant}
        paddingBlock={defaultBlockPaddingForSize[size]}
        dividers={dividers}
        xstyle={xstyle}
        className={className}
        style={style}>
        <div
          ref={listRef}
          role="toolbar"
          aria-label={label}
          aria-orientation={orientation}
          onKeyDown={handleToolbarKeyDown}
          onFocus={handleToolbarFocus}
          onBlur={handleToolbarBlur}
          {...mergeProps(
            themeProps('toolbar', {size}),
            stylex.props(
              hasCenterContent ? styles.baseGrid : styles.baseFlex,
              orientation === 'vertical' && styles.vertical,
              sizeStyles.base,
              dynamicStyles.gap(gapVar),
              // Only drop the tab indicator through the toolbar's block padding
              // onto the rail when a bottom divider is actually present.
              // Without a divider, leave `--_tab-indicator-bottom` unset so a
              // nested TabList's indicator keeps its own default (hugging the
              // tab) instead of floating down into the toolbar's padding.
              hasBottomDivider &&
                dynamicStyles.tabIndicatorBottom(
                  `calc(-1 * (${blockPaddingVarForSize[size]} + 1px))`,
                ),
            ),
          )}
          {...props}>
          {hasCenterContent ? (
            // Three-slot grid layout
            <>
              <div
                {...stylex.props(
                  styles.startSlot,
                  edgeCompSlot.inset(edgeCompInsetForSize[size]),
                  dynamicStyles.gap(gapVar),
                )}>
                {startContent}
              </div>
              <div
                {...stylex.props(styles.centerSlot, dynamicStyles.gap(gapVar))}>
                {centerContent}
              </div>
              <div
                {...stylex.props(
                  styles.endSlot,
                  edgeCompSlot.inset(edgeCompInsetForSize[size]),
                  dynamicStyles.gap(gapVar),
                )}>
                {endContent}
              </div>
            </>
          ) : (
            // Two-slot flex layout
            <>
              {hasStartContent && (
                <div
                  {...stylex.props(
                    styles.startSlot,
                    !hasEndContent && styles.startOnly,
                    edgeCompSlot.inset(edgeCompInsetForSize[size]),
                    dynamicStyles.gap(gapVar),
                  )}>
                  {startContent}
                </div>
              )}
              {hasEndContent && (
                <div
                  {...stylex.props(
                    styles.endSlot,
                    !hasStartContent && styles.endOnly,
                    edgeCompSlot.inset(edgeCompInsetForSize[size]),
                    dynamicStyles.gap(gapVar),
                  )}>
                  {endContent}
                </div>
              )}
            </>
          )}
          {hintElement}
        </div>
      </Section>
    </SizeProvider>
  );
}

Toolbar.displayName = 'Toolbar';
