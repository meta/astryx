// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file ContextMenu.tsx
 * @input Uses React, StyleX, useLayer, shared layer dismissal, BottomSheet,
 *   useListFocus, the presentation resolver (usePresentation), useLongPress,
 *   and the touch layer (ContextMenuTouchLayer, loaded on demand: the press
 *   recognizer, the press feedback and the lift presentation)
 * @output Exports ContextMenu with cursor-popover, touch-lift and touch-sheet
 *   presentations
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
 * Under a finger (a coarse primary pointer: one touch model on every touch
 * device, iOS and Android alike) the trigger behaves like UIKit's
 * UIContextMenuInteraction: a finger held still commits the menu at UIKit's
 * moment (`contextMenu.press.commitMs`), with the press feedback, the page
 * stays put while that menu is up, and the press sends no click. When the
 * menu shows, a block trigger lifts itself as UIKit's preview does
 * (ContextMenuLift.tsx, on the lift module) and the menu sits beside it
 * (`contextMenu.lift`); an inline trigger
 * keeps the menu at the finger. That touch layer, the lift included, loads
 * on demand, only under the touch model. A fine primary pointer keeps the right-click
 * menu and today's long press for a finger (500 ms, `useLongPress`), as
 * `presentation="popover"` does; the
 * touch recognizer stays off there.
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
 * - /packages/core/src/ContextMenu/ContextMenuTouch.ts (the touch layer's one import site)
 * - /packages/core/src/ContextMenu/contextMenuPress.ts (touch timeline)
 * - /packages/core/src/ContextMenu/contextMenuPressFeedback.ts (press feedback)
 * - /packages/core/src/ContextMenu/ContextMenuLift.tsx (lift presentation)
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
import {addAnchorName, removeAnchorName} from '../Layer/anchorName';
import {useLayer} from '../Layer/useLayer';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {currentGesture} from '../Layer/gestureCounter';
import {MenuBottomSheetActionList} from '../DropdownMenu/MenuBottomSheetActionList';
import {menuBottomSheetStyles} from '../DropdownMenu/menuBottomSheet.stylex';
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
import {useLongPress} from '../hooks/useLongPress';
import {pressableProps} from '../utils/pressFeedback';
import {useMenuPress} from '../hooks/useMenuPress';
import {useTypeahead} from '../hooks/useTypeahead';
import {useScrollLock} from '../hooks/useScrollLock';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {readPresentation, usePresentation} from '../utils/presentation';
import {useCompactDefinition} from '../utils/touchPresentation';
import {ContextMenuTouchLayer} from './lazyContextMenuTouchLayer';
import type {
  ContextMenuTouchHandle,
  LiftedMenuPlacement,
} from './ContextMenuTouchLayer';
import type {ContextMenuLiftResult} from './ContextMenuLift';
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
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';

const LazyMenuBottomSheet = lazy(async () =>
  import('../DropdownMenu/MenuBottomSheet').then(module => ({
    default: module.MenuBottomSheet,
  })),
);
const styles = stylex.create({
  // Trigger wrapper. `position: relative` establishes the containing block
  // for the absolutely positioned cursor anchor below, so the anchor point
  // tracks the trigger (and scrolls with it) instead of the page. The iOS
  // callout and text selection stay off, as they always have, so a long press
  // or a right-click opens our menu instead of selecting the trigger's text
  // (spec:AST-017 FR59); the gesture host adds its own lock while its
  // recognizer is attached.
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
  // `position-visibility: anchors-visible` then hides the menu. It paints
  // nothing. While the trigger is lifted, the menu is placed against the
  // lift's own box instead (openLifted).
  cursorAnchor: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
    visibility: 'visible',
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
    // A touch open focuses the menu itself, so no row is lit until the finger
    // moves onto one (as DropdownMenu's held finger): an internal focus target,
    // not a control, so no browser ring; keyboard focus moves to an item
    // instead.
    outline: 'none',
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
  // The menu's own inset inside the sheet content box (menuBottomSheetStyles
  // .content): the 16px / 4px the sheet keeps plus the menu's 4px padding.
  sheetMenuInset: {
    paddingBlockStart: `calc(${spacingVars['--spacing-4']} + ${spacingVars['--spacing-1']})`,
    paddingBlockEnd: spacingVars['--spacing-1'],
    paddingInline: `calc(${spacingVars['--spacing-1']} + ${spacingVars['--spacing-1']})`,
    // Bleeding rows read the padding this element applies.
    '--container-padding-block-start': `calc(${spacingVars['--spacing-4']} + ${spacingVars['--spacing-1']})`,
    '--container-padding-block-end': spacingVars['--spacing-1'],
    '--container-padding-inline-start': `calc(${spacingVars['--spacing-1']} + ${spacingVars['--spacing-1']})`,
    '--container-padding-inline-end': `calc(${spacingVars['--spacing-1']} + ${spacingVars['--spacing-1']})`,
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
   * - omitted: the menu at the pointer; under a finger, a held finger opens it
   *   on iOS's timeline (the touch model).
   * - `popover`: the menu at the pointer on every device, as before; a held
   *   finger opens it at 500 ms through today's long press.
   * - `bottom-sheet`: open as an action sheet.
   * - `adaptive`: use a BottomSheet on compact coarse-pointer viewports and
   *   the cursor-positioned popover elsewhere.
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
  presentation,
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
  // The surface, and whether the touch model applies: under a finger unless
  // the caller pins `presentation="popover"` (public-component-api INV16).
  const {surface, touchModes} = usePresentation(presentation, {
    whenOmitted: 'touch',
  });
  // The theme's compact definition, for the one-time read at the open.
  const compact = useCompactDefinition();
  const usesBottomSheet = surface === 'bottom-sheet';
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
  // While a lift is up, the layer's anchor is the lift's box (openLifted),
  // and the layer's anchor name, for the close, which is declared before the
  // layer.
  const liftAnchorRef = useRef<HTMLElement | null>(null);
  const layerAnchorIdRef = useRef('');
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

  // Whether a finger opened the menu that is up (touch invocation, below).
  const [isTouchOpen, setIsTouchOpen] = useState(false);
  // The mounted touch layer (loaded on demand), for its press feedback and
  // whether it is timing a finger.
  const touchHandleRef = useRef<ContextMenuTouchHandle | null>(null);
  // Whether the touch layer has attached. Until it has (its module is still
  // loading), a finger keeps today's 500 ms long press, so a hold that lands
  // first still opens the menu.
  const [isTouchLayerReady, setIsTouchLayerReady] = useState(false);
  const setTouchHandle = useCallback(
    (handle: ContextMenuTouchHandle | null) => {
      touchHandleRef.current = handle;
      setIsTouchLayerReady(handle != null);
    },
    [],
  );
  // The menu closed: a finger's menu is over, and the trigger springs back
  // with the close itself (run by every close handler below).
  const endTouchOpen = useCallback(() => {
    setIsTouchOpen(false);
    touchHandleRef.current?.release();
    // The lifted trigger returns, and the menu leaves its lifted placement:
    // the layer's anchor is the cursor anchor again.
    touchHandleRef.current?.presentation.drop();
    setLiftPlacement(null);
    const liftAnchor = liftAnchorRef.current;
    liftAnchorRef.current = null;
    if (liftAnchor != null) {
      removeAnchorName(liftAnchor, layerAnchorIdRef.current);
      const anchorEl = cursorAnchorRef.current;
      if (anchorEl != null) {
        addAnchorName(anchorEl, layerAnchorIdRef.current);
      }
    }
  }, []);

  const updateOpenState = useCallback(
    (nextIsOpen: boolean) => {
      if (!nextIsOpen) {
        setSubmenuPath([]);
        endTouchOpen();
      }
      setIsOpen(nextIsOpen);
      onOpenChange?.(nextIsOpen);
    },
    [endTouchOpen, onOpenChange],
  );

  const layer = useLayer({
    mode: 'context',
    onHide: useCallback(() => {
      endTouchOpen();
      setIsOpen(false);
      onOpenChange?.(false);
      // Restore focus to the element that was focused before opening.
      const toRestore = triggerFocusRef.current;
      triggerFocusRef.current = null;
      if (toRestore && document.contains(toRestore)) {
        toRestore.focus();
      }
    }, [endTouchOpen, onOpenChange]),
    onShow: useCallback(() => {
      setIsOpen(true);
      onOpenChange?.(true);
    }, [onOpenChange]),
    lightDismiss: false,
  });
  layerAnchorIdRef.current = layer.anchorId;

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
  // How much the press feedback has scaled a block trigger (from its center):
  // its bounding rect is the scaled box, its offset size the unscaled one.
  const triggerScale = useCallback(
    (rect: DOMRect): {x: number; y: number} => {
      const trigger = triggerRef.current;
      if (trigger == null || triggerAs === 'span') {
        return {x: 1, y: 1};
      }
      return {
        x: trigger.offsetWidth > 0 ? rect.width / trigger.offsetWidth : 1,
        y: trigger.offsetHeight > 0 ? rect.height / trigger.offsetHeight : 1,
      };
    },
    [triggerAs],
  );

  const openAtLocalPoint = useCallback(
    (
      localX: number,
      localY: number,
      focusEl: HTMLElement | null,
      // A touch open focuses the menu itself: UIKit lights no row until the
      // finger moves onto one. Pointer and keyboard opens focus the first
      // item (APG menu pattern); arrow keys reach the items from the menu.
      focusTarget: 'first' | 'menu' = 'first',
    ) => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const scale = rect ? triggerScale(rect) : {x: 1, y: 1};
      const x = rect ? keepAnchorInside(localX, rect.width / scale.x) : localX;
      const y = rect ? keepAnchorInside(localY, rect.height / scale.y) : localY;
      positionRef.current = {x, y};
      const anchorEl = cursorAnchorRef.current;
      if (anchorEl) {
        anchorEl.style.left = `${x}px`;
        anchorEl.style.top = `${y}px`;
        // A trigger the press feedback has grown (from its center) would
        // carry the anchor with it, and engines differ on whether anchor
        // positioning follows transforms. Cancel the scale at the anchor, so
        // its box is the same either way: where the point is on screen.
        if (rect != null && (scale.x !== 1 || scale.y !== 1)) {
          const centerX = rect.width / scale.x / 2;
          const centerY = rect.height / scale.y / 2;
          anchorEl.style.transformOrigin = '0 0';
          anchorEl.style.scale = `${1 / scale.x} ${1 / scale.y}`;
          anchorEl.style.translate = `${(x - centerX) * (1 / scale.x - 1)}px ${(y - centerY) * (1 / scale.y - 1)}px`;
        } else {
          anchorEl.style.removeProperty('transform-origin');
          anchorEl.style.removeProperty('scale');
          anchorEl.style.removeProperty('translate');
        }
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
        requestAnimationFrame(() => {
          if (focusTarget === 'menu') {
            listRef.current?.focus({preventScroll: true});
          } else {
            focusFirst();
          }
        });
      }
    },
    [
      layer,
      focusFirst,
      listRef,
      updateOpenState,
      usesBottomSheet,
      triggerScale,
    ],
  );

  // The box the cursor anchor's offsets are measured from: the trigger, which
  // is its containing block.
  const getAnchorBaseRect = useCallback(
    (): DOMRect | undefined => triggerRef.current?.getBoundingClientRect(),
    [],
  );

  // A client point in the trigger's own coordinates, where the cursor anchor
  // lives: its offset from the trigger's box as laid out, before the press
  // feedback's scale (from its center), kept inside that box.
  const toTriggerLocal = useCallback(
    (point: {x: number; y: number}): {x: number; y: number} => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect == null) {
        return point;
      }
      const scale = triggerScale(rect);
      const width = rect.width / scale.x;
      const height = rect.height / scale.y;
      const left = rect.left + (rect.width - width) / 2;
      const top = rect.top + (rect.height - height) / 2;
      return {
        x: Math.min(Math.max(point.x - left, 0), width),
        y: Math.min(Math.max(point.y - top, 0), height),
      };
    },
    [triggerScale],
  );

  // Opens the menu beside the lifted trigger: the layer's anchor moves to the
  // lift's box at the lifted rect (an anchor inside the trigger would move
  // with the trigger's lift, which anchor positioning follows), the layer
  // places the menu against it, and the menu fades in.
  const openLifted = useCallback(
    ({anchor}: ContextMenuLiftResult) => {
      const anchorEl = cursorAnchorRef.current;
      if (anchorEl != null) {
        removeAnchorName(anchorEl, layer.anchorId);
      }
      addAnchorName(anchor, layer.anchorId);
      liftAnchorRef.current = anchor;
      triggerFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : triggerRef.current;
      layer.show();
      const menu = listRef.current?.closest<HTMLElement>('[popover]');
      if (menu != null) {
        touchHandleRef.current?.presentation.enterMenu(menu);
      }
      // A touch opened it: the menu itself takes the focus, so no row is lit
      // until the finger moves onto one (as openAtLocalPoint's touch path).
      requestAnimationFrame(() => {
        listRef.current?.focus({preventScroll: true});
      });
    },
    [layer, listRef],
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

  // The lift presentation (ContextMenuLift.tsx, run by the touch layer): when
  // the menu shows under a finger, the trigger's preview lifts above a tinted
  // backdrop and the menu sits beside it.
  // A lift whose menu waits for its first side to render.
  const pendingLiftRef = useRef<ContextMenuLiftResult | null>(null);
  const [liftPlacement, setLiftPlacement] =
    useState<LiftedMenuPlacement | null>(null);
  // The lifted menu, once its first side (below) has rendered: show it,
  // measure it, and move it above before the frame paints if it does not fit
  // (a state update in a layout effect renders again before paint).
  useIsomorphicLayoutEffect(() => {
    const lifted = pendingLiftRef.current;
    if (lifted == null || liftPlacement == null) {
      return;
    }
    pendingLiftRef.current = null;
    openLifted(lifted);
    const touch = touchHandleRef.current;
    const menuHeight = listRef.current?.offsetHeight ?? 0;
    if (touch == null) {
      return;
    }
    const placement = touch.placeMenu(lifted, menuHeight);
    if (placement.side !== liftPlacement.side) {
      setLiftPlacement(placement);
    }
  }, [liftPlacement, openLifted, listRef]);
  // Touch invocation (menus-8). Under the touch model the touch layer
  // (ContextMenuTouchLayer.tsx, loaded on demand so a fine-pointer page never
  // downloads it) runs UIKit's long press and asks for the menu here, at the
  // client point where the finger landed.
  const openFromFinger = useCallback(
    (point: {x: number; y: number}) => {
      // Read once, at the open: the render value can be a frame behind a
      // pointer change (a trackpad docking).
      const opensUnderFinger = readPresentation(presentation, {
        whenOmitted: 'touch',
        compact,
      }).touchModes;
      setIsTouchOpen(opensUnderFinger);
      // UIKit's presentation under a finger (spec:AST-094 FR33): the preview
      // lifts and the menu sits beside it. An inline trigger, a fine pointer,
      // `presentation="popover"` and the sheet keep the menu where it opens.
      const touch = touchHandleRef.current;
      const trigger = triggerRef.current;
      if (
        touch != null &&
        trigger != null &&
        !usesBottomSheet &&
        triggerAs !== 'span' &&
        opensUnderFinger
      ) {
        // The lift grows on from where the press feedback left the trigger,
        // which hands the trigger's scale over to the lift. The feedback
        // lets go once the lift has read the page, before it writes, so the
        // page restyles once for both.
        const pressed = trigger.getBoundingClientRect();
        const lifted = touch.presentation.lift(
          {
            x: pressed.left,
            y: pressed.top,
            width: pressed.width,
            height: pressed.height,
          },
          touch.end,
        );
        // A lift that did not happen lets go too (end is idempotent).
        touch.end();
        if (lifted != null) {
          // The menu's side depends on its height: it renders below first,
          // and the layout effect above shows it, measures it, and moves it
          // above before the frame paints if it does not fit.
          pendingLiftRef.current = lifted;
          setLiftPlacement(touch.placeMenu(lifted, 0));
          return;
        }
      }
      // Otherwise the menu opens under the finger (openAtLocalPoint cancels
      // the trigger's scale at the anchor).
      const local = toTriggerLocal(point);
      openAtLocalPoint(local.x, local.y, triggerRef.current, 'menu');
    },
    [
      compact,
      openAtLocalPoint,
      presentation,
      toTriggerLocal,
      triggerAs,
      usesBottomSheet,
    ],
  );
  // The page stays put while a menu a finger opened is up, as it does under
  // UIKit's context menu. A sheet locks the page itself. (The lifted trigger
  // and the menu's anchor are fixed to the viewport in the top layer, so
  // pinning the page moves neither.)
  useScrollLock(isOpen && isTouchOpen && !usesBottomSheet);

  // Today's long press for a finger outside the touch model: under a fine
  // primary pointer, or with `presentation="popover"` (the way back,
  // public-component-api INV16). iOS Safari never synthesizes a `contextmenu`
  // event on a long press, so the menu opens at the touch point once the
  // finger has been held for 500 ms (useLongPress: the timer, the move cancel
  // and the cleanup). Under the touch model the recognizer above owns the
  // finger instead.
  const {
    onTouchStart: handleLongPressTouchStart,
    onTouchMove: handleLongPressTouchMove,
    onTouchEnd: handleLongPressTouchEnd,
    onTouchCancel: handleLongPressTouchCancel,
  } = useLongPress({
    disabled: isDisabled || (touchModes && isTouchLayerReady),
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

  // ContextMenu owns invocation. Consumer handlers are notified too, but
  // preventing their default does not cancel component-owned behavior that
  // the public API does not promise as cancelable.
  const handleTriggerContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (touchHandleRef.current?.isTracking() === true) {
        // The browser's own long-press menu (Android Chrome) for a finger the
        // recognizer is timing: the recognizer decides, not this event.
        event.preventDefault();
      } else {
        handleContextMenu(event);
      }
      onContextMenuProp?.(event);
    },
    [handleContextMenu, onContextMenuProp],
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
          usesBottomSheet
            ? [
                styles.sheetMenu,
                menuBottomSheetStyles.content,
                styles.sheetMenuInset,
              ]
            : styles.menu,
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

  // The root view's heading stands alone; a sub-menu's sits in a row with its
  // back button.
  const sheetViewHeading = (
    <Heading
      ref={setSheetHeadingRef}
      level={3}
      tabIndex={-1}
      xstyle={[
        styles.sheetViewHeading,
        submenuPath.length === 0 && [
          styles.sheetRootHeading,
          menuBottomSheetStyles.headingAlone,
        ],
      ]}>
      {currentTitle}
    </Heading>
  );

  const renderedBottomSheetContent =
    itemsProp !== undefined ? (
      <div
        ref={listRef}
        data-autofocus=""
        tabIndex={0}
        {...mergeProps(
          themeProps('context-menu'),
          stylex.props(
            styles.sheetMenu,
            menuBottomSheetStyles.content,
            styles.sheetMenuInset,
            xstyle,
          ),
          className,
          style,
        )}>
        {submenuPath.length > 0 ? (
          <div {...stylex.props(styles.sheetHeader)}>
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
            {sheetViewHeading}
          </div>
        ) : (
          sheetViewHeading
        )}
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
        // Under the touch model the trigger is a pressable surface of core's
        // one press machine (utils/pressFeedback.ts); the touch layer installs
        // the machine and its press feedback follows the pressed state.
        {...(touchModes ? pressableProps : null)}
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
      {touchModes && !isDisabled ? (
        <Suspense fallback={null}>
          <ContextMenuTouchLayer
            triggerRef={triggerRef}
            isShown={triggerAs !== 'span'}
            triggerKey={triggerAs}
            onHandleChange={setTouchHandle}
            onOpen={openFromFinger}
            onBackdropTap={closeMenu}
          />
        </Suspense>
      ) : null}

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
        layer.render(
          <LayerDepthProvider>{renderedMenu}</LayerDepthProvider>,
          liftPlacement != null
            ? {
                placement: liftPlacement.side,
                alignment: liftPlacement.alignment,
                offset: liftPlacement.gap,
                xstyle: [popoverXstyle],
              }
            : {
                placement: 'below',
                alignment: 'start',
                xstyle: [popoverXstyle, layerAnimations.below],
              },
        )
      )}
    </>
  );
}

ContextMenu.displayName = 'ContextMenu';
