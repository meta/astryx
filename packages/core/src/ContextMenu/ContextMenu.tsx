// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file ContextMenu.tsx
 * @input Uses React, StyleX, useLayer, shared layer dismissal, BottomSheet,
 *   useListFocus, and the shared menu-presentation resolver
 * @output Exports ContextMenu with cursor-popover and touch-sheet presentations
 * @position Core implementation; consumed by index.ts
 *
 * Right-click context menu positioned at the cursor. The cursor point is
 * captured as an offset *inside the trigger* and materialized as a 1px
 * anchor element, so the menu is positioned relative to the trigger's context
 * (via CSS anchor positioning) rather than the viewport. It therefore follows
 * the content on scroll and auto-flips at viewport edges, while still appearing
 * under the cursor.
 * Reuses DropdownMenu item rendering and keyboard navigation.
 *
 * Supports two content modes with a single keyboard/focus path:
 * - **Data-driven**: pass `items` array (converted to components internally)
 * - **Compound-component**: pass `menuContent` JSX directly
 *
 * Both modes use useListFocus for DOM-based keyboard navigation.
 * Open state is managed internally — right-click opens, click-outside/Escape closes.
 * The trigger wrapper is a `div` by default; `triggerAs` makes it an inline
 * `span`, so a reference inside prose can own a context menu without
 * breaking the text flow.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/ContextMenu/ContextMenu.doc.mjs
 * - /packages/core/src/ContextMenu/ContextMenu.test.tsx
 * - /packages/core/src/ContextMenu/index.ts
 * - /apps/storybook/stories/ContextMenu.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/ContextMenu/ (showcase blocks)
 */

import React, {
  useCallback,
  useEffect,
  useId,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
} from 'react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '../Button';
import {Heading} from '../Heading';
import {Icon} from '../Icon';
import {useLayer} from '../Layer/useLayer';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {currentGesture} from '../Layer/gestureCounter';
import {MenuBottomSheetActionList} from '../DropdownMenu/MenuBottomSheetActionList';
import {renderDropdownItems} from '../DropdownMenu/renderDropdownItems';
import {
  DropdownMenuContext,
  DropdownMenuRootOpenContext,
  type DropdownMenuContextValue,
} from '../DropdownMenu/DropdownMenuContext';
import {
  MENU_ITEM_ROLES,
  MENU_ITEM_SELECTOR,
  MENU_BOUNDARY_SELECTOR,
  activateMenuItem,
} from '../DropdownMenu/menuItemRoles';
import {useMenuOverflow} from '../DropdownMenu/useMenuOverflow';
import {useMenuDrillIn} from '../DropdownMenu/useMenuDrillIn';
import {useListFocus} from '../hooks/useListFocus';
import {useMenuPress} from '../hooks/useMenuPress';
import {useTypeahead} from '../hooks/useTypeahead';
import {useLongPress} from '../hooks/useLongPress';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  shadowVars,
} from '../theme/tokens.stylex';
import {mergeProps, rtlStyles} from '../utils';
import type {BaseProps} from '../BaseProps';
import type {StyleXStyles} from '../theme/types';
import {themeProps} from '../utils/themeProps';
import {useTranslator} from '../i18n';
import type {
  DropdownMenuOption,
  DropdownMenuItemData,
  DropdownMenuDividerData,
  DropdownMenuSection,
} from '../DropdownMenu/DropdownMenu';

import {useMergedRefs} from '../hooks/useMergedRefs';
import {
  useAdaptivePresentation,
  type AdaptivePresentation,
} from '../hooks/useAdaptivePresentation';

const LazyMenuBottomSheet = lazy(async () =>
  import('../DropdownMenu/MenuBottomSheet').then(module => ({
    default: module.MenuBottomSheet,
  })),
);
const styles = stylex.create({
  // Trigger wrapper: suppress the iOS long-press callout/selection so the
  // long-press opens our context menu instead of the native text/callout UI.
  // `position: relative` establishes the containing block for the absolutely
  // positioned cursor anchor below, so the anchor point tracks the trigger
  // (and scrolls with it) instead of the page.
  trigger: {
    position: 'relative',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  },
  // 1px anchor placed at the cursor point within the trigger. The menu is
  // anchored to this element, so it sits under the cursor yet is positioned
  // relative to the trigger's context — it follows the content on scroll and
  // the browser can auto-flip it against the viewport edges. It owns a box
  // because WebKit counts an empty anchor box as clipped, and the default
  // `position-visibility: anchors-visible` then hides the menu.
  cursorAnchor: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
  },
  menu: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    maxHeight: '300px',
    overflowY: 'auto',
    '--_dropdown-menu-radius': radiusVars['--radius-container'],
    '--_dropdown-menu-padding': spacingVars['--spacing-1'],
    padding: spacingVars['--spacing-1'],
    borderRadius: 'var(--_dropdown-menu-radius)',
    backgroundColor: colorVars['--color-background-popover'],
    boxShadow: shadowVars['--shadow-low'],
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    userSelect: 'none',
    WebkitTouchCallout: 'none',
  },
  // Scroll ownership by the browser's own signal; see DropdownMenu.
  touchPinchZoom: {
    touchAction: 'pinch-zoom',
  },
  touchPanYPinchZoom: {
    touchAction: 'pan-y pinch-zoom',
    overscrollBehavior: 'contain',
  },
  popover: {
    minWidth: '160px',
  },
  popoverCustomWidth: (width: string | number) => ({
    minWidth: typeof width === 'number' ? `${width}px` : width,
  }),
  sheetMenu: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    width: '100%',
    '--_dropdown-menu-radius': radiusVars['--radius-container'],
    '--_dropdown-menu-padding': spacingVars['--spacing-1'],
    padding: spacingVars['--spacing-1'],
    borderRadius: 'var(--_dropdown-menu-radius)',
    backgroundColor: colorVars['--color-background-surface'],
    outline: 'none',
    userSelect: 'none',
  },
  sheetHeader: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    marginBottom: spacingVars['--spacing-2'],
  },
  sheetRootHeading: {
    marginInlineStart: spacingVars['--spacing-3'],
  },
  sheetViewHeading: {
    outline: 'none',
  },
});

/**
 * Keeps the 1px cursor anchor inside the trigger along one axis. A point in
 * the trigger's last pixel (Shift+F10 opens on its bottom edge) steps back by
 * that pixel: past the edge the anchor would add scrollable overflow, and a
 * scroller whose edge meets the trigger's would clip it and hide the menu.
 * Any other point, inside the trigger or not, stays where it is.
 */
function keepAnchorInside(offset: number, size: number): number {
  return offset > size - 1 && offset <= size ? Math.max(size - 1, 0) : offset;
}

// =============================================================================
// Types
// =============================================================================

export type ContextMenuItemData = DropdownMenuItemData;

export type ContextMenuDividerData = DropdownMenuDividerData;

export type ContextMenuSection = DropdownMenuSection;

export type ContextMenuOption = DropdownMenuOption;

// =============================================================================
// Props
// =============================================================================

interface ContextMenuBaseProps extends BaseProps {
  /** Ref forwarded to the trigger wrapper element. */
  ref?: React.Ref<HTMLElement>;
  /**
   * The element the trigger wrapper renders as. `div` is a block; `span` an
   * inline wrapper, so a reference inside prose can own a context menu
   * without breaking the text flow.
   * @default 'div'
   */
  triggerAs?: 'div' | 'span';
  /**
   * Styles applied to the trigger wrapper element (the right-click target).
   * By default the trigger is a plain block that hugs its content — pass a
   * fill style (e.g. `width/height: 100%`) when the whole parent area should
   * be right-clickable (as the Table does for full-cell context menus).
   */
  triggerXstyle?: StyleXStyles | StyleXStyles[];
  /** The trigger area — right-click on this to open the menu. */
  children: ReactNode;
  /** Custom menu width. @default '160px' */
  menuWidth?: number | string;
  /** Size of menu items. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Accessible name for the menu surface, announced when it opens.
   * @default 'Context menu'
   */
  label?: string;
  /** When true, right-click shows the native browser context menu instead. */
  isDisabled?: boolean;
  /** Called when the menu opens or closes. */
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * Presentation policy for the menu.
   * - `popover`: open beside the pointer position.
   * - `bottom-sheet`: open as an action sheet.
   * - `adaptive`: use a BottomSheet on compact coarse-pointer viewports and
   *   the cursor-positioned popover elsewhere.
   * @default 'popover'
   */
  presentation?: AdaptivePresentation;
  'data-testid'?: string;
}

interface ContextMenuDataProps extends ContextMenuBaseProps {
  /** Array of menu entries (data-driven mode). */
  items: ContextMenuOption[];
  menuContent?: undefined;
}

interface ContextMenuCompoundProps extends ContextMenuBaseProps {
  items?: undefined;
  /** Custom JSX menu content (compound mode). */
  menuContent: ReactNode;
}

export type ContextMenuProps = ContextMenuDataProps | ContextMenuCompoundProps;

// =============================================================================
// ContextMenu
// =============================================================================

/**
 * A context menu component that appears on right-click at cursor position.
 *
 * Supports two modes:
 * - **Data-driven**: pass `items` for static menus
 * - **Compound-component**: pass `menuContent` JSX for dynamic menus
 *
 * Both modes share the same DOM-based keyboard navigation via useListFocus.
 *
 * @example
 * ```
 * <ContextMenu
 *   items={[
 *     { label: 'Cut', onClick: () => handleCut() },
 *     { label: 'Copy', onClick: () => handleCopy() },
 *     { type: 'divider' },
 *     { label: 'Paste', onClick: () => handlePaste() },
 *   ]}
 * >
 *   <div>Right-click this area</div>
 * </ContextMenu>
 * ```
 */
export function ContextMenu({
  children,
  menuWidth,
  size = 'md',
  label: labelFromProps,
  isDisabled = false,
  onOpenChange,
  presentation = 'popover',
  triggerAs = 'div',
  ref,
  className,
  style,
  xstyle,
  triggerXstyle,
  onContextMenu: onContextMenuProp,
  onTouchStart: onTouchStartProp,
  onTouchMove: onTouchMoveProp,
  onTouchEnd: onTouchEndProp,
  onTouchCancel: onTouchCancelProp,
  'data-testid': testId,
  ...rest
}: ContextMenuProps) {
  const t = useTranslator();
  const label = labelFromProps ?? t('@astryx.contextMenu.label');
  const backLabel = t('@astryx.dropdownMenu.back');
  const resolvedPresentation = useAdaptivePresentation(presentation);
  const usesBottomSheet = resolvedPresentation === 'bottom-sheet';
  // Separate content props (union discriminant) from DOM pass-through attrs.
  // The union means exactly one of items/menuContent exists in rest; destructure
  // both so triggerProps contains only DOM-safe attributes.
  const {
    items: itemsProp,
    menuContent: menuContentProp,
    ...triggerProps
  } = rest as {items?: ContextMenuOption[]; menuContent?: ReactNode} & Omit<
    typeof rest,
    'items' | 'menuContent'
  >;
  const items = itemsProp ?? [];
  const menuContent = menuContentProp;

  const menuId = useId();
  // Cursor point in the trigger's local coordinate space (offset from the
  // trigger's top-left, in-flow). Stored here and written to the cursor
  // anchor element so the menu is positioned relative to the trigger context
  // — it scrolls with the content instead of sitting at a fixed viewport point.
  const positionRef = useRef({x: 0, y: 0});
  const cursorAnchorRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  // Element focused before the menu opened, restored when it closes so focus
  // does not fall to <body> after Escape or outside-click dismissal.
  const triggerFocusRef = useRef<HTMLElement | null>(null);
  // The gesture of the finger press that opened the menu (`Layer/
  // gestureCounter`), null when a mouse or the keyboard opened it: the
  // browser's compatibility mouse events for that same press are not presses
  // outside.
  const openingGestureRef = useRef<number | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [submenuPath, setSubmenuPath] = useState<ContextMenuItemData[]>([]);
  const currentSubmenu = submenuPath.at(-1);
  const currentItems = currentSubmenu?.items ?? items;
  const currentTitle = currentSubmenu?.label ?? label;
  const sheetLabel = typeof currentTitle === 'string' ? currentTitle : label;

  const updateOpenState = useCallback(
    (nextIsOpen: boolean) => {
      if (!nextIsOpen) {
        setSubmenuPath([]);
      }
      setIsOpen(nextIsOpen);
      onOpenChange?.(nextIsOpen);
    },
    [onOpenChange],
  );

  const layer = useLayer({
    mode: 'context',
    onHide: useCallback(() => {
      setIsOpen(false);
      onOpenChange?.(false);
      // Restore focus to the element that was focused before opening.
      const toRestore = triggerFocusRef.current;
      triggerFocusRef.current = null;
      if (toRestore && document.contains(toRestore)) {
        toRestore.focus();
      }
    }, [onOpenChange]),
    onShow: useCallback(() => {
      setIsOpen(true);
      onOpenChange?.(true);
    }, [onOpenChange]),
    lightDismiss: false,
  });

  const closeMenu = useCallback(() => {
    if (usesBottomSheet) {
      updateOpenState(false);
    } else {
      layer.hide();
    }
  }, [layer, updateOpenState, usesBottomSheet]);

  const handleBottomSheetSelect = useCallback(
    (item: ContextMenuItemData, event: React.MouseEvent) => {
      if (item.isDisabled) {
        return;
      }
      item.onClick?.(event);
      if (item.hasCloseOnSelect !== false) {
        closeMenu();
      }
    },
    [closeMenu],
  );

  const setSheetHeadingRef = useCallback(
    (node: HTMLHeadingElement | null) => {
      if (node && isOpen && submenuPath.length > 0) {
        node.focus({preventScroll: true});
      }
    },
    [isOpen, submenuPath.length],
  );

  const {
    listRef,
    handleKeyDown: listNavKeyDown,
    focusFirst,
    focusItem,
    ownsEvent,
    getItems: getMenuItems,
  } = useListFocus<HTMLDivElement>({
    itemSelector: MENU_ITEM_SELECTOR,
    boundarySelector: MENU_BOUNDARY_SELECTOR,
    // Menus wrap from the last row to the first and back.
    wrap: true,
    hasPaging: true,
  });

  // Join the shared stack so an Escape press dismisses exactly one top-most
  // surface. BottomSheet owns its own dismissal path.
  useLayerDismissal({
    isActive: isOpen && !usesBottomSheet,
    onDismiss: closeMenu,
    getContainer: () => listRef.current,
  });

  // Typeahead over the enabled menu items, matched on each row's LABEL alone.
  // Reuses the hook's scoped item collection so an inline submenu flyout's
  // items aren't swept in.
  const typeahead = useTypeahead({
    getItemLabels: () => getMenuItems().map(el => el.textContent),
    onMatch: focusItem,
    getCurrentIndex: () =>
      getMenuItems().findIndex(
        el =>
          el === document.activeElement || el.contains(document.activeElement),
      ),
  });

  // Dismiss on any click outside the menu. We use popover="manual" (not
  // "auto") because the native light-dismiss treats the mouseup from the
  // opening right-click as a dismiss event. Handling it ourselves via
  // mousedown avoids that race. A touch's compatibility mousedown for the
  // press that opened the menu (sent mid-hold by iOS, or as a long press
  // lifts by Chromium) belongs to that press's gesture, so it is not read as
  // a press outside; any later press is a new gesture and closes as before.
  useEffect(() => {
    if (!isOpen || usesBottomSheet) {
      return;
    }
    // Inside a shadow root, even a closed or nested one, the document sees a
    // press on the menu as a press on an outer shadow host, so the menu's own
    // tree judges its presses first and the document skips those.
    const tree = listRef.current?.getRootNode();
    const shadow = tree instanceof ShadowRoot ? tree : null;
    const judged = new WeakSet<Event>();
    const handleClickOutside = (e: Event) => {
      const menu = listRef.current;
      if (judged.has(e)) {
        return;
      }
      judged.add(e);
      if (currentGesture() === openingGestureRef.current) {
        return;
      }
      if (menu && !menu.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    shadow?.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      shadow?.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeMenu, listRef, usesBottomSheet]);

  const listKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // A submenu flyout renders inline inside this menu; its key events bubble
      // up here. Let that level own them — only handle events from this level.
      if (!ownsEvent(e)) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // A held key's auto-repeat never activates.
        if (e.repeat) {
          return;
        }
        const focused = document.activeElement as HTMLElement | null;
        if (
          focused &&
          MENU_ITEM_ROLES.has(focused.getAttribute('role') ?? '')
        ) {
          // The synthesized click keeps the key's modifiers, so a modified
          // Enter on a link row opens the way a modified click would.
          activateMenuItem(focused, e);
        }
        return;
      }
      // APG menu pattern: Tab closes the menu. Menu items are tabIndex={-1}
      // so Tab would otherwise leak focus into the page while the menu stayed
      // open (menus-5). Do NOT preventDefault — closing restores focus to the
      // previously focused element, and the browser's default Tab then
      // continues from there to the next element.
      if (e.key === 'Tab') {
        closeMenu();
        return;
      }
      if (typeahead.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
      listNavKeyDown(e);
    },
    [listNavKeyDown, closeMenu, typeahead, ownsEvent],
  );

  // Place the 1px cursor anchor at a point in the trigger's local
  // coordinate space and open the menu. Positioning the anchor inside the
  // trigger (rather than storing viewport coordinates on the menu itself) is
  // what makes the menu context-relative: it scrolls with the content and the
  // browser auto-flips it against the viewport edges via CSS anchor positioning.
  const openAtLocalPoint = useCallback(
    (localX: number, localY: number, focusEl: HTMLElement | null) => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const x = rect ? keepAnchorInside(localX, rect.width) : localX;
      const y = rect ? keepAnchorInside(localY, rect.height) : localY;
      positionRef.current = {x, y};
      const anchorEl = cursorAnchorRef.current;
      if (anchorEl) {
        anchorEl.style.left = `${x}px`;
        anchorEl.style.top = `${y}px`;
      }
      // Remember the element focused before opening so we can restore it on
      // close (Escape or outside-click), instead of dropping focus to <body>.
      triggerFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : focusEl;
      if (usesBottomSheet) {
        updateOpenState(true);
      } else {
        layer.show();
        requestAnimationFrame(() => focusFirst());
      }
    },
    [layer, focusFirst, updateOpenState, usesBottomSheet],
  );

  // The box the cursor anchor's offsets are measured from: the trigger, which
  // is its containing block.
  const getAnchorBaseRect = useCallback(
    (): DOMRect | undefined => triggerRef.current?.getBoundingClientRect(),
    [],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (isDisabled) {
        return;
      }
      e.preventDefault();
      const rect = getAnchorBaseRect();
      // A keyboard-initiated contextmenu (Shift+F10 / the Menu key) fires a
      // `contextmenu` event whose coordinates are (0, 0) in several browsers.
      // Detect that and anchor the menu to the trigger's bottom-left instead,
      // so the menu is reachable without a pointer (menus-8).
      const isKeyboardInvoked =
        e.clientX === 0 && e.clientY === 0 && e.detail === 0;
      // Convert the viewport cursor point into the trigger's local space so
      // the anchor lives inside the (scrollable) trigger context.
      const localX = isKeyboardInvoked || !rect ? 0 : e.clientX - rect.left;
      const localY =
        isKeyboardInvoked || !rect ? (rect?.height ?? 0) : e.clientY - rect.top;
      // A finger's long press reaches here as a pointer `contextmenu` where
      // the browser sends one (Chromium); its compatibility mousedown then
      // belongs to the opening press. A mouse or the keyboard opens without
      // one, so every later mousedown is a press outside.
      openingGestureRef.current =
        (e.nativeEvent as Partial<PointerEvent>).pointerType === 'touch'
          ? currentGesture()
          : null;
      openAtLocalPoint(localX, localY, e.currentTarget as HTMLElement);
    },
    [isDisabled, openAtLocalPoint, getAnchorBaseRect],
  );

  // Touch long-press invocation (menus-8). iOS Safari never synthesizes a
  // `contextmenu` event on long-press, so a context menu is otherwise
  // unreachable on touch. Open the menu at the touch point once the press is
  // held long enough (see useLongPress for timer/move-cancel/cleanup logic).
  // The hook also returns the imperative start/moveTo/cancel API the menu press
  // model drives; only its four touch handlers belong on the trigger element.
  const {
    onTouchStart: handleLongPressTouchStart,
    onTouchMove: handleLongPressTouchMove,
    onTouchEnd: handleLongPressTouchEnd,
    onTouchCancel: handleLongPressTouchCancel,
  } = useLongPress({
    disabled: isDisabled,
    onLongPress: useCallback(
      (point: {x: number; y: number}) => {
        const rect = getAnchorBaseRect();
        // The finger is still down: the compatibility mousedown iOS sends
        // mid-hold, or Chromium as it lifts, belongs to this press.
        openingGestureRef.current = currentGesture();
        openAtLocalPoint(
          rect ? point.x - rect.left : point.x,
          rect ? point.y - rect.top : point.y,
          triggerRef.current,
        );
      },
      [openAtLocalPoint, getAnchorBaseRect],
    ),
  });

  // ContextMenu owns invocation and long-press cleanup. Consumer handlers are
  // notified too, but preventing their default does not cancel component-owned
  // behavior that the public API does not promise as cancelable.
  const handleTriggerContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      handleContextMenu(event);
      onContextMenuProp?.(event);
    },
    [handleContextMenu, onContextMenuProp],
  );
  const handleTriggerTouchStart = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      handleLongPressTouchStart(event);
      onTouchStartProp?.(event);
    },
    [handleLongPressTouchStart, onTouchStartProp],
  );
  const handleTriggerTouchMove = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      handleLongPressTouchMove(event);
      onTouchMoveProp?.(event);
    },
    [handleLongPressTouchMove, onTouchMoveProp],
  );
  const handleTriggerTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      handleLongPressTouchEnd();
      onTouchEndProp?.(event);
    },
    [handleLongPressTouchEnd, onTouchEndProp],
  );
  const handleTriggerTouchCancel = useCallback(
    (event: React.TouchEvent<HTMLElement>) => {
      handleLongPressTouchCancel();
      onTouchCancelProp?.(event);
    },
    [handleLongPressTouchCancel, onTouchCancelProp],
  );

  const popoverXstyle = menuWidth
    ? styles.popoverCustomWidth(menuWidth)
    : styles.popover;

  // The drill-in view stack for sub-menus on a phone; the bottom sheet has
  // its own drill-in.
  const {drillIn, wrapContent} = useMenuDrillIn(isOpen && !usesBottomSheet);
  const contextValue = useMemo<DropdownMenuContextValue>(
    () => ({closeMenu, menuSize: size, drillIn, menuLabel: label}),
    [closeMenu, size, drillIn, label],
  );

  const resolvedMenuContent = wrapContent(
    itemsProp !== undefined ? renderDropdownItems(items) : menuContent,
  );

  const hasOverflow = useMenuOverflow(
    listRef,
    resolvedMenuContent,
    isOpen && !usesBottomSheet,
  );

  // The press model: the row under a release acts, the highlight follows a
  // held pointer, a mouse released outside dismisses and a finger leaves the
  // menu open.
  const menuPress = useMenuPress({
    menuRef: listRef,
    itemSelector: MENU_ITEM_SELECTOR,
    onDismiss: closeMenu,
    isEnabled: !usesBottomSheet,
  });

  const renderedMenu = (
    <div
      ref={listRef}
      id={menuId}
      role="menu"
      data-autofocus={usesBottomSheet ? '' : undefined}
      tabIndex={usesBottomSheet ? 0 : -1}
      aria-label={label}
      onKeyDown={listKeyDown}
      onContextMenu={e => e.preventDefault()}
      {...menuPress.menuProps}
      {...mergeProps(
        themeProps('context-menu'),
        stylex.props(
          usesBottomSheet ? styles.sheetMenu : styles.menu,
          !usesBottomSheet &&
            (hasOverflow ? styles.touchPanYPinchZoom : styles.touchPinchZoom),
          xstyle,
        ),
        className,
        style,
      )}>
      <DropdownMenuContext value={contextValue}>
        <DropdownMenuRootOpenContext value={isOpen}>
          {resolvedMenuContent}
        </DropdownMenuRootOpenContext>
      </DropdownMenuContext>
    </div>
  );

  const renderedBottomSheetContent =
    itemsProp !== undefined ? (
      <div
        ref={listRef}
        data-autofocus=""
        tabIndex={0}
        {...mergeProps(
          themeProps('context-menu'),
          stylex.props(styles.sheetMenu, xstyle),
          className,
          style,
        )}>
        <div {...stylex.props(styles.sheetHeader)}>
          {submenuPath.length > 0 && (
            <Button
              label={backLabel}
              variant="ghost"
              size="sm"
              icon={
                <Icon icon="chevronLeft" size="sm" xstyle={rtlStyles.mirror} />
              }
              isIconOnly
              onClick={() => setSubmenuPath(path => path.slice(0, -1))}
            />
          )}
          <Heading
            ref={setSheetHeadingRef}
            level={3}
            tabIndex={-1}
            xstyle={[
              styles.sheetViewHeading,
              submenuPath.length === 0 && styles.sheetRootHeading,
            ]}>
            {currentTitle}
          </Heading>
        </div>
        <MenuBottomSheetActionList
          items={currentItems}
          onSelect={handleBottomSheetSelect}
          onOpenSubmenu={item => setSubmenuPath(path => [...path, item])}
        />
      </div>
    ) : (
      renderedMenu
    );

  // An inline trigger (`span`) lets prose own a context menu without
  // breaking its flow.
  const TriggerElement = triggerAs === 'div' ? 'div' : 'span';

  return (
    <>
      <TriggerElement
        ref={useMergedRefs(ref, triggerRef)}
        {...triggerProps}
        onContextMenu={handleTriggerContextMenu}
        onTouchStart={handleTriggerTouchStart}
        onTouchMove={handleTriggerTouchMove}
        onTouchEnd={handleTriggerTouchEnd}
        onTouchCancel={handleTriggerTouchCancel}
        data-testid={testId}
        {...stylex.props(
          styles.trigger,
          ...(triggerXstyle
            ? Array.isArray(triggerXstyle)
              ? triggerXstyle
              : [triggerXstyle]
            : []),
        )}>
        {children}
        <span
          ref={useMergedRefs(cursorAnchorRef, layer.ref)}
          aria-hidden="true"
          {...mergeProps(stylex.props(styles.cursorAnchor), {
            style: {
              left: `${positionRef.current.x}px`,
              top: `${positionRef.current.y}px`,
            },
          })}
        />
      </TriggerElement>

      {usesBottomSheet ? (
        <Suspense fallback={null}>
          <LazyMenuBottomSheet
            isOpen={isOpen}
            onOpenChange={updateOpenState}
            label={sheetLabel}>
            {renderedBottomSheetContent}
          </LazyMenuBottomSheet>
        </Suspense>
      ) : (
        layer.render(<LayerDepthProvider>{renderedMenu}</LayerDepthProvider>, {
          placement: 'below',
          alignment: 'start',
          xstyle: [popoverXstyle, layerAnimations.below],
        })
      )}
    </>
  );
}

ContextMenu.displayName = 'ContextMenu';
