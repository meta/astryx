// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {ReactNode} from 'react';

/** Toast status type. Controls color scheme. */
export type ToastType = 'info' | 'error';

/** Position for the toast stack relative to the viewport. */
export type ToastPosition = 'topEnd' | 'topStart' | 'bottomEnd' | 'bottomStart';

/** Behavior when a toast with the same uniqueID already exists. */
export type ToastCollisionBehavior = 'overwrite' | 'ignore';

/** Reason why a toast was dismissed. */
export type ToastDismissReason = 'auto' | 'manual';

/** Options for showing a toast. */
export interface ToastOptions {
  /** Primary message content. */
  body: ReactNode;
  /**
   * Toast type controlling color.
   * @default 'info'
   */
  type?: ToastType;
  /**
   * Whether the toast auto-dismisses.
   * Defaults to true for info, false for error.
   */
  isAutoHide?: boolean;
  /**
   * Duration in ms before auto-dismiss.
   * @default 5000
   */
  autoHideDuration?: number;
  /** Content rendered at the end of the toast (trailing slot). */
  endContent?: ReactNode;
  /**
   * Replaces the content of this toast's card with your own layout.
   *
   * Astryx keeps the card and its auto-hide behavior (inside a
   * `ToastViewport` the viewport announces the toast, and while a modal hosts
   * the viewport the card announces itself), then hands the
   * renderer this toast's content, resolved settings and `dismiss` callback. The renderer owns every control inside its layout; call
   * `dismiss` from the control that should close the toast. Astryx does not
   * inject a fallback control into custom content.
   *
   * Per-toast rather than app-wide on purpose. An app that wants every one of
   * its toasts to share a layout wraps `useToast()` once and passes this on
   * every call; a toast raised by library code that knows nothing about that
   * wrapper then renders as an ordinary Astryx toast.
   */
  renderContent?: ToastContentRenderFn;

  /** Unique identifier for deduplication. */
  uniqueID?: string;
  /**
   * Behavior when a toast with matching uniqueID already exists.
   * @default 'overwrite'
   */
  collisionBehavior?: ToastCollisionBehavior;
  /** Callback fired when the toast is removed. */
  onHide?: (reason: ToastDismissReason) => void;
}

/** Function to programmatically dismiss a toast. */
export type ToastDismissFn = () => void;

/** Values passed to a custom toast content renderer. */
export interface ToastContentRenderProps {
  /** Primary message content, as passed to `showToast`. */
  body: ReactNode;
  /** Trailing content, as passed to `showToast`. Place it in your layout. */
  endContent?: ReactNode;
  /** Resolved toast type — `'error'` also makes the live region assertive. */
  type: ToastType;
  /** Whether this toast will dismiss itself. */
  isAutoHide: boolean;
  /** Milliseconds until auto-dismiss, when `isAutoHide`. */
  autoHideDuration: number;
  /**
   * Dismisses this toast with reason `'manual'`. Pass it through any nested
   * components that need to close the toast.
   */
  dismiss: ToastDismissFn;
}

/**
 * Renders the content of one toast inside Astryx's card — see
 * `ToastOptions.renderContent`.
 */
export type ToastContentRenderFn = (
  toast: ToastContentRenderProps,
) => ReactNode;

/** Function returned by useToast to show toasts. */
export type ShowToastFn = (options: ToastOptions) => ToastDismissFn;

/** Internal toast state with ID and metadata. */
export interface ToastEntry {
  id: string;
  options: ToastOptions;
  createdAt: number;
  /**
   * The row's identity in the stack. A uniqueID overwrite keeps the replaced
   * toast's, so the card updates in place and focus inside it stays.
   */
  rowKey?: string;
}
