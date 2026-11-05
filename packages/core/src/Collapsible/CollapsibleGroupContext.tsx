// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CollapsibleGroupContext.tsx
 * @input Layer-scoped React context
 * @output Exports CollapsibleGroupContext, CollapsibleGroupContextValue,
 *   CollapsibleGroupPresentationContext, CollapsibleGroupPresentationValue,
 *   CollapsibleGroupDensity, and CollapsibleChevronPosition types
 * @position Context definitions for collapsible group coordination and presentation
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Collapsible/CollapsibleGroup.tsx (provider)
 * - /packages/core/src/Collapsible/Collapsible.doc.mjs
 * - /packages/cli/assets/templates/blocks/components/Collapsible/ (showcase blocks)
 */

import {createContext} from 'react';
import {createLayerScopedContext} from '../Layer/layerScopedContext';

/**
 * Context value provided by CollapsibleGroup to coordinate collapsible children.
 */
export interface CollapsibleGroupContextValue {
  /** Check if a given value is currently open. */
  isOpen: (value: string) => boolean;
  /** Toggle the open state of a given value. */
  toggle: (value: string) => void;
}

/**
 * Context for collapsible group coordination.
 * When present, collapsible components defer their open/close state to the group.
 */
export const CollapsibleGroupContext =
  createContext<CollapsibleGroupContextValue | null>(null);
CollapsibleGroupContext.displayName = 'CollapsibleGroupContext';

/**
 * Row density for the items of a CollapsibleGroup, controlling trigger and
 * content block padding. Shares the repo-wide density vocabulary
 * (Table, List, Item).
 */
export type CollapsibleGroupDensity = 'compact' | 'balanced' | 'spacious';

/**
 * Logical position of Collapsible's disclosure chevron.
 *
 * `end` is the default trailing indicator: down when collapsed, up when
 * expanded. `start` is the leading disclosure pattern: inward toward content
 * when collapsed (mirrored under RTL), down when expanded.
 */
export type CollapsibleChevronPosition = 'start' | 'end';

/**
 * Presentation value provided by CollapsibleGroup so each Collapsible can
 * draw its own group chrome (StyleX has no child selectors, so the group
 * cannot style items from the outside).
 */
export interface CollapsibleGroupPresentationValue {
  /** Whether the group's items draw hairline dividers between one another. */
  hasDividers: boolean;
  /** Resolved row density, or null to keep the default (unpadded) look. */
  density: CollapsibleGroupDensity | null;
  /**
   * Chevron position for the group's direct items, or null to leave each item on
   * its own default. An item's own `chevronPosition` still wins, but mixing
   * positions within one group reads as a mistake, so the group is the usual
   * place to set it.
   */
  chevronPosition: CollapsibleChevronPosition | null;
}

/**
 * Context for collapsible group presentation (dividers, density).
 * Kept separate from CollapsibleGroupContext so the public useCollapsible
 * state API is unaffected. Collapsible resets this context around its
 * children so nested collapsibles never inherit row chrome.
 */
export const CollapsibleGroupPresentationContext =
  createLayerScopedContext<CollapsibleGroupPresentationValue | null>(null);
CollapsibleGroupPresentationContext.displayName =
  'CollapsibleGroupPresentationContext';
