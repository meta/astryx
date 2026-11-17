// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports from Divider.tsx
 * @output Exports Divider component and props type
 * @position Package entry point for Divider
 *
 * SYNC: When modified, update /packages/core/src/Divider/Divider.doc.mjs
 */

/**
 * Extensible variant map for Divider.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/Divider' {
 *   interface DividerVariantMap {
 *     'accent': true;
 *   }
 * }
 * ```
 */
export interface DividerVariantMap {
  subtle: true;
  strong: true;
}

export {Divider} from './Divider';
export type {DividerProps, DividerVariant} from './Divider';
