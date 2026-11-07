// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports from TreeList.tsx and TreeListTypes.ts
 * @output Exports TreeList component and its types
 * @position Package entry point for TreeList
 *
 * SYNC: When modified, update /packages/core/src/TreeList/TreeList.doc.mjs
 */

/**
 * Extensible variant map for TreeList.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/TreeList' {
 *   interface TreeListVariantMap {
 *     'dotted': true;
 *   }
 * }
 * ```
 */
export interface TreeListVariantMap {
  lineGuides: true;
  noGuides: true;
}

export {TreeList} from './TreeList';
export type {
  TreeListProps,
  TreeListDensity,
  TreeListVariant,
  TreeListExpandIconState,
} from './TreeList';
export type {TreeListItemData} from './TreeListTypes';
