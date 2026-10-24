// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file usePopover.tsx
 * @input Uses useLayer, useFocusTrap, React hooks
 * @output Exports the public usePopover hook with derived focus and guarded opening.
 * @position Higher-level layer utility; used by DatePicker, Combobox, etc.
 *
 * Combines popover layer behavior with focus trap for dialog-like popovers.
 * Use this for interactive popover content that should trap focus.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Popover/index.ts
 */

import React, {useCallback, useEffect, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useLayer, type ContextRenderProps} from '../Layer/useLayer';
import {useFocusTrap} from '../hooks/useFocusTrap';
import {LayerDepthProvider} from '../Layer/LayerDepthContext';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  colorVars,
  spacingVars,
  radiusVars,
  shadowVars,
} from '../theme/tokens.stylex';
import {Button} from '../Button';
import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {rtlStyles} from '../utils';
import {useTranslator} from '../i18n';
import {useDevWarning} from '../hooks/useDevWarning';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {mergeProps} from '../utils/mergeProps';
import {themeProps} from '../utils/themeProps';
import {paddingStyles} from '../Layout/padding.stylex';
import type {SpacingStep} from '../utils/types';
import {stableClassName} from '../naming';

const FALLBACK_CLOSE_SELECTOR = '[data-astryx-popover-fallback-close]';

function attemptFocus(element: HTMLElement): boolean {
  try {
    element.focus();
  } catch {
    // Ignore non-focusable elements; the caller will try the next target.
  }
  return document.activeElement === element;
}

function focusFirstContentControl(container: HTMLElement): boolean {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(element => element.closest(FALLBACK_CLOSE_SELECTOR) == null);
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
   * Whether the dialog is modal (`aria-modal`). Only applies when `role` is
   * `'dialog'`. Set to `false` for non-modal dialogs that do not inert the rest
   * of the page.
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
  options: UsePopoverOptions = {},
): UsePopoverReturn {
  const {
    onShow,
    onHide,
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
  } = options;

  const t = useTranslator();
  const closeButtonLabel =
    closeButtonLabelFromProps ?? t('@astryx.popover.close');

  // Track the trigger element for returning focus
  const triggerElementRef = useRef<HTMLElement | null>(null);

  // Track whether to skip auto-focus for the current open event
  const skipAutoFocusRef = useRef(false);

  // Core layer for popover positioning
  const layer = useLayer({
    mode: 'context',
    lightDismiss: hasLightDismiss,
    onShow,
    onHide,
  });

  // Focus trap for the popover content. Escape stays registered while light
  // dismiss is on (native popover="auto" closes on Escape regardless), so a
  // host Dialog keeps deferring to this trap instead of double-dismissing.
  const {containerRef: contentRef, focusFirst} = useFocusTrap<HTMLDivElement>({
    isActive: layer.isOpen,
    onEscape: hasEscapeDismiss || hasLightDismiss ? layer.hide : undefined,
  });

  const focusInitialTarget = useCallback(() => {
    const container = contentRef.current;
    if (!container) {
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
      return;
    }
    if (hasAutoFocus && !skipAutoFocusRef.current) {
      // Wait a frame so the content is mounted. A popover that closes or
      // unmounts first cancels it: the frame would otherwise move focus into
      // content that is no longer shown, after the close had left it alone.
      const frame = requestAnimationFrame(focusInitialTarget);
      return () => cancelAnimationFrame(frame);
    }
  }, [layer.isOpen, hasAutoFocus, focusInitialTarget]);

  // Combined ref for trigger element (layer anchor + our ref)
  const triggerRef = useCallback(
    (el: HTMLElement | null) => {
      triggerElementRef.current = el;
      layer.ref(el);
    },
    [layer],
  );

  // Show function with optional focus preservation
  const show = useCallback(
    (showOptions?: {skipAutoFocus?: boolean}) => {
      skipAutoFocusRef.current = showOptions?.skipAutoFocus ?? false;
      layer.show();
    },
    [layer],
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
            role={role === 'dialog' ? 'dialog' : undefined}
            aria-modal={role === 'dialog' && isModal ? true : undefined}
            aria-label={role === 'dialog' ? dialogLabel : undefined}
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
        {...props, xstyle: props?.xstyle},
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
      role,
      isModal,
      xstyle,
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
