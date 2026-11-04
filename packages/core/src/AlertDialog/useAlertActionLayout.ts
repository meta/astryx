// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAlertActionLayout.ts
 * @input The row holding the alert's actions, their labels, the alert's
 *   title element, the document's fonts, and whether the compact touch
 *   layout applies
 * @output Exports useAlertActionLayout and resolveAlertActionLayout: whether
 *   an alert's two actions share a row or stack, and the callback ref that
 *   takes the title
 * @position Internal hook of AlertDialog: its compact touch action layout
 *
 * Two actions share a row, Cancel leading, when each label fits its own half
 * of the row on one line. They stack, the action above Cancel, when one does
 * not. The rule is per label, never the sum (`alertController.actions`).
 * AlertDialog applies it under a finger on a compact window only.
 *
 * The hook reads layout again when the alert's title changes size: its first
 * display, a rotation, a zoom. It also reads it when a web font finishes
 * loading, which can change a label's width but not the title's size. The
 * action layout never changes the title's size, so a decision never resizes
 * what the hook watches. Each label's single-line width does not depend on
 * the button's width.
 *
 * SYNC: When modified, update useAlertActionLayout.test.tsx and
 * __tests__/AlertDialog.layout.interaction.browser.spec.ts
 */

import {useCallback, useState, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {alertController} from '../motion/uikit/alert';
import {observeResize} from '../utils/sharedResizeObserver';

/** How an alert's actions are laid out. */
export type AlertActionLayout = 'row' | 'stack';

export interface AlertActionMeasure {
  /** Width of the row the actions share, px. */
  readonly available: number;
  /** Gap between two actions in a row, px. */
  readonly gap: number;
  /** Width each action needs to show its label on one line, px. */
  readonly widths: ReadonlyArray<number>;
}

/**
 * Two actions share a row when each one fits its own share of it on one line,
 * and stack otherwise. Three or more always stack, and one fills the row.
 */
export function resolveAlertActionLayout({
  available,
  gap,
  widths,
}: AlertActionMeasure): AlertActionLayout {
  if (widths.length <= 1) {
    return 'row';
  }
  if (widths.length > 2) {
    return 'stack';
  }
  const share = (available - gap) * alertController.actions.rowShare;
  return widths.every(width => width <= share) ? 'row' : 'stack';
}

export interface AlertActionLayoutOptions {
  /** The compact touch layout applies. Otherwise the hook reads nothing. */
  isCompact: boolean;
  /** Selects the actions inside the row. */
  itemSelector: string;
  /** The actions' labels. A change measures again. */
  labels: ReadonlyArray<string>;
}

export interface AlertActionLayoutResult {
  /** How the actions are laid out. */
  readonly layout: AlertActionLayout;
  /**
   * Callback ref for an element that shows with the actions and whose size
   * they never change: the alert's title.
   */
  readonly watchRef: (element: HTMLElement | null) => void;
}

export function useAlertActionLayout(
  rowRef: RefObject<HTMLElement | null>,
  {isCompact, itemSelector, labels}: AlertActionLayoutOptions,
): AlertActionLayoutResult {
  const [layout, setLayout] = useState<AlertActionLayout>('stack');
  // The title mounts and unmounts with the alert's content. An inline alert
  // renders nothing while it is closed.
  const [watched, setWatched] = useState<HTMLElement | null>(null);
  const watchRef = useCallback((element: HTMLElement | null) => {
    setWatched(element);
  }, []);
  const labelKey = labels.join('\u0000');

  // Synchronizes the decision with the alert's layout. A resize of the
  // watched element, or a web font that loads, reads the row and the labels
  // again.
  useIsomorphicLayoutEffect(() => {
    const row = rowRef.current;
    if (!isCompact || row == null || watched == null) {
      return;
    }
    const labelSet = new Set(labelKey.split('\u0000'));
    const measure = (): AlertActionLayout | null => {
      const available = row.clientWidth;
      // A closed dialog is not rendered: keep the last decision.
      if (available <= 0) {
        return null;
      }
      const actions = [...row.querySelectorAll<HTMLElement>(itemSelector)];
      return resolveAlertActionLayout({
        available,
        gap: gapOf(row),
        widths: actions.map(action => requiredWidth(action, labelSet)),
      });
    };
    let isRegistering = true;
    const update = () => {
      const next = measure();
      if (next == null) {
        return;
      }
      if (isRegistering) {
        // The registration call runs inside this effect: a plain update
        // still commits before the first paint.
        setLayout(next);
        return;
      }
      // The observer reports after layout and before paint, as on the
      // dialog's first display. Committing here paints the decided layout in
      // that frame. A font load commits before its next paint too. The
      // watched element keeps its size, so this starts no further
      // observation in the frame.
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the opening frame must paint the decided layout, and the observer runs between layout and paint
      flushSync(() => {
        setLayout(next);
      });
    };
    const fonts: FontFaceSet | undefined = row.ownerDocument.fonts;
    fonts?.addEventListener('loadingdone', update);
    const stop = observeResize(watched, update);
    isRegistering = false;
    return () => {
      stop();
      fonts?.removeEventListener('loadingdone', update);
    };
  }, [isCompact, itemSelector, labelKey, rowRef, watched]);

  return {layout: isCompact ? layout : 'row', watchRef};
}

/**
 * The row's gap between two actions, px: its column gap, which a flex row
 * computes as `normal`, no gap, when none is set.
 */
function gapOf(row: HTMLElement): number {
  const {columnGap} = getComputedStyle(row);
  return columnGap === 'normal' ? 0 : parseFloat(columnGap);
}

/**
 * The element holding an action's label: the deepest one whose text is one of
 * the labels. A loading action adds a spinner and its own text beside it. The
 * label's text clips with an ellipsis, so its scroll width is its full
 * single-line width.
 */
function labelElementOf(
  action: HTMLElement,
  labels: ReadonlySet<string>,
): HTMLElement | null {
  let found: HTMLElement | null = null;
  const walk = (element: HTMLElement) => {
    for (const child of element.children) {
      if (!(child instanceof HTMLElement)) {
        continue;
      }
      if (labels.has(child.textContent?.trim() ?? '')) {
        found = child;
      }
      walk(child);
    }
  };
  walk(action);
  return found;
}

/** The width an action needs to show its label on one line, px. */
function requiredWidth(
  action: HTMLElement,
  labels: ReadonlySet<string>,
): number {
  const style = getComputedStyle(action);
  const chrome =
    parseFloat(style.paddingLeft) +
    parseFloat(style.paddingRight) +
    parseFloat(style.borderLeftWidth) +
    parseFloat(style.borderRightWidth);
  const label = labelElementOf(action, labels);
  return (label?.scrollWidth ?? action.scrollWidth) + chrome;
}
