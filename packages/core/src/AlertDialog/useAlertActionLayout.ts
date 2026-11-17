// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useAlertActionLayout.ts
 * @input The row holding the alert's actions, their labels, the alert's
 *   title, the document's fonts, and whether the compact touch layout applies
 * @output useAlertActionLayout and resolveAlertActionLayout: whether two
 *   actions share a row or stack, and the callback ref that takes the title
 * @position Internal hook of AlertDialog: its compact touch action layout
 *
 * A decision never resizes the watched title, but it resizes the row that
 * other observers watch. So a decision that a resize report starts waits for
 * the next frame.
 */

import {useCallback, useEffect, useState, type RefObject} from 'react';
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
  /**
   * The alert is shown. A modal alert's dialog opens in Dialog's passive
   * effect, before the hook's own, where the hook decides.
   */
  isShown: boolean;
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
  {isCompact, isShown, itemSelector, labels}: AlertActionLayoutOptions,
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
    const labels = new Set(labelKey.split('\u0000'));
    const commit = () => {
      const next = measureLayout(row, itemSelector, labels);
      if (next != null) {
        // A font load and a frame callback run outside React's work: the
        // decided layout commits before the next paint.
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the next frame must paint the decided layout
        flushSync(() => {
          setLayout(next);
        });
      }
    };
    let isRegistering = true;
    let frame: number | null = null;
    const onResize = () => {
      if (isRegistering) {
        // The registration call runs inside this effect: a plain update
        // still commits before the first paint.
        const next = measureLayout(row, itemSelector, labels);
        if (next != null) {
          setLayout(next);
        }
        return;
      }
      // A commit inside the observer's callback resizes the row and the
      // dialog that other observers watch, and the browser then reports an
      // observer loop.
      frame ??= requestAnimationFrame(() => {
        frame = null;
        commit();
      });
    };
    const fonts: FontFaceSet | undefined = row.ownerDocument.fonts;
    fonts?.addEventListener('loadingdone', commit);
    const stop = observeResize(watched, onResize);
    isRegistering = false;
    return () => {
      stop();
      if (frame != null) {
        cancelAnimationFrame(frame);
      }
      fonts?.removeEventListener('loadingdone', commit);
    };
  }, [isCompact, itemSelector, labelKey, rowRef, watched]);

  // Dialog opens a modal alert in its passive effect, which runs before this
  // one. A decision here commits before the dialog's first layout, so the
  // observer's first report finds it made.
  useEffect(() => {
    const row = rowRef.current;
    if (!isCompact || !isShown || row == null) {
      return;
    }
    const next = measureLayout(
      row,
      itemSelector,
      new Set(labelKey.split('\u0000')),
    );
    if (next == null) {
      return;
    }
    // React cannot commit inside its own effects. A microtask runs after them
    // and before the frame. An unchanged layout commits nothing, so the row is
    // measured once per open.
    let isActive = true;
    queueMicrotask(() => {
      if (isActive) {
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the dialog's first frame must paint the decided layout
        flushSync(() => {
          setLayout(next);
        });
      }
    });
    return () => {
      isActive = false;
    };
  }, [isCompact, isShown, itemSelector, labelKey, rowRef]);

  return {layout: isCompact ? layout : 'row', watchRef};
}

/**
 * The row's layout from its width, gap and labels, or null while the row is
 * not laid out: a closed dialog keeps the last decision.
 */
function measureLayout(
  row: HTMLElement,
  itemSelector: string,
  labels: ReadonlySet<string>,
): AlertActionLayout | null {
  const available = row.clientWidth;
  if (available <= 0) {
    return null;
  }
  const actions = [...row.querySelectorAll<HTMLElement>(itemSelector)];
  return resolveAlertActionLayout({
    available,
    gap: gapOf(row),
    widths: actions.map(action => requiredWidth(action, labels)),
  });
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
