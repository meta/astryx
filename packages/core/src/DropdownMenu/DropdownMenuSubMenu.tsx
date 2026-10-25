// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuSubMenu.tsx
 * @input React, stylex, useLayer (context mode), useListFocus, useMenuHover,
 *   useTypeahead, the shared viewport-safe menu-width resolver, Item, Icon,
 *   Spinner, and DropdownMenu context + item roles
 * @output Exports DropdownMenuSubMenu — a single menu row that reveals a nested
 *   menu of its own children/items: a flyout beside the row, or, on a phone,
 *   a drilled-in view in place of the parent rows. With a header or footer,
 *   that surface is a modal dialog rendered into the root's surface host,
 *   beside every menu element.
 * @position Sub-component; place inside a DropdownMenu (or ContextMenu)
 *   alongside plain items.
 *
 * One component, not three. The row itself adopts DropdownMenuItem semantics
 * (label / icon / description / isDisabled, host attributes, DOM handlers and
 * a ref on the row) and its children become the flyout's content. This
 * mirrors how SideNavItem / TreeListItem promote a
 * normal row into a nested surface when given children, rather than the Radix
 * Sub / SubTrigger / SubContent split. Data-driven menus never touch this
 * component directly — renderDropdownItems renders it from a nested `items`
 * array and passes the rendered children in.
 *
 * Built on existing primitives — no bespoke floating code:
 * - Positioning: useLayer context mode opens the flyout inline-end with
 *   viewport auto-flip via CSS anchor positioning (RTL-correct by default).
 * - Pointer: useMenuHover for open/close intent.
 * - Keyboard: a per-level useListFocus + useTypeahead. Right (Left in RTL) /
 *   Enter / Space opens the flyout and focuses its first item; Left (Right in
 *   RTL) / Escape closes it and returns focus to the trigger row.
 *
 * Drill-in (the phone presentation): the root menu keeps a view stack
 * (useMenuDrillIn) and this row pushes its view onto it; the root shows the
 * view — a Back row named "Back to <parent>", then these rows — in place of
 * its own, portalled into the root's host so the row stays mounted and its
 * rows stay live. Back, Escape and ArrowLeft pop the view and return focus to
 * the row. The list keeps this level's own roving focus, typeahead and press
 * model, so nothing beside the row needs to know.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DropdownMenu/DropdownMenuSubMenu.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenuSubMenu.test.tsx
 * - /packages/core/src/DropdownMenu/index.ts
 * - /apps/storybook/stories/DropdownMenu.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/DropdownMenu/ (showcase blocks)
 */

import React, {
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {Icon, renderIconSlot, type IconType} from '../Icon';
import {Spinner} from '../Spinner';
import {MenuRegionsContext} from './menuRegionsContext';
import {moveRegionsTab} from './menuRegionStops';
import {Item} from '../Item';
import {useLayer} from '../Layer/useLayer';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {useListFocus} from '../hooks/useListFocus';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {useMenuHover} from '../hooks/useMenuHover';
import {
  isMenuPressActivation,
  MENU_PRESS_SURFACE_ATTR,
  useMenuPress,
} from '../hooks/useMenuPress';
import {useTypeahead} from '../hooks/useTypeahead';
import {useMenuOverflow} from './useMenuOverflow';
import {resolveMenuWidth} from './menuWidth';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  shadowVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {
  composeEventHandlers,
  isImeKeyEvent,
  isRenderable,
  mergeProps,
  rtlStyles,
} from '../utils';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {getInteractionModality} from '../utils/interactionModality';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useDevWarning} from '../hooks/useDevWarning';
import {themeProps} from '../utils/themeProps';
import type {BaseProps} from '../BaseProps';
import {
  MENU_ITEM_ROLES,
  MENU_ITEM_SELECTOR,
  MENU_BOUNDARY_SELECTOR,
  activateMenuItem,
} from './menuItemRoles';
import {
  DropdownMenuContext,
  DropdownMenuRootOpenContext,
  DropdownMenuSurfaceContext,
  useDropdownMenuContext,
  useDropdownMenuRootOpen,
  type DropdownMenuContextValue,
} from './DropdownMenuContext';
import {focusMenuItemOnHover} from './menuItemHover';
import {DropdownMenuItem} from './DropdownMenuItem';
import {useTranslator} from '../i18n';

// The flyout's own lower cap on the placement axis; the viewport cap under
// it and the inline gutter beside it are the layer runtime's (spec:AST-059).
const MENU_BLOCK_CAP = '300px';
const MENU_MAX_BLOCK_SIZE = `min(${MENU_BLOCK_CAP}, ${layerViewportInset.maxBlockSize})`;
const MENU_MAX_BLOCK_SIZE_FALLBACK = `min(${MENU_BLOCK_CAP}, ${layerViewportInset.maxBlockSizeFallback})`;

const triggerStyles = stylex.create({
  root: {
    boxSizing: 'border-box',
    width: '100%',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: `max(0px, calc(var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    color: colorVars['--color-text-primary'],
    backgroundColor: {
      default: 'transparent',
      ':focus': colorVars['--color-overlay-hover'],
    },
    borderWidth: 0,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
    outline: 'none',
  },
  // While the flyout is open, keep the trigger visibly active so the open
  // branch reads as the current path even when focus has moved into the child.
  open: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  disabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  caret: {
    display: 'flex',
    alignItems: 'center',
  },
});

const triggerSizeStyles = stylex.create({
  sm: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-1-5'],
  },
  lg: {},
});

const flyoutStyles = stylex.create({
  menu: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    maxInlineSize: stylex.firstThatWorks(
      `calc(${layerViewportInset.maxInlineSize})`,
      `calc(${layerViewportInset.maxInlineSizeFallback})`,
    ),
    maxHeight: stylex.firstThatWorks(
      MENU_MAX_BLOCK_SIZE,
      MENU_MAX_BLOCK_SIZE_FALLBACK,
    ),
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
    // A held finger drives the highlight; the browser's held-press callout
    // and text selection must not compete with it.
    WebkitTouchCallout: 'none',
    userSelect: 'none',
  },
  scrollable: {
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
  },
  // Scroll ownership by the browser's own signal; see DropdownMenu.
  touchPinchZoom: {
    touchAction: 'pinch-zoom',
  },
  touchPanYPinchZoom: {
    touchAction: 'pan-y pinch-zoom',
    overscrollBehavior: 'contain',
  },
  popoverViewport: {
    boxSizing: 'border-box',
    // Keep the inline viewport cap on the menu surface above. Applying it to
    // the anchor-positioned popover itself prevents Chromium from selecting
    // `flip-inline` and instead shifts the flyout back across its parent.
    maxBlockSize: stylex.firstThatWorks(
      MENU_MAX_BLOCK_SIZE,
      MENU_MAX_BLOCK_SIZE_FALLBACK,
    ),
  },
  popover: {
    minWidth: stylex.firstThatWorks(
      `min(160px, ${layerViewportInset.maxInlineSize})`,
      `min(160px, ${layerViewportInset.maxInlineSizeFallback})`,
      '160px',
    ),
  },
  popoverCustomWidth: (width: string) => ({
    minWidth: width,
  }),
  popoverCustomIntrinsicWidth: (width: string) => ({
    inlineSize: width,
  }),
});

// The drilled-in list shows in place of the parent rows, inside the parent's
// own box: no surface, shadow or cap of its own.
const drillInStyles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    outline: 'none',
    WebkitTouchCallout: 'none',
    userSelect: 'none',
  },
  hidden: {
    display: 'none',
  },
});

// With a header or footer the sub-menu's surface is a frame holding the
// header, the sub-menu's own role="menu" element and the footer, in one column
// under the flyout's block cap: the regions keep their height and the rows
// shrink and scroll between them.
// A drilled-in view with a header or footer takes the root menu's place, so
// it caps where the root does when the root's `menuMaxHeight` lifts the 300px
// cap; the viewport still bounds it.
const dynamicRegionStyles = stylex.create({
  viewMaxHeight: (maxHeight: string) => ({
    maxHeight: `min(${maxHeight}, ${layerViewportInset.maxBlockSize})`,
  }),
});

const regionStyles = stylex.create({
  frame: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: stylex.firstThatWorks(
      MENU_MAX_BLOCK_SIZE,
      MENU_MAX_BLOCK_SIZE_FALLBACK,
    ),
    '--_dropdown-menu-radius': radiusVars['--radius-container'],
    '--_dropdown-menu-padding': spacingVars['--spacing-1'],
    borderRadius: 'var(--_dropdown-menu-radius)',
  },
  // The flyout paints its own surface; a drilled-in view sits inside the
  // root's.
  flyoutSurface: {
    // Each constant inside calc(), as for the plain flyout: a bare pair would
    // ship as var(--<hash>, <fallback>) with the hash defined nowhere.
    maxInlineSize: stylex.firstThatWorks(
      `calc(${layerViewportInset.maxInlineSize})`,
      `calc(${layerViewportInset.maxInlineSizeFallback})`,
    ),
    backgroundColor: colorVars['--color-background-popover'],
    boxShadow: shadowVars['--shadow-low'],
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  menu: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    flexGrow: 1,
    flexShrink: 1,
    minBlockSize: 0,
    padding: spacingVars['--spacing-1'],
    outline: 'none',
    WebkitTouchCallout: 'none',
    userSelect: 'none',
  },
  region: {
    flexShrink: 0,
    padding: spacingVars['--spacing-1'],
  },
  hidden: {
    display: 'none',
  },
});

export type DropdownMenuSubMenuPresentation =
  'flyout' | 'drill-in' | 'adaptive';

interface DropdownMenuSubMenuBaseProps extends Omit<
  BaseProps,
  'role' | 'tabIndex'
> {
  /** Icon to display before the label on the trigger row. */
  icon?: ReactNode | IconType;
  /** Primary label text for the trigger row. */
  label: ReactNode;
  /** Secondary description text displayed below the label. */
  description?: ReactNode;
  /**
   * Whether the submenu is disabled. A disabled submenu renders its trigger
   * row but never opens the flyout.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Show a spinner in place of the caret, e.g. while a lazy submenu's children
   * are loading.
   * @default false
   */
  hasSpinner?: boolean;
  /**
   * Minimum flyout width. The flyout may grow for its content but is capped to
   * the available viewport space. Defaults to intrinsic sizing (min 160px).
   */
  menuWidth?: number | string;
  /** Called when the flyout opens or closes. */
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * How the sub-menu shows its rows. `flyout` opens them beside the row;
   * `drill-in` replaces the menu's rows with them and a Back row, in the same
   * box; `adaptive` drills in when a finger opened the menu — a
   * `(pointer: coarse)` device, decided when the menu opened — and flies out
   * otherwise. Drill-in needs a `DropdownMenu` or `ContextMenu` root.
   * @default 'adaptive'
   */
  presentation?: DropdownMenuSubMenuPresentation;
  /**
   * Content above the sub-menu's rows: a field that filters them, say. Like
   * the root menu's `header`, it sits beside the sub-menu's `role="menu"`
   * element, never inside it, and keeps its own keys and presses. With a
   * header or footer the sub-menu's surface (the flyout, or the drilled-in
   * view on a phone) is a modal dialog named by the row: the row says
   * `aria-haspopup="dialog"`, Tab and Shift+Tab walk the header's controls,
   * the rows as one stop and the footer's controls and wrap, and Escape
   * returns to the row. A pointer leaving the flyout does not close it while
   * focus is inside. A `ContextMenu` does not show it.
   */
  header?: ReactNode;
  /**
   * Content below the sub-menu's rows: a door to where the options are
   * managed, say. Same rules as `header`.
   */
  footer?: ReactNode;
  /** Test id for the trigger row. */
  'data-testid'?: string;
  /**
   * Test id for the sub-menu's own `role="menu"` element: the flyout, or the
   * drilled-in list on a phone.
   */
  menuDataTestId?: string;
  /**
   * Ref forwarded to the trigger row — the element carrying `role="menuitem"`
   * and `aria-haspopup="menu"` (`"dialog"` with a header or footer).
   */
  ref?: React.Ref<HTMLElement>;
}

export interface DropdownMenuSubMenuProps extends DropdownMenuSubMenuBaseProps {
  /**
   * The flyout's menu items — the same components used at the top level
   * (`DropdownMenuItem`, `DropdownMenuSubMenu`, selectable items, etc.).
   *
   * Data-mode parity lives one level up: give a `DropdownMenu`/`ContextMenu`
   * item a nested `items` array and it renders a `DropdownMenuSubMenu` with
   * these children automatically — so the data path never has to reach into
   * this component.
   */
  children: ReactNode;
}

/**
 * Close every open flyout with a header or footer whose row sits in `menu`.
 * Such a flyout renders beside the root's menu, not inside the flyout that
 * holds its row, so hiding that flyout does not hide it. Each closes through
 * the popover API, as DropdownMenu closes its flyouts when it hides, so its
 * layer's toggle handling resets its state and reports the close; its own
 * nested flyouts close the same way, innermost first.
 */
function hideRegionedFlyoutsIn(menu: HTMLElement | null): void {
  if (menu == null) {
    return;
  }
  const doc = menu.ownerDocument;
  const rows = menu.querySelectorAll<HTMLElement>(
    '[aria-expanded="true"][aria-controls]',
  );
  for (const row of [...rows].reverse()) {
    const frame = doc.getElementById(row.getAttribute('aria-controls') ?? '');
    if (frame?.getAttribute('data-astryx-submenu-regions') !== 'flyout') {
      continue;
    }
    const flyout = frame.closest<HTMLElement>('[popover]');
    if (flyout == null) {
      continue;
    }
    if (typeof flyout.hidePopover === 'function') {
      if (flyout.matches(':popover-open')) {
        flyout.hidePopover();
      }
    } else if (flyout.style.display === 'block') {
      // Without the popover API the layer toggles `display`; mirror it and
      // tell its reconciler, as DropdownMenu's own sweep does.
      flyout.style.display = 'none';
      const toggle = new Event('toggle', {bubbles: false});
      Object.defineProperty(toggle, 'newState', {
        value: 'closed',
        configurable: true,
      });
      flyout.dispatchEvent(toggle);
    }
  }
}

/**
 * A single menu row that reveals a nested flyout of its own items. The row
 * adopts DropdownMenuItem semantics (label / icon / description / isDisabled);
 * its `children` become the flyout content. Place inside a DropdownMenu (or
 * ContextMenu) alongside plain items.
 *
 * For data-driven menus, don't use this directly — give a menu item a nested
 * `items` array and DropdownMenu/ContextMenu renders the submenu for you.
 *
 * @example
 * ```
 * <DropdownMenu button={{label: 'Actions'}}>
 *   <DropdownMenuItem label="Rename" onClick={rename} />
 *   <DropdownMenuSubMenu label="Move to" icon="folder">
 *     <DropdownMenuItem label="Folder A" onClick={() => move('a')} />
 *     <DropdownMenuItem label="Folder B" onClick={() => move('b')} />
 *   </DropdownMenuSubMenu>
 * </DropdownMenu>
 * ```
 */
export function DropdownMenuSubMenu(
  props: DropdownMenuSubMenuProps,
): ReactNode {
  const {
    icon,
    label,
    description,
    isDisabled = false,
    hasSpinner = false,
    menuWidth,
    onOpenChange,
    presentation = 'adaptive',
    header,
    footer,
    children,
    xstyle,
    className,
    style,
    'data-testid': testId,
    menuDataTestId,
    ref,
    id: idProp,
    onMouseEnter,
    onMouseLeave,
    onPointerMove,
    onClick,
    onKeyDown,
    // Host attributes and DOM handlers for the trigger row.
    ...rest
  } = props;

  const t = useTranslator();
  const menuCtx = useDropdownMenuContext();
  const rootSurface = use(DropdownMenuSurfaceContext);
  const rootHasRegions = use(MenuRegionsContext);
  const menuSize = menuCtx?.menuSize ?? 'md';
  const canOpen = !isDisabled;
  // With a header or footer the sub-menu's surface holds controls that are not
  // menu items, so it is a modal dialog around the sub-menu's menu, rendered
  // into the root's surface host: outside every menu element. A root that
  // renders no host (no surface context, as in ContextMenu) has nowhere
  // outside its menu to put them, so the sub-menu shows its rows alone there.
  const wantsRegions = isRenderable(header) || isRenderable(footer);
  const rootHostsSurfaces = rootSurface != null;
  const hasRegions = wantsRegions && rootHostsSurfaces;
  const surfaceHost = rootSurface?.host.getElement() ?? null;
  useDevWarning(
    'DropdownMenuSubMenu',
    'header and footer show only inside a DropdownMenu; this menu has no place outside its rows for them, so they are not rendered.',
    wantsRegions && !rootHostsSurfaces,
  );
  const frameId = useId();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [isMenuKeyboardFocused, setIsMenuKeyboardFocused] = useState(false);

  const contentId = useId();
  const generatedTriggerId = useId();
  // A caller's `id` names the row; the flyout stays labelled by it.
  const triggerId = idProp ?? generatedTriggerId;
  const triggerRef = useRef<HTMLDivElement | null>(null);

  // Drill-in: the root keeps a view stack; this row pushes its
  // view and the root shows it in place of its rows. Decided from the root's
  // pointer kind at open time, or forced by `presentation`.
  const drillIn = menuCtx?.drillIn;
  const activeDrillIn =
    drillIn != null &&
    (presentation === 'drill-in' ||
      (presentation === 'adaptive' && drillIn.isCompactTouch))
      ? drillIn
      : null;
  const isDrillIn = activeDrillIn != null;
  const viewId = useId();
  const isOnStack = activeDrillIn?.viewStack.includes(viewId) === true;
  const isTopView = isOnStack && activeDrillIn?.viewStack.at(-1) === viewId;
  const stringLabel = typeof label === 'string' ? label : undefined;
  const parentLabel = menuCtx?.menuLabel;
  const backLabel =
    parentLabel != null
      ? t('@astryx.dropdownMenu.backTo', {parent: parentLabel})
      : t('@astryx.dropdownMenu.back');

  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const isOpen = isDrillIn ? isOnStack : isFlyoutOpen;

  // Whether focus is anywhere in this flyout's frame, a level nested in it
  // included: React brings a nested level's focus events back here through
  // its portal, where the DOM would not.
  const isFocusInFrameRef = useRef(false);
  // A pointer that left while focus was inside: the flyout closes once focus
  // leaves too.
  const closeWhenFocusLeavesRef = useRef(false);
  const layer = useLayer({
    mode: 'context',
    lightDismiss: false,
    onShow: useCallback(() => {
      closeWhenFocusLeavesRef.current = false;
      setIsFlyoutOpen(true);
      onOpenChange?.(true);
    }, [onOpenChange]),
    onHide: useCallback(() => {
      closeWhenFocusLeavesRef.current = false;
      // Whatever closed this flyout, a flyout with a header or footer opened
      // from one of its rows closes with it: that flyout renders beside the
      // root's menu, not inside this one, so hiding this one leaves it shown.
      hideRegionedFlyoutsIn(
        triggerRef.current?.ownerDocument.getElementById(contentId) ?? null,
      );
      setIsFlyoutOpen(false);
      onOpenChange?.(false);
    }, [onOpenChange, contentId]),
  });

  const showLayer = useCallback(() => {
    if (canOpen) {
      layer.show();
    }
  }, [canOpen, layer]);
  const hideLayer = useCallback(() => {
    // A pointer leaving a flyout with a header or footer does not close it
    // while focus is inside: what was typed into its field stays.
    if (hasRegions && isFocusInFrameRef.current) {
      closeWhenFocusLeavesRef.current = true;
      return;
    }
    layer.hide();
  }, [layer, hasRegions]);
  const handleFrameFocus = useCallback(() => {
    isFocusInFrameRef.current = true;
  }, []);
  const handleFrameBlur = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      isFocusInFrameRef.current = false;
      if (!closeWhenFocusLeavesRef.current) {
        return;
      }
      // Focus moving to another control in the frame keeps it open.
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) {
        return;
      }
      // Focus moving into a level nested in this one (React brings that
      // focus event back through its portal), or moved by the browser itself
      // (an arrow key in a native radio group, whose focus event follows a
      // microtask checkpoint), arrives after this blur: decide in a task of
      // its own, once the move has completed.
      setTimeout(() => {
        if (
          !isFocusInFrameRef.current &&
          closeWhenFocusLeavesRef.current &&
          triggerRef.current?.isConnected === true
        ) {
          closeWhenFocusLeavesRef.current = false;
          layer.hide();
        }
      }, 0);
    },
    [layer],
  );
  const handleFramePointerEnter = useCallback(() => {
    closeWhenFocusLeavesRef.current = false;
  }, []);

  // Dedicated roving-focus + typeahead for this flyout level. The boundary
  // selector scopes item collection and key handling to this flyout's own
  // `role="menu"` — so a submenu nested inside this one (also inline, also
  // `role="menu"`) doesn't pollute this level's items or double-handle keys.
  const {
    listRef: menuRef,
    handleKeyDown: listNavKeyDown,
    focusFirst,
    focusItem,
    ownsEvent,
    getItems,
  } = useListFocus<HTMLDivElement>({
    itemSelector: MENU_ITEM_SELECTOR,
    boundarySelector: MENU_BOUNDARY_SELECTOR,
    // Menus wrap.
    wrap: true,
    hasPaging: true,
    onEscape: () => close({focusTrigger: true}),
  });
  // A drilled-in list scrolls with the root menu, not on its own, unless it
  // has a header or footer: then its rows scroll between them.
  const hasOverflow = useMenuOverflow(
    menuRef,
    children,
    isOpen && (!isDrillIn || hasRegions),
  );

  const typeahead = useTypeahead({
    getItemLabels: () => getItems().map(el => el.textContent),
    onMatch: focusItem,
    getCurrentIndex: () =>
      getItems().findIndex(
        el =>
          el === document.activeElement || el.contains(document.activeElement),
      ),
  });

  // Hover-intent: entering the trigger opens after a short delay; leaving
  // either surface closes after a delay. Hover-open does not steal focus.
  // Hover intent and the shared hover→click guard only: this level owns its own
  // click handling, roving focus and typeahead. popover="manual", so the
  // invoker wiring other consumers need does not apply. A drill-in row has no
  // hover: a finger drives it, and a press opens it. Hover is also gated on
  // the root menu being open, so a hover-open scheduled before the menu
  // closed from elsewhere is cancelled instead of firing into the hidden
  // menu (#6893).
  const isRootMenuOpen = useDropdownMenuRootOpen();
  // The loading Spinner on the trigger is decorative; the submenu announces
  // its busy start instead (spec:AST-086 FR8), once its level is shown: a
  // closed menu stays mounted but hidden, and announces nothing.
  useBusyAnnouncement(
    hasSpinner && isRootMenuOpen,
    t('@astryx.spinner.loading'),
    triggerRef,
  );
  const {triggerProps, contentProps, confirmHoverOpen} =
    useMenuHover<HTMLDivElement>({
      show: showLayer,
      hide: hideLayer,
      isOpen: isFlyoutOpen,
      isEnabled: canOpen && !isDrillIn && isRootMenuOpen,
      // The safe triangle toward the flyout's near edge is built from the
      // flyout this component renders, not the hook's own list ref: the
      // frame, with a header or footer.
      flyoutRef: hasRegions ? frameRef : menuRef,
    });
  // Where focus lands once a pushed view shows: the first row after Back for
  // a keyboard open, the list itself for a pointer open; and the row itself
  // once its view is popped.
  const pendingViewFocusRef = useRef<'first' | 'container' | null>(null);
  const pendingTriggerFocusRef = useRef(false);

  const open = useCallback(
    (options?: {focusFirst?: boolean}) => {
      if (!canOpen) {
        return;
      }
      if (activeDrillIn != null) {
        pendingViewFocusRef.current = options?.focusFirst
          ? 'first'
          : 'container';
        activeDrillIn.push(viewId);
        onOpenChange?.(true);
        return;
      }
      layer.show();
      if (options?.focusFirst) {
        // Synchronous by design — see the focus note in useMenuHover. A
        // still-loading flyout has no focusable item, so fall back to the
        // container: keyboard ownership must leave the parent list either way.
        if (!focusFirst()) {
          menuRef.current?.focus();
        }
      }
    },
    [canOpen, activeDrillIn, viewId, onOpenChange, layer, focusFirst, menuRef],
  );

  const close = useCallback(
    (options?: {focusTrigger?: boolean}) => {
      if (activeDrillIn != null) {
        if (isOnStack) {
          pendingTriggerFocusRef.current = options?.focusTrigger !== false;
          activeDrillIn.pop();
          onOpenChange?.(false);
        }
        return;
      }
      layer.hide();
      if (options?.focusTrigger !== false) {
        triggerRef.current?.focus();
      }
    },
    [activeDrillIn, isOnStack, onOpenChange, layer],
  );

  // The pushed view has just shown (its rows are in the host and visible):
  // land focus as the open asked.
  useEffect(() => {
    if (!isTopView || activeDrillIn?.host == null) {
      return;
    }
    const mode = pendingViewFocusRef.current;
    if (mode == null) {
      return;
    }
    pendingViewFocusRef.current = null;
    const items = getItems();
    // Back is the first row; a keyboard open lands on the first row after it.
    const target = mode === 'first' ? (items[1] ?? items[0]) : null;
    if (target != null) {
      target.focus({preventScroll: true});
    } else {
      menuRef.current?.focus({preventScroll: true});
    }
  }, [isTopView, activeDrillIn?.host, getItems, menuRef]);

  // The view was popped: the row is visible again, focus returns to it.
  useEffect(() => {
    if (isOnStack || !pendingTriggerFocusRef.current) {
      return;
    }
    pendingTriggerFocusRef.current = false;
    triggerRef.current?.focus({preventScroll: true});
  }, [isOnStack]);

  // Single ref for the trigger row: store it for focus management AND wire it
  // as the flyout's positioning anchor (CSS anchor positioning).
  // Depends on the layer's anchor ref alone, which is stable: the layer
  // object changes with its open state, and a new callback here would re-run a
  // caller's ref as the flyout opens.
  const layerRef = layer.ref;
  const setTriggerEl = useCallback(
    (el: HTMLDivElement | null) => {
      triggerRef.current = el;
      layerRef(el);
    },
    [layerRef],
  );
  // The caller's ref reaches the same row.
  const triggerRowRef = useMergedRefs<HTMLElement>(setTriggerEl, ref);

  const handleTriggerClick = useCallback(
    (event: React.MouseEvent) => {
      if (isDisabled) {
        // As a disabled DropdownMenuItem does: the click is spent, so a
        // caller's onClick composed after this one does not run.
        event.preventDefault();
        return;
      }
      if (isDrillIn) {
        // A keyboard activation (a synthesized click, `detail` 0, outside the
        // press model) lands on the first row; a pointer's drill-in — a real
        // click, or the press model's own activation, which is also `detail`
        // 0 — lights nothing until the pointer moves.
        const isPointer = event.detail > 0 || isMenuPressActivation();
        open({focusFirst: !isPointer});
        return;
      }
      // Toggles, except for the click that follows a hover-open (#3121).
      if (isFlyoutOpen) {
        if (confirmHoverOpen()) {
          if (!focusFirst()) {
            menuRef.current?.focus();
          }
          return;
        }
        close({focusTrigger: true});
      } else {
        open({focusFirst: true});
      }
    },
    [
      isDisabled,
      isDrillIn,
      isFlyoutOpen,
      open,
      close,
      confirmHoverOpen,
      focusFirst,
      menuRef,
    ],
  );

  // The row's toggle runs first, then a caller's `onClick`. Item reports the
  // click as a generic element event; its root is the row's HTMLElement.
  const handleRowClick = useCallback(
    (event: React.MouseEvent) => {
      composeEventHandlers<React.MouseEvent<HTMLElement>>(
        handleTriggerClick,
        onClick,
      )(event as React.MouseEvent<HTMLElement>);
    },
    [handleTriggerClick, onClick],
  );

  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isDisabled) {
        return;
      }
      const isRtl =
        typeof window !== 'undefined' && triggerRef.current
          ? window.getComputedStyle(triggerRef.current).direction === 'rtl'
          : false;
      const openKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
      if (e.key === openKey || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // The trigger row is a direct child of the parent menu (not a nested
        // role="menu"), so the parent's key handler would otherwise also act on
        // this event (e.g. Enter clicking the focused row). Stop it here — this
        // level fully handles opening the flyout.
        e.stopPropagation();
        open({focusFirst: true});
      }
    },
    [isDisabled, open],
  );

  // Move the single focus-driven highlight onto the trigger as the pointer
  // enters it, so a sibling item that still holds focus doesn't stay
  // highlighted alongside the hovered trigger. This is separate from the
  // hover-open intent (onMouseEnter/onMouseLeave) — the flyout still opens on
  // the hover delay; this only keeps the highlight single.
  const handlePointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => focusMenuItemOnHover(e, isDisabled),
    [isDisabled],
  );

  // Enter/Space activate the focused row; typeahead jumps by first character;
  // the close key (Left, or Right in RTL) returns focus to the trigger;
  // arrows/Home/End defer to useListFocus (RTL-aware).
  //
  // The flyout renders inline (useLayer context mode is a native popover, not a
  // portal), so a submenu nested inside this one bubbles its key events up to
  // this handler. `ownsEvent` (from useListFocus, scoped by boundarySelector)
  // tells us whether the event originated in THIS flyout or a deeper one; we
  // only act on our own, letting the deeper level keep ownership. No manual
  // stopPropagation needed — each level self-filters.
  const handleContentKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Tab') {
        // With its own header or footer this level is a dialog: Tab walks
        // its regions and its rows as one stop, and wraps. A deeper level
        // has closed itself as the key bubbled up, and the walk continues
        // from this level's rows.
        if (hasRegions) {
          moveRegionsTab(
            e,
            menuRef.current,
            headerRef.current,
            footerRef.current,
            !ownsEvent(e),
          );
          return;
        }
        // In a menu with a header or footer above this level, Tab leaves the
        // flyout stack: every open level closes as the key bubbles past it,
        // this one's own rows or a deeper level's, and the level with the
        // regions moves focus on.
        if (rootHasRegions) {
          close({focusTrigger: false});
          return;
        }
      }
      if (!ownsEvent(e)) {
        return;
      }
      // Escape closes just this submenu and returns focus to its trigger (APG:
      // Escape collapses the current level, not the whole stack). The root
      // popover's focus-trap listens for Escape at the document level and bails
      // when the event is already handled, so we mark it handled here (stop
      // propagation + preventDefault) to keep the parent menu open.
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close({focusTrigger: true});
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
      const isRtl =
        typeof window !== 'undefined' && menuRef.current
          ? window.getComputedStyle(menuRef.current).direction === 'rtl'
          : false;
      const closeKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === closeKey) {
        e.preventDefault();
        close({focusTrigger: true});
        return;
      }
      if (typeahead.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
      listNavKeyDown(e);
    },
    [
      ownsEvent,
      close,
      listNavKeyDown,
      typeahead,
      menuRef,
      rootHasRegions,
      hasRegions,
    ],
  );

  // A region keeps its own keys: arrows move a field's caret and letters type.
  // Tab moves on through the dialog's stops, and Escape returns to the row as
  // it does from the rows.
  const handleRegionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Tab') {
        moveRegionsTab(
          e,
          menuRef.current,
          headerRef.current,
          footerRef.current,
        );
        return;
      }
      // An Escape that ends an IME composition belongs to the field, and one a
      // control in the region already handled (a menu it opened closing, a
      // field clearing itself) belongs to that control: either closes nothing
      // here, so one Escape affects one surface.
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !isImeKeyEvent(e.nativeEvent)
      ) {
        e.preventDefault();
        e.stopPropagation();
        close({focusTrigger: true});
      }
    },
    [menuRef, close],
  );

  // Re-provide the menu context so nested items behave exactly like top-level
  // ones. Selecting a leaf item must dismiss the WHOLE stack, not just this
  // flyout: close this level (without stealing focus back to the trigger) and
  // propagate up via the parent menu's closeMenu. Because every level
  // re-provides the context, this chains from the deepest flyout all the way to
  // the root DropdownMenu (whose closeMenu hides the popover). The drill-in
  // stack passes through untouched — the root owns it — and this level's label
  // names the Back row of a view drilled in from here.
  const nestedMenuContext = useMemo<DropdownMenuContextValue>(
    () => ({
      menuSize,
      closeMenu: () => {
        close({focusTrigger: false});
        menuCtx?.closeMenu();
      },
      drillIn,
      menuLabel: stringLabel,
    }),
    [menuSize, close, menuCtx, drillIn, stringLabel],
  );

  // The press model for this flyout: the row under a release acts, the
  // highlight follows a held pointer. A mouse released outside every level
  // dismisses the whole menu; a finger leaves it open.
  const menuPress = useMenuPress({
    menuRef,
    itemSelector: MENU_ITEM_SELECTOR,
    onDismiss: nestedMenuContext.closeMenu,
  });

  const endAffordance = hasSpinner ? (
    <span {...stylex.props(triggerStyles.caret)}>
      <Spinner size="sm" aria-hidden="true" />
    </span>
  ) : (
    <span {...stylex.props(triggerStyles.caret)}>
      <Icon
        icon="chevronRight"
        size="sm"
        color="secondary"
        xstyle={rtlStyles.mirror}
        {...themeProps('dropdown-menu-indicator-icon')}
      />
    </span>
  );

  const resolvedMenuWidth = menuWidth
    ? resolveMenuWidth(menuWidth, layerViewportInset.maxInlineSizeFallback)
    : null;
  const popoverXstyle = resolvedMenuWidth
    ? resolvedMenuWidth.property === 'inlineSize'
      ? flyoutStyles.popoverCustomIntrinsicWidth(resolvedMenuWidth.value)
      : flyoutStyles.popoverCustomWidth(resolvedMenuWidth.value)
    : flyoutStyles.popover;

  // The flyout is a layer of its own, where layer-scoped contexts reset:
  // nested rows get this level's menu context and the root's surface again.
  const nestedRows = (
    <DropdownMenuContext value={nestedMenuContext}>
      <DropdownMenuSurfaceContext value={rootSurface}>
        {isDrillIn && (
          <DropdownMenuItem
            icon={
              <Icon
                icon="chevronLeft"
                size="sm"
                color="secondary"
                xstyle={rtlStyles.mirror}
              />
            }
            label={backLabel}
            hasCloseOnSelect={false}
            onClick={() => close({focusTrigger: true})}
          />
        )}
        {children}
      </DropdownMenuSurfaceContext>
    </DropdownMenuContext>
  );
  // A level with its own header or footer tells the levels below it, so Tab
  // from a deeper flyout closes that flyout and this level walks on.
  //
  // Nested rows live in this level's flyout, a layer of their own where the
  // layer-scoped signal resets; re-provide it, as whether every level above
  // them is open, so their pending hover intent dies with the root menu or
  // with this level: a hover-open that fired after this level closed would
  // leave a flyout with a header or footer shown beside the root's menu.
  const nestedContent = (
    <DropdownMenuRootOpenContext value={isRootMenuOpen && isOpen}>
      {hasRegions ? (
        <MenuRegionsContext value={true}>{nestedRows}</MenuRegionsContext>
      ) : (
        nestedRows
      )}
    </DropdownMenuRootOpenContext>
  );

  // The menu of a sub-menu with a header or footer renders beside the root's
  // menu, outside its DOM: it names the root so the press model counts it as
  // nested there, as a flyout inside the root's menu is. Only this menu does:
  // a picker placed in its header or footer stays its own press root.
  const surfaceOwnerProps =
    hasRegions && rootSurface != null
      ? {[MENU_PRESS_SURFACE_ATTR]: rootSurface.ownerId}
      : undefined;

  // With a header or footer, the dialog that holds them and the sub-menu's
  // menu. A drilled-in view is named as its list is, by the row's label; the
  // flyout by the row.
  const renderRegionsFrame = (
    menuElement: ReactNode,
    frameProps: React.HTMLAttributes<HTMLDivElement>,
    surface: 'flyout' | 'view',
  ): ReactNode => (
    <div
      ref={frameRef}
      id={frameId}
      role="dialog"
      aria-modal="true"
      // Read by the root's step-aside rule (a shown view) and by the flyout
      // that holds this row when it closes (an open flyout).
      data-astryx-submenu-regions={surface}
      {...frameProps}
      {...(surface === 'flyout'
        ? {
            onFocus: handleFrameFocus,
            onBlur: handleFrameBlur,
            onPointerEnter: handleFramePointerEnter,
          }
        : undefined)}
      {...(surface === 'flyout'
        ? // The flyout's frame paints its surface, so the menu target rides
          // on it; a drilled-in view sits inside the root's surface.
          mergeProps(
            themeProps('dropdown-menu'),
            stylex.props(regionStyles.frame, regionStyles.flyoutSurface),
          )
        : stylex.props(
            regionStyles.frame,
            rootSurface?.menuMaxHeight != null &&
              dynamicRegionStyles.viewMaxHeight(rootSurface.menuMaxHeight),
            frameProps.hidden === true && regionStyles.hidden,
          ))}>
      {isRenderable(header) && (
        <div
          ref={headerRef}
          onKeyDown={handleRegionKeyDown}
          {...stylex.props(regionStyles.region)}>
          {header}
        </div>
      )}
      {menuElement}
      {isRenderable(footer) && (
        <div
          ref={footerRef}
          onKeyDown={handleRegionKeyDown}
          {...stylex.props(regionStyles.region)}>
          {footer}
        </div>
      )}
    </div>
  );
  // A flyout with a header or footer renders into the root's surface host,
  // beside the root's menu rather than inside it; any other flyout renders
  // in place, inside the menu that holds its row.
  const renderFlyout = (flyout: ReactNode): ReactNode =>
    hasRegions && surfaceHost != null
      ? createPortal(flyout, surfaceHost)
      : flyout;
  // Between a header and a footer the rows are one Tab stop, so keyboard focus
  // on the menu element shows the ring the base style otherwise removes.
  const handleMenuFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (hasRegions && event.target === event.currentTarget) {
      setIsMenuKeyboardFocused(getInteractionModality() === 'keyboard');
    }
  };
  const handleMenuBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (hasRegions && event.target === event.currentTarget) {
      setIsMenuKeyboardFocused(false);
    }
  };

  return (
    <>
      <Item
        // Host attributes and handlers first: the row's role, tab stop, popup
        // state and wiring are set after them, and its own handlers run
        // before the caller's.
        {...rest}
        ref={triggerRowRef}
        id={triggerId}
        role="menuitem"
        tabIndex={isDisabled ? undefined : -1}
        aria-haspopup={hasRegions ? 'dialog' : 'menu'}
        aria-expanded={isOpen}
        aria-controls={isOpen ? (hasRegions ? frameId : contentId) : undefined}
        aria-disabled={isDisabled || undefined}
        data-testid={testId}
        onMouseEnter={composeEventHandlers(
          triggerProps.onMouseEnter,
          onMouseEnter,
        )}
        onMouseLeave={composeEventHandlers(
          triggerProps.onMouseLeave,
          onMouseLeave,
        )}
        onPointerMove={composeEventHandlers(handlePointerMove, onPointerMove)}
        startContent={
          icon
            ? renderIconSlot(icon, {size: 'sm', color: 'secondary'})
            : undefined
        }
        label={label}
        description={description}
        endContent={endAffordance}
        onClick={handleRowClick}
        onKeyDown={composeEventHandlers(handleTriggerKeyDown, onKeyDown)}
        isDisabled={isDisabled}
        xstyle={[
          triggerStyles.root,
          triggerSizeStyles[menuSize],
          isOpen && triggerStyles.open,
          isDisabled && triggerStyles.disabled,
          xstyle,
        ]}
        {...mergeProps(themeProps('dropdown-menu-item', {size: menuSize}), {
          className,
          style,
        })}
      />
      {activeDrillIn != null
        ? isOnStack &&
          activeDrillIn.host != null &&
          (hasRegions
            ? // A view with a header or footer renders beside the root's menu,
              // in its surface host, while the root steps its menu aside.
              createPortal(
                renderRegionsFrame(
                  <div
                    ref={menuRef}
                    id={contentId}
                    role="menu"
                    tabIndex={0}
                    aria-label={stringLabel}
                    aria-labelledby={
                      stringLabel == null ? triggerId : undefined
                    }
                    onKeyDown={handleContentKeyDown}
                    onFocus={handleMenuFocus}
                    onBlur={handleMenuBlur}
                    data-testid={menuDataTestId}
                    {...menuPress.menuProps}
                    {...surfaceOwnerProps}
                    {...stylex.props(
                      regionStyles.menu,
                      hasOverflow && flyoutStyles.scrollable,
                      hasOverflow
                        ? flyoutStyles.touchPanYPinchZoom
                        : flyoutStyles.touchPinchZoom,
                      isMenuKeyboardFocused && focusOutlineStyles.focusVisible,
                    )}>
                    {nestedContent}
                  </div>,
                  {
                    'aria-label': stringLabel,
                    'aria-labelledby':
                      stringLabel == null ? triggerId : undefined,
                    // A deeper view shows in its place; this one waits, hidden.
                    hidden: !isTopView,
                    inert: !isTopView,
                  },
                  'view',
                ),
                surfaceHost ?? activeDrillIn.host,
              )
            : createPortal(
                <div
                  ref={menuRef}
                  id={contentId}
                  role="menu"
                  tabIndex={-1}
                  // The drilled-in list is named by its row's label.
                  aria-label={stringLabel}
                  aria-labelledby={stringLabel == null ? triggerId : undefined}
                  // A deeper view shows in its place; this one waits, hidden.
                  hidden={!isTopView}
                  inert={!isTopView}
                  onKeyDown={handleContentKeyDown}
                  data-testid={menuDataTestId}
                  {...menuPress.menuProps}
                  {...stylex.props(
                    drillInStyles.list,
                    !isTopView && drillInStyles.hidden,
                  )}>
                  {nestedContent}
                </div>,
                activeDrillIn.host,
              ))
        : renderFlyout(
            layer.render(
              hasRegions ? (
                renderRegionsFrame(
                  <div
                    ref={menuRef}
                    id={contentId}
                    role="menu"
                    // One Tab stop between the regions.
                    tabIndex={0}
                    aria-labelledby={triggerId}
                    onKeyDown={handleContentKeyDown}
                    onFocus={handleMenuFocus}
                    onBlur={handleMenuBlur}
                    data-testid={menuDataTestId}
                    {...menuPress.menuProps}
                    {...surfaceOwnerProps}
                    {...stylex.props(
                      regionStyles.menu,
                      hasOverflow
                        ? flyoutStyles.touchPanYPinchZoom
                        : flyoutStyles.touchPinchZoom,
                      hasOverflow && flyoutStyles.scrollable,
                      isMenuKeyboardFocused && focusOutlineStyles.focusVisible,
                    )}>
                    {nestedContent}
                  </div>,
                  {
                    'aria-labelledby': triggerId,
                    // Hovering the regions is hovering the flyout.
                    onMouseEnter: contentProps.onMouseEnter,
                    onMouseLeave: contentProps.onMouseLeave,
                  },
                  'flyout',
                )
              ) : (
                <div
                  ref={menuRef}
                  id={contentId}
                  role="menu"
                  // Focusable as a fallback target so an empty/loading flyout can own
                  // arrow/Escape keys. An overflowing flyout joins the Tab order so its
                  // scrollable region is keyboard-accessible.
                  tabIndex={hasOverflow ? 0 : -1}
                  aria-labelledby={triggerId}
                  onKeyDown={handleContentKeyDown}
                  onMouseEnter={contentProps.onMouseEnter}
                  onMouseLeave={contentProps.onMouseLeave}
                  data-testid={menuDataTestId}
                  {...menuPress.menuProps}
                  {...mergeProps(
                    themeProps('dropdown-menu'),
                    stylex.props(
                      flyoutStyles.menu,
                      hasOverflow
                        ? flyoutStyles.touchPanYPinchZoom
                        : flyoutStyles.touchPinchZoom,
                      hasOverflow && flyoutStyles.scrollable,
                    ),
                  )}>
                  {nestedContent}
                </div>
              ),
              {
                placement: 'end',
                alignment: 'start',
                offset: spacingVars['--spacing-1'],
                xstyle: [
                  flyoutStyles.popoverViewport,
                  popoverXstyle,
                  layerAnimations.end,
                ],
              },
            ),
          )}
    </>
  );
}

DropdownMenuSubMenu.displayName = 'DropdownMenuSubMenu';
