// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports Dialog component and types from Dialog.tsx
 * @output Exports Dialog, DialogHeader, and related types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Dialog/Dialog.doc.mjs
 */

/**
 * Extensible variant map for Dialog.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/Dialog' {
 *   interface DialogVariantMap {
 *     'drawer': true;
 *   }
 * }
 * ```
 */
export interface DialogVariantMap {
  standard: true;
  fullscreen: true;
}

export {Dialog} from './Dialog';
export type {
  DialogProps,
  DialogVariant,
  DialogPurpose,
  DialogPosition,
} from './Dialog';

export {DialogHeader} from './DialogHeader';
export type {DialogHeaderProps} from './DialogHeader';

export {useImperativeDialog} from './useImperativeDialog';
export type {ImperativeDialogReturn} from './useImperativeDialog';
