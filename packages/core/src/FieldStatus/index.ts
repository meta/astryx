// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input FieldStatus component source
 * @output Exports FieldStatus and related types
 * @position Entry point for @astryxdesign/core/FieldStatus subpath export
 */

/**
 * Extensible variant map for FieldStatus.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/FieldStatus' {
 *   interface FieldStatusVariantMap {
 *     'inline': true;
 *   }
 * }
 * ```
 */
export interface FieldStatusVariantMap {
  attached: true;
  detached: true;
  /**
   * @deprecated FieldStatus has no `tooltip` presentation
   * (`component:FieldStatus` FR7): given it directly, it draws a plain message
   * box with no tooltip. Set `statusVariant="tooltip"` on the field control
   * (TextInput, Selector, and the rest), which shows the message from its
   * on-field status icon. Removed in the next minor release.
   */
  tooltip: true;
}

export {FieldStatus} from './FieldStatus';
export type {FieldStatusProps, FieldStatusVariant} from './FieldStatus';
