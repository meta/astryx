// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Token component
 * @output Exports all Token module public API
 * @position Entry point for Token module
 *
 * SYNC: When adding new Token files, update exports here
 */

/**
 * Extensible color map for Token.
 *
 * Theme packages can add custom colors via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/Token' {
 *   interface TokenColorMap {
 *     brand: true;
 *   }
 * }
 * ```
 */
export interface TokenColorMap {
  default: true;
  red: true;
  orange: true;
  yellow: true;
  green: true;
  teal: true;
  cyan: true;
  blue: true;
  purple: true;
  pink: true;
  gray: true;
}

export {Token} from './Token';
export type {TokenProps, TokenColor, TokenSize} from './Token';
