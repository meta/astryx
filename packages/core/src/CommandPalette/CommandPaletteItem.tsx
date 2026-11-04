// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';
/**
 * @file CommandPaletteItem.tsx
 * @input Uses React, StyleX, CommandPaletteContext, DialogContext
 * @output Exports CommandPaletteItem component
 * @position Sub-component; individual selectable item
 *
 * SYNC: When modified, update:
 * - /packages/cli/assets/templates/blocks/components/CommandPalette/ (showcase blocks)
 */

import {useCallback, useEffect, useMemo, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import {
  colorVars,
  spacingVars,
  radiusVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {useCommandPaletteContext} from './CommandPaletteContext';
import {useDialogContext} from '../Dialog/DialogContext';
import {themeProps} from '../utils/themeProps';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';

import {useMergedRefs} from '../hooks/useMergedRefs';

const styles = stylex.create({
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    paddingInline: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-inner'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start' as const,
    outline: 'none',
    userSelect: 'none',
  },
  itemHighlighted: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  itemDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  itemSelected: {
    backgroundColor: colorVars['--color-accent-muted'],
  },
});

export interface CommandPaletteItemProps extends Omit<
  BaseProps<HTMLDivElement>,
  'onChange' | 'onSelect'
> {
  /** Ref forwarded to the root element. */
  ref?: React.Ref<HTMLDivElement>;
  /** Unique value for identification and selection. */
  value: string;
  /**
   * Called after this item is activated by pointer.
   * Keyboard selection inside CommandPalette reports through the root
   * `onValueChange` callback.
   */
  onSelect?: (value: string) => void;
  /**
   * Whether this item is visually highlighted (keyboard focus).
   * When omitted inside CommandPalette, derived from context.
   * @default false
   */
  isHighlighted?: boolean;
  /**
   * Whether this item is currently selected (picker mode).
   * When omitted inside CommandPalette, derived from the palette value.
   * @default false
   */
  isSelected?: boolean;
  /**
   * Whether the item is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /** Non-interactive item content: labels, icons, descriptions, shortcuts, etc. */
  children: ReactNode;
}

/**
 * A selectable item in the command palette.
 * Accepts arbitrary children for full rendering control.
 *
 * When used inside CommandPalette, context supplies identity, highlight,
 * selection, and close behavior. Standalone use supports explicit visual
 * state and pointer activation but does not provide a composite listbox
 * keyboard model.
 *
 * @compositionHint Place inside CommandPaletteList or CommandPaletteGroup.
 *
 * @example
 * ```
 * <CommandPaletteItem value="settings" onSelect={() => navigate('/settings')}>
 *   Settings
 * </CommandPaletteItem>
 * ```
 */
export function CommandPaletteItem({
  value,
  onSelect,
  isHighlighted: controlledHighlighted,
  isSelected: controlledSelected,
  isDisabled = false,
  children,
  ref,
  xstyle,
  className,
  style,
  id: idProp,
  onClick: onClickProp,
  onMouseEnter: onMouseEnterProp,
  ...props
}: CommandPaletteItemProps) {
  const pressable = usePressFeedback();
  const ctx = useCommandPaletteContext();
  const dialogContext = useDialogContext();
  const isInlineDialog = dialogContext?.isInline === true;
  const itemRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);

  // Find this item's index in the flat selectable items list (DOM order).
  // This aligns with useCombobox's index-based navigation.
  const itemIndex = useMemo(
    () => ctx?.selectableItems.findIndex(item => item.value === value) ?? -1,
    [ctx?.selectableItems, value],
  );

  // Highlight from useCombobox: index-based, matches DOM order
  const isHighlighted =
    controlledHighlighted ??
    (ctx ? ctx.highlightedIndex === itemIndex && itemIndex >= 0 : false);
  const isSelected = controlledSelected ?? (ctx ? ctx.value === value : false);

  useEffect(() => {
    // Inside CommandPalette the shared useHighlightedOptionScroll (via
    // useCombobox) is the single scrollIntoView owner (#6077); a second owner
    // here doubled every keyboard scroll and scrolled on hover. Standalone
    // items (no context) keep their own scroll.
    if (ctx) {
      return;
    }

    // Inline dialogs are documentation/showcase previews. Avoid scrolling the
    // surrounding page when picker mode auto-highlights its selected item on
    // mount, while preserving scroll-into-view after user navigation.
    const shouldSkipInitialInlineScroll =
      isInlineDialog && !didMountRef.current;
    didMountRef.current = true;

    if (shouldSkipInitialInlineScroll) {
      return;
    }

    if (isHighlighted && itemRef.current) {
      itemRef.current.scrollIntoView?.({block: 'nearest'});
    }
  }, [ctx, isHighlighted, isInlineDialog]);

  const handleClick = useCallback(() => {
    onSelect?.(value);
    if (ctx) {
      ctx.selectItem(value);
      ctx.onClose();
    }
  }, [value, onSelect, ctx]);

  return (
    <div
      ref={useMergedRefs(ref, itemRef)}
      {...props}
      id={ctx && itemIndex >= 0 ? ctx.getItemId(itemIndex) : idProp}
      role="option"
      aria-selected={isSelected}
      aria-disabled={isDisabled || undefined}
      data-value={value}
      {...pressable}
      onClick={
        isDisabled ? undefined : composeEventHandlers(onClickProp, handleClick)
      }
      onMouseEnter={onMouseEnterProp}
      {...mergeProps(
        themeProps('command-palette-item', {
          highlighted: isHighlighted ? 'highlighted' : null,
          selected: isSelected ? 'selected' : null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        stylex.props(
          styles.item,
          !isDisabled && interactionOverlayStyles.backgroundColor,
          isHighlighted && styles.itemHighlighted,
          isSelected && styles.itemSelected,
          isDisabled && styles.itemDisabled,
          xstyle,
        ),
        className,
        style,
      )}>
      {children}
    </div>
  );
}

CommandPaletteItem.displayName = 'CommandPaletteItem';
