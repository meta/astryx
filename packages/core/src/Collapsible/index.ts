// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports Collapsible, CollapsibleGroup, and useCollapsible
 * @output Exports components, hook, and types
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
