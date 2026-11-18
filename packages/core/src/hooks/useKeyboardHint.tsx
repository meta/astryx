// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useKeyboardHint.tsx
 * @input Uses React, StyleX, Kbd, useLayer, the shared anchored hint
 *   (hooks/anchoredHint.tsx), i18n (useComponentTranslator)
 * @output Exports useKeyboardHint hook — ephemeral arrow-key navigation hint
 * @position Core hook; shows sighted keyboard users how to navigate composite
 *   widgets that use roving tabindex (single Tab stop, arrows inside)
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/anchoredHint.tsx
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useKeyboardHint.doc.mjs
 * - /apps/storybook/stories/useKeyboardHint.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Hooks/useKeyboardHintHookUsage.tsx
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Kbd} from '../Kbd';
import {useLayer} from '../Layer/useLayer';
import {useLayerDismissal} from '../Layer/useLayerDismissal';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/hooks/useKeyboardHint.generated';
import {anchoredHintStyles, renderAnchoredHint} from './anchoredHint';

registerEnglishFallback(english);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyboardHintOrientation = 'horizontal' | 'vertical' | 'both';

export interface UseKeyboardHintOptions {
  /**
   * Orientation of the arrow-key navigation. Controls which arrow icons are
   * shown in the hint badge.
   * - `'horizontal'` → ← →
   * - `'vertical'` → ↑ ↓
   * - `'both'` → ← → ↑ ↓
   * @default 'horizontal'
   */
  orientation?: KeyboardHintOrientation;

  /**
   * Milliseconds before the hint dismisses itself after appearing. Leave it
   * unset: by default the hint stays until the person presses an arrow key or
   * Escape, or moves focus out of the group. A time limit can remove the hint
   * before someone has read it (WCAG 1.4.13).
   * @default undefined (no time limit)
   */
  dismissAfterMs?: number;

  /**
   * Whether the hint is enabled. Set to false to disable for a specific
   * instance (e.g. when the widget is read-only or the user has dismissed
   * globally).
   * @default true
   */
  isEnabled?: boolean;
}

export interface UseKeyboardHintReturn {
  /**
   * The popover hint element to render inside your component tree (portals to
   * top layer via `popover="manual"`). Render unconditionally — it manages its
   * own visibility.
   */
  hintElement: ReactNode;

  /**
   * Attach to the composite container's `onFocus`. Shows the hint on the first
   * keyboard-focus (`:focus-visible`) entry from outside.
   */
  onFocus: (e: React.FocusEvent) => void;

  /**
   * Attach to the composite container's `onBlur`. Hides the hint when focus
   * leaves the composite entirely.
   */
  onBlur: (e: React.FocusEvent) => void;

  /**
   * Attach to the composite container's `onKeyDown`. Dismisses the hint on the
   * first arrow press (the user discovered the interaction). Escape dismisses
   * it through the shared layer dismissal stack, without moving focus.
   */
  onKeyDown: (e: React.KeyboardEvent) => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

const ARROW_HINT_KEYS: Record<
  KeyboardHintOrientation,
  ReadonlyArray<string>
> = {
  horizontal: ['left', 'right'],
  vertical: ['up', 'down'],
  both: ['left', 'right', 'up', 'down'],
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Shows an ephemeral visual hint ("← → to navigate") anchored to the focused
 * item when a composite widget first receives keyboard focus. Teaches sighted
 * keyboard users that arrows navigate within the group.
 *
 * The hint renders in the top layer (popover="manual") and is CSS-anchor-
 * positioned to the currently focused element, so it is never clipped by
 * overflow containers. It stays until the first arrow press, Escape, or blur,
 * and does not re-show for that instance.
 *
 * @example
 * ```
 * const hint = useKeyboardHint({orientation: 'horizontal'});
 * <div role="toolbar" onFocus={hint.onFocus} onBlur={hint.onBlur} onKeyDown={hint.onKeyDown}>
 *   {children}
 *   {hint.hintElement}
 * </div>
 * ```
 */
export function useKeyboardHint(
  options: UseKeyboardHintOptions = {},
): UseKeyboardHintReturn {
  const {
    orientation = 'horizontal',
    dismissAfterMs,
    isEnabled = true,
  } = options;

  const t = useComponentTranslator();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedRef = useRef(false);
  const isVisibleRef = useRef(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const layerAnchorRef = useRef<(el: HTMLElement | null) => void>(() => {});

  const clearDismissTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Registered on the layer stack only while the hint shows, so it registers
  // after its anchor is set and ranks in the anchor's document.
  const [isShowing, setIsShowing] = useState(false);

  const handleLayerShow = useCallback(() => {
    isVisibleRef.current = true;
  }, []);

  const handleLayerHide = useCallback(() => {
    isVisibleRef.current = false;
    setIsShowing(false);
    clearDismissTimeout();
    layerAnchorRef.current(null);
  }, [clearDismissTimeout]);

  const layer = useLayer({
    mode: 'context',
    onShow: handleLayerShow,
    onHide: handleLayerHide,
  });
  layerAnchorRef.current = layer.ref;

  // Hide + mark dismissed (won't re-show for this instance)
  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    clearDismissTimeout();
    layer.hide();
    isVisibleRef.current = false;
    layerAnchorRef.current(null);
  }, [clearDismissTimeout, layer]);

  // Show the layer anchored to the focused element
  const show = useCallback(
    (anchor: HTMLElement) => {
      if (dismissedRef.current || !isEnabled) {
        return;
      }

      anchorRef.current = anchor;
      layerAnchorRef.current(anchor);
      setIsShowing(true);
      layer.show();

      clearDismissTimeout();
      if (dismissAfterMs != null) {
        timeoutRef.current = setTimeout(() => {
          dismiss();
        }, dismissAfterMs);
      }
    },
    [clearDismissTimeout, dismiss, dismissAfterMs, isEnabled, layer],
  );

  // Registered while the hint shows, in its anchor's document. The hint's
  // host is a layer, so a hint in a dialog ranks above that dialog.
  useLayerDismissal({
    isActive: isShowing,
    isPresent: () => isVisibleRef.current,
    onDismiss: dismiss,
    getContainer: () => anchorRef.current,
  });

  // Releases the dismiss timer and the layer anchor on unmount.
  useEffect(
    () => () => {
      clearDismissTimeout();
      layerAnchorRef.current(null);
    },
    [clearDismissTimeout],
  );

  // --- Handlers ---

  const onFocus = useCallback(
    (e: React.FocusEvent) => {
      if (dismissedRef.current || !isEnabled) {
        return;
      }
      // Only show on keyboard focus (focus-visible)
      const target = e.target as HTMLElement;
      if (!target.matches(':focus-visible')) {
        return;
      }
      const container = e.currentTarget as HTMLElement;
      // React bubbles focus from portaled children (a sheet or popover opened
      // from the row) to the container; that focus is not in the row, where
      // the arrow keys work, so it neither shows nor spends the hint.
      if (!container.contains(target)) {
        return;
      }
      // Only show when focus enters from outside the container
      if (
        e.relatedTarget instanceof Node &&
        container.contains(e.relatedTarget)
      ) {
        return;
      }
      show(target);
    },
    [show, isEnabled],
  );

  const onBlur = useCallback(
    (e: React.FocusEvent) => {
      if (!isVisibleRef.current) {
        return;
      }
      const container = e.currentTarget as HTMLElement;
      // Only dismiss when focus leaves the container entirely
      if (
        e.relatedTarget instanceof Node &&
        container.contains(e.relatedTarget)
      ) {
        // Focus moved within — re-anchor to the new target
        if (!dismissedRef.current && e.relatedTarget instanceof HTMLElement) {
          layerAnchorRef.current(e.relatedTarget);
        }
        return;
      }
      dismiss();
    },
    [dismiss],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isVisibleRef.current) {
        return;
      }
      if (ARROW_KEYS.has(e.key)) {
        dismiss();
      }
    },
    [dismiss],
  );

  // --- Render the hint element ---

  const arrowContent = (
    <span {...stylex.props(anchoredHintStyles.keys)}>
      {ARROW_HINT_KEYS[orientation].map(key => (
        <Kbd key={key} keys={key} />
      ))}
    </span>
  );

  const hintElement = renderAnchoredHint(
    layer,
    <span aria-hidden="true">
      {arrowContent}
      <span {...stylex.props(anchoredHintStyles.label)}>
        {t('@astryx.keyboardHint.toNavigate')}
      </span>
    </span>,
  );

  return {hintElement, onFocus, onBlur, onKeyDown};
}
