// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports Collapsible, CollapsibleGroup, useCollapsible, and
 *   useCollapsibleContentMotion
 * @output Exports components, hooks, and types
 * @position Entry point for @astryxdesign/core/Collapsible module
 *
 * SYNC: When modified, update /packages/core/src/Collapsible/Collapsible.doc.mjs
 */

export {Collapsible} from './Collapsible';
export type {CollapsibleProps} from './Collapsible';

export {CollapsibleGroup} from './CollapsibleGroup';
export type {CollapsibleGroupProps} from './CollapsibleGroup';
export type {
  CollapsibleChevronPosition,
  CollapsibleGroupDensity,
} from './CollapsibleGroupContext';

export {useCollapsible} from './useCollapsible';
export type {
  CollapsibleConfig,
  UseCollapsibleOptions,
  UseCollapsibleReturn,
} from './useCollapsible';

export {useCollapsibleContentMotion} from './useCollapsibleContentMotion';
export type {
  UseCollapsibleContentMotionOptions,
  UseCollapsibleContentMotionReturn,
} from './useCollapsibleContentMotion';
