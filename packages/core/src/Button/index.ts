// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports Button component and types from Button.tsx
 * @output Exports Button, ButtonProps, ButtonVariant, ButtonVariantMap
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Button/Button.doc.mjs
 */

/**
 * Extensible variant map for Button.
 *
 * Theme builds can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/Button' {
 *   interface ButtonVariantMap {
 *     'primary-muted': true;
 *   }
 * }
 * ```
 */
export interface ButtonVariantMap {
  primary: true;
  secondary: true;
  ghost: true;
  destructive: true;
}

export {Button} from './Button';
export type {ButtonProps, ButtonVariant, ButtonSize} from './Button';
