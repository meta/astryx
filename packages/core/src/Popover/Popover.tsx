// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Popover.tsx
 * @input Uses React layout measurement and the usePopover hook
 * @output Exports Popover with conditional overflow and content-first focus above the layer runtime's viewport fit
 * @position Layer component; declarative wrapper around usePopover hook
 *
 * For hover-triggered overlays, use HoverCard instead.
 *
 * `presentation` chooses the surface, with the vocabulary DropdownMenu and
 * Selector use: the anchored popover (the default), a BottomSheet, or
 * `adaptive` — a BottomSheet on a compact touch screen and the popover
 * elsewhere (the shared adaptive presentation policy), which is what iOS does
 * with a popover unless the app keeps it. The surface is chosen when the
 * popover opens; whichever is open stays until it closes. The BottomSheet
 * loads on demand (lazyPopoverBottomSheet.ts).
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Popover/Popover.test.tsx
 * - /packages/core/src/Popover/index.ts
 * - /packages/core/src/Popover/PopoverPresentation.test.tsx
 * - /apps/storybook/stories/Popover.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Popover/ (showcase blocks)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import type {
  AdaptivePresentation,
  ResolvedAdaptivePresentation,
} from '../hooks/useAdaptivePresentation';
import {
  compactDefinition,
  DEFAULT_COMPACT_DEFINITION,
} from '../theme/themeAdaptations';
import {useThemeDefinition} from '../theme/useTheme';
import * as stylex from '@stylexjs/stylex';
import {devWarn} from '../utils/devWarning';
import type {BaseProps} from '../BaseProps';
import {usePopover} from './usePopover';
import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import type {LayerAlignment, LayerPlacement} from '../Layer/useLayer';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {layerViewportInset} from '../Layer/layerViewportInset.stylex';
import {clampInlineSize, isIntrinsicInlineSize} from '../Layer/clampInlineSize';
import {spacingVars} from '../theme/tokens.stylex';
import {InteractiveRoleContext} from '../InteractiveRoleContext/InteractiveRoleContext';
import type {SpacingStep} from '../utils/types';
import {BottomSheetEscapeContext} from '../BottomSheet/bottomSheetEscape';
import {
  PopoverBottomSheet,
  preloadPopoverBottomSheet,
} from './lazyPopoverBottomSheet';
import {Button} from '../Button';
import {useTranslator} from '../i18n';

// =============================================================================
// Helpers
// =============================================================================

const BUTTON_SELECTOR = 'button, [role="button"]';

const subscribeToNothing = () => () => {};
const notCompactTouch = () => false;

/**
 * The surface `presentation` resolves to now. `adaptive` takes the sheet on a
 * compact screen with a coarse pointer, compact as the active theme defines
 * it (spec:AST-012 FR9: narrower than its `md` point or shorter than 500).
 * Only an adaptive popover reads the theme and subscribes to that query, so a
 * default popover holds no viewport or document listener. The theme is the
 * nearest Theme provider's; without one, the registered root theme's, as
 * AppShell reads it (architecture:theme-application).
 */
function usePresentationSurface(
  presentation: AdaptivePresentation,
): ResolvedAdaptivePresentation {
  const isAdaptive = presentation === 'adaptive';
  const points =
    useThemeDefinition(isAdaptive)?.__adaptations?.widthBreakpoints;
  const query = useMemo(
    () =>
      (points == null ? DEFAULT_COMPACT_DEFINITION : compactDefinition(points))
        .coarsePointerQuery,
    [points],
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onStoreChange);
      return () => mql.removeEventListener('change', onStoreChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );
  const isCompactTouch = useSyncExternalStore(
    isAdaptive ? subscribe : subscribeToNothing,
    isAdaptive ? getSnapshot : notCompactTouch,
    notCompactTouch,
  );
  if (!isAdaptive) {
    return presentation;
  }
  return isCompactTouch ? 'bottom-sheet' : 'popover';
}
/**
 * Find the trigger button inside a container element.
 * Looks for `<button>` or `[role="button"]` — either the element itself
 * or the first matching descendant.
 */
function findTriggerButton(el: HTMLElement): HTMLElement | null {
  if (el.matches(BUTTON_SELECTOR)) {
    return el;
  }
  return el.querySelector<HTMLElement>(BUTTON_SELECTOR);
}

/** The trigger's own name: its `aria-label`, else its text. */
function readTriggerText(trigger: HTMLElement): string {
  return (
    trigger.getAttribute('aria-label')?.trim() ||
    trigger.textContent?.trim() ||
    ''
  );
}

// =============================================================================
// Types
// =============================================================================

/**
 * The surface a Popover presents its content on: anchored to the trigger, in
 * a BottomSheet, or adaptive (a BottomSheet on a compact touch screen, the
 * popover elsewhere).
 */
export type PopoverPresentation = AdaptivePresentation;

/**
 * Props passed to render-prop children for explicit trigger wiring.
 */
export interface PopoverTriggerRenderProps {
  /** Ref callback — attach to the trigger element for anchor positioning. */
  ref: (el: HTMLElement | null) => void;
  /** Toggle the popover open/closed. Pass the click event through so pointer and keyboard focus behavior can differ. */
  onClick: (event?: {detail: number}) => void;
  /** ARIA attribute: indicates the trigger opens a dialog-style popover. */
  'aria-haspopup': 'dialog';
  /** ARIA attribute: whether the popover is currently open. */
  'aria-expanded': boolean;
  /** ARIA attribute: ID of the controlled popover element. */
  'aria-controls': string;
}

export interface PopoverProps extends Pick<
  BaseProps,
  'xstyle' | 'className' | 'style'
> {
  /**
   * The trigger element. Accepts either:
   *
   * **ReactNode (automatic mode):** Must contain a `<button>` or
   * `[role="button"]` element — the popover locates it and applies
   * click/keydown handlers and ARIA attributes automatically.
   * Components that consume `InteractiveRoleContext` (e.g., Token)
   * will render as a button automatically when placed here.
   *
   * **Render function (explicit mode):** Receives `PopoverTriggerRenderProps`
   * with ref, onClick, and ARIA attributes. The consumer is responsible
   * for attaching these to their trigger element. Use this for custom
   * triggers or third-party components.
   *
   * The trigger is rendered inside an anchor wrapper used for CSS anchor
   * positioning. The wrapper is stable (no pressed-state transforms),
   * preventing popover position jitter.
   *
   * When `anchorRef` is provided, children can be omitted and the popover
   * attaches to the external ref element as a sibling.
   *
   * @example
   * ```
   * <Popover content={...}><Button label="Open" /></Popover>
   * <Popover content={...}><Token label="Filter" /></Popover>
   * <Popover content={...}>
   *   {(triggerProps) => <MyCustomTrigger {...triggerProps} />}
   * </Popover>
   * ```
   */
  children?: ReactNode | ((props: PopoverTriggerRenderProps) => ReactNode);

  /**
   * External ref to use as the popover anchor.
   * When provided (and no children), the popover attaches to this element
   * instead of wrapping children. The referenced element must be a
   * `<button>` or `[role="button"]` — the popover applies click/keydown
   * handlers and ARIA attributes to it directly.
   */
  anchorRef?: React.RefObject<HTMLElement>;

  /**
   * Content to display inside the popover.
   */
  content: ReactNode;

  /**
   * Position placement relative to the trigger.
   * Uses CSS anchor positioning via useLayer.
   * @default 'below'
   */
  placement?: LayerPlacement;

  /**
   * Alignment along the placement axis.
   * @default 'start'
   */
  alignment?: LayerAlignment;

  /**
   * Whether the popover is open (controlled mode).
   * Omit for uncontrolled behavior.
   */
  isOpen?: boolean;

  /**
   * Callback fired when the popover visibility changes.
   */
  onOpenChange?: (isOpen: boolean) => void;

  /**
   * Whether the popover is enabled.
   * When false, trigger interactions are ignored.
   * @default true
   */
  isEnabled?: boolean;

  /**
   * Width of the popover container.
   * Numbers are px, strings are CSS widths. The popover renders at this width
   * up to the viewport minus its gutters — it is never shrunk to the room
   * beside the trigger; when it does not fit there it flips or slides.
   * @default 'auto'
   */
  width?: number | string;

  /**
   * Inner padding of the popover surface, using the spacing scale.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   * Matches the `padding` prop on `Card` and `Stack`.
   *
   * Pass `0` for a flush surface when the content owns its own edges — a
   * list of rows whose hover paint reaches the edge, or a header row with a
   * bottom rule — and pad the content itself.
   *
   * The padding sits on the painted surface (the `popover` theme target), so
   * a theme's `padding` on that target replaces it rather than nesting.
   * @default 3
   */
  padding?: SpacingStep;

  /**
   * Accessible label for the popover dialog.
   * Recommended for accessibility when `role` is `'dialog'`. A sheet
   * (`presentation`) without one is named by the trigger's text, so it is
   * never an unnamed dialog.
   */
  label?: string;

  /**
   * ARIA role stamped on the popover content wrapper.
   *
   * Use `'dialog'` for dialog-style popovers. Use `'none'` when the popup
   * content owns its own role, such as a child `role="menu"` or
   * `role="listbox"`.
   *
   * @default 'dialog'
   */
  role?: 'dialog' | 'none';

  /**
   * Whether a dialog-style popover is modal (`aria-modal`). Only applies when
   * `role` is `'dialog'`.
   *
   * @default true
   */
  isModal?: boolean;

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
   * Whether to move focus into the popover when it opens. Focus enters the
   * first genuine caller content control; dialogs with none fall back to the
   * labeled surface. The generated fallback close control is excluded from
   * initial focus and reveals only when reached through keyboard navigation.
   * Set to `false` for input-owned focus, inline showcases, or documentation
   * previews.
   * @default true
   */
  hasAutoFocus?: boolean;

  /**
   * Whether clicking outside dismisses the popover.
   * Set to `false` for surfaces that should stay open until explicitly
   * dismissed, like onboarding coachmarks or multi-step flows.
   * @default true
   */
  hasLightDismiss?: boolean;

  /**
   * Whether pressing Escape dismisses the popover.
   *
   * Only takes full effect together with `hasLightDismiss={false}`: with
   * light dismiss on, the browser's native light dismiss also closes on
   * Escape. Set both to `false` for explicit-dismiss-only surfaces.
   * @default true
   */
  hasEscapeDismiss?: boolean;

  /**
   * The surface that holds the content. `'popover'` anchors it to the
   * trigger. `'bottom-sheet'` presents it in a modal BottomSheet, labeled
   * by `label`. `'adaptive'` presents the BottomSheet on a compact touch
   * screen (a coarse pointer on a screen the theme counts as compact:
   * narrower than its `md` width point or shorter than 500px, so a phone in
   * either orientation) and the anchored popover elsewhere, which is what iOS
   * does with a popover by default.
   *
   * In a sheet, `placement`, `alignment`, `width`, `role`, `isModal` and
   * `hasAutoFocus` do not apply (the sheet is a modal dialog with its own
   * focus handling); `xstyle`, `className` and `style` style the sheet's
   * panel, as they style the anchored surface; `padding` insets the
   * sheet's content. The sheet always light-dismisses (a tap outside it or a
   * swipe down closes it, whatever `hasLightDismiss` says), Escape follows
   * `hasEscapeDismiss`, and the fallback close stays hidden as on the
   * anchored surface. The surface is
   * chosen when the popover opens and kept until it closes.
   * @default 'popover'
   */
  presentation?: PopoverPresentation;

  /**
   * Test ID for the popover container.
   */
  'data-testid'?: string;
}

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  // Stable anchor wrapper — uses inline-flex to generate a box for CSS
  // anchor positioning without affecting layout. The trigger element (e.g.
  // Button) renders inside this wrapper. Because the wrapper itself is
  // the anchor, pressed-state transforms on the child (e.g. :active scale)
  // don't shift the anchor position and cause popover jitter.
  anchorWrapper: {
    display: 'inline-flex',
  },
  // The sheet's fallback close control: hidden until it is reached, as the
  // anchored surface's is, on the Button itself rather than a wrapper
  // (architecture:component-style-authoring INV7). Taken out of flow and
  // clipped at rest, it rejoins the flow when focused, set below the content
  // with room for its focus ring.
  sheetFallbackClose: {
    position: {
      default: 'absolute',
      ':focus': 'relative',
    },
    clipPath: {
      default: 'inset(50%)',
      ':focus': 'none',
    },
    marginBlockStart: {
      default: 0,
      ':focus': spacingVars['--spacing-3'],
    },
    // Block-level when revealed, so it starts its own line below inline
    // content rather than sitting on its last line.
    display: {
      default: null,
      ':focus': 'flex',
    },
    width: {
      default: null,
      ':focus': 'fit-content',
    },
  },
  // The painted surface is capped to the viewport with the layer runtime's
  // one definition (spec:AST-059 FR2, FR3): the layer box above it caps the
  // block axis itself and leaves the inline axis to the surface, so a flip is
  // still chosen when the surface does not fit beside the trigger.
  surfaceViewportFit: {
    boxSizing: 'border-box',
    maxInlineSize: stylex.firstThatWorks(
      `calc(${layerViewportInset.maxInlineSize})`,
      `calc(${layerViewportInset.maxInlineSizeFallback})`,
    ),
    maxBlockSize: stylex.firstThatWorks(
      `calc(${layerViewportInset.maxBlockSize})`,
      `calc(${layerViewportInset.maxBlockSizeFallback})`,
    ),
  },
  surfaceScrollable: {
    overflow: 'auto',
    overscrollBehavior: 'contain',
  },
  // An explicit width renders at its size up to the viewport cap, never
  // shrunk to the room beside the trigger (spec:AST-059 FR2). Keywords cannot
  // sit inside min(); the surface cap above bounds them.
  customWidth: (width: string) => ({
    width,
  }),
  // Without a width the surface prefers the trigger's minimum width, clamped
  // by the runtime's cap because a CSS minimum beats a maximum (FR7).
  matchTrigger: {
    minWidth: stylex.firstThatWorks(
      `min(anchor-size(width), ${layerViewportInset.maxInlineSize})`,
      `min(anchor-size(width), ${layerViewportInset.maxInlineSizeFallback})`,
      'anchor-size(width)',
    ),
  },
});

// =============================================================================
// Component
// =============================================================================

/**
 * A click-triggered popover for displaying interactive content anchored to a trigger.
 *
 * Implements the button + dialog ARIA pattern. The trigger must contain a
 * `<button>` or `[role="button"]` element — the popover finds it and applies
 * click/keydown handlers and ARIA attributes automatically.
 *
 * Uses an inline-flex wrapper as the CSS anchor for stable positioning
 * (immune to pressed-state transforms like `:active { scale(0.98) }`).
 *
 * Focus is trapped inside the popover when open.
 * Supports light dismiss by default (click outside or Escape to close).
 *
 * For hover-triggered overlays, use {@link HoverCard} instead.
 *
 * @example
 * ```
 * <Popover label="Settings" content={<SettingsPanel />} placement="below">
 *   <Button label="Settings" />
 * </Popover>
 * <Popover
 *   isOpen={isOpen}
 *   onOpenChange={setIsOpen}
 *   label="Filter"
 *   content={<FilterForm />}>
 *   <Button label="Filter" />
 * </Popover>
 * <Popover
 *   anchorRef={myButtonRef}
 *   label="Actions"
 *   content={<ActionMenu />}
 *   placement="below"
 * />
 * ```
 */
export function Popover({
  children,
  anchorRef,
  content,
  placement = 'below',
  alignment = 'start',
  isOpen,
  onOpenChange,
  isEnabled = true,
  width,
  padding = 3,
  label,
  role = 'dialog',
  isModal,
  hasCloseButton,
  closeButtonLabel,
  hasAutoFocus,
  hasLightDismiss = true,
  hasEscapeDismiss = true,
  presentation = 'popover',
  xstyle,
  className,
  style,
  'data-testid': testId,
}: PopoverProps): ReactElement {
  const t = useTranslator();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const measurementFrameRef = useRef<number | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const isControlled = isOpen !== undefined;
  // The bottom-sheet presentation: the surface it resolves to now, and
  // whether the sheet is the surface that is open.
  const resolvedPresentation = usePresentationSurface(presentation);
  const [isSheetOpenState, setIsSheetOpenState] = useState(false);

  const handlePopoverShow = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handlePopoverHide = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  const popover = usePopover({
    dialogLabel: label,
    role,
    isModal,
    hasLightDismiss,
    hasEscapeDismiss,
    hasCloseButton,
    closeButtonLabel,
    hasAutoFocus,
    // The surface is the box that paints background, radius and elevation, so
    // it is the element the `popover` theme target has to sit on — a target on
    // the content div inside it styles a box that paints nothing.
    surfaceTarget: 'popover',
    // Surface padding is a usePopover option so it lands on that same box,
    // where a theme's `padding` replaces it instead of nesting inside it.
    padding,
    xstyle: [
      styles.surfaceViewportFit,
      hasOverflow && styles.surfaceScrollable,
      xstyle,
    ],
    className,
    style,
    onShow: handlePopoverShow,
    onHide: handlePopoverHide,
  });

  // A controlled popover opens on the surface its presentation resolves to
  // as it opens, and keeps that surface until it closes: a phone rotated past
  // the compact width while the sheet is open keeps its sheet.
  const [controlledSurface, setControlledSurface] = useState<
    'popover' | 'bottom-sheet' | null
  >(null);
  // The latch is set during render, as the controlled `isOpen` turns on or
  // off, so the open surface is known in the same render that opens it.
  if (isControlled) {
    if (isOpen !== true && controlledSurface != null) {
      setControlledSurface(null);
    } else if (isOpen === true && controlledSurface == null) {
      setControlledSurface(popover.isOpen ? 'popover' : resolvedPresentation);
    }
  }
  const isSheetOpen = isControlled
    ? isOpen === true && controlledSurface === 'bottom-sheet'
    : isSheetOpenState;
  // One presentation at a time (architecture:component-style-authoring
  // INV7): the sheet is mounted, in place of the anchored layer, while it is
  // the surface an opening would choose (a compact touch screen, or
  // `'bottom-sheet'`) and the anchored popover is not the open one, while it
  // is open, and through its exit after it was. Closed, it holds the content
  // as the anchored layer does, so state kept in the content (a ticked box,
  // typed text) survives a reopen. After a sheet closes on a screen that has
  // stopped being compact, it stays through its exit, so the exit plays out
  // and its dialog hands focus back to the trigger (component:Popover AR4),
  // and gives way to the anchored layer once its dialog has closed.
  const [hasSheetBeenOpen, setHasSheetBeenOpen] = useState(false);
  // The trigger's text, which names a sheet that has no `label` (DEC-8).
  const [triggerText, setTriggerText] = useState('');
  if (isSheetOpen && !hasSheetBeenOpen) {
    setHasSheetBeenOpen(true);
  }
  const isSheetMounted =
    isSheetOpen ||
    hasSheetBeenOpen ||
    (resolvedPresentation === 'bottom-sheet' && !popover.isOpen);
  const sheetPanelRef = useRef<HTMLDivElement | null>(null);
  const [isSheetPanelAttached, setSheetPanelAttached] = useState(false);
  const attachSheetPanel = useCallback((panel: HTMLDivElement | null) => {
    sheetPanelRef.current = panel;
    setSheetPanelAttached(panel != null);
  }, []);
  // Focus enters the sheet at each opening as it enters the anchored popover
  // (FR2): a caller's `[data-autofocus]`, else the first genuine content
  // control (never the injected fallback close, never BottomSheet's own
  // scroll area), else that scroll area: the sheet's labelled surface, which
  // paints the shared focus ring under the keyboard. It runs a frame after
  // BottomSheet presents the dialog; BottomSheet is unchanged.
  useEffect(() => {
    if (!isSheetOpen || !isSheetPanelAttached) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const sheetPanel = sheetPanelRef.current;
      if (sheetPanel == null) {
        return;
      }
      const dialog = sheetPanel.closest('dialog');
      if (dialog == null || !dialog.open) {
        return;
      }
      const active = sheetPanel.ownerDocument.activeElement;
      if (
        active != null &&
        active !== sheetPanel &&
        active !== dialog &&
        sheetPanel.contains(active)
      ) {
        return;
      }
      const target =
        sheetPanel.querySelector<HTMLElement>('[data-autofocus]') ??
        Array.from(
          sheetPanel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).find(
          element =>
            // BottomSheet's scroll area is the panel's own child; content
            // sits inside it.
            element.parentElement !== sheetPanel &&
            element.closest('[data-astryx-popover-fallback-close]') == null,
        );
      if (target != null) {
        target.focus({preventScroll: true});
        return;
      }
      // The scroll area is a tab stop only while its content overflows; it is
      // focusable from script either way.
      const surface = Array.from(sheetPanel.children).find(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          child.getAttribute('role') === 'group',
      );
      if (surface == null) {
        return;
      }
      if (!surface.hasAttribute('tabindex')) {
        surface.tabIndex = -1;
      }
      surface.focus({preventScroll: true});
    });
    return () => cancelAnimationFrame(frame);
  }, [isSheetOpen, isSheetPanelAttached]);
  useEffect(() => {
    if (isSheetOpen || !hasSheetBeenOpen) {
      return;
    }
    const dialog = sheetPanelRef.current?.closest('dialog');
    if (dialog == null || !dialog.open) {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- syncs with the sheet's <dialog>: it is already closed, so its close event has fired and its exit is over; unmount it
      setHasSheetBeenOpen(false);
      return;
    }
    const handleClose = () => setHasSheetBeenOpen(false);
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [hasSheetBeenOpen, isSheetOpen]);
  // An open on a compact touch screen shows the sheet at once: its module
  // loads as soon as the sheet can be the surface, with nothing rendered.
  useEffect(() => {
    if (resolvedPresentation === 'bottom-sheet') {
      preloadPopoverBottomSheet();
    }
  }, [resolvedPresentation]);
  const isAnySurfaceOpen = popover.isOpen || isSheetOpen;
  const sheetId = `${popover.id}-sheet`;

  const setSheetOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setIsSheetOpenState(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const measureOverflow = useCallback(() => {
    const surface = popover.contentRef.current;
    if (!surface) {
      return;
    }
    const nextHasOverflow =
      surface.scrollHeight > surface.clientHeight + 1 ||
      surface.scrollWidth > surface.clientWidth + 1;
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- DOM overflow measurement controls whether this surface becomes a scroll container
    setHasOverflow(current =>
      current === nextHasOverflow ? current : nextHasOverflow,
    );
  }, [popover.contentRef]);

  const scheduleOverflowMeasurement = useCallback(() => {
    if (measurementFrameRef.current != null) {
      return;
    }
    measurementFrameRef.current = window.requestAnimationFrame(() => {
      measurementFrameRef.current = null;
      measureOverflow();
    });
  }, [measureOverflow]);

  useIsomorphicLayoutEffect(() => {
    if (!popover.isOpen) {
      return;
    }
    const surface = popover.contentRef.current;
    if (!surface) {
      return;
    }
    measureOverflow();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(scheduleOverflowMeasurement);
    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(scheduleOverflowMeasurement);
    resizeObserver?.observe(surface);
    mutationObserver?.observe(surface, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    surface.addEventListener('load', scheduleOverflowMeasurement, true);
    window.addEventListener('resize', scheduleOverflowMeasurement);
    window.visualViewport?.addEventListener(
      'resize',
      scheduleOverflowMeasurement,
    );
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      surface.removeEventListener('load', scheduleOverflowMeasurement, true);
      window.removeEventListener('resize', scheduleOverflowMeasurement);
      window.visualViewport?.removeEventListener(
        'resize',
        scheduleOverflowMeasurement,
      );
      if (measurementFrameRef.current != null) {
        window.cancelAnimationFrame(measurementFrameRef.current);
        measurementFrameRef.current = null;
      }
    };
  }, [measureOverflow, popover.isOpen, scheduleOverflowMeasurement]);

  useIsomorphicLayoutEffect(() => {
    if (!popover.isOpen) {
      return;
    }
    scheduleOverflowMeasurement();
  }, [content, popover.isOpen, scheduleOverflowMeasurement]);

  // Shared handler for click events on the trigger button.
  // A render-prop trigger is the caller's element, reached through the ref
  // the render prop hands it; its text names a sheet that has no `label`.
  const renderTriggerRef = useRef<HTMLElement | null>(null);
  const setRenderTrigger = useCallback(
    (element: HTMLElement | null) => {
      renderTriggerRef.current = element;
      popover.triggerRef(element);
    },
    [popover],
  );
  const handleTriggerClick = useCallback(
    (event?: {currentTarget: EventTarget | null}) => {
      // An aria-disabled trigger stays focusable but opens nothing
      // (spec:AST-085 FR2), even for a click dispatched straight on it.
      const trigger = event?.currentTarget;
      if (
        !isEnabled ||
        (trigger instanceof Element &&
          trigger.getAttribute('aria-disabled') === 'true')
      ) {
        return;
      }
      // Opening chooses the surface; an open popover closes as a popover.
      if (
        isSheetOpen ||
        (!popover.isOpen && resolvedPresentation === 'bottom-sheet')
      ) {
        const opener =
          trigger instanceof HTMLElement ? trigger : renderTriggerRef.current;
        if (opener != null) {
          setTriggerText(readTriggerText(opener));
        }
        setSheetOpen(!isSheetOpen);
        return;
      }
      popover.toggle();
    },
    [isEnabled, isSheetOpen, popover, resolvedPresentation, setSheetOpen],
  );

  // Shared handler for keydown events on role="button" elements.
  // Native <button> synthesizes click on Enter/Space, but role="button"
  // does not — we need to handle it explicitly.
  const handleTriggerKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTriggerClick(e);
      }
    },
    [handleTriggerClick],
  );

  /**
   * Attach click/keydown handlers and ARIA attributes to a trigger button.
   * Used by both sibling mode and children mode.
   */
  const attachTrigger = useCallback(
    (button: HTMLElement) => {
      // ARIA attributes
      // The sheet's surface is a dialog whatever the popover's role.
      button.setAttribute(
        'aria-haspopup',
        isSheetMounted ? 'dialog' : popover.triggerProps['aria-haspopup'],
      );
      button.setAttribute('aria-expanded', String(isAnySurfaceOpen));
      button.setAttribute(
        'aria-controls',
        isSheetMounted ? sheetId : popover.triggerProps['aria-controls'],
      );
      // The trigger's text is in the DOM the caller rendered, read as the
      // trigger attaches; it names a sheet that has no `label` (DEC-8).
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- reads the caller-rendered trigger's text, which only the DOM holds
      setTriggerText(readTriggerText(button));

      // Event handlers
      button.addEventListener('click', handleTriggerClick);
      // Only add keydown for role="button" — native <button> already
      // synthesizes click events for Enter/Space.
      const needsKeyDown =
        button.tagName !== 'BUTTON' && button.getAttribute('role') === 'button';
      if (needsKeyDown) {
        button.addEventListener('keydown', handleTriggerKeyDown);
      }

      return () => {
        button.removeAttribute('aria-haspopup');
        button.removeAttribute('aria-expanded');
        button.removeAttribute('aria-controls');
        button.removeEventListener('click', handleTriggerClick);
        if (needsKeyDown) {
          button.removeEventListener('keydown', handleTriggerKeyDown);
        }
      };
    },
    [
      popover,
      isAnySurfaceOpen,
      isSheetMounted,
      sheetId,
      handleTriggerClick,
      handleTriggerKeyDown,
    ],
  );

  // Sibling mode: attach to external anchorRef
  useIsomorphicLayoutEffect(() => {
    if (!anchorRef) {
      return;
    }

    const el = anchorRef.current;
    if (!el) {
      return;
    }

    const button = findTriggerButton(el);
    if (!button) {
      devWarn(
        'Popover',
        'anchorRef must reference a <button> or [role="button"] element. ' +
          'The popover trigger implements the button + dialog ARIA pattern.',
      );
    }
    if (!button) {
      return;
    }

    // Set up anchor positioning on the anchorRef element itself
    popover.triggerRef(el);

    // Attach handlers + ARIA to the button
    const detach = attachTrigger(button);

    return () => {
      popover.triggerRef(null);
      detach();
    };
  }, [anchorRef, popover, attachTrigger]);

  // Children mode: use wrapper as CSS anchor, find button inside for
  // ARIA + event handlers.
  useIsomorphicLayoutEffect(() => {
    if (anchorRef) {
      return;
    } // Skip if using anchorRef mode
    if (typeof children === 'function') {
      return;
    } // Skip if using render prop mode

    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    // Use the wrapper as the CSS anchor — it doesn't receive pressed-state
    // transforms, so the anchor position stays stable.
    popover.triggerRef(wrapper);

    // Find the button inside the wrapper
    const button = findTriggerButton(wrapper);
    if (!button) {
      devWarn(
        'Popover',
        'children must contain a <button> or [role="button"] element. ' +
          'The popover trigger implements the button + dialog ARIA pattern.',
      );
    }
    if (!button) {
      return;
    }

    const detach = attachTrigger(button);

    return () => {
      popover.triggerRef(null);
      detach();
    };
  }, [anchorRef, popover, attachTrigger]);

  // Sync controlled state: show or hide the anchored popover, the one surface
  // with an imperative API, to follow the latch. The sheet follows the latch
  // in render (`isSheetOpen`).
  useIsomorphicLayoutEffect(() => {
    if (!isControlled) {
      return;
    }
    if (!isOpen) {
      if (popover.isOpen) {
        popover.hide();
      }
      return;
    }
    if (controlledSurface === 'popover' && !popover.isOpen) {
      popover.show();
    }
  }, [isOpen, isControlled, popover, controlledSurface]);

  // Popover's one sizing fact: an explicit width wins over trigger matching.
  // Fit against the viewport is the layer runtime's (spec:AST-059).
  const popoverSizeXstyle = !width
    ? styles.matchTrigger
    : styles.customWidth(
        typeof width === 'string' && isIntrinsicInlineSize(width)
          ? width.trim()
          : clampInlineSize(width, layerViewportInset.maxInlineSizeFallback),
      );
  const layerXstyle = [popoverSizeXstyle, layerAnimations[placement]];

  // One instance of the content at a time: the sheet holds it while it is
  // mounted, the anchored layer otherwise.
  const isContentInSheet = isSheetMounted;
  const anchoredContent = (
    <div data-testid={isContentInSheet ? undefined : testId}>
      {isContentInSheet ? null : content}
    </div>
  );
  // The sheet renders while it is the open surface and through its exit. It
  // always light-dismisses: a tap outside it or a swipe down closes it,
  // whatever `hasLightDismiss` says, so a finger always has a way out
  // (DEC-8). Escape follows `hasEscapeDismiss`, and the fallback close stays
  // hidden until it is reached, as on the anchored surface.
  const sheet = isSheetMounted ? (
    <BottomSheetEscapeContext value={hasEscapeDismiss}>
      <PopoverBottomSheet
        ref={attachSheetPanel}
        id={sheetId}
        isOpen={isSheetOpen}
        onOpenChange={setSheetOpen}
        label={label ?? triggerText}
        height="tall"
        padding={padding}
        xstyle={xstyle}
        className={className}
        style={style}
        data-testid={isContentInSheet ? testId : undefined}>
        {isContentInSheet ? content : null}
        {isContentInSheet && hasCloseButton !== false ? (
          <Button
            data-astryx-popover-fallback-close=""
            variant="secondary"
            label={closeButtonLabel ?? t('@astryx.popover.close')}
            onClick={() => setSheetOpen(false)}
            xstyle={styles.sheetFallbackClose}
          />
        ) : null}
      </PopoverBottomSheet>
    </BottomSheetEscapeContext>
  ) : null;

  // The anchored layer, unless the sheet is the presentation that is mounted.
  const anchoredLayer = isSheetMounted
    ? null
    : popover.render(anchoredContent, {
        placement,
        alignment,
        offset: spacingVars['--spacing-1'],
        xstyle: layerXstyle,
      });

  // Sibling mode: render only the popover (no wrapper needed)
  if (anchorRef && children == null) {
    return (
      <>
        {anchoredLayer}
        {sheet}
      </>
    );
  }

  // Render prop mode: children is a function — pass trigger props directly
  const isRenderProp = typeof children === 'function';

  if (isRenderProp) {
    const triggerProps: PopoverTriggerRenderProps = {
      ref: setRenderTrigger,
      // The caller renders and owns this trigger element.
      onClick: () => handleTriggerClick(),
      'aria-haspopup': 'dialog',
      'aria-expanded': isAnySurfaceOpen,
      'aria-controls': isSheetMounted ? sheetId : popover.id,
    };

    return (
      <>
        {children(triggerProps)}
        {anchoredLayer}
        {sheet}
      </>
    );
  }

  // Automatic mode: wrap children in context + anchor wrapper
  return (
    <>
      <InteractiveRoleContext value="button">
        <div ref={wrapperRef} {...stylex.props(styles.anchorWrapper)}>
          {children}
        </div>
      </InteractiveRoleContext>
      {anchoredLayer}
      {sheet}
    </>
  );
}

Popover.displayName = 'Popover';
