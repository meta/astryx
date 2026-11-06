// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SideNavCollapseContext.ts
 * @input React createContext, use
 * @output Exports SideNavCollapseContext, useSideNavCollapse, and the registry
 *   of collapse toggles rendered outside a SideNav
 * @position Internal context for sidenav collapse state
 *
 * Provides collapse state to SideNavCollapseButton and other
 * sidenav children. Set by SideNav when isCollapsible is true.
 * A button rendered outside the SideNav tree is out of context's reach and
 * takes the controlled `collapsible` config as a prop instead.
 */

import {createContext, use, type Ref} from 'react';

export interface SideNavCollapseState {
  /** Whether the sidenav is currently collapsed */
  isCollapsed: boolean;
  /** Toggle collapse state */
  toggle: () => void;
  /** Whether collapse is enabled */
  isCollapsible: boolean;
}

/** Object form of SideNav's `collapsible` prop. */
export interface SideNavCollapsibleConfig {
  defaultIsCollapsed?: boolean;
  isCollapsed?: boolean;
  onCollapsedChange?: (isCollapsed: boolean) => void;
  hasButton?: boolean;
  buttonLabel?: string;
  /**
   * The collapsed nav's width. `'rail'` (the default) keeps the icon rail.
   * `0` hides the nav completely: it takes no width, its contents are inert,
   * and it slides out by its inline edge. Render a SideNavCollapseButton
   * outside the nav with the same controlled `collapsible` config, since the
   * built-in button hides with the nav; focus inside the nav moves to that
   * button when the nav collapses.
   */
  collapsedWidth?: 'rail' | 0;
}

/**
 * The controlled form: the consumer holds the state, so it can be handed to
 * both SideNav and a SideNavCollapseButton rendered outside it.
 */
export interface SideNavControlledCollapsible extends SideNavCollapsibleConfig {
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
}

/**
 * @deprecated Pass the same controlled `collapsible` config to SideNav and to
 * the out-of-tree SideNavCollapseButton instead. The state then reaches the
 * button through props rather than through a ref.
 */
export interface SideNavImperativeCollapseHandle {
  getCollapseState: () => SideNavCollapseState | null;
}

export const SideNavCollapseContext = createContext<SideNavCollapseState>({
  isCollapsed: false,
  toggle: () => {},
  isCollapsible: false,
});
SideNavCollapseContext.displayName = 'SideNavCollapseContext';

/**
 * Read the sidenav collapse state from context.
 * Returns { isCollapsed, toggle, isCollapsible }.
 * When used outside a sidenav with isCollapsible, isCollapsible is false.
 */
export function useSideNavCollapse(): SideNavCollapseState {
  return use(SideNavCollapseContext);
}

/**
 * What ties a SideNavCollapseButton rendered outside a SideNav to that nav:
 * the controlled `onCollapsedChange` both were handed, or the deprecated
 * `handleRef` both hold. Matched by identity, so the documented wiring (one
 * controlled config for both) also pairs them.
 */
export interface SideNavCollapseAssociation {
  onCollapsedChange?: ((isCollapsed: boolean) => void) | undefined;
  handleRef?: Ref<SideNavImperativeCollapseHandle | null> | undefined;
}

// Collapse toggles rendered outside a SideNav. The button and the nav share
// no ancestor of their own, only the app's layout, so this is module state,
// not context. A nav that hides completely moves focus to its own toggle.
const externalCollapseToggles = new Map<
  HTMLElement,
  SideNavCollapseAssociation
>();

/** Registers a collapse toggle rendered outside a SideNav; returns its unregister. */
export function registerExternalCollapseToggle(
  element: HTMLElement,
  association: SideNavCollapseAssociation,
): () => void {
  externalCollapseToggles.set(element, association);
  return () => {
    externalCollapseToggles.delete(element);
  };
}

/**
 * The first registered toggle that shares `nav`'s collapse state, is in the
 * document and is not inside `nav`. Never another nav's toggle.
 */
export function findExternalCollapseToggle(
  nav: HTMLElement,
  association: SideNavCollapseAssociation,
): HTMLElement | null {
  for (const [element, other] of externalCollapseToggles) {
    const sharesState =
      (association.onCollapsedChange != null &&
        association.onCollapsedChange === other.onCollapsedChange) ||
      (association.handleRef != null &&
        association.handleRef === other.handleRef);
    if (sharesState && element.isConnected && !nav.contains(element)) {
      return element;
    }
  }
  return null;
}
