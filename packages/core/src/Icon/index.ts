// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports Icon component/types, icon registry, and global registration
 * @output Exports Icon, icon registry helpers, registerIcons, getIconRegistry, getIcon,
 *   the IconEntry/IconRequest types for theme and registered entries, and the
 *   augmentable IconVariantMap with its IconVariant names
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Icon/Icon.doc.mjs
 */

/**
 * Icon variant names an application uses. Astryx defines none: a theme lists
 * the names it supports in `defineTheme({iconVariants})`, and an application
 * augments this map with the names it requests.
 *
 * A theme icon entry receives a requested variant only when the active theme
 * lists it; any other request renders the entry's normal artwork.
 *
 * @example
 * ```
 * declare module '@astryxdesign/core/Icon' {
 *   interface IconVariantMap {
 *     outline: true;
 *     filled: true;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation point
export interface IconVariantMap {}

/** A variant name from the augmentable {@link IconVariantMap}. */
export type IconVariant = keyof IconVariantMap & string;

export {Icon, renderIconSlot} from './Icon';
export {useIcon} from './useIcon';
export type {IconProps, IconColor, IconSize, IconType} from './Icon';

// Global registry (RSC-compatible, no 'use client')
export {
  registerIcons,
  getIconRegistry,
  getIcon,
  getExtendedIcon,
  resetIcons,
} from './globalIconRegistry';
export type {
  IconName,
  ExtendedIconName,
  NamespacedIconName,
  IconRegistry,
  IconRegistrySource,
  IconEntry,
  IconRequest,
} from './globalIconRegistry';
