// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCollapsible.ts
 * @input Uses React useState/use/useId, CollapsibleGroupContext
 * @output Exports useCollapsible hook, CollapsibleConfig, UseCollapsibleOptions, UseCollapsibleReturn types
 * @position Headless disclosure: the open-state machine (group, controlled,
 *   uncontrolled) and the props a caller-rendered trigger and content need.
 *   Collapsible and Banner use it. Content motion is a separate import,
 *   useCollapsibleContentMotion.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Collapsible/index.ts (exports)
 * - /packages/core/src/Collapsible/useCollapsible.doc.mjs
 */

import {useState, use, useId} from 'react';
import {CollapsibleGroupContext} from './CollapsibleGroupContext';

/**
 * Configuration for collapsible behavior.
 */
export type CollapsibleConfig = {
  /** Default open state for uncontrolled usage. @default true */
  defaultIsOpen?: boolean;
  /** Controlled open state. */
  isOpen?: boolean;
  /** Callback when open state changes. */
  onOpenChange?: (isOpen: boolean) => void;
};

export interface UseCollapsibleOptions {
  /**
   * Whether the component is collapsible.
   * - `true` — self-managed, starts open
   * - `{ defaultIsOpen: false }` — self-managed, starts collapsed
   * - `{ isOpen, onOpenChange }` — controlled externally
   */
  isCollapsible?: boolean | CollapsibleConfig;
  /**
   * Unique identifier within an CollapsibleGroup.
   * When present and inside a group, defers state to the group.
   */
  value?: string;
}

export interface UseCollapsibleReturn {
  /** Whether collapsible behavior is enabled. */
  isEnabled: boolean;
  /** Whether the content is currently open/expanded. */
  isOpen: boolean;
  /** Toggle the open/closed state. */
  toggle: () => void;
  /**
   * Props to spread on the trigger: a `<button>`, or a component that renders
   * one.
   */
  triggerProps: {
    /** Activation toggles the content and never submits a form. */
    type: 'button';
    /** Whether the content is open. */
    'aria-expanded': boolean;
    /** The id of the content element, which stays rendered while closed. */
    'aria-controls': string;
    /** Toggles the open state. */
    onClick: () => void;
  };
  /**
   * Props to spread on the content element. Render that element in every
   * state, and its children only while `isOpen`.
   */
  contentProps: {
    /** The id the trigger's `aria-controls` names. */
    id: string;
    /** Hidden while the content is closed. */
    hidden: boolean;
  };
}

/**
 * Hook that encapsulates collapsible state management, and the props that
 * wire a caller-rendered trigger to its content.
 *
 * Supports three modes:
 * 1. **Group-controlled**: When inside a CollapsibleGroup with a `value`, defers to group.
 * 2. **Controlled**: When `isOpen` is provided in config, the parent owns state;
 *    `toggle` only calls `onOpenChange` and never mutates internal state.
 * 3. **Uncontrolled**: Self-managed internal state with optional `defaultIsOpen`.
 *    `onOpenChange`, if supplied, is invoked in addition to the internal update —
 *    it is a notification callback, not a signal that the component is controlled.
 *
 * `triggerProps` go on a `<button>`, and `contentProps` on the element that
 * holds the content. That element stays rendered while closed, so
 * `aria-controls` always names it; its children render only while `isOpen`.
 * To animate the content, pass the result to `useCollapsibleContentMotion`.
 *
 * @example
 * ```
 * const row = useCollapsible({isCollapsible: {defaultIsOpen: false}});
 * <button {...row.triggerProps}>Details</button>
 * <div {...row.contentProps}>{row.isOpen && <Details />}</div>
 * ```
 */
export function useCollapsible(
  options: UseCollapsibleOptions,
): UseCollapsibleReturn {
  const {isCollapsible, value} = options;

  // Check for CollapsibleGroup context
  const group = use(CollapsibleGroupContext);
  const isControlledByGroup = group != null && value != null;

  // Parse config: true → empty config, object → as-is, false/undefined → null
  const config: CollapsibleConfig | null =
    isCollapsible === true ? {} : isCollapsible ? isCollapsible : null;
  const isEnabled = config != null;

  // Internal state for uncontrolled mode
  const [internalIsOpen, setInternalIsOpen] = useState(() => {
    if (isControlledByGroup) {
      return true;
    } // group manages this
    if (config?.isOpen !== undefined) {
      return config.isOpen;
    }
    return config?.defaultIsOpen ?? true;
  });

  // Determine open state from the appropriate source
  let isOpen: boolean;
  if (isControlledByGroup && value != null) {
    isOpen = group.isOpen(value);
  } else if (config?.isOpen !== undefined) {
    isOpen = config.isOpen;
  } else {
    isOpen = internalIsOpen;
  }

  // Toggle handler dispatches to the appropriate controller.
  //
  // Controlled vs uncontrolled is decided by whether `isOpen` was provided —
  // mirroring how `isOpen` is derived above. `onOpenChange` is a notification
  // callback, not a signal of control: an uncontrolled component may still want
  // to observe changes. So in uncontrolled mode we drive internal state AND
  // fire the callback; only in controlled mode do we defer entirely to the
  // parent via the callback.
  const toggle = () => {
    if (isControlledByGroup && value != null) {
      group.toggle(value);
      return;
    }
    const next = !isOpen;
    // Uncontrolled: internal state is the source of truth, so update it.
    if (config?.isOpen === undefined) {
      setInternalIsOpen(next);
    }
    // Always notify — for both controlled and uncontrolled usage.
    config?.onOpenChange?.(next);
  };

  const contentId = useId();

  return {
    isEnabled,
    isOpen,
    toggle,
    triggerProps: {
      type: 'button',
      'aria-expanded': isOpen,
      'aria-controls': contentId,
      onClick: toggle,
    },
    contentProps: {
      id: contentId,
      hidden: !isOpen,
    },
  };
}
