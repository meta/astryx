// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input None
 * @output The run-time API of @astryxdesign/native: platforms, native theme
 *   configuration, and native icon defaults
 * @position Package root. Experimental and canary-only (AST-082 FR15); component
 *   types live at `@astryxdesign/native/components`
 */

export {
  NATIVE_PLATFORMS,
  SHARED_CONDITION,
  isNativePlatform,
} from './platforms.js';
export type {NativePlatform} from './platforms.js';
export {
  compareVersions,
  defineNativeTheme,
  resolveNativeTheme,
} from './theme/defineNativeTheme.js';
export type {
  DefineNativeThemeOptions,
  DurableMaterial,
  NativeTheme,
  NativeThemeConfig,
  PlatformEntry,
  PlatformIcon,
  PlatformVocabulary,
  PortableThemeLike,
  ResolvedNativeTheme,
} from './theme/defineNativeTheme.js';
export {BUILTIN_ICON_NAMES, NATIVE_ICON_DEFAULTS} from './icons/defaults.js';
export type {BuiltinIconName} from './icons/defaults.js';
