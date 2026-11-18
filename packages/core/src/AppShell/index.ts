// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports AppShell component and types from AppShell.tsx
 * @output Exports AppShell and related types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/AppShell/AppShell.doc.mjs
 */

/**
 * Extensible variant map for AppShell.
 *
 * Theme packages can add custom variants via TypeScript module augmentation:
 * @example
 * ```
 * declare module '@astryxdesign/core/AppShell' {
 *   interface AppShellVariantMap {
 *     'glass': true;
 *   }
 * }
 * ```
 */
export interface AppShellVariantMap {
  wash: true;
  surface: true;
  section: true;
  elevated: true;
}

export {AppShell} from './AppShell';
export type {
  AppShellProps,
  AppShellBreakpoint,
  AppShellVariant,
  MobileNavConfig,
} from './AppShell';
export {
  useAppShellMobile,
  AppShellMobileContext,
} from './AppShellMobileContext';
export type {AppShellMobileContextValue} from './AppShellMobileContext';
