// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePopover.tsx
 * @input Uses useLayer, useFocusTrap, useAnnounce, React hooks, and Layer's
 *   outside watches (outsidePanClaim)
 * @output Exports the public usePopover hook with derived focus, guarded opening
 *   and an optional anchor apart from the trigger.
 *   For Core's own components (internal), exports usePopoverInternal and
 *   FALLBACK_CLOSE_SELECTOR.
 * @position Higher-level layer utility; used by DatePicker, Combobox, etc.
 *
 * Combines popover layer behavior with focus trap for dialog-like popovers.
 * Use this for interactive popover content that should trap focus.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Popover/index.ts
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useLayerInternal, type ContextRenderProps} from '../Layer/useLayer';
import {watchOutsidePans, watchOutsidePresses} from '../Layer/outsidePanClaim';
import {currentInputTarget} from '../Layer/gestureCounter';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {resolvePopoverAnchor} from './popoverAnchor';
import {useAnnounce} from '../hooks/useAnnounce';
import {containsAlongFlatTree, deepActiveElement} from '../utils/flatTree';
import {useFocusTrapInternal} from '../hooks/useFocusTrap';
import {useCommittedRef, useCommittedRefInto} from '../hooks/useCommittedRef';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {isElement, isHTMLElement} from '../utils/nodeType';
import {focusableWithin, takesFocusAsIs} from '../utils/focusReturn';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  shadowVars,
} from '../theme/tokens.stylex';
import {Button} from '../Button';
import {
  FOCUSABLE_SELECTOR,
  isDisabledWithin,
  preferTabStops,
} from '../hooks/focusableSelector';
import {rtlStyles} from '../utils';
import {useDevWarning} from '../hooks/useDevWarning';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {mergeProps} from '../utils/mergeProps';
import {isFocusDetached} from '../utils/isFocusDetached';
import {themeProps} from '../utils/themeProps';
import {paddingStyles} from '../Layout/paddingStyles.stylex';
import type {SpacingStep} from '../utils/types';
import {stableClassName} from '../naming';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Popover/usePopover.generated';

registerEnglishFallback(english);

// Bundlers replace this value at build time. The declaration lets a product
// without Node's types type-check this file.
declare const process: {readonly env: {readonly NODE_ENV?: string}};

/**
 * The fallback close button's wrapper (anchored layer) or button (sheet,
 * Popover.tsx); initial focus skips it.
 */
export const FALLBACK_CLOSE_SELECTOR = '[data-astryx-popover-fallback-close]';

function attemptFocus(element: HTMLElement): boolean {
  try {
    element.focus();
  } catch {
    // Ignore non-focusable elements; the caller will try the next target.
  }
  // The element's own document: a popover rendered into a second document
  // (an iframe, a Picture-in-Picture window) never moves this one's focus.
  return element.ownerDocument.activeElement === element;
}

function focusFirstContentControl(container: HTMLElement): boolean {
  const focusable = preferTabStops(
    Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(
      element =>
        element.closest(FALLBACK_CLOSE_SELECTOR) == null &&
        !isDisabledWithin(element, container),
    ),
  );
  for (const element of focusable) {
    if (attemptFocus(element)) {
      return true;
    }
  }
  return false;
}

const styles = stylex.create({
  // Default popover surface — background, radius, shadow.
  // Applied automatically unless hasSurface is false.
  // Consumers that need a raw positioned layer should use useLayer instead.
  surface: {
    backgroundColor: colorVars['--color-background-popover'],
    '--_popover-radius': radiusVars['--radius-container'],
    borderRadius: 'var(--_popover-radius)',
    boxShadow: shadowVars['--shadow-low'],
    // Forced colors removes box-shadow, which is this surface's only edge.
    borderWidth: {
      default: null,
      '@media (forced-colors: active)': '1px',
    },
    borderStyle: {
      default: null,
      '@media (forced-colors: active)': 'solid',
    },
    borderColor: {
      default: null,
      '@media (forced-colors: active)': 'CanvasText',
    },
  },
  // An open popover whose separate anchor resolves to nothing shows no
  // surface until it does: an unanchored layer would sit at the page origin.
  unanchored: {
    visibility: 'hidden',
  },
  // Focus trap container. Shared :focus-visible styling keeps semantic focus
  // placement independent of pointer/keyboard indication.
  contentWrapper: {
    position: 'relative',
  },
  // Hidden close button wrapper - sr-only until focused, then positioned below
  // popover. Inline-axis centering (+ the translateY(100%) that drops it below
  // the surface) comes from rtlStyles.centerInline('100%') at the call site —
  // it centers correctly in both LTR and RTL.
  closeButtonWrapper: {
    position: 'absolute',
    bottom: 0,
    zIndex: 1,
    // sr-only by default
    width: {
      default: 1,
      ':focus-within': 'auto',
    },
    height: {
      default: 1,
      ':focus-within': 'auto',
    },
    overflow: {
      default: 'hidden',
      ':focus-within': 'visible',
    },
    clipPath: {
      default: 'inset(50%)',
      ':focus-within': 'none',
    },
    pointerEvents: {
      default: 'none',
      ':focus-within': 'auto',
    },
    paddingBlockStart: {
      default: 0,
      ':focus-within': spacingVars['--spacing-1'],
    },
  },
});

/**
 * Options for usePopover
 */
export interface UsePopoverOptions {
  /**
   * External ref to use as the popover anchor. When provided, the popover
   * sits on this element instead of the trigger. The trigger keeps its toggle
   * and ARIA attributes; the anchor gets neither, and it is never a trigger.
   *
   * Any element with a CSS box works (an HTML element or an `<svg>` element;
   * a shape inside an `<svg>` warns in development). The ref is read when the
   * popover opens, on each render of the component that calls `usePopover`,
   * and on each `show()`; nothing watches the page. To move an open popover,
   * set `anchorRef.current` and call `show()`. A `show()` while the ref holds
   * no element in the document waits, and opens when the ref is next read and
   * holds one. An open popover whose anchor is missing shows no surface.
   */
  anchorRef?: React.RefObject<Element | null>;

  /**
   * Callback fired when popover is shown.
   * Wrap in useCallback for stable identity.
   */
  onShow?: () => void;

  /**
   * Callback fired when popover is hidden. Focus returns on its own as the
   * popover closes; focus another element here to send focus there instead.
   * Wrap in useCallback for stable identity.
   */
  onHide?: () => void;

  /**
   * StyleX styles applied to the popover's content wrapper.
   * Merges after the surface styles (when hasSurface is true), so these
   * can override background, radius, etc.
   *
   * For styles on the layer's positioned element (e.g., animations using
   * `:popover-open`), pass `xstyle` via the `render()` call's props instead.
   */
  xstyle?: StyleXStyles;

  /**
   * Additional class name applied to the painted popover surface.
   */
  className?: string;

  /**
   * Inline styles applied to the painted popover surface.
   */
  style?: React.CSSProperties;

  /**
   * Whether clicking outside should dismiss the popover.
   * @default true
   */
  hasLightDismiss?: boolean;

  /**
   * Whether pressing Escape dismisses the popover.
   *
   * Takes effect together with `hasLightDismiss: false`: with light dismiss
   * on, the native popover uses `popover="auto"`, whose browser-level light
   * dismiss also closes on Escape, so Escape handling stays registered to
   * keep topmost-only dismissal intact. Set both to `false` for
   * explicit-dismiss-only surfaces like onboarding coachmarks. A popover
   * with `tabBehavior: 'pageOrder'` is not an auto popover, so `false` turns
   * its Escape off whatever `hasLightDismiss` says.
   *
   * @default true
   */
  hasEscapeDismiss?: boolean;

  /**
   * Whether to automatically focus the first focusable element when opened.
   * @default true
   */
  hasAutoFocus?: boolean;

  /**
   * Whether to include a hidden close button for accessibility.
   * The button appears when keyboard users tab past the last element.
   * @default true
   */
  hasCloseButton?: boolean;

  /**
   * Label for the hidden close button.
   * @default "Close popover"
   */
  closeButtonLabel?: string;

  /**
   * Accessible label for the dialog.
   * Required for screen readers to announce the dialog purpose
   * (only applies when `role` is `'dialog'`).
   */
  dialogLabel?: string;

  /**
   * ARIA role stamped on the popover content wrapper.
   *
   * - `'dialog'` (default): the wrapper is a `role="dialog"` and, when
   *   `isModal` is true, carries `aria-modal`. Use for genuine dialog content.
   * - `'none'`: the wrapper carries no role or `aria-modal`, so the popup's own
   *   content role (e.g. a child `role="listbox"` or `role="menu"`) is the
   *   exposed semantics. Use for comboboxes, listboxes, and menus — their
   *   trigger keeps DOM focus, so announcing an unnamed modal dialog around
   *   them is incorrect.
   *
   * @default 'dialog'
   */
  role?: 'dialog' | 'none';

  /**
   * Whether the dialog is modal (`aria-modal`). Only applies when `role` is
   * `'dialog'`. Set to `false` for a dialog that leaves the rest of the page
   * usable. Tab stays inside the popover either way: `tabBehavior` decides
   * that. A popover with `tabBehavior: 'pageOrder'` is never modal.
   *
   * @default true
   */
  isModal?: boolean;

  /**
   * Where Tab and Shift+Tab go while the popover is open.
   *
   * - `'contain'`: they cycle inside the popover.
   * - `'pageOrder'`: the popover holds nothing. Tab moves in the page's
   *   order. Where the browser supports popover invokers, the popover takes
   *   its place after its trigger, or after an anchor that can take focus
   *   when there is no trigger. When another layer opened from the same
   *   trigger or anchor closes (a menu, a hover card), the popover leaves
   *   the Tab order until it opens again. Escape closes it only while focus
   *   is inside
   *   it, or on or inside its anchor or trigger, and it never carries
   *   `aria-modal`.
   *   Use it for a coachmark or a tour step, whose reader must reach the
   *   control it describes.
   *
   * A Tab pressed outside the popover is never pulled into it. Set
   * `tabBehavior` before the popover opens: a change while it is open is not
   * supported.
   *
   * @default 'contain'
   */
  tabBehavior?: 'contain' | 'pageOrder';

  /**
   * Whether to apply the default popover surface (background, border-radius,
   * box-shadow) to the content wrapper.
   *
   * Set to false when the popover content provides its own surface styling
   * (e.g., mega menus with custom layouts). If you find yourself opting out,
   * consider whether useLayer is a better fit.
   *
   * @default true
   */
  hasSurface?: boolean;

  /**
   * Inner padding of the painted surface, using the spacing scale.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * `0` paints a flush surface for content that owns its own edges (a list of
   * rows, a header with a rule). Matches the `padding` prop on `Card`,
   * `Stack` and `Popover`.
   *
   * Applied to the surface itself — the box that paints background, radius
   * and elevation — so a theme's `padding` on the `popover` target replaces
   * it instead of nesting inside it. `xstyle` merges after it.
   *
   * Omit it and the surface paints no padding of its own (the hook's
   * historical behavior; `Popover` passes its own default).
   */
  padding?: SpacingStep;

  /**
   * Theme-target name stamped on the popup SURFACE — the element that paints
   * the background, radius and elevation — without the `astryx-` prefix
   * (e.g. `'complex-selector-popup'`).
   *
   * The surface is created here, not by the calling component, so a component
   * that wants its popup themeable cannot reach it on its own: a target it
   * renders itself lands on its content INSIDE the surface, where a background
   * or radius rule paints the wrong box. Name the surface through this option
   * and document the class in the component's `theming.targets`.
   *
   * The canonical `astryx-popover` target is always present alongside any
   * component-owned refinement target.
   */
  surfaceTarget?: string;
}

/**
 * Return type for usePopover
 */
export interface UsePopoverReturn {
  /**
   * Ref callback to attach to the trigger element.
   * Sets up CSS anchor positioning.
   */
  triggerRef: (el: HTMLElement | null) => void;

  /**
   * Ref for the popover content container (used internally for focus trapping).
   * You typically don't need to use this directly - the render function
   * automatically wraps content in a focus trap container.
   */
  contentRef: React.RefObject<HTMLDivElement | null>;

  /**
   * The CSS anchor name to use for positioning.
   * Use when you need to set anchorName manually (e.g., display:contents wrapper).
   * Set it only while the layer is shown or its exit animation runs.
   */
  anchorId: string;

  /**
   * Show the popover.
   * @param options.skipAutoFocus - If true, don't auto-focus the first element.
   *   Useful when triggered by mouse click on an input that should retain focus.
   */
  show: (options?: {skipAutoFocus?: boolean}) => void;

  /**
   * Hide the popover
   */
  hide: () => void;

  /**
   * Toggle the popover open/closed
   */
  toggle: () => void;

  /**
   * Whether the popover is currently open
   */
  isOpen: boolean;

  /**
   * Unique ID for aria-describedby or aria-controls
   */
  id: string;

  /**
   * Render function for popover content.
   * Automatically wraps content in a focus trap container with a hidden close button.
   *
   * @example
   * ```
   * {popover.render(
   *   <Calendar />,
   *   { placement: 'below', alignment: 'start' }
   * )}
   * ```
   */
  render: (children: ReactNode, props?: ContextRenderProps) => ReactNode;

  /**
   * ARIA attributes to spread on the trigger element
   */
  triggerProps: {
    'aria-haspopup': 'dialog' | 'true';
    'aria-expanded': boolean;
    'aria-controls': string;
  };
}

/**
 * Options a core component may pass through `usePopoverInternal`; not part
 * of the public `usePopover` options.
 */
export interface InternalPopoverOptions extends UsePopoverOptions {
  /**
   * Runs as the popover starts to close, while the browser still shows it.
   * A close that plays out after the popover is hidden starts here.
   */
  onCloseStart?: () => void;
  /**
   * Where focus returns on close when the element focused at open is gone.
   */
  getRestoreFallback?: () => HTMLElement | null;
  /**
   * Moves focus to the element the close restores to, in place of
   * `element.focus()` (useFocusTrap's `restoreFocusTo`).
   */
  restoreFocusTo?: (element: HTMLElement) => void;
  /**
   * The opener focus returns to, read when `show` runs. Null or absent: the
   * element focused then. For a caller whose open runs after the event that
   * asked for it, when focus may already have moved.
   */
  getOpener?: () => HTMLElement | null;
  /**
   * useLayer's `onOpenPendingChange`: true when a `show()` that the layer
   * accepted starts to wait for a valid anchor, false when that wait ends.
   */
  onOpenPendingChange?: (isPending: boolean) => void;
  /**
   * The owner decides what a touch outside that pans does to the popover.
   * Otherwise a light-dismiss popover keeps such a pan from dismissing it
   * (useLayer's `watchesOutside`).
   */
  ownsOutsidePan?: boolean;
  /**
   * The component writes the entrance's side itself, after the commit that
   * moves the popover (`useLayerInternal`'s `writesEntranceSide`).
   */
  writesEntranceSide?: boolean;
  /** Called after a scroll stop places the popover afresh (`useLayerInternal`'s `onPlacedAfresh`). */
  onPlacedAfresh?: () => void;
  /**
   * Attributes for the surface element, for a component whose surface is
   * its own root: a role with a name that its content gives, and the
   * component's host attributes. `className` and `style` here are dropped;
   * pass them as the options of those names.
   */
  surfaceProps?: React.HTMLAttributes<HTMLDivElement>;
  /** The component's own ref to the surface element. */
  surfaceRef?: React.Ref<HTMLDivElement>;
}

/**
 * Hook for creating popover dialogs with focus trapping.
 *
 * Combines:
 * - `useLayer` for popover positioning using CSS anchor positioning
 * - `useFocusTrap` for trapping focus within the popover content
 * - Auto-focus first element on open
 * - Escape key to close (configurable via hasEscapeDismiss)
 * - Hidden close button that reveals on focus for accessibility
 *
 * The render function automatically wraps your content in a focus trap container
 * and appends a hidden close button. The button appears at the end of the popover,
 * is visually hidden until focused, then shows a tooltip-like message (default: "Close popover").
 *
 * @example
 * ```
 * function DatePickerExample() {
 *   const inputRef = useRef<HTMLInputElement>(null);
 *   const popover = usePopover({
 *     onHide: () => inputRef.current?.focus(),
 *     closeButtonLabel: 'Close calendar',
 *   });
 *   return (
 *     <>
 *       <input ref={inputRef} />
 *       <button
 *         ref={popover.triggerRef}
 *         onClick={popover.toggle}
 *         {...popover.triggerProps}>
 *         Open Calendar
 *       </button>
 *       {popover.render(
 *         <Calendar />,
 *         { placement: 'below', alignment: 'start' }
 *       )}
 *     </>
 *   );
 * }
 * ```
 */
function usePopoverImplementation(
  options: InternalPopoverOptions = {},
): UsePopoverInternalReturn {
  const {
    anchorRef,
    onShow,
    onHide,
    onCloseStart,
    writesEntranceSide,
    onPlacedAfresh,
    xstyle,
    className,
    style,
    hasLightDismiss = true,
    hasEscapeDismiss = true,
    hasAutoFocus = true,
    hasSurface = true,
    padding,
    surfaceTarget,
    hasCloseButton = true,
    closeButtonLabel: closeButtonLabelFromProps,
    dialogLabel,
    role = 'dialog',
    isModal: isModalOption,
    tabBehavior = 'contain',
    getRestoreFallback,
    restoreFocusTo,
    getOpener,
    ownsOutsidePan = false,
    onOpenPendingChange,
    surfaceProps: hostSurfaceProps,
    surfaceRef,
  } = options;

  // A popover that Tab passes through is never modal.
  const passesTab = tabBehavior === 'pageOrder';
  const isModal = !passesTab && (isModalOption ?? true);
  useDevWarning(
    'usePopover',
    process.env.NODE_ENV === 'production'
      ? ''
      : "`isModal: true` is ignored with `tabBehavior: 'pageOrder'`.",
    passesTab && isModalOption === true,
  );

  const t = useComponentTranslator();
  const closeButtonLabel =
    closeButtonLabelFromProps ?? t('@astryx.popover.close');

  // Track the trigger element for returning focus
  const triggerElementRef = useRef<HTMLElement | null>(null);
  // The caller's `anchorRef`, and the element bound as the anchor: `null`
  // while the ref holds none, `undefined` while the trigger is the anchor.
  const anchorOptionRef = useCommittedRef(anchorRef);
  const boundAnchorRef = useRef<Element | null | undefined>(undefined);

  // Track whether to skip auto-focus for the current open event
  const skipAutoFocusRef = useRef(false);
  // Whether `show` focused a content control within the opening event.
  const hasFocusedInGestureRef = useRef(false);

  // Set when the layer reports it has shown, so `show` can tell a popover
  // that opened within the call from one whose content mounts later.
  const hasShownRef = useRef(false);
  // Initial focus for the show in progress. It runs when the layer reports
  // the show: within `show` when the layer opens at once, or inside the
  // release's click when the layer holds the show for a press's release.
  // Either way the focus lands within the event that opened the popover.
  const focusOnShowRef = useRef<(() => void) | null>(null);
  const handleLayerShow = useCallback(() => {
    hasShownRef.current = true;
    onShow?.();
    const focusOnShow = focusOnShowRef.current;
    focusOnShowRef.current = null;
    focusOnShow?.();
  }, [onShow]);

  // Filled in once the content ref exists; runs when the surface hides because
  // its anchor is missing.
  const anchorMissingRef = useRef<(() => void) | null>(null);
  // Read at press time: with light dismiss off, no press closes the popover.
  const hasLightDismissRef = useCommittedRef(hasLightDismiss);
  // Closes a `'pageOrder'` popover for a press outside it.
  const watchPresses = useCallback(
    (layerElement: HTMLElement, dismiss: () => void) =>
      watchOutsidePresses(
        layerElement,
        triggerElementRef,
        hasLightDismissRef,
        dismiss,
      ),
    [hasLightDismissRef],
  );
  // A `'pageOrder'` popover takes Escape only while it holds focus: inside
  // it, or on the anchor or trigger it belongs to. Read at press time.
  const isFocusInScope = useCallback((surface: Element | null): boolean => {
    // The focused element may be inside a shadow root, or the surface may
    // be in one and its trigger outside.
    const active = deepActiveElement(surface?.ownerDocument ?? document);
    return (
      active != null &&
      [surface, boundAnchorRef.current, triggerElementRef.current].some(
        scope => scope != null && containsAlongFlatTree(scope, active),
      )
    );
  }, []);

  // Focus returns as the popover starts to close, while it still holds focus.
  // The browser restores focus only for an auto popover whose opener is still
  // there, and then with a focus ring whatever the last input was. The trap
  // below supplies the return. It is read through a ref because the layer
  // exists first.
  const returnFocusRef = useRef<() => void>(() => {});
  const onCloseStartRef = useCommittedRef(onCloseStart);
  const handleCloseStart = useCallback(() => {
    returnFocusRef.current();
    onCloseStartRef.current?.();
  }, [onCloseStartRef]);
  // A `'pageOrder'` popover follows its trigger in the focus order. With no
  // trigger it follows an anchor that takes focus. Otherwise it keeps its DOM
  // place. A trigger that wraps its control passes the control: browsers
  // place the popover before a control inside the invoker.
  const getInvoker = useCallback((): HTMLElement | null => {
    const trigger = triggerElementRef.current;
    if (trigger != null) {
      return focusableWithin(trigger) ?? trigger;
    }
    // Read from the caller's ref, not from the last bind: a layer element
    // that mounts again while open shows before this commit binds the anchor.
    const anchorElement = anchorOptionRef.current?.current;
    return isHTMLElement(anchorElement) &&
      anchorElement.isConnected &&
      anchorElement.tabIndex >= 0
      ? anchorElement
      : null;
  }, [anchorOptionRef]);
  const announcesOpenRef = useRef(false);
  const layer = useLayerInternal({
    mode: 'context',
    // A `'pageOrder'` popover takes Escape only within its scope, and the
    // browser's auto light dismiss closes on any Escape. So it is a manual
    // popover, and a watch closes it for a press outside.
    lightDismiss: hasLightDismiss && !passesTab,
    onShow: handleLayerShow,
    onHide,
    onCloseStart: handleCloseStart,
    watchesOutside: passesTab
      ? watchPresses
      : hasLightDismiss && !ownsOutsidePan
        ? watchOutsidePans
        : undefined,
    writesEntranceSide,
    onPlacedAfresh,
    onOpenPendingChange,
    waitsForAnchor: anchorRef != null,
    getInvoker: passesTab ? getInvoker : undefined,
  });

  // Focus trap for the popover content. A `'contain'` popover keeps Escape
  // registered while light dismiss is on, because native popover="auto"
  // closes on Escape regardless. A host Dialog then defers to this trap and
  // does not dismiss too.
  // The element focused when `show` ran: initial focus may move inside before
  // the trap activates, so the trap restores focus here instead.
  const openerRef = useRef<HTMLElement | null>(null);
  const getOpenerRef = useRef(getOpener);
  getOpenerRef.current = getOpener;
  const getRestoreTarget = useCallback(() => openerRef.current, []);
  const {
    containerRef: contentRef,
    focusFirst,
    returnFocus,
    moveFocusOut,
  } = useFocusTrapInternal<HTMLDivElement>({
    isActive: layer.isOpen,
    onEscape:
      hasEscapeDismiss || (hasLightDismiss && !passesTab)
        ? layer.hide
        : undefined,
    getRestoreTarget,
    getRestoreFallback,
    restoreFocusTo,
    getTrigger: () => triggerElementRef.current,
    getAnchor: () => boundAnchorRef.current ?? null,
    layerId: layer.id,
    isContaining: !passesTab,
    isEscapeInScope: passesTab ? isFocusInScope : undefined,
  });
  useCommittedRefInto(returnFocusRef, returnFocus);

  const focusInitialTarget = useCallback(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }
    // Focus already on a control inside (set in `onShow`, or a press in the
    // content) is where the user or the caller wants it; moving it would
    // undo that.
    const active = container.ownerDocument.activeElement;
    if (active != null && active !== container && container.contains(active)) {
      return;
    }
    if (focusFirstContentControl(container)) {
      return;
    }
    if (role === 'dialog') {
      attemptFocus(container);
      return;
    }
    focusFirst();
  }, [contentRef, focusFirst, role]);

  // A dialog popover that opens from code and takes no focus announces
  // its name, so a screen reader user learns it appeared. It reads focus
  // after initial focus has had its frame.
  const isOpenForAnnouncement = layer.isOpen;
  // Both are read when the announcement is made. The announcer changes
  // identity with the modal that holds this popover, and a caller may rename
  // the popover. Neither restarts the wait.
  const announceRef = useCommittedRef(useAnnounce());
  const dialogLabelRef = useCommittedRef(dialogLabel);
  const roleRef = useCommittedRef(role);
  useEffect(() => {
    if (!isOpenForAnnouncement || !announcesOpenRef.current) {
      return;
    }
    announcesOpenRef.current = false;
    const container = contentRef.current;
    const view = container?.ownerDocument.defaultView ?? window;
    // Initial focus for content that mounts on open lands in the next frame,
    // so focus is read one frame after that.
    let frame = view.requestAnimationFrame(() => {
      frame = view.requestAnimationFrame(() => {
        const active = deepActiveElement(container?.ownerDocument);
        const name = dialogLabelRef.current;
        if (
          name != null &&
          container != null &&
          (active == null || !containsAlongFlatTree(container, active))
        ) {
          announceRef.current(name, 'polite');
        }
      });
    });
    return () => view.cancelAnimationFrame(frame);
  }, [isOpenForAnnouncement, contentRef, dialogLabelRef, announceRef]);

  // Auto-focus first element when popover opens (unless skipped)
  useEffect(() => {
    // Reset the per-open focus preference after the popover closes.
    if (!layer.isOpen) {
      skipAutoFocusRef.current = false;
      hasFocusedInGestureRef.current = false;
      return;
    }
    if (hasAutoFocus && !skipAutoFocusRef.current) {
      // Wait a frame so the content is mounted. A popover that closes or
      // unmounts first cancels it: the frame would otherwise move focus into
      // content that is no longer shown, after the close had left it alone.
      const frame = requestAnimationFrame(() => {
        const doc = contentRef.current?.ownerDocument ?? document;
        if (hasFocusedInGestureRef.current && !isFocusDetached(doc)) {
          return;
        }
        focusInitialTarget();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [layer.isOpen, hasAutoFocus, focusInitialTarget, contentRef]);

  // Combined ref for trigger element (layer anchor + our ref). It is keyed on
  // the layer's own ref, not the whole layer: the layer object changes with
  // every new onShow or onHide, and a trigger ref that changed with it made
  // React detach and reattach the trigger on every render. It reads nothing
  // else from the layer, and layer.ref (useLayer's contextRef) reads only refs
  // and its anchor name and anchor-clearance option, so nothing in it goes
  // stale.
  const layerRef = layer.ref;
  // With `anchorRef`, the trigger keeps its role but is not the layer's
  // anchor: the element the ref holds is.
  const [isAnchorMissing, setIsAnchorMissing] = useState(false);
  const triggerRef = useCallback(
    (el: HTMLElement | null) => {
      triggerElementRef.current = el;
      if (anchorOptionRef.current == null) {
        layerRef(el);
      }
    },
    [anchorOptionRef, layerRef],
  );
  // Focus leaves a surface that hides because its anchor is missing: to the
  // trigger when it takes focus, then along the focus-return chain.
  const moveFocusOutOfHiddenSurface = () => {
    const container = contentRef.current;
    const active = container?.ownerDocument.activeElement ?? null;
    if (container == null || active == null || !container.contains(active)) {
      return;
    }
    const trigger = triggerElementRef.current;
    moveFocusOut([
      isHTMLElement(trigger) && takesFocusAsIs(trigger) ? trigger : null,
    ]);
  };
  useCommittedRefInto(anchorMissingRef, moveFocusOutOfHiddenSurface);

  const bindAnchor = useCallback(() => {
    const option = anchorOptionRef.current;
    if (option == null) {
      return;
    }
    const element = resolvePopoverAnchor(option);
    if (element !== boundAnchorRef.current) {
      boundAnchorRef.current = element;
      // The layer's ref reads only the element's style and box; an element
      // with a box can carry an anchor name.
      layerRef(element as HTMLElement | null);
    }
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- whether the caller's anchor exists is a DOM fact; it hides the surface until it does
    setIsAnchorMissing(element == null);
    if (element == null) {
      anchorMissingRef.current?.();
    }
  }, [anchorOptionRef, layerRef]);

  // Syncs the layer's CSS anchor with the element the caller's `anchorRef`
  // holds. The ref changes with no event here, so this reads it after every
  // commit.
  useIsomorphicLayoutEffect(() => {
    if (anchorRef != null) {
      bindAnchor();
      return;
    }
    if (boundAnchorRef.current !== undefined) {
      // The caller dropped its anchor: the trigger anchors again.
      boundAnchorRef.current = undefined;
      setIsAnchorMissing(false);
      layerRef(triggerElementRef.current);
    }
  });
  // React detaches a trigger's ref when the popover unmounts. The anchor is
  // the caller's element, so this hook takes its anchor name off. Effects
  // that run again bind the anchor again.
  useIsomorphicLayoutEffect(
    () => () => {
      if (boundAnchorRef.current !== undefined) {
        layerRef(null);
        boundAnchorRef.current = undefined;
      }
    },
    [layerRef],
  );

  // Show function with optional focus preservation
  const show = useCallback(
    (showOptions?: {skipAutoFocus?: boolean}) => {
      skipAutoFocusRef.current = showOptions?.skipAutoFocus ?? false;
      hasShownRef.current = false;
      const activeElement = (
        triggerElementRef.current?.ownerDocument ?? document
      ).activeElement as HTMLElement | null;
      const focused = getOpenerRef.current?.() ?? activeElement;
      // Initial focus can move inside before a controlled popover's sync runs
      // show() again. That call keeps the element that opened the popover.
      const opener =
        focused != null && contentRef.current?.contains(focused) === true
          ? openerRef.current
          : focused;
      openerRef.current =
        opener != null && !contentRef.current?.contains(opener) ? opener : null;
      const focusWithinEvent = () => {
        const container = contentRef.current;
        if (
          hasShownRef.current &&
          hasAutoFocus &&
          !skipAutoFocusRef.current &&
          container != null &&
          !container.contains(container.ownerDocument.activeElement) &&
          focusFirstContentControl(container)
        ) {
          // Initial focus is done. The effect's frame stays only as a fallback
          // for focus lost to the page (content swapped in the same handler
          // unmounts the control just focused); it must not move focus the
          // user has since moved elsewhere.
          hasFocusedInGestureRef.current = true;
        }
      };
      // iOS raises its keyboard only for a focus made while the tap is still
      // being handled, so initial focus runs when the layer reports the show.
      // Only a content control already rendered takes focus there; content
      // that renders on open (and the dialog-surface fallback) waits for the
      // effect's frame.
      focusOnShowRef.current = focusWithinEvent;
      const trigger = triggerElementRef.current;
      // An open is the person's while a press, key or click on the trigger
      // is being handled, or while the pointer is on the trigger. Any other
      // open is from code.
      const inputTarget = currentInputTarget();
      const isFromTrigger =
        trigger != null &&
        ((isElement(inputTarget) &&
          containsAlongFlatTree(trigger, inputTarget)) ||
          trigger.matches(':hover'));
      announcesOpenRef.current =
        roleRef.current === 'dialog' &&
        dialogLabelRef.current != null &&
        !isFromTrigger;
      // The first frame is anchored: the anchor is read as the popover opens.
      bindAnchor();
      layer.show();
    },
    [layer, hasAutoFocus, contentRef, bindAnchor, roleRef, dialogLabelRef],
  );

  // Toggle function. Opening delegates to show so every route inherits the
  // same-gesture reopen guard owned by Layer.
  const toggle = useCallback(() => {
    if (layer.isOpen) {
      layer.hide();
    } else {
      show();
    }
  }, [layer, show]);

  // ARIA attributes for the trigger
  const triggerProps = {
    'aria-haspopup':
      role === 'dialog' ? ('dialog' as const) : ('true' as const),
    'aria-expanded': layer.isOpen,
    'aria-controls': layer.id,
  };

  // Dev-time guardrail: a dialog popover should always be labeled.
  useDevWarning(
    'usePopover',
    'role="dialog" without a `dialogLabel` renders an unnamed ' +
      'dialog. Pass `dialogLabel`, or use `role: "none"` for listbox/menu ' +
      'popups whose content already carries its own role.',
    role === 'dialog' && !dialogLabel,
  );

  const isDialogShown = role === 'dialog' && layer.isOpen;
  const surfaceRefs = useMergedRefs(contentRef, surfaceRef);
  // Wrapped render function that includes surface styles and optional hidden close button
  const render = useCallback(
    (children: ReactNode, props?: ContextRenderProps): ReactNode => {
      // `mergeProps` is positional — a third OBJECT argument is read as
      // `style`, not as more props — so the surface's classes are composed
      // into one props object before merging with the StyleX result.
      const surfaceProps = themeProps('popover');
      const surfaceClassName =
        surfaceTarget != null && surfaceTarget !== 'popover'
          ? `${surfaceProps.className} ${stableClassName(surfaceTarget)}`
          : surfaceProps.className;

      return layer.render(
        <LayerDepthProvider>
          <div
            ref={surfaceRefs}
            // A closed surface stays mounted but hidden. It carries no dialog
            // role or name, so selectors find no hidden dialog.
            role={isDialogShown ? 'dialog' : undefined}
            aria-modal={isDialogShown && isModal ? true : undefined}
            aria-label={isDialogShown ? dialogLabel : undefined}
            tabIndex={role === 'dialog' ? -1 : undefined}
            {...hostSurfaceProps}
            {...mergeProps(
              {...surfaceProps, className: surfaceClassName},
              focusOutlineProps.focusVisible(
                styles.contentWrapper,
                hasSurface && styles.surface,
                padding != null && paddingStyles[padding],
                xstyle,
              ),
              className,
              style,
            )}>
            {children}
            {hasCloseButton && (
              <div
                data-astryx-popover-fallback-close=""
                {...stylex.props(
                  styles.closeButtonWrapper,
                  rtlStyles.centerInline('100%'),
                )}>
                <Button
                  variant="secondary"
                  label={closeButtonLabel}
                  onClick={layer.hide}
                />
              </div>
            )}
          </div>
        </LayerDepthProvider>,
        {
          ...props,
          xstyle: [props?.xstyle, isAnchorMissing && styles.unanchored],
        },
      );
    },
    [
      layer,
      hasCloseButton,
      hasSurface,
      padding,
      surfaceTarget,
      className,
      style,
      closeButtonLabel,
      surfaceRefs,
      hostSurfaceProps,
      dialogLabel,
      isDialogShown,
      role,
      isModal,
      xstyle,
      isAnchorMissing,
    ],
  );

  return {
    triggerRef,
    contentRef,
    anchorId: layer.anchorId,
    show,
    hide: layer.hide,
    toggle,
    isOpen: layer.isOpen,
    id: layer.id,
    render,
    triggerProps,
    isFocusInScope,
  };
}

/**
 * @internal What a Core composition reads beyond the public return.
 */
export interface UsePopoverInternalReturn extends UsePopoverReturn {
  /**
   * Whether focus is in the popover's Escape scope: inside `surface`, or on
   * or inside its anchor or trigger.
   */
  isFocusInScope: (surface: Element | null) => boolean;
}

export function usePopover<
  TabBehavior extends UsePopoverOptions['tabBehavior'] =
    UsePopoverOptions['tabBehavior'],
>(
  options?: UsePopoverOptions & {
    tabBehavior?: TabBehavior;
    /** A popover that Tab passes through is never modal. */
    isModal?: [TabBehavior] extends ['pageOrder'] ? false : boolean;
  },
): UsePopoverReturn {
  const {isFocusInScope: _isFocusInScope, ...popover} =
    usePopoverImplementation(options ?? {});
  return popover;
}

/**
 * @internal For Popover; not exported from the package barrel.
 */
export function usePopoverInternal(
  options: InternalPopoverOptions = {},
): UsePopoverInternalReturn {
  return usePopoverImplementation(options);
}
