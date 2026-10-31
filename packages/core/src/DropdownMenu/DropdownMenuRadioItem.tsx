// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuRadioItem.tsx
 * @input React, stylex, Item + Icon + DropdownMenu context + tokens from core
 * @output DropdownMenuRadioItem — a single option in a radio group.
 * @position Sub-component; must be used inside a DropdownMenuRadioGroup.
 *
 * A menu item representing one option in a single-select group
 * (role="menuitemradio"). The row owns the role and aria-checked; there is no
 * nested native <input> (per the WAI-ARIA menuitemradio pattern). Selection
 * state + onChange come from DropdownMenuRadioGroupContext. Keyboard nav +
 * Enter/Space activation come from the parent DropdownMenu. Caller onClick and
 * onPointerMove run after the row's own selection and hover focus.
 *
 * The round radio visual is the shared radio indicator, decorative
 * (aria-hidden) — the row owns the checked state, and menu radios pick up the
 * same `radio` theming (and any theme replacement) as RadioList. This row keeps
 * the marker box: its size is derived from the menu's item size and it swaps to
 * the inline-end of the row on coarse-pointer (touch) devices via CSS `order`.
 */

import {
  useCallback,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {renderIconSlot, type IconType} from '../Icon';
import {useIndicator} from '../Indicator';
import {Item} from '../Item';
import {useDropdownMenuContext} from './DropdownMenuContext';
import {focusMenuItemOnHover} from './menuItemHover';
import {colorVars, spacingVars} from '../theme/tokens.stylex';
import {composeEventHandlers, mergeProps, themeProps} from '../utils';
import type {BaseProps} from '../BaseProps';
import {useDropdownMenuRadioGroupContext} from './DropdownMenuContext';

const styles = stylex.create({
  root: {
    width: '100%',
    borderRadius: `max(0px, calc(var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    color: colorVars['--color-text-primary'],
    backgroundColor: {
      default: 'transparent',
      ':focus': colorVars['--color-overlay-hover'],
    },
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    outline: 'none',
  },
  disabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  // Rendered in Item's `marker` slot as a raw flex child. On touch it moves to
  // the inline-end of the row via `order`.
  // Layout box for the decorative marker. The painted circle is the radio
  // indicator inside it, which carries the shared `radio` theme target.
  // Placement of the marker within the row. The indicator draws its own box
  // (size, fill, border) — these are only the rules the MENU owns: where the
  // marker sits in the row, and that it never takes the pointer.
  marker: {
    pointerEvents: 'none',
    order: {
      default: 0,
      '@media (pointer: coarse)': 1,
    },
    marginInlineStart: {
      default: 0,
      '@media (pointer: coarse)': 'auto',
    },
  },
});

// Matches the control sizes RadioList uses, so a radio reads the same in a
// menu row as it does in a radio group.
export interface DropdownMenuRadioItemProps extends Omit<
  BaseProps,
  'role' | 'aria-checked' | 'tabIndex'
> {
  /**
   * The value this item represents within its group. The group's `value`
   * matches against this to determine the checked state.
   */
  value: string;
  /**
   * Primary label text identifying the option.
   */
  label: ReactNode;
  /**
   * Secondary description text displayed below the label.
   */
  description?: ReactNode;
  /**
   * Icon to display before the label. Accepts a semantic icon name (see
   * `astryx docs icons`) or a rendered node.
   */
  icon?: ReactNode | IconType;
  /**
   * Whether this individual radio item is disabled. Disabled items expose
   * `aria-disabled`, block selection, and are currently skipped by
   * DropdownMenu arrow-key navigation.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Content to render after the label and description, such as a badge or
   * metadata.
   */
  endContent?: ReactNode;
  /** Ref forwarded to the row root — the element carrying `role="menuitemradio"`. */
  ref?: React.Ref<HTMLElement>;
}

/**
 * A single option in a DropdownMenuRadioGroup (role="menuitemradio").
 *
 * Consumer click and pointer-move handlers compose after the row's own
 * selection and hover-focus behavior; disabled activation stops before the
 * consumer click handler.
 *
 * @example
 * ```
 * <DropdownMenuRadioGroup value={sort} onChange={setSort} label="Sort by">
 *   <DropdownMenuRadioItem value="newest" label="Newest" />
 *   <DropdownMenuRadioItem value="oldest" label="Oldest" icon="clock" />
 * </DropdownMenuRadioGroup>
 * ```
 */
export function DropdownMenuRadioItem({
  value,
  label,
  description,
  icon,
  isDisabled = false,
  endContent,
  xstyle,
  className,
  style,
  onClick,
  onPointerMove,
  ...rest
}: DropdownMenuRadioItemProps) {
  const menuCtx = useDropdownMenuContext();
  const groupCtx = useDropdownMenuRadioGroupContext();
  if (!groupCtx) {
    throw new Error(
      'DropdownMenuRadioItem must be used within a DropdownMenuRadioGroup',
    );
  }
  const menuSize = menuCtx?.menuSize ?? 'md';
  const controlSize = menuSize === 'sm' ? 'sm' : 'md';
  const isChecked = groupCtx.value === value;
  const RadioControl = useIndicator('radio');

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (isDisabled) {
        return;
      }
      groupCtx.onChange(value);
      if (groupCtx.hasCloseOnSelect) {
        menuCtx?.closeMenu();
      }
      onClick?.(event as MouseEvent<HTMLElement>);
    },
    [isDisabled, groupCtx, value, menuCtx, onClick],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => focusMenuItemOnHover(e, isDisabled),
    [isDisabled],
  );

  return (
    <Item
      {...rest}
      role="menuitemradio"
      aria-checked={isChecked}
      tabIndex={isDisabled ? undefined : -1}
      onPointerMove={composeEventHandlers(handlePointerMove, onPointerMove)}
      marker={
        // No wrapper — see DropdownMenuCheckboxItem: the target belongs on the
        // visible circle, and the indicator already owns its control size.
        <RadioControl
          state={isChecked ? 'checked' : 'unchecked'}
          size={controlSize}
          isDisabled={isDisabled}
          xstyle={styles.marker}
          {...themeProps('dropdown-menu-radio', {
            size: controlSize,
            checked: isChecked ? 'checked' : null,
            disabled: isDisabled ? 'disabled' : null,
          })}
        />
      }
      startContent={
        icon
          ? renderIconSlot(icon, {size: 'sm', color: 'secondary'})
          : undefined
      }
      label={label}
      description={description}
      endContent={endContent}
      onClick={handleClick}
      isDisabled={isDisabled}
      xstyle={[styles.root, isDisabled && styles.disabled, xstyle]}
      {...mergeProps(themeProps('dropdown-menu-item', {size: menuSize}), {
        className,
        style,
      })}
    />
  );
}

DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';
