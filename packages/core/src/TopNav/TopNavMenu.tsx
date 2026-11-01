// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TopNavMenu.tsx
 * @input Uses React, StyleX, usePopover, useMenuHover, useListFocus,
 *   useTypeahead, TopNavItem tokens, and the shared navigation policy
 * @output Exports TopNavMenu component and related types
 * @position Navigation item with hover-triggered overflow menu for TopNav
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TopNav/TopNav.doc.mjs
 * - /packages/core/src/TopNav/TopNavMenu.test.tsx
 * - /packages/core/src/TopNav/index.ts
 * - /packages/cli/assets/templates/blocks/components/TopNav/ (showcase blocks)
 */

import React, {
  useCallback,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {usePopover} from '../Popover/usePopover';
import {useMenuHover} from '../hooks/useMenuHover';
import {useMenuPress} from '../hooks/useMenuPress';
import {pressOnItemsOnly} from '../hooks/menuPressOnItems';
import {menuTouchActionStyles} from '../DropdownMenu/menuTouchAction.stylex';
import {useMenuOverflow} from '../DropdownMenu/useMenuOverflow';
import {useListFocus} from '../hooks/useListFocus';
import {useTypeahead} from '../hooks/useTypeahead';
import {Icon} from '../Icon';
import {mergeProps, composeEventHandlers} from '../utils';
import {useMergedRefs} from '../hooks/useMergedRefs';
import type {BaseProps} from '../BaseProps';
import {navItemStyles} from '../NavItem/navItemStyles.stylex';
import {useTopNavSlot} from './TopNavContext';
import {useTopNavRenderMode} from './TopNavRenderContext';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import {useLinkComponent} from '../Link/useLinkComponent';
import {isSafeUrl} from '../utils/safeUrl';
import {themeProps} from '../utils/themeProps';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
    textDecoration: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    transitionProperty: 'background-color, color',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    backgroundColor: {
      default: 'transparent',
      ':hover:where(:not(:disabled,[aria-disabled="true"]))': {
        '@media (hover: hover)': colorVars['--color-overlay-hover'],
      },
    },
    borderWidth: 0,
    borderStyle: 'none',
    fontFamily: 'inherit',
  },
  triggerOpen: {
    color: colorVars['--color-text-primary'],
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    // The registry chevron is a 1em SVG, so it has always rendered at the
    // trigger's own font size (--text-label-size). Icon's size box would repin
    // it to a fixed rem (the nearest, sm, is 1rem = 16px vs the 14px here), so
    // hold it on the inherited em: same pixels, and still tracks the type
    // scale when a theme changes the label size.
    width: '1em',
    height: '1em',
    fontSize: 'inherit',
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronOpen: {
    transform: 'rotate(180deg)',
  },
  menuContainer: {
    // A held pointer slides across the items; it selects no text.
    userSelect: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    minWidth: 280,
    padding: spacingVars['--spacing-1'],
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-3'],
    paddingInline: spacingVars['--spacing-3'],
    borderRadius: radiusVars['--radius-element'],
    textDecoration: 'none',
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
    borderWidth: 0,
    borderStyle: 'none',
  },
  menuItemIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: radiusVars['--radius-element'],
    backgroundColor: colorVars['--color-neutral'],
    flexShrink: 0,
  },
  menuItemContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-1'],
    minWidth: 0,
  },
  menuItemTitle: {
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-semibold'],
    color: colorVars['--color-text-primary'],
  },
  menuItemDescription: {
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
});

const drawerStyles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    justifyContent: 'space-between',
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
  },
  chevron: {
    display: 'inline-flex',
    // Same em pin as styles.chevron above — the drawer header inherits
    // --text-label-size from navItemStyles.item.
    width: '1em',
    height: '1em',
    fontSize: 'inherit',
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  chevronExpanded: {
    transform: 'rotate(180deg)',
  },
  // The section clips its items only for the 0fr collapse animation: a
  // permanent clip cuts off the focus ring, which paints outside the item.
  // `overflow` is discrete, so it rides the transition with `allow-discrete`
  // and switches to `visible` only after the open has finished. Collapsing
  // clips again at once.
  items: {
    display: 'grid',
    gridTemplateRows: '0fr',
    overflow: 'hidden',
    transitionProperty: 'grid-template-rows, overflow',
    transitionBehavior: 'allow-discrete',
    transitionDuration: `${durationVars['--duration-medium']}, 0s`,
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  itemsExpanded: {
    gridTemplateRows: '1fr',
    overflow: 'visible',
    transitionDelay: `0s, ${durationVars['--duration-medium']}`,
  },
  itemsInner: {
    minHeight: 0,
  },
  item: {
    paddingInlineStart: spacingVars['--spacing-6'],
    textDecoration: 'none',
  },
  itemIcon: {
    flexShrink: 0,
    width: 20,
    height: 20,
  },
  itemText: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
  },
  itemDescription: {
    fontSize: typeScaleVars['--text-supporting-size'],
    color: colorVars['--color-text-secondary'],
    fontWeight: fontWeightVars['--font-weight-normal'],
  },
});

// =============================================================================
// Types
// =============================================================================

/**
 * An item in the TopNav overflow menu.
 */
export interface TopNavMenuItemData {
  /**
   * Display title for the menu item.
   */
  title: string;

  /**
   * Optional description text displayed below the title.
   */
  description?: string;

  /**
   * Optional icon element displayed to the left.
   */
  icon?: ReactNode;

  /**
   * URL to navigate to when clicked.
   */
  href?: string;

  /**
   * Callback when item is clicked.
   */
  onClick?: () => void;
}

function getMenuItemKey(item: TopNavMenuItemData): string {
  return item.title;
}

export interface TopNavMenuProps extends BaseProps<HTMLButtonElement> {
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * The visible label for the nav item trigger.
   */
  label: string;

  /**
   * Menu items to display in the hover popover.
   */
  items: TopNavMenuItemData[];

  /**
   * Delay before showing the menu on hover (ms).
   * @default 150
   */
  delay?: number;

  /**
   * Delay before hiding the menu after mouse leaves (ms).
   * @default 200
   */
  hideDelay?: number;
}

// =============================================================================
// TopNavMenu
// =============================================================================

/**
 * A navigation item that displays a hover-triggered overflow menu.
 *
 * Renders as a nav item in TopNav's startContent slot. On hover,
 * shows a popover with rich menu items containing an icon, title,
 * and optional description.
 *
 * @example
 * ```
 * <TopNav
 *   startContent={
 *     <>
 *       <TopNavItem label="Home" href="/" isSelected />
 *       <TopNavMenu
 *         label="Products"
 *         items={[
 *           {
 *             title: 'Analytics',
 *             description: 'Track and analyze user behavior',
 *             icon: <ChartBarIcon />,
 *             href: '/products/analytics',
 *           },
 *           {
 *             title: 'Messaging',
 *             description: 'Real-time communication tools',
 *             icon: <ChatBubbleIcon />,
 *             href: '/products/messaging',
 *           },
 *         ]}
 *       />
 *     </>
 *   }
 * />
 * ```
 */

export function TopNavMenu({
  ref,
  label,
  items,
  delay = 150,
  hideDelay = 200,
  xstyle,
  className,
  style,
  onClick: onClickProp,
  onMouseEnter: onMouseEnterProp,
  onMouseLeave: onMouseLeaveProp,
  ...rest
}: TopNavMenuProps) {
  const pressable = usePressFeedback();
  const renderMode = useTopNavRenderMode();
  const {closeMobileNav} = useAppShellMobile();
  const LinkComponent = useLinkComponent();
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const menuId = useId();

  const slot = useTopNavSlot();
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  const popover = usePopover({
    // The popup's own role="menu" is the exposed semantics; a modal dialog
    // wrapper would announce an unnamed dialog around the menu and make the
    // trigger claim aria-haspopup="dialog" for menu content (see TabMenu).
    role: 'none',
  });

  const {triggerProps, contentProps, menuRef, setTriggerEl, close} =
    useMenuHover<HTMLDivElement>({
      show: popover.show,
      hide: popover.hide,
      isOpen: popover.isOpen,
      isEnabled: true,
      showDelay: delay,
      hideDelay,
      // Trigger sits outside an auto popover; the invoker relationship exempts
      // it from light dismiss.
      popoverId: popover.id,
    });

  const setTriggerRef = useMergedRefs<HTMLButtonElement>(
    triggerButtonRef,
    popover.triggerRef,
    setTriggerEl,
    ref,
  );

  // The desktop popup is a composite menu widget per the APG menu pattern:
  // a single roving tab stop with ArrowUp/ArrowDown traversal (wrapping),
  // Home/End, and first-character typeahead. The hook owns item tabindex —
  // items render tabIndex={-1} and exactly one is promoted to 0. The
  // composition mirrors NavHeadingMenu.
  const {listRef, handleKeyDown, handleFocus, focusItem} =
    useListFocus<HTMLDivElement>({
      itemSelector: '[role="menuitem"]',
      hasRovingTabIndex: true,
      // Not popover.hide: Escape must also restore focus to the trigger.
      onEscape: close,
    });

  // First-character typeahead over the menu items (menus-11).
  const getMenuItems = useCallback(
    (): HTMLElement[] =>
      listRef.current
        ? Array.from(
            listRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'),
          )
        : [],
    [listRef],
  );
  const typeahead = useTypeahead({
    getItemLabels: () => getMenuItems().map(el => el.textContent),
    onMatch: focusItem,
    getCurrentIndex: () =>
      getMenuItems().findIndex(
        el =>
          el === document.activeElement || el.contains(document.activeElement),
      ),
  });

  // Extend useListFocus with Enter/Space activation. Items rendered without an
  // `href` are `<div role="menuitem">` elements, which have no native keyboard
  // activation — without this, Enter/Space on a focused onClick-only item does
  // nothing. Anchor items (with `href`) already activate on Enter natively.
  const menuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const focused = document.activeElement as HTMLElement | null;
        if (focused?.getAttribute('role') === 'menuitem') {
          e.preventDefault();
          focused.click();
          return;
        }
      }
      if (typeahead.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
      handleKeyDown(e);
    },
    [handleKeyDown, typeahead],
  );

  // Menu container carries both the hover hook's ref (for its open/close
  // focus management) and the list-focus ref (for roving tabindex/typeahead).
  const setMenuRef = useMergedRefs<HTMLDivElement>(menuRef, listRef);

  // A press that slides across the items acts on the item it lifts on, the
  // highlight following the pointer, as every menu does
  // (`family:action-groups` FR1-FR3); a mouse released outside closes it.
  const menuPress = useMenuPress({
    menuRef: listRef,
    itemSelector: '[role="menuitem"]',
    onDismiss: close,
  });
  const hasOverflow = useMenuOverflow(listRef, items.length, popover.isOpen);

  // Mobile bar: hide menus entirely
  if (renderMode === 'mobile-bar') {
    return null;
  }

  // Drawer mode: collapsible section
  if (renderMode === 'drawer') {
    return (
      <div {...stylex.props(drawerStyles.section)}>
        <button
          ref={ref}
          type="button"
          {...rest}
          onMouseEnter={onMouseEnterProp}
          onMouseLeave={onMouseLeaveProp}
          onClick={composeEventHandlers(onClickProp, () =>
            setDrawerExpanded(v => !v),
          )}
          aria-expanded={drawerExpanded}
          aria-controls={`${menuId}-items`}
          {...pressable}
          {...mergeProps(
            focusOutlineProps.focusVisible(
              navItemStyles.item,
              interactionOverlayStyles.backgroundColor,
              drawerStyles.header,
              xstyle,
            ),
            className,
            style,
          )}>
          {label}
          <Icon
            icon="chevronDown"
            size="sm"
            color="inherit"
            xstyle={[
              drawerStyles.chevron,
              drawerExpanded && drawerStyles.chevronExpanded,
            ]}
          />
        </button>
        <div
          id={`${menuId}-items`}
          aria-hidden={!drawerExpanded}
          inert={!drawerExpanded ? true : undefined}
          {...stylex.props(
            drawerStyles.items,
            drawerExpanded && drawerStyles.itemsExpanded,
          )}>
          <div {...stylex.props(drawerStyles.itemsInner)}>
            {items.map(item => (
              <LinkComponent
                key={getMenuItemKey(item)}
                href={item.href}
                {...pressable}
                onClick={(_e: React.MouseEvent) => {
                  item.onClick?.();
                  closeMobileNav();
                }}
                {...focusOutlineProps.focusVisible(
                  navItemStyles.item,
                  interactionOverlayStyles.backgroundColor,
                  drawerStyles.item,
                )}>
                {item.icon && (
                  <span {...stylex.props(drawerStyles.itemIcon)}>
                    {item.icon}
                  </span>
                )}
                <span {...stylex.props(drawerStyles.itemText)}>
                  {item.title}
                  {item.description && (
                    <span {...stylex.props(drawerStyles.itemDescription)}>
                      {item.description}
                    </span>
                  )}
                </span>
              </LinkComponent>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Default: desktop popover
  return (
    <>
      <button
        ref={setTriggerRef}
        type="button"
        {...rest}
        {...popover.triggerProps}
        {...triggerProps}
        onClick={composeEventHandlers(onClickProp, triggerProps.onClick)}
        onMouseEnter={composeEventHandlers(
          onMouseEnterProp,
          triggerProps.onMouseEnter,
        )}
        onMouseLeave={composeEventHandlers(
          onMouseLeaveProp,
          triggerProps.onMouseLeave,
        )}
        {...mergeProps(
          themeProps('top-nav-menu'),
          focusOutlineProps.focusVisible(
            styles.trigger,
            popover.isOpen && styles.triggerOpen,
            xstyle,
          ),
          className,
          style,
        )}>
        {label}
        <Icon
          icon="chevronDown"
          size="sm"
          color="inherit"
          xstyle={[styles.chevron, popover.isOpen && styles.chevronOpen]}
        />
      </button>
      {popover.render(
        <div
          ref={setMenuRef}
          role="menu"
          aria-label={label}
          {...contentProps}
          {...menuPress.menuProps}
          onPointerDown={pressOnItemsOnly(
            menuPress.menuProps.onPointerDown,
            '[role="menuitem"]',
          )}
          // After the contentProps spread so the full APG composition (roving
          // tabindex + typeahead + Enter/Space activation) replaces the hover
          // hook's basic arrow-key handler.
          onKeyDown={menuKeyDown}
          onFocus={handleFocus}
          {...stylex.props(
            styles.menuContainer,
            hasOverflow
              ? menuTouchActionStyles.scrolls
              : menuTouchActionStyles.fits,
          )}>
          {items.map(item => {
            const Element = item.href ? 'a' : 'div';
            return (
              <Element
                key={getMenuItemKey(item)}
                role="menuitem"
                // Single tab stop: useListFocus owns the roving tabindex and
                // promotes exactly one item to 0.
                tabIndex={-1}
                href={
                  item.href != null && isSafeUrl(item.href)
                    ? item.href
                    : undefined
                }
                // A menu row is never a draggable link: a mouse press that
                // slides to another item would start a drag instead.
                draggable={item.href != null ? false : undefined}
                onClick={item.onClick}
                {...focusOutlineProps.focusVisible(styles.menuItem)}>
                <div {...stylex.props(styles.menuItemIcon)}>{item.icon}</div>
                <div {...stylex.props(styles.menuItemContent)}>
                  <span {...stylex.props(styles.menuItemTitle)}>
                    {item.title}
                  </span>
                  {item.description && (
                    <span {...stylex.props(styles.menuItemDescription)}>
                      {item.description}
                    </span>
                  )}
                </div>
              </Element>
            );
          })}
        </div>,
        {
          placement: 'below',
          alignment: slot,
          offset: spacingVars['--spacing-1'],
        },
      )}
    </>
  );
}

TopNavMenu.displayName = 'TopNavMenu';
