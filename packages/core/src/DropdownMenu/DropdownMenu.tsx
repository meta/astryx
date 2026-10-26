// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenu.tsx
 * @input Uses React, StyleX, usePopover, MenuBottomSheet (lazy), Button, List,
 *   useListFocus, and the shared viewport-safe menu-width resolver
 * @output Exports DropdownMenu with caller-selected popover or bottom-sheet
 *   presentation
 * @position Core implementation; consumed by index.ts
 *
 * Supports two modes with a single keyboard/focus path:
 * - **Data-driven**: pass `items` array (converted to components internally)
 * - **Compound-component**: pass JSX children directly
 *
 * Both modes use useListFocus for DOM-based keyboard navigation.
 *
 * The trigger is the design system's Button (`button`) or any control the
 * caller renders (`renderTrigger`).
 *
 * A sub-menu drills in on a phone through the view stack useMenuDrillIn
 * keeps; the root shows the drilled view in place of its rows.
 *
 * Initial focus on open follows the input modality: a keyboard open
 * (Enter / Space / ArrowDown on the trigger) focuses the first enabled item
 * (APG menu-button); a pointer open focuses the menu container itself so no
 * item reads as pre-selected, and the first ArrowDown then moves to item 1.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DropdownMenu/DropdownMenu.doc.mjs
 * - /packages/core/src/DropdownMenu/DropdownMenu.test.tsx
 * - /packages/core/src/DropdownMenu/index.ts
 * - /apps/storybook/stories/DropdownMenu.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/DropdownMenu/ (showcase blocks)
 */

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {usePopover} from '../Popover/usePopover';
import {Button, type ButtonProps} from '../Button';
import {Heading} from '../Heading';
import {Icon} from '../Icon';

import {renderDropdownItems} from './renderDropdownItems';
import type {DropdownMenuItemProps} from './DropdownMenuItem';
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
  type DropdownMenuContextValue,
  type DropdownMenuSurfaceHost,
  type DropdownMenuSurfaceValue,
} from './DropdownMenuContext';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {useListFocus} from '../hooks/useListFocus';
import {useMenuPress} from '../hooks/useMenuPress';
import type {MenuPressPointerType} from '../hooks/menuPressGesture';
import {useTypeahead} from '../hooks/useTypeahead';
import {useFocusReturnVisibility} from '../hooks/useFocusReturnVisibility';
import {focusForLastInput} from '../utils/focusReturn';
import {useMenuOverflow} from './useMenuOverflow';
import {MenuRegionsContext} from './menuRegionsContext';
import {moveRegionsTab} from './menuRegionStops';
import {useDevWarning} from '../hooks/useDevWarning';
import {useMenuDrillIn} from './useMenuDrillIn';
import {resolveMenuWidth} from './menuWidth';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {
  useAdaptivePresentation,
  type AdaptivePresentation,
} from '../hooks/useAdaptivePresentation';
// Loaded on demand: only the bottom-sheet presentation renders the sheet.
import {
  MenuBottomSheet,
  MenuBottomSheetActionList,
  preloadMenuBottomSheetActionList,
} from './lazyMenuBottomSheet';
import {menuBottomSheetStyles} from './menuBottomSheet.stylex';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import type {LayerAlignment, LayerPlacement} from '../Layer/useLayer';
import {
  spacingVars,
  colorVars,
  radiusVars,
  durationVars,
  easeVars,
} from '../theme/tokens.stylex';
import {isRenderable, mergeProps, rtlStyles} from '../utils';
import type {BaseProps} from '../BaseProps';
import {themeProps} from '../utils/themeProps';
import {
  getInteractionModality,
  useInteractionModalityTracking,
} from '../utils/interactionModality';
import {useTranslator} from '../i18n';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';

// The menu's own lower cap on the placement axis; the viewport cap underneath
// it is the layer runtime's (spec:AST-059 FR3).
const MENU_BLOCK_CAP = '300px';
const MENU_MAX_BLOCK_SIZE = `min(${MENU_BLOCK_CAP}, ${layerViewportInset.maxBlockSize})`;
const MENU_MAX_BLOCK_SIZE_FALLBACK = `min(${MENU_BLOCK_CAP}, ${layerViewportInset.maxBlockSizeFallback})`;
const MENU_TRIGGER_OPEN_BACKGROUND = `linear-gradient(${colorVars['--color-overlay-pressed']}, ${colorVars['--color-overlay-pressed']})`;

// A sub-menu's drilled-in view with a header or footer renders in the surface
// host that follows the menu (marked `data-astryx-submenu-host`), as the frame
// marked `data-astryx-submenu-regions="view"` (hidden while a deeper view
// shows). While one shows, the menu and its header and footer step aside. The
// rule reads that from the DOM, so no state mirrors which view shows; it names
// the host by its marker rather than a universal selector.
const STEPS_ASIDE_FOR_VIEW =
  ':has(~ [data-astryx-submenu-host] > [data-astryx-submenu-regions="view"]:not([hidden]))';

const styles = stylex.create({
  triggerOpen: {
    backgroundImage: MENU_TRIGGER_OPEN_BACKGROUND,
  },
  // A finger held on the trigger opens the menu; the browser's own held-press
  // affordances — the link preview callout, text selection — must not compete
  // with it.
  triggerPressable: {
    WebkitTouchCallout: 'none',
    userSelect: 'none',
  },
  dropdown: {
    boxSizing: 'border-box',
    display: {
      default: 'flex',
      // A sub-menu's drilled-in view with a header or footer shows in its
      // place (see `stepsAsideForView`).
      [STEPS_ASIDE_FOR_VIEW]: 'none',
    },
    flexDirection: 'column',
    gap: spacingVars['--spacing-0-5'],
    // Pointer opens focus this container so subsequent arrow keys and Escape
    // stay owned by the menu. It is an internal focus target, not a control,
    // so suppress the browser ring; keyboard focus moves to an item instead.
    outline: 'none',
    // Menu rows never offer the browser's held-press link preview or text
    // selection: a held finger is driving the highlight.
    WebkitTouchCallout: 'none',
    userSelect: 'none',
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
    opacity: 1,
    transitionProperty: 'opacity',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
  },
  scrollable: {
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehavior: 'contain',
  },
  // With a header or footer, the regions and the menu share one column under
  // the menu's block cap: the regions keep their height and the menu shrinks
  // and scrolls between them.
  regionsFrame: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: stylex.firstThatWorks(
      MENU_MAX_BLOCK_SIZE,
      MENU_MAX_BLOCK_SIZE_FALLBACK,
    ),
  },
  menuInFrame: {
    flexGrow: 1,
    flexShrink: 1,
    minBlockSize: 0,
  },
  // Where a sub-menu with a header or footer renders its surface: beside the
  // menu, never inside it. It owns no box, so the popover's layout is
  // unchanged.
  surfaceHost: {
    display: 'contents',
  },
  // While a sub-menu's drilled-in view with its own header or footer shows
  // in the surface host, the header and footer step aside for it, as the menu
  // does (see `dropdown`). Derived from the DOM by the rule itself: the view
  // is the frame in the host that is not hidden.
  stepsAsideForView: {
    display: {
      default: null,
      [STEPS_ASIDE_FOR_VIEW]: 'none',
    },
  },
  region: {
    flexShrink: 0,
    padding: spacingVars['--spacing-1'],
  },
  // Scroll ownership by the browser's own signal. A menu whose rows fit keeps
  // every one-finger move: a slide over its rows stays a slide. One that
  // scrolls lets the browser pan it vertically and cancel the press when it
  // does. Both leave a two-finger pinch to the browser, so the page stays
  // zoomable over an open menu; `pinch-zoom` admits no one-finger pan.
  touchPinchZoom: {
    touchAction: 'pinch-zoom',
  },
  touchPanYPinchZoom: {
    touchAction: 'pan-y pinch-zoom',
    overscrollBehavior: 'contain',
  },
  // The menu's lower block cap rides on the layer box too, so the layer's
  // flip decision sees the same height the menu paints.
  popoverViewport: {
    boxSizing: 'border-box',
    maxBlockSize: stylex.firstThatWorks(
      MENU_MAX_BLOCK_SIZE,
      MENU_MAX_BLOCK_SIZE_FALLBACK,
    ),
  },
  // Without a width the menu prefers the trigger's minimum width, clamped by
  // the runtime's cap because a CSS minimum beats a maximum (spec:AST-059 FR7).
  popoverMatchTrigger: {
    minWidth: stylex.firstThatWorks(
      `min(anchor-size(width), ${layerViewportInset.maxInlineSize})`,
      `min(anchor-size(width), ${layerViewportInset.maxInlineSizeFallback})`,
      'anchor-size(width)',
    ),
  },
  popoverCustomWidth: (width: string) => ({
    minWidth: width,
  }),
  popoverCustomIntrinsicWidth: (width: string) => ({
    inlineSize: width,
  }),
});

// `menuMaxHeight` lifts the 300px cap for a menu that must fit its rows; the
// viewport still bounds it.
const dynamicStyles = stylex.create({
  menuMaxHeight: (maxHeight: string) => ({
    maxHeight: `min(${maxHeight}, ${layerViewportInset.maxBlockSize})`,
  }),
  popoverViewportMaxBlockSize: (maxHeight: string) => ({
    maxBlockSize: `min(${maxHeight}, ${layerViewportInset.maxBlockSize})`,
  }),
});

const bottomSheetStyles = stylex.create({
  content: {
    width: '100%',
  },
  header: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    marginBottom: spacingVars['--spacing-2'],
  },
  rootHeading: {
    // Match the content edge of a spacious ListItem. Icon-bearing rows place
    // their icon here; rows without an icon place their label here.
    marginInlineStart: spacingVars['--spacing-3'],
  },
  viewHeading: {
    outline: 'none',
  },
  // Caller content above or below the action list, inset to the list's
  // content edge.
  region: {
    paddingInline: spacingVars['--spacing-3'],
    paddingBlock: spacingVars['--spacing-2'],
  },
});

// =============================================================================
// Types
// =============================================================================

/**
 * Data-mode shape for one menu row.
 *
 * The item fields are sourced from `DropdownMenuItemProps` — data mode renders
 * through `DropdownMenuItem`, so the two APIs describe the same thing and must
 * not drift. Only the fields listed here are part of the data API; add a key to
 * the `Pick` to expose more of the item's props to `items`.
 */
export interface DropdownMenuItemData extends Pick<
  DropdownMenuItemProps,
  | 'icon'
  | 'onClick'
  | 'isDisabled'
  | 'variant'
  | 'description'
  | 'endContent'
  | 'hasCloseOnSelect'
  | 'href'
  | 'target'
  | 'rel'
> {
  /**
   * Stable identity for the row, used as its React key (as on
   * `TreeListItemData`). Omit it and the row is keyed by position, which is
   * correct for a fixed menu; set it when `items` can reorder, filter, or grow,
   * so a row keeps its DOM node — and therefore keyboard focus — as the array
   * changes around it.
   */
  id?: string;
  /** Primary label content. */
  label: ReactNode;
  /**
   * Nested submenu entries. When present, this row becomes a submenu (a
   * flyout revealing `items`) instead of a leaf action — no separate item
   * "type" is needed. Data-mode parity for the compound DropdownMenuSubMenu API.
   */
  items?: DropdownMenuOption[];
}

/**
 * Data-mode shape for a divider row. The compound-mode peer is the
 * `DropdownMenuDivider` component, which both modes render.
 */
export interface DropdownMenuDividerData {
  type: 'divider';
}

export interface DropdownMenuSection {
  type: 'section';
  /** Stable identity for the group; see {@link DropdownMenuItemData.id}. */
  id?: string;
  title?: string;
  items: DropdownMenuItemData[];
}

export type DropdownMenuOption =
  DropdownMenuItemData | DropdownMenuDividerData | DropdownMenuSection;

// =============================================================================
// Props
// =============================================================================

export type DropdownMenuButtonProps = Omit<ButtonProps, 'onClick'>;

export type DropdownMenuPresentation = AdaptivePresentation;

/**
 * The props a custom `trigger` spreads onto the control that opens the menu.
 * They carry the press model — a mouse opens on press-down, a held finger
 * opens with the finger down — the keyboard opens (Enter, Space, ArrowDown,
 * ArrowUp), the toggle click, and the ARIA wiring that names the menu after
 * the control. Spread them all; add your own handlers beside them.
 */
export interface DropdownMenuTriggerProps {
  /** Attaches the control as the menu's anchor and focus-return target. */
  ref: (element: HTMLElement | null) => void;
  /** The menu points at this id with `aria-labelledby`. */
  id: string;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLElement>) => void;
  'aria-haspopup': 'menu' | 'dialog';
  'aria-expanded': boolean;
  'aria-controls': string;
}

interface DropdownMenuBaseProps extends BaseProps {
  /**
   * The design system's own button as the trigger. Mutually exclusive with
   * `renderTrigger`.
   */
  button?: DropdownMenuButtonProps;
  /**
   * Render the control the menu hangs off — an icon button, a chip, an
   * avatar, a list row. Spread the given props onto it; the menu is then
   * named by that control. Mutually exclusive with `button`.
   *
   * Hover and pressed paint stay yours. The open state reaches your control
   * as `aria-expanded` on the given props, so style it from the rendered
   * attribute. A pressed look keyed to `:active` is not a substitute:
   * `:active` does not behave the same under a coarse pointer, which is why
   * menu rows drop coarse-pointer `:active` paint entirely.
   *
   * @example
   * ```
   * <DropdownMenu renderTrigger={props => <IconButton icon="more" label="More" {...props} />}>
   * ```
   *
   * @example
   * ```
   * // Styling the open state from the rendered attribute:
   * // .my-trigger[aria-expanded='true'] { background: var(--color-overlay-pressed); }
   * ```
   */
  renderTrigger?: (props: DropdownMenuTriggerProps) => ReactNode;
  isMenuOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * Minimum popover width. The menu may grow for its content but is capped to
   * the available viewport space. Ignored by bottom-sheet presentation.
   * Defaults to the trigger width.
   */
  menuWidth?: number | string;
  /**
   * Maximum menu height in pixels, for a menu that must fit its rows. Lifts
   * the default 300px cap; the viewport still bounds it. Ignored by
   * bottom-sheet presentation.
   */
  menuMaxHeight?: number;
  onClick?: () => void;
  hasChevron?: boolean;
  /**
   * Popover position relative to the trigger. Ignored by bottom-sheet
   * presentation.
   * Uses the same placement values as other Astryx layer-based components.
   * @default 'below'
   */
  placement?: LayerPlacement;

  /**
   * Popover alignment along the placement axis. Ignored by bottom-sheet
   * presentation.
   * Uses the same alignment values as other Astryx layer-based components.
   * @default 'start'
   */
  alignment?: LayerAlignment;
  /**
   * Content above the menu's rows and outside the menu itself — a filter
   * field, a toggle. The menu holds only its rows, so a control that is not
   * a row goes here or in `footer`, never among the rows.
   */
  header?: ReactNode;
  /**
   * Content below the menu's rows and outside the menu itself — a "Create"
   * button. See `header`.
   */
  footer?: ReactNode;

  'data-testid'?: string;
}

interface DropdownMenuDataProps extends DropdownMenuBaseProps {
  /**
   * Surface used to present the actions. Pass a value selected by product
   * policy (for example, a compact-touch media query) when the presentation
   * should adapt. Bottom-sheet presentation is intended for short action sets.
   * @default 'popover'
   */
  presentation?: DropdownMenuPresentation;
  items: DropdownMenuOption[];
  children?: undefined;
}

interface DropdownMenuCompoundProps extends DropdownMenuBaseProps {
  presentation?: 'popover';
  items?: undefined;
  children: ReactNode;
}

export type DropdownMenuProps =
  DropdownMenuDataProps | DropdownMenuCompoundProps;

// =============================================================================
// DropdownMenu
// =============================================================================

/**
 * A dropdown menu component that displays a list of actionable items.
 *
 * Supports two modes:
 * - **Data-driven**: pass `items` and choose either the default anchored
 *   popover or the modal bottom-sheet presentation.
 * - **Compound-component**: pass JSX children for dynamic, stateful, or
 *   lazy-loaded anchored popover menus.
 *
 * @example
 * ```
 * <DropdownMenu
 *   button={{ label: 'Actions' }}
 *   presentation={useBottomSheet ? 'bottom-sheet' : 'popover'}
 *   items={[
 *     { label: 'Edit', onClick: () => handleEdit() },
 *     { label: 'Delete', onClick: () => handleDelete() },
 *   ]}
 * />
 * ```
 */
// When the consumer doesn't pass `button`, the default label is looked up
// at render time so it respects the active InternationalizationProvider
// locale.
const DEFAULT_BUTTON_I18N_KEY = '@astryx.dropdownMenu.label' as const;

/**
 * Keep `control` the invoker of popover `popoverId` for the rest of the press
 * in flight, so the native light dismiss of a `popover="auto"` does not read
 * the release over the trigger as a dismissal. The attribute is dropped a
 * task after the release, once light dismiss has run.
 */
function holdInvokerThroughPress(
  control: HTMLElement | null,
  popoverId: string,
): void {
  if (control == null) {
    return;
  }
  const doc = control.ownerDocument;
  control.setAttribute('popovertarget', popoverId);
  const onPressEnd = () => {
    doc.removeEventListener('pointerup', onPressEnd, true);
    doc.removeEventListener('pointercancel', onPressEnd, true);
    // Light dismiss runs as the pointerup default action after listeners.
    doc.defaultView?.setTimeout(() => {
      control.removeAttribute('popovertarget');
    }, 0);
  };
  doc.addEventListener('pointerup', onPressEnd, true);
  doc.addEventListener('pointercancel', onPressEnd, true);
}

/** Text an assistive technology reads from `element`, `aria-hidden` left out. */
function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) {
    hidden.remove();
  }
  // An icon-only control is named by its image's alt, an inner aria-label, or
  // an svg title rather than by text, so those count as its contents too.
  for (const named of copy.querySelectorAll('img[alt], [aria-label]')) {
    const name =
      named.getAttribute(named.tagName === 'IMG' ? 'alt' : 'aria-label') ?? '';
    named.replaceWith(copy.ownerDocument.createTextNode(` ${name} `));
  }
  for (const svg of copy.querySelectorAll('svg')) {
    const title = svg.querySelector('title')?.textContent ?? '';
    svg.replaceWith(copy.ownerDocument.createTextNode(` ${title} `));
  }
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The name a custom trigger gives the menu it labels (`aria-labelledby` on
 * the menu points at it): its own `aria-labelledby` targets, its
 * `aria-label`, its text, or its `title`, in that order.
 */
function readAccessibleName(element: HTMLElement | null): string | undefined {
  if (element == null) {
    return undefined;
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy != null && labelledBy.trim() !== '') {
    const text = labelledBy
      .split(/\s+/)
      .map(id => element.ownerDocument.getElementById(id))
      .filter((node): node is HTMLElement => node != null)
      .map(visibleText)
      .join(' ')
      .trim();
    if (text !== '') {
      return text;
    }
  }
  const label = element.getAttribute('aria-label')?.trim();
  if (label) {
    return label;
  }
  // A form control is named by its own <label>s; an input button by its value.
  const labels =
    'labels' in element
      ? Array.from((element as HTMLInputElement).labels ?? [])
      : [];
  const labelText = labels.map(visibleText).join(' ').trim();
  if (labelText !== '') {
    return labelText;
  }
  if (
    element instanceof HTMLInputElement &&
    ['button', 'submit', 'reset'].includes(element.getAttribute('type') ?? '')
  ) {
    const value = element.value.trim();
    if (value !== '') {
      return value;
    }
  }
  const text = visibleText(element);
  if (text !== '') {
    return text;
  }
  return element.getAttribute('title')?.trim() || undefined;
}

function DropdownMenuBottomSheet({
  button: buttonFromProps,
  renderTrigger,
  isMenuOpen: controlledIsOpen,
  onOpenChange,
  onClick,
  hasChevron = true,
  items,
  presentation: _presentation,
  menuWidth: _menuWidth,
  menuMaxHeight: _menuMaxHeight,
  placement: _placement,
  alignment: _alignment,
  header,
  footer,
  className,
  style,
  xstyle,
  'data-testid': testId,
  ...rest
}: DropdownMenuDataProps & {presentation: 'bottom-sheet'}) {
  const t = useTranslator();
  const button = buttonFromProps ?? {label: t(DEFAULT_BUTTON_I18N_KEY)};
  const backLabel = t('@astryx.dropdownMenu.back');
  const buttonRef = useRef<HTMLElement>(null);
  const triggerId = useId();
  const sheetId = useId();
  const actionListRef = useRef<HTMLDivElement>(null);
  const openModalityRef = useRef<'keyboard' | 'pointer'>('pointer');
  const {
    isFocusRingSuppressed,
    onFocusReturnTargetFocus,
    prepareFocusReturn,
    resetFocusReturn,
  } = useFocusReturnVisibility();
  const viewHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousSubmenuDepthRef = useRef(0);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [submenuPath, setSubmenuPath] = useState<DropdownMenuItemData[]>([]);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const [previousIsOpen, setPreviousIsOpen] = useState(isOpen);
  if (previousIsOpen !== isOpen) {
    setPreviousIsOpen(isOpen);
    if (!isOpen && submenuPath.length > 0) {
      setSubmenuPath([]);
    }
  }
  // The closed sheet renders nothing, so load its rows at rest: the first
  // open shows the actions at once.
  useEffect(() => {
    preloadMenuBottomSheetActionList();
  }, []);
  const currentSubmenu = submenuPath.at(-1);
  const currentItems = currentSubmenu?.items ?? items;
  const currentTitle = currentSubmenu?.label ?? button.label;
  const sheetLabel =
    typeof currentTitle === 'string' ? currentTitle : button.label;

  const setOpen = useCallback(
    (nextIsOpen: boolean) => {
      if (!nextIsOpen) {
        setSubmenuPath([]);
        prepareFocusReturn();
      } else {
        resetFocusReturn();
      }
      onOpenChange?.(nextIsOpen);
      if (!isControlled) {
        setInternalIsOpen(nextIsOpen);
      }
    },
    [isControlled, onOpenChange, prepareFocusReturn, resetFocusReturn],
  );

  const handleSelect = useCallback(
    (item: DropdownMenuItemData, event: React.MouseEvent) => {
      if (item.isDisabled) {
        return;
      }
      item.onClick?.(event);
      if (item.hasCloseOnSelect !== false) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const isIconOnly = button.isIconOnly === true;
  const resolvedEndContent =
    button.endContent ??
    (hasChevron && !isIconOnly ? (
      <Icon icon="chevronDown" size="sm" color="inherit" />
    ) : undefined);

  useEffect(() => {
    if (!isOpen || openModalityRef.current !== 'keyboard') {
      return;
    }
    const findFirstAction = () =>
      actionListRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), a[href]',
      ) ?? null;
    let observer: MutationObserver | null = null;
    let frame = requestAnimationFrame(() => {
      const action = findFirstAction();
      if (action != null) {
        action.focus({preventScroll: true});
        return;
      }
      // The sheet loads on demand, so a keyboard open can arrive before its
      // rows exist. Wait for them, then focus a frame later so the sheet's
      // own open-focus has already run.
      observer = new MutationObserver(() => {
        const loaded = findFirstAction();
        if (loaded == null) {
          return;
        }
        observer?.disconnect();
        observer = null;
        frame = requestAnimationFrame(() => {
          loaded.focus({preventScroll: true});
        });
      });
      observer.observe(document.body, {childList: true, subtree: true});
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [currentItems, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      previousSubmenuDepthRef.current = 0;
      return;
    }
    if (submenuPath.length === previousSubmenuDepthRef.current) {
      return;
    }
    previousSubmenuDepthRef.current = submenuPath.length;
    const frame = requestAnimationFrame(() => {
      viewHeadingRef.current?.focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, submenuPath.length]);

  const handleSheetTriggerPointerDown = () => {
    openModalityRef.current = 'pointer';
  };
  const handleSheetTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      openModalityRef.current = 'keyboard';
    }
  };
  const handleSheetTriggerClick = (event: React.MouseEvent<HTMLElement>) => {
    // A caller-rendered trigger that is natively or aria-disabled must not
    // open the sheet; the default Button already refuses its own click.
    // The DOM check covers the built-in Button too (it renders aria-disabled
    // when focusable-disabled); a caller's own enabled control wins over a
    // `button.isDisabled` left on the props.
    if (event.currentTarget.matches(':disabled, [aria-disabled="true"]')) {
      return;
    }
    onClick?.();
    setOpen(!isOpen);
  };

  // The root view's heading stands alone; a sub-menu's sits in a row with its
  // back button.
  const viewHeading = (
    <Heading
      ref={viewHeadingRef}
      level={3}
      tabIndex={-1}
      xstyle={[
        bottomSheetStyles.viewHeading,
        submenuPath.length === 0 && [
          bottomSheetStyles.rootHeading,
          menuBottomSheetStyles.headingAlone,
        ],
      ]}>
      {currentTitle}
    </Heading>
  );
  return (
    <>
      {renderTrigger != null ? (
        renderTrigger({
          ref: el => {
            buttonRef.current = el;
          },
          id: triggerId,
          onClick: handleSheetTriggerClick,
          onClickCapture: () => {},
          onPointerDown: handleSheetTriggerPointerDown,
          onContextMenu: () => {},
          onKeyDown: handleSheetTriggerKeyDown,
          onFocus: onFocusReturnTargetFocus,
          'aria-haspopup': 'dialog',
          'aria-expanded': isOpen,
          'aria-controls': sheetId,
        })
      ) : (
        <Button
          {...button}
          ref={buttonRef as React.Ref<HTMLButtonElement>}
          xstyle={[
            isOpen && styles.triggerOpen,
            button.xstyle,
            isFocusRingSuppressed && focusOutlineStyles.suppressed,
          ]}
          tooltip={isOpen ? undefined : button.tooltip}
          endContent={resolvedEndContent}
          onPointerDown={event => {
            button.onPointerDown?.(event);
            handleSheetTriggerPointerDown();
          }}
          onKeyDown={event => {
            button.onKeyDown?.(event);
            handleSheetTriggerKeyDown(event);
          }}
          onFocus={event => {
            button.onFocus?.(event);
            onFocusReturnTargetFocus();
          }}
          onClick={handleSheetTriggerClick}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          data-testid={testId}
        />
      )}

      <MenuBottomSheet
        isOpen={isOpen}
        onOpenChange={setOpen}
        finalFocusRef={buttonRef}
        label={sheetLabel}>
        <div
          ref={actionListRef}
          id={sheetId}
          {...rest}
          {...mergeProps(
            themeProps('dropdown-menu', {presentation: 'bottom-sheet'}),
            stylex.props(
              bottomSheetStyles.content,
              menuBottomSheetStyles.content,
              xstyle,
            ),
            className,
            style,
          )}>
          {submenuPath.length > 0 ? (
            <div {...stylex.props(bottomSheetStyles.header)}>
              <Button
                label={backLabel}
                variant="ghost"
                size="sm"
                icon={
                  <Icon
                    icon="chevronLeft"
                    size="sm"
                    xstyle={rtlStyles.mirror}
                  />
                }
                isIconOnly
                onClick={() => setSubmenuPath(path => path.slice(0, -1))}
              />
              {viewHeading}
            </div>
          ) : (
            viewHeading
          )}
          {isRenderable(header) && (
            <div {...stylex.props(bottomSheetStyles.region)}>{header}</div>
          )}
          <MenuBottomSheetActionList
            items={currentItems}
            onSelect={handleSelect}
            onOpenSubmenu={item => setSubmenuPath(path => [...path, item])}
          />
          {isRenderable(footer) && (
            <div {...stylex.props(bottomSheetStyles.region)}>{footer}</div>
          )}
        </div>
      </MenuBottomSheet>
    </>
  );
}

function DropdownMenuPopover({
  button: buttonFromProps,
  renderTrigger,
  isMenuOpen: controlledIsOpen,
  onOpenChange,
  menuWidth,
  menuMaxHeight,
  onClick,
  hasChevron = true,
  placement = 'below',
  alignment = 'start',
  presentation: _presentation,
  header,
  footer,
  className,
  style,
  xstyle,
  'data-testid': testId,
  ...props
}: DropdownMenuProps) {
  const t = useTranslator();
  const button = buttonFromProps ?? {label: t(DEFAULT_BUTTON_I18N_KEY)};

  const items = ('items' in props ? props.items : undefined) ?? [];
  const children = props.children;

  // Extract BaseProps pass-throughs (aria-*, id, event handlers) from the
  // discriminated-union rest bag so they can be forwarded to the menu element.
  const {
    items: _items,
    children: _children,
    ...rest
  } = props as Record<string, unknown>;

  const menuId = useId();
  const triggerId = useId();
  const menuSize = button.size ?? 'md';
  const buttonRef = useRef<HTMLElement>(null);

  // The name a custom trigger gives the menu, read off it as the menu opens.
  const [triggerName, setTriggerName] = useState<string | undefined>(undefined);

  // Open state
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const acceptedOpenRef = useRef(false);
  const notifyClickOnShowRef = useRef(false);
  const pendingControlledOpenRef = useRef(false);
  const suppressControlledRollbackHideRef = useRef(false);

  useInteractionModalityTracking();
  const {
    isFocusRingSuppressed,
    onFocusReturnTargetFocus,
    prepareFocusReturn,
    resetFocusReturn,
  } = useFocusReturnVisibility();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const hasRegions = useMemo(
    () => isRenderable(header) || isRenderable(footer),
    [header, footer],
  );
  // Whether the menu element itself took focus from the keyboard. A pointer
  // open focuses it programmatically, and pointer history must not paint the
  // keyboard ring (architecture:interaction-modality INV1).
  const [isMenuKeyboardFocused, setIsMenuKeyboardFocused] = useState(false);
  // The press model is mounted below (it needs the popover); the hide path
  // above it ends the gesture in flight through this ref.
  const cancelMenuPressRef = useRef<() => void>(() => {});

  // Submenu flyouts are `popover="manual"` elements nested inside the menu's
  // `popover="auto"` element, so the browser's light dismiss of the menu never
  // reaches them: without a sweep they keep their open state and their
  // top-layer entry while the menu is hidden, and re-anchor to the viewport
  // corner when the menu reopens (#6893). Closing them through the popover
  // API lets useLayer's toggle handling reset their state. Only flyouts that
  // are actually open are touched: `:popover-open` ships wherever
  // `hidePopover` does (they are one API), and the display fallback keeps its
  // own open signal (`display: block`) so it is guarded the same way.
  const hideOpenFlyouts = useCallback(() => {
    const menuPopover = contentRef.current;
    if (!menuPopover) {
      return;
    }
    // Innermost first: hiding a flyout may unmount the flyouts nested inside
    // it, and a detached element no longer has the toggle listener that
    // resets its open state.
    const flyouts = [
      ...menuPopover.querySelectorAll<HTMLElement>('[popover]'),
    ].reverse();
    for (const flyout of flyouts) {
      if (typeof flyout.hidePopover === 'function') {
        if (flyout.matches(':popover-open')) {
          flyout.hidePopover();
        }
      } else if (flyout.style.display === 'block') {
        flyout.style.display = 'none';
        const toggle = new Event('toggle', {bubbles: false});
        Object.defineProperty(toggle, 'newState', {
          value: 'closed',
          configurable: true,
        });
        flyout.dispatchEvent(toggle);
      }
    }
  }, []);

  // Focus lands somewhere stated when the menu closes. A press outside that
  // landed on a focusable control has already moved focus there; leave it.
  // Otherwise — a row acted, Escape, a press on nothing — focus returns to
  // the trigger, with a visible ring only when the menu was driven by
  // keyboard (the modality tracker decides; the suppressed style hides the
  // pointer case, which Safari would otherwise paint after a touch pick).
  const handleLayerHide = useCallback(() => {
    // Whatever closed the menu — light dismiss, the dismissal stack, Escape
    // or a controlled close — its flyouts close with it.
    hideOpenFlyouts();
    if (suppressControlledRollbackHideRef.current) {
      suppressControlledRollbackHideRef.current = false;
      return;
    }
    cancelMenuPressRef.current();
    pendingControlledOpenRef.current = false;
    onOpenChange?.(false);
    if (!isControlled) {
      setInternalIsOpen(false);
    }
    const trigger = buttonRef.current;
    if (!trigger) {
      return;
    }
    const active = document.activeElement;
    const focusLandedElsewhere =
      active instanceof HTMLElement &&
      active !== document.body &&
      active !== trigger &&
      !contentRef.current?.contains(active);
    if (focusLandedElsewhere) {
      return;
    }
    prepareFocusReturn();
    // After pointer input the trigger takes focus without the focus-visible
    // ring (`component:DropdownMenu/DEC-1`). The style the helper above adds
    // reaches only the design system's own Button; the browser's focus option
    // also reaches a control the caller renders, which the browser would
    // otherwise ring (Chromium after a mouse pick, WebKit after a touch).
    focusForLastInput(trigger, {preventScroll: true});
  }, [hideOpenFlyouts, isControlled, onOpenChange, prepareFocusReturn]);

  // Defer item focus until the layer has committed open, so focus restore
  // captures the trigger instead of the first menu item.
  const shouldFocusOnOpenRef = useRef(false);

  // How the next open was initiated. Keyboard (and programmatic) opens focus
  // the first enabled item per the APG menu-button pattern; pointer opens
  // focus the menu container instead, so no item is visually highlighted as
  // if pre-selected (#4477). Reset to 'keyboard' after every open so
  // programmatic controlled opens keep the item-focus behavior.
  const openModalityRef = useRef<'keyboard' | 'pointer'>('keyboard');
  // ArrowUp opens with the LAST enabled row highlighted.
  const focusLastOnOpenRef = useRef(false);

  // Synchronizes the dialog's name from the custom trigger's DOM, an external
  // system React does not own: the rendered control's accessible name is only
  // readable once it mounts. With a header or footer the dialog is named like
  // the menu, so that name is needed before the first open, not only at it.
  useIsomorphicLayoutEffect(() => {
    if (renderTrigger != null && hasRegions && triggerName == null) {
      setTriggerName(readAccessibleName(buttonRef.current));
    }
  }, [renderTrigger, hasRegions, triggerName]);

  const handleLayerShow = useCallback(() => {
    acceptedOpenRef.current = true;
    resetFocusReturn();
    if (renderTrigger != null) {
      setTriggerName(readAccessibleName(buttonRef.current));
    }
    if (notifyClickOnShowRef.current) {
      notifyClickOnShowRef.current = false;
      onClick?.();
    }
    onOpenChange?.(true);
    if (!isControlled) {
      setInternalIsOpen(true);
    }
  }, [isControlled, onClick, onOpenChange, renderTrigger, resetFocusReturn]);

  // The menu's name: the dialog around it with a header or footer, and the
  // Back row of a drilled-in view ("Back to <this>"), both read it.
  // The design system's button names the menu by its label. A custom trigger
  // names it by reference (or the caller's `aria-label` does), so that name
  // is read off the control as the menu opens.
  const callerMenuLabel = rest['aria-label'];
  const menuLabel =
    renderTrigger != null
      ? typeof callerMenuLabel === 'string' && callerMenuLabel.trim() !== ''
        ? callerMenuLabel
        : triggerName
      : typeof button.label === 'string'
        ? button.label
        : undefined;

  const popover = usePopover({
    onHide: handleLayerHide,
    onShow: handleLayerShow,
    hasLightDismiss: true,
    hasCloseButton: false,
    hasAutoFocus: false,
    // Without a header or footer the popup's own role="menu" is the exposed
    // semantics; a dialog around it would announce an extra container. With
    // either, the popover holds controls that are not menu items, so it is a
    // modal dialog named like the menu, with the menu inside it. A custom
    // trigger's name is read off the control once it mounts; until then, or
    // when the control exposes no readable name, the dialog takes the default
    // menu label, so it is never unnamed and never loses its role.
    role: hasRegions ? 'dialog' : 'none',
    dialogLabel: hasRegions
      ? (menuLabel ?? t(DEFAULT_BUTTON_I18N_KEY))
      : undefined,
  });

  const closeMenu = useCallback(() => {
    popover.hide();
  }, [popover]);

  // Single keyboard navigation path for both modes.
  // The selector matches plain items plus selectable items
  // (menuitemradio/menuitemcheckbox) so lab checkbox/radio rows are reachable
  // and roved to alongside plain items — not just role="menuitem".
  const {
    listRef,
    handleKeyDown: listNavKeyDown,
    focusFirst,
    focusLast,
    focusItem,
    ownsEvent,
    getItems: getMenuItems,
  } = useListFocus<HTMLDivElement>({
    itemSelector: MENU_ITEM_SELECTOR,
    boundarySelector: MENU_BOUNDARY_SELECTOR,
    // Menus wrap from the last row to the first and back, as macOS menus do;
    // a picker's list clamps instead.
    wrap: true,
    hasPaging: true,
    onEscape: closeMenu,
  });

  // Typeahead over the (enabled) menu items — jump to the next item whose
  // LABEL starts with the typed text, never its description, shortcut or
  // badge. Reuses the hook's scoped item collection so an inline submenu
  // flyout's items aren't swept in.
  const typeahead = useTypeahead({
    getItemLabels: () => getMenuItems().map(el => el.textContent),
    onMatch: focusItem,
    getCurrentIndex: () =>
      getMenuItems().findIndex(
        el =>
          el === document.activeElement || el.contains(document.activeElement),
      ),
  });

  // Mounting already open (`isMenuOpen` true on the first render) is not an
  // open anyone asked for, so it must not move focus into the menu — that
  // drops keyboard users mid-page (#5976). The flag is decided once at mount
  // rather than per effect run, because the layer may defer the first show
  // until its popover element mounts; it clears once the consumer closes the
  // menu, so every later open follows the modality rules above.
  const isMountedOpenRef = useRef(isControlled && controlledIsOpen === true);

  // Sync controlled open state → popover. A trigger open is committed first so
  // Popover can reject the dismissing gesture before notifying the controller.
  // If the controller has not accepted by the next layout pass, roll the DOM
  // state back before paint without emitting a second change request.
  useIsomorphicLayoutEffect(() => {
    if (!isControlled) {
      return;
    }
    if (controlledIsOpen) {
      pendingControlledOpenRef.current = false;
      if (!popover.isOpen) {
        shouldFocusOnOpenRef.current = !isMountedOpenRef.current;
        popover.show();
      }
    } else {
      isMountedOpenRef.current = false;
      if (popover.isOpen) {
        suppressControlledRollbackHideRef.current =
          pendingControlledOpenRef.current;
        pendingControlledOpenRef.current = false;
        popover.hide();
      }
    }
  }, [controlledIsOpen, isControlled, popover]);

  // Move focus into the menu only after the layer has committed open,
  // honoring the input modality: keyboard (and programmatic) opens land on
  // the first enabled item per the APG menu-button pattern; pointer opens
  // focus the menu container itself (tabIndex={-1}) so no item is
  // highlighted as if pre-selected (#4477). Container focus keeps arrows,
  // typeahead, Escape and Tab in the menu's onKeyDown, and is also the
  // fallback when no item is focusable (e.g. all disabled), mirroring the
  // submenu flyout fallback.
  useEffect(() => {
    if (!popover.isOpen || !shouldFocusOnOpenRef.current) {
      return;
    }
    shouldFocusOnOpenRef.current = false;
    requestAnimationFrame(() => {
      const focusEnd = focusLastOnOpenRef.current ? focusLast : focusFirst;
      focusLastOnOpenRef.current = false;
      if (openModalityRef.current === 'pointer' || !focusEnd()) {
        listRef.current?.focus();
      }
      openModalityRef.current = 'keyboard';
    });
  }, [popover.isOpen, focusFirst, focusLast, listRef]);

  // With a header or footer the popover is a modal dialog: Tab and Shift+Tab
  // walk the header's controls, the menu as one stop, then the footer's
  // controls, and wrap at either end. The key is handled here in full, so the
  // popover's own focus trap, which listens on the document, never reads it a
  // second time.
  const moveDialogTab = useCallback(
    (e: React.KeyboardEvent, isFromFlyout = false) => {
      moveRegionsTab(
        e,
        listRef.current,
        headerRef.current,
        footerRef.current,
        isFromFlyout,
      );
    },
    [listRef],
  );

  // Extend useListFocus with Enter/Space activation + typeahead
  const listKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // A submenu flyout renders inline inside this menu; its key events bubble
      // up here. Let that level own them — only handle events from this level.
      if (!ownsEvent(e)) {
        // Except Tab with a header or footer: each open flyout has closed
        // itself as the key bubbled up, and the root moves focus on as Tab
        // from one of its own rows would.
        if (e.key === 'Tab' && hasRegions) {
          moveDialogTab(e, true);
        }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // The key that opened the menu, held down, auto-repeats into the menu
        // once focus has moved there; a repeat is never an activation.
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
      // With a header or footer the popover is a dialog and Tab wraps inside
      // it. Without either, the APG menu-button pattern: Tab closes the menu.
      // Menu items are tabIndex={-1} so the focus trap has nothing trappable
      // and Tab would otherwise leak into the page while the menu stayed open
      // (menus-5). Do NOT preventDefault — closing restores focus to the
      // trigger, and the browser's default Tab then continues from there.
      if (e.key === 'Tab') {
        if (hasRegions) {
          moveDialogTab(e);
          return;
        }
        closeMenu();
        return;
      }
      // Type-to-focus next; if it consumed a printable key, stop here.
      if (typeahead.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
      listNavKeyDown(e);
    },
    [
      listNavKeyDown,
      closeMenu,
      typeahead,
      ownsEvent,
      hasRegions,
      moveDialogTab,
    ],
  );

  // Tab from a header or footer control moves through the same dialog cycle.
  const handleRegionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Tab') {
        moveDialogTab(e);
      }
    },
    [moveDialogTab],
  );

  const openAndFocus = useCallback(
    (
      modality: 'keyboard' | 'pointer' = 'keyboard',
      notifyClick = false,
    ): boolean => {
      // An unavailable trigger never opens the menu. Button keeps an
      // aria-disabled trigger focusable for its tooltip and swallows only
      // Enter and Space, so the arrow keys, a press and a click would still
      // arrive here; a custom trigger may be natively disabled instead.
      if (
        buttonRef.current?.matches(':disabled, [aria-disabled="true"]') === true
      ) {
        return false;
      }
      acceptedOpenRef.current = false;
      notifyClickOnShowRef.current = notifyClick;
      pendingControlledOpenRef.current = isControlled;
      openModalityRef.current = modality;
      shouldFocusOnOpenRef.current = true;
      popover.show();
      if (!acceptedOpenRef.current) {
        notifyClickOnShowRef.current = false;
        pendingControlledOpenRef.current = false;
        openModalityRef.current = 'keyboard';
        shouldFocusOnOpenRef.current = false;
        return false;
      }
      return true;
    },
    [isControlled, popover],
  );

  const isMenuOpenNow = isControlled
    ? controlledIsOpen === true
    : popover.isOpen;

  // A mouse opens on press-down; a finger held on the trigger opens after
  // the long-press delay. Pressing the trigger of an open menu closes it, and
  // the click of that same gesture — reported by `isTriggerClickFromPress` —
  // neither toggles nor reopens.
  const handleTriggerPress = useCallback(
    (pointerType: MenuPressPointerType): boolean => {
      if (isMenuOpenNow) {
        if (pointerType !== 'mouse') {
          // A finger's tap toggles through its click, as it always did.
          return false;
        }
        onClick?.();
        if (isControlled) {
          onOpenChange?.(false);
        } else {
          popover.hide();
        }
        return false;
      }
      // The press opens the menu before the browser's own mousedown has
      // focused the trigger (a held finger never does), so the popover would
      // remember whatever was focused BEFORE the press as the element to hand
      // focus back to when it closes. Focusing the trigger first gives the
      // popover the state a click-open already has: the trigger is where
      // Escape or a pick returns focus (the APG menu-button pattern).
      buttonRef.current?.focus({preventScroll: true});
      const didOpen = openAndFocus('pointer', true);
      if (didOpen) {
        // The menu is `popover="auto"`: the browser's light dismiss would
        // read the release of this very press, on the trigger outside the
        // popover, as a dismissal — a mouse's release, and as much a
        // finger's after the long-press delay opened the menu under it.
        // Holding the invoker relationship through the press exempts the
        // trigger, the way useKeepLayerOpenProps does for controls beside
        // an open layer.
        holdInvokerThroughPress(buttonRef.current, popover.id);
      }
      return didOpen;
    },
    [isMenuOpenNow, isControlled, onClick, onOpenChange, openAndFocus, popover],
  );

  // The press model: the row under a release acts, the highlight follows a
  // held pointer. A mouse released outside the menu dismisses it; a finger
  // released outside leaves it open, so the hook never calls onDismiss then.
  const menuPress = useMenuPress({
    menuRef: listRef,
    triggerRef: buttonRef,
    itemSelector: MENU_ITEM_SELECTOR,
    onTriggerPress: handleTriggerPress,
    onDismiss: closeMenu,
  });
  cancelMenuPressRef.current = menuPress.cancel;

  const handleButtonClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      // The press already opened or closed the menu; its click is spent.
      if (menuPress.isTriggerClickFromPress()) {
        return;
      }
      // detail === 0 marks a synthesized click (screen reader / AT
      // activation): treat it as keyboard so those users still land on the
      // first item. Real pointer clicks report detail >= 1.
      const modality = e.detail === 0 ? 'keyboard' : 'pointer';
      if (isControlled) {
        if (controlledIsOpen) {
          onClick?.();
          onOpenChange?.(false);
        } else {
          openAndFocus(modality, true);
        }
      } else if (popover.isOpen) {
        onClick?.();
        popover.hide();
      } else {
        openAndFocus(modality, true);
      }
    },
    [
      menuPress,
      onClick,
      isControlled,
      onOpenChange,
      controlledIsOpen,
      popover,
      openAndFocus,
    ],
  );

  const handleTriggerClickCapture = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const control = e.currentTarget;
      if (control.hasAttribute('popovertarget')) {
        // Still the invoker from a press-open: the browser would toggle the
        // menu shut on this click.
        e.preventDefault();
        control.removeAttribute('popovertarget');
      }
    },
    [],
  );

  const handleButtonKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!popover.isOpen) {
        if (
          e.key === 'ArrowDown' ||
          e.key === 'ArrowUp' ||
          e.key === 'Enter' ||
          e.key === ' '
        ) {
          e.preventDefault();
          if (e.repeat) {
            return;
          }
          focusLastOnOpenRef.current = e.key === 'ArrowUp';
          if (!openAndFocus()) {
            // A refused open (disabled trigger) must not leave ArrowUp's
            // "land on the last row" armed for a later open.
            focusLastOnOpenRef.current = false;
          }
        }
        return;
      }
      // Open with focus still on the trigger — a menu that mounted open, or
      // a pointer open followed by Shift+Tab — has nothing in the tab order
      // to reach its items, so ArrowDown walks in the way a keyboard open
      // would land (#5976). Enter/Space keep toggling the menu closed, and
      // once focus is inside, key events go to the menu container instead.
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!focusFirst()) {
          listRef.current?.focus();
        }
      }
    },
    [popover.isOpen, openAndFocus, focusFirst, listRef],
  );

  // Icon-only
  const isIconOnly = button.isIconOnly === true;
  const resolvedEndContent =
    button.endContent ??
    (hasChevron && !isIconOnly ? (
      <Icon icon="chevronDown" size="sm" color="inherit" />
    ) : undefined);

  // An explicit menuWidth is clamped to the viewport, never to the room
  // beside the trigger (spec:AST-059 FR2, FR7).
  const resolvedMenuWidth = menuWidth
    ? resolveMenuWidth(menuWidth, layerViewportInset.maxInlineSizeFallback)
    : null;
  const popoverXstyle = resolvedMenuWidth
    ? resolvedMenuWidth.property === 'inlineSize'
      ? styles.popoverCustomIntrinsicWidth(resolvedMenuWidth.value)
      : styles.popoverCustomWidth(resolvedMenuWidth.value)
    : styles.popoverMatchTrigger;

  // The drill-in view stack for sub-menus on a phone.
  const {drillIn, wrapContent} = useMenuDrillIn(isOpen);
  // The surface host is owned through a ref. State keeps only a key that
  // changes whenever a host element attaches, the host included when it
  // moves (a header or footer coming or going), so sub-menus re-render into
  // the element that is mounted.
  const surfaceHostRef = useRef<HTMLDivElement | null>(null);
  const [surfaceHostKey, setSurfaceHostKey] = useState(0);
  const attachSurfaceHost = useCallback((node: HTMLDivElement | null) => {
    surfaceHostRef.current = node;
    if (node != null) {
      setSurfaceHostKey(key => key + 1);
    }
  }, []);
  const surfaceHost = useMemo<DropdownMenuSurfaceHost>(
    () => ({
      getElement: () => (surfaceHostKey > 0 ? surfaceHostRef.current : null),
    }),
    [surfaceHostKey],
  );
  const resolvedMaxHeight = menuMaxHeight == null ? null : `${menuMaxHeight}px`;
  // Context for compound items
  const contextValue = useMemo<DropdownMenuContextValue>(
    () => ({closeMenu, menuSize, drillIn, menuLabel}),
    [closeMenu, menuSize, drillIn, menuLabel],
  );
  // What a sub-menu with a header or footer needs, on an internal context.
  const surfaceValue = useMemo<DropdownMenuSurfaceValue>(
    () => ({
      host: surfaceHost,
      ownerId: menuId,
      menuMaxHeight: resolvedMaxHeight ?? undefined,
    }),
    [surfaceHost, menuId, resolvedMaxHeight],
  );

  // Resolve menu content: data-driven items become components
  const menuContent = wrapContent(
    props.items !== undefined ? renderDropdownItems(items) : children,
  );
  const hasOverflow = useMenuOverflow(listRef, menuContent, popover.isOpen);

  // The header and footer sit beside the menu inside the popover, never inside
  // the role="menu" element: a menu holds only its rows. The surface host
  // follows the menu, so a sub-menu with a header or footer renders beside the
  // menu too; while such a sub-menu's drilled-in view shows there, the menu and
  // the regions step aside (STEPS_ASIDE_FOR_VIEW).
  const surfaceHostElement = (
    <div
      ref={attachSurfaceHost}
      data-astryx-submenu-host=""
      {...stylex.props(styles.surfaceHost)}
    />
  );
  const renderWithRegions = (menu: ReactNode): ReactNode =>
    hasRegions ? (
      <div
        {...stylex.props(
          styles.regionsFrame,
          resolvedMaxHeight != null &&
            dynamicStyles.menuMaxHeight(resolvedMaxHeight),
        )}>
        {isRenderable(header) && (
          <div
            ref={headerRef}
            onKeyDown={handleRegionKeyDown}
            {...stylex.props(styles.region, styles.stepsAsideForView)}>
            {header}
          </div>
        )}
        {menu}
        {isRenderable(footer) && (
          <div
            ref={footerRef}
            onKeyDown={handleRegionKeyDown}
            {...stylex.props(styles.region, styles.stepsAsideForView)}>
            {footer}
          </div>
        )}
        {surfaceHostElement}
      </div>
    ) : (
      <>
        {menu}
        {surfaceHostElement}
      </>
    );

  const triggerProps: DropdownMenuTriggerProps = {
    ref: el => {
      buttonRef.current = el;
      popover.triggerRef(el);
    },
    id: triggerId,
    onClick: handleButtonClick,
    onClickCapture: handleTriggerClickCapture,
    onPointerDown: menuPress.triggerProps.onPointerDown,
    onContextMenu: menuPress.triggerProps.onContextMenu,
    onKeyDown: handleButtonKeyDown,
    // The caller's control paints its own ring, and the menu's focus return
    // keeps the browser from drawing one after pointer input (see
    // handleLayerHide), so its focus needs no bookkeeping here.
    onFocus: () => {},
    'aria-haspopup': hasRegions ? 'dialog' : 'menu',
    'aria-expanded': isOpen,
    'aria-controls': hasRegions ? popover.id : menuId,
  };

  return (
    <>
      {renderTrigger != null ? (
        renderTrigger(triggerProps)
      ) : (
        <Button
          {...button}
          ref={el => {
            buttonRef.current = el;
            popover.triggerRef(el);
            const consumerRef = button.ref;
            if (typeof consumerRef === 'function') {
              consumerRef(el);
            } else if (consumerRef) {
              /* eslint-disable react-compiler/react-compiler -- ref callback: forwarding consumer ref object */
              consumerRef.current = el;
              /* eslint-enable react-compiler/react-compiler */
            }
          }}
          xstyle={[
            styles.triggerPressable,
            isOpen && styles.triggerOpen,
            button.xstyle,
            isFocusRingSuppressed && focusOutlineStyles.suppressed,
          ]}
          tooltip={isOpen ? undefined : button.tooltip}
          endContent={resolvedEndContent}
          onClick={handleButtonClick}
          onClickCapture={event => {
            button.onClickCapture?.(event);
            handleTriggerClickCapture(event);
          }}
          onKeyDown={handleButtonKeyDown}
          onPointerDown={event => {
            button.onPointerDown?.(event);
            menuPress.triggerProps.onPointerDown(event);
          }}
          onContextMenu={event => {
            button.onContextMenu?.(event);
            menuPress.triggerProps.onContextMenu(event);
          }}
          onFocus={event => {
            button.onFocus?.(event);
            onFocusReturnTargetFocus();
          }}
          aria-haspopup={hasRegions ? 'dialog' : 'menu'}
          aria-expanded={isOpen}
          aria-controls={hasRegions ? popover.id : menuId}
          data-testid={testId}
        />
      )}
      {popover.render(
        renderWithRegions(
          <div
            {...rest}
            ref={el => {
              listRef.current = el;
              contentRef.current =
                el?.closest<HTMLDivElement>('[popover]') ?? null;
            }}
            id={menuId}
            role="menu"
            // Pointer opens focus the container so arrows, typeahead, Escape and
            // Tab remain owned by the menu without pre-highlighting an item.
            // An overflowing menu joins the Tab order so its scrollable region is
            // keyboard-accessible; Tab still dismisses through listKeyDown. With
            // a header or footer the menu is one Tab stop between them.
            tabIndex={hasOverflow || hasRegions ? 0 : -1}
            // Give the menu an accessible name from its trigger's label, so
            // screen readers announce e.g. "Actions menu" rather than an unnamed
            // menu (menus-13). A custom trigger names it by reference.
            aria-label={
              renderTrigger != null
                ? (rest['aria-label'] as string | undefined)
                : button.label
            }
            aria-labelledby={
              renderTrigger != null && rest['aria-label'] == null
                ? triggerId
                : (rest['aria-labelledby'] as string | undefined)
            }
            onKeyDown={listKeyDown}
            onFocus={event => {
              (
                rest.onFocus as
                  React.FocusEventHandler<HTMLDivElement> | undefined
              )?.(event);
              if (event.target === event.currentTarget) {
                setIsMenuKeyboardFocused(
                  getInteractionModality() === 'keyboard',
                );
              }
            }}
            {...menuPress.menuProps}
            {...mergeProps(
              themeProps('dropdown-menu'),
              stylex.props(
                styles.dropdown,
                resolvedMaxHeight != null &&
                  dynamicStyles.menuMaxHeight(resolvedMaxHeight),
                hasOverflow ? styles.touchPanYPinchZoom : styles.touchPinchZoom,
                hasOverflow && styles.scrollable,
                hasRegions && styles.menuInFrame,
                // Between a header and a footer the menu is a Tab stop, so
                // keyboard focus on it must be visible (the base style removes
                // the ring for the pointer-open focus target).
                hasRegions &&
                  isMenuKeyboardFocused &&
                  focusOutlineStyles.focusVisible,
                xstyle,
              ),
              className,
              style,
            )}>
            <MenuRegionsContext value={hasRegions}>
              <DropdownMenuContext value={contextValue}>
                <DropdownMenuSurfaceContext value={surfaceValue}>
                  <DropdownMenuRootOpenContext value={isOpen}>
                    {menuContent}
                  </DropdownMenuRootOpenContext>
                </DropdownMenuSurfaceContext>
              </DropdownMenuContext>
            </MenuRegionsContext>
          </div>,
        ),
        {
          placement,
          alignment,
          offset: spacingVars['--spacing-1'],
          xstyle: [
            styles.popoverViewport,
            resolvedMaxHeight != null &&
              dynamicStyles.popoverViewportMaxBlockSize(resolvedMaxHeight),
            popoverXstyle,
            layerAnimations[placement],
          ],
        },
      )}
    </>
  );
}

export function DropdownMenu(props: DropdownMenuProps) {
  const {onOpenChange} = props;
  // Both presentations hang the menu off ONE control.
  useDevWarning(
    'DropdownMenu',
    '`button` and `trigger` are mutually exclusive: the menu hangs off one ' +
      'control. `trigger` wins; drop `button`.',
    props.button != null && props.renderTrigger != null,
  );
  const requestedPresentation =
    'items' in props ? (props.presentation ?? 'popover') : 'popover';
  const resolvedPresentation = useAdaptivePresentation(requestedPresentation);
  const isControlled = props.isMenuOpen !== undefined;
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = isControlled ? props.isMenuOpen : internalIsOpen;
  const handleOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      onOpenChange?.(nextIsOpen);
      if (!isControlled) {
        setInternalIsOpen(nextIsOpen);
      }
    },
    [isControlled, onOpenChange],
  );
  const sharedProps = {
    ...props,
    isMenuOpen: isOpen,
    onOpenChange: handleOpenChange,
  };

  if (
    resolvedPresentation === 'bottom-sheet' &&
    'items' in props &&
    props.items !== undefined
  ) {
    return (
      <DropdownMenuBottomSheet
        {...(sharedProps as DropdownMenuDataProps)}
        presentation="bottom-sheet"
      />
    );
  }

  return <DropdownMenuPopover {...sharedProps} presentation="popover" />;
}

DropdownMenu.displayName = 'DropdownMenu';
