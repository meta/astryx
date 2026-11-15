// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports Avatar component and types from Avatar.tsx, AvatarStatusDot from AvatarStatusDot.tsx
 * @output Exports Avatar, AvatarProps, AvatarSize, AvatarShape, resolveSize, AvatarStatusDot, AvatarStatusDotProps, AvatarStatusDotVariant
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Avatar/Avatar.doc.mjs
 */

/**
 * Extensible variant map for AvatarStatusDot.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/Avatar' {
 *   interface AvatarStatusDotVariantMap {
 *     'away': true;
 *   }
 * }
 * ```
 *
 * Custom variants render no background fill, no ink colour, and no built-in
 * shape glyph — the theme must supply the fill and, if it passes an `icon`,
 * a `color` for it to paint with. It should also supply a non-colour mark
 * so the status is not distinguishable by colour alone (a WCAG 1.4.1
 * failure): pass `icon`, or theme a glyph onto the dot via
 * `.astryx-avatar-status-dot[data-variant="..."]` (e.g. a `::before` mark).
 */
export interface AvatarStatusDotVariantMap {
  success: true;
  neutral: true;
  error: true;
}

export {Avatar, resolveSize} from './Avatar';
export type {AvatarProps, AvatarSize, AvatarShape} from './Avatar';
export {AvatarStatusDot} from './AvatarStatusDot';
export type {
  AvatarStatusDotProps,
  AvatarStatusDotVariant,
} from './AvatarStatusDot';
