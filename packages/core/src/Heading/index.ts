// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Heading component source
 * @output Exports Heading, its props/types, and the extensible HeadingTypeMap
 * @position Entry point for @astryxdesign/core/Heading subpath export
 */

/**
 * Extensible visual-type map for Heading.
 *
 * Theme builds add custom visual roles through module augmentation:
 * @example
 * ```ts
 * declare module '@astryxdesign/core/Heading' {
 *   interface HeadingTypeMap {
 *     hero: true;
 *   }
 * }
 * ```
 */
export interface HeadingTypeMap {
  'display-1': true;
  'display-2': true;
  'display-3': true;
}

export {
  Heading,
  type HeadingProps,
  type HeadingLevel,
  type HeadingType,
} from './Heading';
