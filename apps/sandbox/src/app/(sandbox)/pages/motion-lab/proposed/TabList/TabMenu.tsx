// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TabMenu.tsx
 * @input Uses React, StyleX, usePopover, TabListContext
 * @output Exports TabMenu component, TabMenuProps type, TabMenuOption type
 * @position Menu trigger button; opens dropdown of overflow menu items and
 *   mirrors selected tab indicator positioning
 *
 * SYNC: When modified, update:
 * - /packages/core/src/TabList/TabList.doc.mjs
 * - /packages/core/src/TabList/index.ts
 * - /packages/core/src/TabList/TabList.test.tsx
 * - /packages/cli/assets/templates/blocks/components/TabList/ (showcase blocks)
 */

import React, {useCallback, useId, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Icon} from '@astryxdesign/core/Icon';
import {renderIconSlot, type IconType} from '@astryxdesign/core/Icon';
import {
  colorVars,
  spacingVars,
  sizeVars,
  radiusVars,
  durationVars,
  easeVars,
  fontWeightVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {focusOutlineProps} from '@astryxdesign/core/utils';
import {usePopover} from '@astryxdesign/core/Popover';
// SWIZZLE BUG: `MENU_ITEM_SELECTOR` is internal to DropdownMenu and is not
// re-exported from the package, so the swizzler's rewrite to
// '@astryxdesign/core/DropdownMenu' does not typecheck. Pointed at the package
// source instead. See index.ts for the full list.
import {MENU_ITEM_SELECTOR} from '../../../../../../../../../packages/core/src/DropdownMenu/menuItemRoles';
import {useListFocus} from '@astryxdesign/core/hooks';
import {useTabListContext} from './TabListContext';
import type {TabListSize} from './TabListContext';
import {tabScope} from './tab.markers.stylex';
import {mergeProps} from '@astryxdesign/core/utils';
import {useMergedRefs} from '@astryxdesign/core/hooks';
import type {BaseProps} from '@astryxdesign/core/BaseProps';
import {themeProps} from '@astryxdesign/core/utils';

export interface TabMenuOption {
  value: string;
  label: string;
  /**
   * Icon to display before the label.
   */
  icon?: ReactNode | IconType;
}

export interface TabMenuProps extends Pick<
  BaseProps<HTMLButtonElement>,
  'xstyle' | 'className' | 'style'
> {
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Label for the trigger button and dropdown heading.
   * Displayed as trigger text when no option is selected.
   */
  label: string;
  /**
   * Menu options rendered in the dropdown.
   */
  options: TabMenuOption[];
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  trigger: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radiusVars['--radius-element'],
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textDecoration: 'none',
    transitionProperty: 'color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  triggerSelected: {
    color: colorVars['--color-text-primary'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  triggerLabel: {
    position: 'relative',
    display: 'inline-grid',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  triggerLabelText: {
    gridRowStart: 1,
    gridColumnStart: 1,
  },
  triggerLabelSizer: {
    gridRowStart: 1,
    gridColumnStart: 1,
    visibility: 'hidden',
    pointerEvents: 'none',
    fontWeight: fontWeightVars['--font-weight-semibold'],
  },
  indicator: {
    position: 'absolute',
    // Mirrors Tab's indicator: sits on the bottom edge by default (-1px), or
    // drops onto the divider rail when an ancestor (TabList `hasDivider` or a
    // Toolbar with a bottom divider) sets `--_tab-indicator-bottom`.
    bottom: 'var(--_tab-indicator-bottom, -1px)',
    insetInlineStart: spacingVars['--spacing-3'],
    insetInlineEnd: spacingVars['--spacing-3'],
    height: '2px',
    borderRadius: radiusVars['--radius-full'],
    pointerEvents: 'none',
    transitionProperty: 'opacity, background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  indicatorSelected: {
    backgroundColor: colorVars['--color-icon-primary'],
    opacity: 1,
  },
  hoverBg: {
    position: 'absolute',
    inset: 0,
    margin: 'auto',
    width: '100%',
    borderRadius: radiusVars['--radius-element'],
    pointerEvents: 'none',
    backgroundColor: {
      default: 'transparent',
      [stylex.when.ancestor(':hover', tabScope)]: {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevron: {
    width: spacingVars['--spacing-4'],
    height: spacingVars['--spacing-4'],
    flexShrink: 0,
  },
  // Applied to the chevron <Icon> (via `xstyle`) rather than its wrapper, so the
  // element that rotates is the element a theme targets.
  chevronIcon: {
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  dropdown: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-1'],
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    fontFamily: 'inherit',
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-primary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
  },
  menuItemSelected: {
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  menuItemContent: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  itemCheckmark: {
    flexShrink: 0,
    width: 16,
    height: 16,
    color: colorVars['--color-icon-primary'],
  },
  menuHeading: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    color: colorVars['--color-text-secondary'],
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-3'],
  },
});

const sizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm']},
  md: {height: sizeVars['--size-element-md']},
  lg: {height: sizeVars['--size-element-lg']},
});

// Hover bg uses the standard element size (one step smaller than tab)
const hoverSizeStyles = stylex.create({
  sm: {height: sizeVars['--size-element-sm']},
  md: {height: sizeVars['--size-element-md']},
  lg: {height: sizeVars['--size-element-lg']},
});

/**
 * Tab menu trigger that opens a dropdown of additional tab options.
 * Shows the selected option's label as trigger text when an option is active.
 * Dropdown includes a heading showing the menu's label prop.
 *
 * @example
 * ```
 * <TabList value={tab} onChange={setTab}>
 *   <Tab value="overview" label="Overview" />
 *   <TabMenu label="More" options={[
 *     { value: "settings", label: "Settings" },
 *     { value: "history", label: "History" },
 *   ]} />
 * </TabList>
 * ```
 */
export function TabMenu({
  ref,
  label,
  options,
  xstyle,
  className,
  style,
}: TabMenuProps) {
  const tabListCtx = useTabListContext();
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const popover = usePopover({
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // The popup's own role="menu" is the exposed semantics; a modal dialog
    // wrapper would announce an unnamed dialog around the menu.
    role: 'none',
    // Return focus to the trigger when the menu closes (Escape, Tab, select,
    // or light dismiss) so keyboard focus is never dropped to <body>.
    onHide: useCallback(() => {
      buttonRef.current?.focus();
    }, []),
  });

  // The overflow menu is a composite widget: a single roving tab stop with
  // arrow-key navigation between items, per the APG menu pattern. The hook owns
  // item tabindex — items render tabIndex={-1} and exactly one is promoted to 0.
  const {
    listRef,
    handleKeyDown: handleListKeyDown,
    handleFocus,
    focusFirst,
  } = useListFocus<HTMLDivElement>({
    hasRovingTabIndex: true,
    // Options render as menuitemradio (single-select menu), which the
    // default '[role="menuitem"]' selector would not match.
    itemSelector: MENU_ITEM_SELECTOR,
    onEscape: () => popover.hide(),
  });

  const handleToggle = useCallback(() => {
    if (popover.isOpen) {
      popover.hide();
    } else {
      popover.show();
      // Move focus into the menu on open so arrow navigation works and the
      // roving tab stop lands on a real item (APG menu-button focus-on-open).
      requestAnimationFrame(() => focusFirst());
    }
  }, [popover, focusFirst]);

  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // APG menu-button: Tab leaves the menu rather than walking its items.
      // Close and let onHide return focus to the trigger, from which the
      // browser's default Tab continues to the next element.
      if (e.key === 'Tab') {
        popover.hide();
        return;
      }
      handleListKeyDown(e);
    },
    [handleListKeyDown, popover],
  );

  const selectedOption = options.find(o => o.value === tabListCtx.value);
  const triggerLabel = selectedOption?.label ?? label;
  const hasSelectedOption = selectedOption != null;

  const size: TabListSize = tabListCtx.size;

  const handleSelect = useCallback(
    (value: string) => {
      tabListCtx.onChange(value);
      popover.hide();
    },
    [tabListCtx, popover],
  );

  const setButtonRef = useMergedRefs<HTMLButtonElement>(
    popover.triggerRef,
    buttonRef,
    ref,
  );

  return (
    <>
      <button
        ref={setButtonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={popover.isOpen}
        aria-controls={menuId}
        data-tab-menu=""
        tabIndex={hasSelectedOption ? 0 : -1}
        onClick={handleToggle}
        {...mergeProps(
          themeProps('tab-menu'),
          focusOutlineProps.focusVisible(
            styles.trigger,
            sizeStyles[size],
            hasSelectedOption && styles.triggerSelected,
            tabScope,
            xstyle,
          ),
          className,
          style,
        )}>
        <span
          aria-hidden="true"
          {...stylex.props(styles.hoverBg, hoverSizeStyles[size])}
        />
        <span {...stylex.props(styles.triggerLabel)}>
          <span {...stylex.props(styles.triggerLabelText)}>{triggerLabel}</span>
          <span aria-hidden="true" {...stylex.props(styles.triggerLabelSizer)}>
            {triggerLabel}
          </span>
        </span>
        <span aria-hidden="true" {...stylex.props(styles.chevron)}>
          <Icon
            icon="chevronDown"
            size="sm"
            color="inherit"
            xstyle={[styles.chevronIcon, popover.isOpen && styles.chevronOpen]}
          />
        </span>
        {hasSelectedOption && (
          <span
            {...mergeProps(
              themeProps('tab-indicator', {selected: 'selected'}),
              stylex.props(styles.indicator, styles.indicatorSelected),
            )}
          />
        )}
      </button>
      {popover.render(
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          onFocus={handleFocus}
          {...mergeProps(
            themeProps('tab-menu-dropdown'),
            stylex.props(styles.dropdown),
          )}>
          <span role="presentation" {...stylex.props(styles.menuHeading)}>
            {label}
          </span>
          {options.map(option => {
            const isSelected = tabListCtx.value === option.value;
            return (
              <div
                key={option.value}
                // The menu is single-select: exactly one option can be the
                // active tab, so options are radio menu items with
                // aria-checked (APG menu-button), not plain menuitems with
                // aria-current.
                role="menuitemradio"
                tabIndex={-1}
                aria-checked={isSelected}
                onClick={() => handleSelect(option.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(option.value);
                  }
                }}
                {...mergeProps(
                  themeProps('tab-menu-item'),
                  focusOutlineProps.focusVisible(
                    styles.menuItem,
                    isSelected && styles.menuItemSelected,
                  ),
                )}>
                <span {...stylex.props(styles.menuItemContent)}>
                  {option.icon &&
                    renderIconSlot(option.icon, {
                      size: 'sm',
                      color: 'secondary',
                    })}
                  {option.label}
                </span>
                {isSelected && <Icon icon="check" size="sm" color="accent" />}
              </div>
            );
          })}
        </div>,
        {placement: 'below', alignment: 'start'},
      )}
    </>
  );
}

TabMenu.displayName = 'TabMenu';
