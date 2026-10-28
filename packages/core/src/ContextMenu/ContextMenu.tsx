// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';

/**
 * @file ContextMenu.tsx
 * @input Uses React, StyleX, the headless context menu (createContextMenu.tsx,
 *   which ContextMenu is built on, and contextMenuRows.tsx for its rows),
 *   useLayer, shared layer dismissal, BottomSheet, useListFocus, the
 *   presentation resolver (usePresentation), and the touch layer
 *   (ContextMenuTouchLayer: the press feedback and the lift presentation)
 * @output Exports ContextMenu with cursor-popover, touch-lift and touch-sheet
 *   presentations, and, internally, ContextMenuView: the menu createContextMenu
 *   renders for its element
 * @position Core implementation; consumed by index.ts and createContextMenu.tsx
 *
 * Right-click context menu positioned at the cursor. The cursor point is
 * captured as an offset *inside the trigger* and materialized as a 1px
 * anchor element, so the menu is positioned relative to the trigger's context
 * (via CSS anchor positioning) rather than the viewport. It therefore follows
 * the content on scroll and auto-flips at viewport edges, while still appearing
 * under the cursor.
 * Reuses DropdownMenu item rendering and keyboard navigation.
 *
 * ContextMenu is built on createContextMenu (spec:AST-107 FR8, FR7). It renders
 * its trigger and attaches the factory to it: the factory opens the menu on
 * the trigger's context request (a held finger or pen, a right click,
 * Shift+F10 or the context-menu key, once per gesture), runs the touch model
 * on it, and renders it through ContextMenu's own tree, as a portal into a
 * container beside the trigger, so the caller's contexts reach it and it
 * unmounts with ContextMenu. `items` go to the factory as they are;
 * `menuContent` is portaled into the menu from ContextMenu's tree.
 *
 * Under a finger (a coarse primary pointer: one touch model on every touch
 * device, iOS and Android alike) the trigger behaves like UIKit's
 * UIContextMenuInteraction: the request's hold is UIKit's long press, which
 * opens the menu as it begins (spec:AST-094 FR43), with the press feedback,
 * the page stays put while that menu is up, and the press sends no click. When the
 * menu shows, a block trigger lifts itself as UIKit's preview does
 * (ContextMenuLift.tsx, on the lift module) and the menu sits beside it
 * (`contextMenu.lift`); an inline trigger keeps the menu at the finger. The
 * touch layer, the lift included, is part of ContextMenu, so it runs from the
 * first render under the touch model (a phone pays no extra request for it).
 * A fine primary pointer keeps the right-click menu and the same long press
 * for a finger, with no press feedback or lift, as `presentation="popover"`
 * does.
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
 * - /packages/core/src/ContextMenu/createContextMenu.tsx (the factory it is built on)
 * - /packages/core/src/ContextMenu/contextMenuRows.tsx (its rows in the menu)
 * - /packages/core/src/ContextMenu/contextMenuRequests.ts (the request core)
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
  useImperativeHandle,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';
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
import type {ContextRequestOptions} from '../gestures/contextRequest';
import {PRESSABLE_ATTRIBUTE} from '../utils/pressFeedback';
import {useMenuPress} from '../hooks/useMenuPress';
import {useTypeahead} from '../hooks/useTypeahead';
import {useScrollLock} from '../hooks/useScrollLock';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {readPresentation, usePresentation} from '../utils/presentation';
import {useCompactDefinition} from '../utils/touchPresentation';
import {
  ContextMenuTouchLayer,
  type ContextMenuTouchHandle,
  type LiftedMenuPlacement,
} from './ContextMenuTouchLayer';
import type {
  ContextMenuForwarded,
  ContextMenuRequestOptions,
} from './contextMenuRequests';
import type {ContextMenuLiftResult} from './ContextMenuLift';
import {
  createMenuRowsSlot,
  MenuRows,
  type MenuRowsSlot,
} from './contextMenuRows';
import {
  createContextMenu,
  hostContextMenuInReact,
  updateContextMenu,
  viewContextMenu,
  type ContextMenuController,
  type CreateContextMenuOptions,
} from './createContextMenu';
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
/**
 * The `left` and `top` that put a fixed box's corner at a client point. A
 * fixed box's containing block is the viewport unless an ancestor sets one
 * up (a transform, a filter, `contain: paint`), as a Drawer's dialog does
 * while it is open: the box is placed at two offsets, where it lands is
 * measured, and the point is mapped through that block's offset and scale.
 */
function fixedOffsetOfClientPoint(
  box: HTMLElement,
  point: {x: number; y: number},
): {x: number; y: number} {
  box.style.left = '0px';
  box.style.top = '0px';
  const origin = box.getBoundingClientRect();
  box.style.left = '100px';
  box.style.top = '100px';
  const shifted = box.getBoundingClientRect();
  const scaleX = (shifted.left - origin.left) / 100 || 1;
  const scaleY = (shifted.top - origin.top) / 100 || 1;
  return {
    x: (point.x - origin.left) / scaleX,
    y: (point.y - origin.top) / scaleY,
  };
}

const styles = stylex.create({
  // Trigger wrapper. `position: relative` establishes the containing block
  // for the absolutely positioned cursor anchor below, so the anchor point
  // tracks the trigger (and scrolls with it) instead of the page. The iOS
  // callout and text selection stay off, as they always have, so a long press
  // or a right-click opens our menu instead of selecting the trigger's text
  // (spec:AST-017 FR59); the gesture host adds its own lock for a held press.
  trigger: {
    position: 'relative',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  },
  // Where ContextMenu's menu lives: beside its trigger, in its own tree, so
  // the menu takes what the trigger's place gives it (the theme, the
  // direction, an enclosing dialog, popover or shadow root). It has no box.
  menuSlot: {
    display: 'contents',
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
  // The headless context menu's anchor, at a client point: it lives in the
  // factory's own container, outside the element (createContextMenu.tsx).
  cursorAnchorAttached: {
    position: 'fixed',
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
export function ContextMenu(props: ContextMenuProps) {
  const {
    children,
    triggerAs = 'div',
    triggerXstyle,
    ref,
    label,
    isDisabled,
    onOpenChange,
    presentation,
    size,
    menuWidth,
    className,
    style,
    xstyle,
    'data-testid': testId,
    ...rest
  } = props;
  // The union means exactly one of items/menuContent exists in rest; take
  // both out so the trigger gets DOM attributes only.
  const {items, menuContent, ...triggerProps} = rest as {
    items?: ContextMenuOption[];
    menuContent?: ReactNode;
  } & Omit<typeof rest, 'items' | 'menuContent'>;
  const hasContent = menuContent !== undefined;
  const triggerRef = useRef<HTMLElement>(null);
  const triggerElementRef = useMergedRefs(ref, triggerRef);
  // The 1px cursor anchor lives inside the trigger, so the menu follows the
  // content on scroll (#3465); the menu places it.
  const cursorAnchorRef = useRef<HTMLSpanElement>(null);
  // The menu's container lives here, beside the trigger.
  const [menuSlot, setMenuSlot] = useState<HTMLSpanElement | null>(null);
  // The factory's menu, which renders here, in ContextMenu's own tree, as a
  // portal into its container: the caller's contexts reach it, and it
  // unmounts with ContextMenu.
  const [menu, setMenu] = useState<ReactNode>(null);
  // `menuContent` renders here, in ContextMenu's own tree (so the caller's
  // contexts reach it), into a host the menu's container adopts. The host is
  // a detached element, made once the menu has a place to live.
  const slot = useMemo<MenuRowsSlot | null>(
    () =>
      hasContent && menuSlot != null
        ? createMenuRowsSlot(menuSlot.ownerDocument)
        : null,
    [hasContent, menuSlot],
  );
  const controllerRef = useRef<ContextMenuController | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const handleOpenChange = useCallback((isOpen: boolean) => {
    onOpenChangeRef.current?.(isOpen);
  }, []);
  const factoryOptions = (
    rowsSlot: MenuRowsSlot | null,
  ): CreateContextMenuOptions => {
    const shared = {
      label,
      isDisabled,
      onOpenChange: handleOpenChange,
      presentation,
    };
    return rowsSlot != null
      ? {...shared, render: rowsSlot.render}
      : {...shared, items: items ?? NO_ITEMS};
  };
  const view: ContextMenuViewExtras = {
    size,
    menuWidth,
    className,
    style,
    xstyle,
    cursorAnchor: cursorAnchorRef.current,
    isInline: triggerAs === 'span',
  };
  const latestRef = useRef({factoryOptions, view});

  useIsomorphicLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    latestRef.current = {factoryOptions, view};
    const controller = controllerRef.current;
    if (controller == null) {
      return;
    }
    updateContextMenu(controller, factoryOptions(slot));
    viewContextMenu(controller, {
      ...view,
      cursorAnchor: cursorAnchorRef.current,
      containerParent: menuSlot,
    });
  });

  // ContextMenu is built on the public headless context menu (spec:AST-107
  // FR8, FR7): its trigger is the element createContextMenu attaches to.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (trigger == null || menuSlot == null || (hasContent && slot == null)) {
      return;
    }
    const latest = latestRef.current;
    hostContextMenuInReact(trigger, setMenu);
    const controller = createContextMenu(trigger, latest.factoryOptions(slot));
    viewContextMenu(controller, {
      ...latest.view,
      cursorAnchor: cursorAnchorRef.current,
      containerParent: menuSlot,
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      slot?.host.remove();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [hasContent, menuSlot, slot, triggerAs]);

  // An inline trigger (`span`) lets prose own a context menu without
  // breaking its flow.
  const TriggerElement = triggerAs === 'div' ? 'div' : 'span';
  return (
    <>
      <TriggerElement
        ref={triggerElementRef}
        {...triggerProps}
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
        {/* At the trigger's corner until the menu places it, so it never
            hangs past the trigger's bottom edge (a scroll box would count
            it). The values never change, so a render writes nothing over
            the menu's placement. */}
        <span
          ref={cursorAnchorRef}
          aria-hidden="true"
          {...mergeProps(stylex.props(styles.cursorAnchor), {
            style: CURSOR_ANCHOR_START,
          })}
        />
      </TriggerElement>
      <span ref={setMenuSlot} {...stylex.props(styles.menuSlot)} />
      {menu}
      {slot != null
        ? createPortal(
            <MenuRows slot={slot}>{menuContent}</MenuRows>,
            slot.host,
          )
        : null}
    </>
  );
}

/** The cursor anchor's place before the menu first places it. */
const CURSOR_ANCHOR_START = {left: '0px', top: '0px'} as const;

/** `items` when ContextMenu has none, one array for every render. */
const NO_ITEMS: ContextMenuOption[] = [];

/**
 * @internal What ContextMenu tells its menu beyond the factory's options: the
 * menu's size, width and styles, the cursor anchor inside its trigger, and
 * whether the trigger is inline (createContextMenu.tsx, viewContextMenu).
 */
export interface ContextMenuViewExtras {
  size?: 'sm' | 'md' | 'lg';
  menuWidth?: number | string;
  className?: string;
  style?: React.CSSProperties;
  xstyle?: StyleXStyles | StyleXStyles[];
  cursorAnchor?: HTMLElement | null;
  isInline?: boolean;
  /** Where the menu's container goes: beside ContextMenu's trigger. */
  containerParent?: Element | null;
}

/**
 * A context request the headless context menu forwards to the menu
 * (createContextMenu.tsx, from gestures/contextRequest.ts): what made it,
 * and the client point, none for a key or for `open()` without one.
 * @internal
 */
export interface ContextMenuAttachedRequest {
  readonly kind: 'hold' | 'pointer' | 'keyboard' | 'open';
  readonly point: {readonly x: number; readonly y: number} | null;
}

/** @internal How the headless context menu opens and closes the menu. */
export interface ContextMenuAttachedHandle {
  open(request: ContextMenuAttachedRequest): void;
  close(): void;
}

/**
 * @internal The headless context menu's element, which is the trigger, and
 * the handle createContextMenu's own open() and close() reach the menu
 * through.
 */
export interface ContextMenuAttachment {
  readonly element: HTMLElement;
  readonly handleRef: React.Ref<ContextMenuAttachedHandle | null>;
  /**
   * Lets the menu follow the element's context request's hold (which
   * createContextMenu attaches): the haptic at its commit, under the touch
   * model.
   */
  readonly configureRequests: (
    config: Pick<ContextMenuRequestOptions, 'onHold'>,
  ) => void;
}

/** @internal The menu createContextMenu renders for its element. */
export interface ContextMenuViewProps extends ContextMenuViewExtras {
  attachment: ContextMenuAttachment;
  items?: ContextMenuOption[];
  menuContent?: ReactNode;
  label?: string;
  isDisabled?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  presentation?: AdaptivePresentation;
}

/**
 * @internal ContextMenu's menu, attached to an element: the menu of
 * createContextMenu (spec:AST-107 FR8), which ContextMenu is built on. It
 * attaches the element's context request, runs the touch model on it (press
 * feedback, the haptic, the lift), and opens at the cursor anchor
 * inside the element (ContextMenu's) or at a client point (a plain element).
 */
export function ContextMenuView({
  attachment,
  menuWidth,
  size = 'md',
  label: labelFromProps,
  isDisabled = false,
  onOpenChange,
  presentation,
  className,
  style,
  xstyle,
  cursorAnchor: anchorInElement = null,
  isInline = false,
  items: itemsProp,
  menuContent: menuContentProp,
}: ContextMenuViewProps) {
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
  // The headless context menu's element is the trigger.
  useIsomorphicLayoutEffect(() => {
    if (attachment != null) {
      triggerRef.current = attachment.element;
    }
  }, [attachment]);
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
  // The mounted touch layer, for its press feedback and whether it is timing
  // a finger.
  const touchHandleRef = useRef<ContextMenuTouchHandle | null>(null);
  const setTouchHandle = useCallback(
    (handle: ContextMenuTouchHandle | null) => {
      touchHandleRef.current = handle;
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
      // Focus returns to the element the menu is attached to (spec:AST-107
      // FR8): to what had focus inside it before the open, or to the element
      // itself when focus was elsewhere (a tap on another control, then a
      // hold or open() here). An element that takes no focus (ContextMenu's
      // trigger wrapper has no tab stop) leaves it where it was.
      const before = triggerFocusRef.current;
      triggerFocusRef.current = null;
      const element = triggerRef.current;
      const isBeforeInElement =
        before != null && element != null && element.contains(before);
      if (!isBeforeInElement && element != null && element.isConnected) {
        element.focus({preventScroll: true});
        if (element.ownerDocument.activeElement === element) {
          return;
        }
      }
      if (before != null && before.isConnected) {
        before.focus();
      }
    }, [endTouchOpen, onOpenChange]),
    onShow: useCallback(() => {
      setIsOpen(true);
      onOpenChange?.(true);
    }, [onOpenChange]),
    lightDismiss: false,
  });
  layerAnchorIdRef.current = layer.anchorId;

  // A lifted menu shrinks back into the finger as it closes: the lift takes
  // its exit copy while the menu still shows (set once the menu's list ref
  // exists, below; a no-op when nothing is lifted).
  const dismissLiftedMenuRef = useRef<() => void>(() => {});
  const closeMenu = useCallback(() => {
    if (usesBottomSheet) {
      updateOpenState(false);
    } else {
      dismissLiftedMenuRef.current();
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
  dismissLiftedMenuRef.current = () => {
    const list = listRef.current;
    if (list != null) {
      touchHandleRef.current?.presentation.dismissMenu(list);
    }
  };

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
      if (trigger == null || isInline) {
        return {x: 1, y: 1};
      }
      return {
        x: trigger.offsetWidth > 0 ? rect.width / trigger.offsetWidth : 1,
        y: trigger.offsetHeight > 0 ? rect.height / trigger.offsetHeight : 1,
      };
    },
    [isInline],
  );

  // Shows the menu once its anchor is placed, focusing its first row or, for
  // a finger, the menu itself.
  const showMenu = useCallback(
    (focusEl: HTMLElement | null, focusTarget: 'first' | 'menu') => {
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
    [layer, focusFirst, listRef, updateOpenState, usesBottomSheet],
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
      showMenu(focusEl, focusTarget);
    },
    [showMenu, triggerScale],
  );

  // The headless context menu's open (createContextMenu.tsx): the anchor sits
  // at the client point in the factory's own container.
  const openAtClientPoint = useCallback(
    (point: {x: number; y: number}, focusTarget: 'first' | 'menu') => {
      const anchorEl = cursorAnchorRef.current;
      const local =
        anchorEl != null ? fixedOffsetOfClientPoint(anchorEl, point) : point;
      positionRef.current = local;
      if (anchorEl != null) {
        anchorEl.style.left = `${local.x}px`;
        anchorEl.style.top = `${local.y}px`;
      }
      showMenu(triggerRef.current, focusTarget);
    },
    [showMenu],
  );

  // What reaches the menu: the element's requests and the factory's own
  // open() and close() (set below, with the touch path).
  const onForwardedRef = useRef<(forwarded: ContextMenuForwarded) => void>(
    () => {},
  );
  // createContextMenu's own open(at) and close() take the same path as the
  // element's requests.
  useImperativeHandle(
    attachment.handleRef,
    () => ({
      open: (request: ContextMenuAttachedRequest) => {
        onForwardedRef.current(request);
      },
      close: () => {
        onForwardedRef.current('close');
      },
    }),
    [],
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
  // with the trigger's lift, which anchor positioning follows), and the layer
  // places the menu against it.
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
      // A touch opened it: the menu itself takes the focus, so no row is lit
      // until the finger moves onto one (as openAtLocalPoint's touch path).
      requestAnimationFrame(() => {
        listRef.current?.focus({preventScroll: true});
      });
    },
    [layer, listRef],
  );

  // The lift presentation (ContextMenuLift.tsx, run by the touch layer): when
  // the menu shows under a finger, the trigger's preview lifts above a tinted
  // backdrop and the menu sits beside it.
  // A lift whose menu waits for its side to render, and the finger it grows
  // out of.
  const pendingLiftRef = useRef<{
    lifted: ContextMenuLiftResult;
    press: {x: number; y: number};
    isShown: boolean;
  } | null>(null);
  const [liftPlacement, setLiftPlacement] =
    useState<LiftedMenuPlacement | null>(null);
  // The lifted menu, once its first side (below) has rendered: show it,
  // measure it, and move it above before the frame paints if it does not fit
  // (a state update in a layout effect renders again before paint). It then
  // grows out of the finger, from the side it settled on.
  useIsomorphicLayoutEffect(() => {
    const pending = pendingLiftRef.current;
    if (pending == null || liftPlacement == null) {
      return;
    }
    if (!pending.isShown) {
      pending.isShown = true;
      openLifted(pending.lifted);
      const touch = touchHandleRef.current;
      const menuHeight = listRef.current?.offsetHeight ?? 0;
      if (touch != null) {
        const placement = touch.placeMenu(pending.lifted, menuHeight);
        if (placement.side !== liftPlacement.side) {
          setLiftPlacement(placement);
          return;
        }
      }
    }
    pendingLiftRef.current = null;
    const menu = listRef.current?.closest<HTMLElement>('[popover]');
    if (menu != null) {
      touchHandleRef.current?.presentation.morphMenu(menu, pending.press);
    }
  }, [liftPlacement, openLifted, listRef]);
  // Touch invocation (menus-8). Under the touch model the touch layer
  // (ContextMenuTouchLayer.tsx) runs UIKit's long press and asks for the menu here, at the
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
        !isInline &&
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
          // and the layout effect above shows it, measures it, moves it above
          // before the frame paints if it does not fit, and then grows it out
          // of the finger.
          pendingLiftRef.current = {lifted, press: point, isShown: false};
          setLiftPlacement(touch.placeMenu(lifted, 0));
          return;
        }
      }
      // Otherwise the menu opens under the finger: at the anchor inside the
      // element (openAtLocalPoint cancels the trigger's scale there), or at
      // the client point.
      if (anchorInElement == null) {
        openAtClientPoint(point, 'menu');
        return;
      }
      const local = toTriggerLocal(point);
      openAtLocalPoint(local.x, local.y, triggerRef.current, 'menu');
    },
    [
      anchorInElement,
      compact,
      isInline,
      openAtClientPoint,
      openAtLocalPoint,
      presentation,
      toTriggerLocal,
      usesBottomSheet,
    ],
  );
  // The page stays put while a menu a finger opened is up, as it does under
  // UIKit's context menu. A sheet locks the page itself. (The lifted trigger
  // and the menu's anchor are fixed to the viewport in the top layer, so
  // pinning the page moves neither.)
  useScrollLock(isOpen && isTouchOpen && !usesBottomSheet);

  // The element's context request (a held finger or pen, a right click,
  // Shift+F10 or the context-menu key, once per gesture), through the request
  // core (contextMenuRequests.ts, spec:AST-107 FR8), and the factory's own
  // open() and close() reach the menu here. Under the touch model the hold
  // runs on UIContextMenuInteraction's timeline; otherwise a finger's hold
  // opens the menu at 500 ms, as before (public-component-api INV16).
  onForwardedRef.current = forwarded => {
    if (forwarded === 'close') {
      closeMenu();
      return;
    }
    const {kind, point} = forwarded;
    if (kind === 'hold' && touchModes && point != null) {
      // The press feedback stops where it is, and the menu opens under the
      // finger: UIKit's presentation (the lift) where it applies.
      touchHandleRef.current?.hold();
      openFromFinger(point);
      return;
    }
    // A finger's compatibility mousedown, sent mid-hold or at the lift,
    // belongs to the press that opened the menu (spec:AST-094 FR33).
    openingGestureRef.current = kind === 'hold' ? currentGesture() : null;
    const rect = getAnchorBaseRect();
    if (anchorInElement == null) {
      // A plain element: the factory's own anchor, at the client point, or
      // at the element's bottom-left corner for a key or open() without a
      // point (menus-8). A finger's open lights no row until it moves onto
      // one.
      openAtClientPoint(
        point ?? {x: rect?.left ?? 0, y: rect?.bottom ?? 0},
        kind === 'hold' ? 'menu' : 'first',
      );
      return;
    }
    if (point == null || rect == null) {
      // A key's request, or open() without a point: the trigger's
      // bottom-left corner, so the menu is reachable without a pointer
      // (menus-8).
      openAtLocalPoint(0, rect?.height ?? 0, triggerRef.current);
      return;
    }
    openAtLocalPoint(
      point.x - rect.left,
      point.y - rect.top,
      triggerRef.current,
    );
  };
  // At the commit the click haptic plays, where a vibration motor is the only
  // haptic (iOS Safari can play none: no tap lands at the commit).
  const onHoldRef = useRef<NonNullable<ContextRequestOptions['onHold']>>(
    () => {},
  );
  onHoldRef.current = phase => {
    if (phase === 'committed' && touchModes) {
      touchHandleRef.current?.commit();
    }
  };
  // The element's request is UIKit's long press, which requests as it begins
  // (spec:AST-094 FR43); under the touch model its commit plays the haptic.
  useEffect(() => {
    attachment.configureRequests({
      onHold: phase => onHoldRef.current(phase),
    });
  }, [attachment]);
  // Under the touch model the element is a pressable surface of core's one
  // press machine (utils/pressFeedback.ts): the touch layer installs the
  // machine, and its press feedback follows the pressed state.
  useEffect(() => {
    const element = attachment.element;
    if (
      !touchModes ||
      isDisabled ||
      element.hasAttribute(PRESSABLE_ATTRIBUTE)
    ) {
      return;
    }
    element.setAttribute(PRESSABLE_ATTRIBUTE, '');
    return () => {
      element.removeAttribute(PRESSABLE_ATTRIBUTE);
    };
  }, [attachment, isDisabled, touchModes]);

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

  const cursorAnchorElementRef = useMergedRefs(cursorAnchorRef, layer.ref);
  // ContextMenu's anchor lives inside its trigger (so the menu follows the
  // content on scroll); the layer anchors the menu to it.
  useIsomorphicLayoutEffect(() => {
    if (anchorInElement == null) {
      return;
    }
    cursorAnchorElementRef(anchorInElement);
    return () => {
      cursorAnchorElementRef(null);
    };
  }, [anchorInElement, cursorAnchorElementRef]);

  // A plain element's anchor: the factory's own, at a client point, in the
  // factory's container outside the element.
  const ownCursorAnchor =
    anchorInElement == null ? (
      <span
        ref={cursorAnchorElementRef}
        aria-hidden="true"
        {...mergeProps(
          stylex.props(styles.cursorAnchor, styles.cursorAnchorAttached),
          {
            style: {
              left: `${positionRef.current.x}px`,
              top: `${positionRef.current.y}px`,
            },
          },
        )}
      />
    ) : null;

  const menuSurface = usesBottomSheet ? (
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
  );

  return (
    <>
      {ownCursorAnchor}
      {touchModes && !isDisabled ? (
        <ContextMenuTouchLayer
          triggerRef={triggerRef}
          isShown={!isInline}
          triggerKey={attachment.element}
          onHandleChange={setTouchHandle}
          onBackdropTap={closeMenu}
        />
      ) : null}
      {menuSurface}
    </>
  );
}

ContextMenu.displayName = 'ContextMenu';
