// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePopover.tsx
 * @input Uses useLayer, useFocusTrap, React hooks
 * @output Exports the public usePopover hook with derived focus, guarded opening
 *   and an optional anchor apart from the trigger.
 *   For Popover.tsx (internal), exports usePopoverInternal and
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
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {
  createRectAnchorBox,
  isRectAnchor,
  resolveElementAnchor,
  type PopoverAnchor,
  type RectAnchorBox,
} from './popoverAnchor';
import {useOutsidePress} from '../Layer/outsidePress';
import {isElement} from '../utils/nodeType';
import {useFocusTrapInternal} from '../hooks/useFocusTrap';
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
   * The element the popover sits on, when it is not the trigger: a ref to any
   * element, a function that returns the element (or `null`), or a rectangle
   * (`getBoundingClientRect` and an optional `contextElement`), which is
   * placed as a box inside `contextElement` when the popover opens or the
   * rectangle object changes.
   *
   * The trigger keeps its toggle and ARIA; the anchor gets neither. A
   * function is read again when the popover opens, after each commit while it
   * is open, and when the element it returned leaves the document, so a row
   * that remounts its control keeps its popover without a remount. While it
   * resolves to nothing, an open popover shows no surface.
   *
   * Omit it and the trigger is the anchor.
   */
  anchor?: PopoverAnchor;

  /**
   * What the popover does while its anchor is out of view — scrolled out of
   * the viewport or out of a scrolling panel, or removed.
   *
   * - `'hold'`: the popover keeps its place and size until the anchor
   *   returns.
   * - `'hide'`: the popover is hidden and takes no pointer input. It stays
   *   open (no `onHide`) and shows again in place when the anchor returns.
   *
   * @default 'hold'
   */
  anchorOutOfView?: 'hold' | 'hide';

  /**
   * Called for each press that starts and ends outside the open popover,
   * before the popover closes for it. Call `event.preventDefault()` to keep
   * the popover open — for example when the press lands on a control that
   * switches what the popover shows. Cancelling affects only the dismissal:
   * the press, its focus change and its click reach the page unchanged.
   *
   * A press on a separate `anchor` is an outside press. A press on the
   * trigger keeps its toggle and is not reported. Not called when
   * `hasLightDismiss` is false, nor for Escape or the close button.
   * Wrap in useCallback for stable identity.
   */
  onOutsidePress?: (event: PopoverOutsidePressEvent) => void;

  /**
   * Callback fired when popover is shown.
   * Wrap in useCallback for stable identity.
   */
  onShow?: () => void;

  /**
   * Callback fired when popover is hidden.
   * Use this to return focus to the trigger element.
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
   * explicit-dismiss-only surfaces like onboarding coachmarks.
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
   * Whether the popover is modal.
   *
   * - `true`: Tab and Shift+Tab cycle inside the open popover, and a dialog
   *   popover carries `aria-modal`.
   * - `false`: the popover holds nothing. Tab moves in the browser's order:
   *   from the anchor (else the trigger) into the popover, and from its last
   *   control to what follows the anchor. Escape closes it only while focus
   *   is inside it or on its anchor or trigger. Use it for a coachmark or a
   *   tour step, whose reader must reach the control it describes.
   *
   * A Tab pressed outside the popover is never pulled into it.
   *
   * @default true
   */
  isModal?: boolean;

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
 * A press outside an open popover, reported to `onOutsidePress` before the
 * popover closes for it.
 */
export interface PopoverOutsidePressEvent {
  /** The element the press landed on, or `null` when it is not an element. */
  readonly target: Element | null;
  /** The pointer that pressed: `'mouse'`, `'pen'` or `'touch'`. */
  readonly pointerType: string;
  /** The browser event that ended the press. */
  readonly nativeEvent: PointerEvent;
  /** Keeps the popover open. It does not cancel `nativeEvent`. */
  preventDefault: () => void;
  /** Whether `preventDefault` was called. */
  readonly defaultPrevented: boolean;
}

function createOutsidePressEvent(
  nativeEvent: PointerEvent,
): PopoverOutsidePressEvent {
  let isPrevented = false;
  const pressed = nativeEvent.composedPath()[0];
  return {
    target: pressed != null && isElement(pressed) ? pressed : null,
    pointerType: nativeEvent.pointerType,
    nativeEvent,
    preventDefault: () => {
      isPrevented = true;
    },
    get defaultPrevented() {
      return isPrevented;
    },
  };
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
interface InternalPopoverOptions extends UsePopoverOptions {
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
): UsePopoverReturn {
  const {
    anchor,
    anchorOutOfView = 'hold',
    onOutsidePress,
    onShow,
    onHide,
    onCloseStart,
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
    isModal = true,
    getRestoreFallback,
    restoreFocusTo,
    getOpener,
  } = options;

  const t = useComponentTranslator();
  const closeButtonLabel =
    closeButtonLabelFromProps ?? t('@astryx.popover.close');

  // Track the trigger element for returning focus
  const triggerElementRef = useRef<HTMLElement | null>(null);
  // The caller's `anchor`, and the element it is bound to now.
  const anchorOptionRef = useRef(anchor);
  anchorOptionRef.current = anchor;
  const boundAnchorRef = useRef<Element | null>(null);

  // Track whether to skip auto-focus for the current open event
  const skipAutoFocusRef = useRef(false);
  // Whether `show` focused a content control within the opening event.
  const hasFocusedInGestureRef = useRef(false);

  // Set when the layer reports it has shown, so `show` can tell a popover
  // that opened within the call from one whose content mounts later.
  const hasShownRef = useRef(false);
  const handleLayerShow = useCallback(() => {
    hasShownRef.current = true;
    onShow?.();
  }, [onShow]);

  // Core layer for popover positioning
  // A caller that may cancel an outside dismissal gets the outside-press
  // watch in place of native light dismiss, which no script can cancel.
  const watchesOutsidePress = hasLightDismiss && onOutsidePress != null;
  // A non-modal popover takes Escape only while it holds focus: inside it, or
  // on the anchor or trigger it belongs to. Read at press time.
  const surfaceHolderRef =
    useRef<React.RefObject<HTMLDivElement | null> | null>(null);
  const isFocusInNonModalScope = useCallback((): boolean => {
    const surface = surfaceHolderRef.current?.current ?? null;
    const doc = surface?.ownerDocument ?? document;
    const active = doc.activeElement;
    if (active == null) {
      return false;
    }
    const anchor = boundAnchorRef.current;
    const trigger = triggerElementRef.current;
    return (
      surface?.contains(active) === true ||
      anchor?.contains(active) === true ||
      trigger?.contains(active) === true
    );
  }, []);

  // Focus returns as the popover starts to close, while it still holds focus:
  // the browser restores focus only for an auto popover whose opener is still
  // there, and then with a focus ring whatever the last input was. The trap
  // below supplies the return; it is read through a ref because the layer
  // exists first.
  const returnFocusRef = useRef<() => void>(() => {});
  const onCloseStartRef = useRef(onCloseStart);
  onCloseStartRef.current = onCloseStart;
  const handleCloseStart = useCallback(() => {
    returnFocusRef.current();
    onCloseStartRef.current?.();
  }, []);
  const layer = useLayerInternal({
    mode: 'context',
    lightDismiss: hasLightDismiss && !watchesOutsidePress,
    onShow: handleLayerShow,
    onHide,
    onCloseStart: handleCloseStart,
    hidesWithAnchor: anchorOutOfView === 'hide',
  });

  // Focus trap for the popover content. Escape stays registered while light
  // dismiss is on (native popover="auto" closes on Escape regardless), so a
  // host Dialog keeps deferring to this trap instead of double-dismissing.
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
  } = useFocusTrapInternal<HTMLDivElement>({
    isActive: layer.isOpen,
    onEscape: hasEscapeDismiss || hasLightDismiss ? layer.hide : undefined,
    getRestoreTarget,
    getRestoreFallback,
    restoreFocusTo,
    getTrigger: () => triggerElementRef.current,
    getAnchor: () =>
      anchorOptionRef.current == null ? null : boundAnchorRef.current,
    layerId: layer.id,
    isContaining: isModal,
    isEscapeInScope: isModal ? undefined : isFocusInNonModalScope,
  });
  surfaceHolderRef.current = contentRef;
  returnFocusRef.current = returnFocus;

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
  // With a separate `anchor`, the trigger keeps its role but is not the
  // layer's anchor: the element `anchor` resolves to is.
  const hasSeparateAnchor = anchor != null;
  const isAnchorBoundRef = useRef(false);
  const [isAnchorMissing, setIsAnchorMissing] = useState(false);
  const triggerRef = useCallback(
    (el: HTMLElement | null) => {
      triggerElementRef.current = el;
      if (anchorOptionRef.current == null) {
        layerRef(el);
      }
    },
    [layerRef],
  );
  // The box that stands for a rectangle anchor, created on first use.
  const rectBoxRef = useRef<RectAnchorBox | null>(null);
  const bindAnchor = useCallback(
    (isOpening = false) => {
      const option = anchorOptionRef.current;
      if (option == null) {
        return;
      }
      let element: Element | null;
      if (isRectAnchor(option)) {
        rectBoxRef.current ??= createRectAnchorBox();
        element = rectBoxRef.current.place(option, isOpening);
      } else {
        rectBoxRef.current?.remove();
        element = resolveElementAnchor(option);
      }
      if (!isAnchorBoundRef.current || element !== boundAnchorRef.current) {
        isAnchorBoundRef.current = true;
        boundAnchorRef.current = element;
        // The layer's ref reads only the element's style and box; any element
        // with a box can carry an anchor name.
        layerRef(element as HTMLElement | null);
      }
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- whether the caller's anchor exists is a DOM fact; it hides the surface until it does
      setIsAnchorMissing(element == null);
    },
    [layerRef],
  );

  // A function anchor can return another element after any render of the
  // caller, so the binding is checked after every commit. A ref anchor is
  // read the same way, so a ref whose element changes is followed too.
  useIsomorphicLayoutEffect(() => {
    if (hasSeparateAnchor) {
      bindAnchor();
      return;
    }
    if (isAnchorBoundRef.current) {
      // The caller dropped its anchor: the trigger anchors again.
      isAnchorBoundRef.current = false;
      boundAnchorRef.current = null;
      rectBoxRef.current?.remove();

      setIsAnchorMissing(false);
      layerRef(triggerElementRef.current);
    }
  });

  // While open, an anchor that leaves the document (a row that remounts its
  // control), or one that has not arrived yet, is looked up again when the
  // document changes. The observer exists only while the popover is open and
  // its callback reads no layout.
  const isLayerOpen = layer.isOpen;
  useEffect(() => {
    if (!hasSeparateAnchor || !isLayerOpen) {
      return;
    }
    const doc =
      triggerElementRef.current?.ownerDocument ??
      boundAnchorRef.current?.ownerDocument ??
      document;
    if (typeof MutationObserver === 'undefined') {
      return;
    }
    const observer = new MutationObserver(() => {
      const bound = boundAnchorRef.current;
      if (bound == null || !bound.isConnected) {
        bindAnchor();
      }
    });
    observer.observe(doc.documentElement, {childList: true, subtree: true});
    return () => observer.disconnect();
  }, [hasSeparateAnchor, isLayerOpen, bindAnchor]);

  // The rectangle anchor's box is the hook's own element; it leaves the
  // document with the hook.
  useEffect(() => () => rectBoxRef.current?.remove(), []);

  const onOutsidePressRef = useRef(onOutsidePress);
  onOutsidePressRef.current = onOutsidePress;
  const hideRef = useRef(layer.hide);
  hideRef.current = layer.hide;
  const outsidePress = useOutsidePress();
  // Watches the document for outside presses while the popover is open. The
  // trigger counts as inside, so its own toggle answers a press on it.
  useEffect(() => {
    const surface = contentRef.current;
    if (!watchesOutsidePress || !isLayerOpen || surface == null) {
      return;
    }
    const layerRoot = surface.closest('[popover]') ?? surface;
    outsidePress.start(
      surface,
      path => {
        const trigger = triggerElementRef.current;
        return (
          path.includes(layerRoot) ||
          (trigger != null && path.includes(trigger))
        );
      },
      nativeEvent => {
        const press = createOutsidePressEvent(nativeEvent);
        onOutsidePressRef.current?.(press);
        if (press.defaultPrevented) {
          return false;
        }
        hideRef.current();
        return true;
      },
    );
    return () => outsidePress.stop();
  }, [watchesOutsidePress, isLayerOpen, outsidePress, contentRef]);

  // Show function with optional focus preservation
  const show = useCallback(
    (showOptions?: {skipAutoFocus?: boolean}) => {
      skipAutoFocusRef.current = showOptions?.skipAutoFocus ?? false;
      hasShownRef.current = false;
      const activeElement = (
        triggerElementRef.current?.ownerDocument ?? document
      ).activeElement as HTMLElement | null;
      const opener = getOpenerRef.current?.() ?? activeElement;
      openerRef.current =
        opener != null && !contentRef.current?.contains(opener) ? opener : null;
      // The first frame is anchored: the anchor is read as the popover opens,
      // and a rectangle anchor is placed again, since it may have moved.
      bindAnchor(true);
      layer.show();
      // When the content is already mounted, the layer shows it within this
      // call, so initial focus lands within the event that opened it: iOS
      // raises its keyboard only for a focus made while the tap is still
      // being handled. The frame in the effect above stays for content that
      // mounts later.
      // Only a content control already rendered takes focus here; content
      // that renders on open (and the dialog-surface fallback) waits for the
      // effect's frame.
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
        // unmounts the control just focused); it must not move focus the user
        // has since moved elsewhere.
        hasFocusedInGestureRef.current = true;
      }
    },
    [layer, hasAutoFocus, contentRef, bindAnchor],
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
            ref={contentRef}
            // A closed surface stays mounted but hidden. It carries no dialog
            // role or name, so selectors find no hidden dialog.
            role={isDialogShown ? 'dialog' : undefined}
            aria-modal={isDialogShown && isModal ? true : undefined}
            aria-label={isDialogShown ? dialogLabel : undefined}
            tabIndex={role === 'dialog' ? -1 : undefined}
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
          xstyle: [
            props?.xstyle,
            hasSeparateAnchor && isAnchorMissing && styles.unanchored,
          ],
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
      contentRef,
      dialogLabel,
      isDialogShown,
      role,
      isModal,
      xstyle,
      hasSeparateAnchor,
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
  };
}

export function usePopover(options: UsePopoverOptions = {}): UsePopoverReturn {
  return usePopoverImplementation(options);
}

/**
 * @internal For Popover; not exported from the package barrel.
 */
export function usePopoverInternal(
  options: InternalPopoverOptions = {},
): UsePopoverReturn {
  return usePopoverImplementation(options);
}
