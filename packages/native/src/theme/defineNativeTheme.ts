// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme/defineNativeTheme.ts
 * @input A defined theme (its portable part) and native theme configuration
 * @output A native theme, and its resolution for one platform and OS version
 * @position Native theme configuration (AST-082 FR10, FR18). Builds on the
 *   defined theme without changing it and never sets tokens
 */

import {NATIVE_PLATFORMS, type NativePlatform} from '../platforms.js';

/**
 * The portable part of a defined theme (AST-082 FR18). A core `DefinedTheme`
 * satisfies it structurally, so native never imports core to accept one.
 */
export interface PortableThemeLike {
  readonly name: string;
  readonly tokens: Readonly<Record<string, string>>;
  readonly localTokens?: Readonly<Record<string, string>>;
}

/** Durable outcomes a person sees; no platform feature names (DEC-5). */
export type DurableMaterial = 'opaque' | 'translucent';

export interface PlatformVocabulary {
  ios: {material: DurableMaterial | 'liquidGlass'};
  macos: {material: DurableMaterial | 'liquidGlass'};
  android: {material: DurableMaterial};
  windows: {material: DurableMaterial | 'mica' | 'acrylic'};
}

/** Platform icon reference, as data (AST-082 FR17). */
export type PlatformIcon =
  {readonly systemName: string} | {readonly materialSymbol: string};

export type PlatformEntry<P extends NativePlatform> = Partial<
  PlatformVocabulary[P]
> & {
  readonly minVersion?: string;
  readonly maxVersion?: string;
  /** Overrides for this platform's theme targets, keyed by target. */
  readonly components?: Readonly<
    Record<string, Readonly<Record<string, string | number>>>
  >;
  readonly icons?: Readonly<Record<string, PlatformIcon>>;
};

export interface NativeThemeConfig {
  readonly material?: DurableMaterial;
  readonly platforms?: {
    readonly [P in NativePlatform]?: ReadonlyArray<PlatformEntry<P>>;
  };
}

export interface NativeTheme {
  readonly theme: PortableThemeLike;
  readonly config: NativeThemeConfig;
}

export interface DefineNativeThemeOptions {
  /** Native theme to extend: durable members merge, platform entry lists replace. */
  readonly extends?: NativeTheme;
  /** Receives each report; defaults to console.warn outside production. */
  readonly onReport?: (message: string) => void;
}

/** Platform terms that exist only from a given OS version. */
const FEATURE_FLOORS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  ios: {liquidGlass: '26'},
  macos: {liquidGlass: '26'},
  windows: {mica: '11'},
};

/** Web-only parts of a defined theme that have no native meaning (FR18). */
const WEB_PARTS = [
  'components',
  'icons',
  'indicators',
  '__onDark',
  '__onLight',
  '__adaptations',
];

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function hasContent(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return true;
}

function validate(config: NativeThemeConfig): string[] {
  const errors: string[] = [];
  for (const platform of NATIVE_PLATFORMS) {
    for (const entry of config.platforms?.[platform] ?? []) {
      const material = (entry as {material?: string}).material;
      const floor = material ? FEATURE_FLOORS[platform]?.[material] : undefined;
      if (
        floor &&
        (entry.minVersion == null ||
          compareVersions(entry.minVersion, floor) < 0)
      ) {
        errors.push(
          `${platform} material "${material}" exists only from ${platform} ${floor}; ` +
            `scope its entry with minVersion: '${floor}' or later`,
        );
      }
      if (
        entry.minVersion &&
        entry.maxVersion &&
        compareVersions(entry.minVersion, entry.maxVersion) > 0
      ) {
        errors.push(`${platform} entry has minVersion above maxVersion`);
      }
    }
  }
  return errors;
}

export function defineNativeTheme(
  theme: PortableThemeLike,
  config: NativeThemeConfig,
  options: DefineNativeThemeOptions = {},
): NativeTheme {
  const merged: NativeThemeConfig = options.extends
    ? {
        ...options.extends.config,
        ...config,
        platforms: {...options.extends.config.platforms, ...config.platforms},
      }
    : config;

  const errors = validate(merged);
  if (errors.length > 0) {
    throw new Error(`defineNativeTheme(${theme.name}): ${errors.join('; ')}`);
  }

  const report =
    options.onReport ??
    ((message: string) => {
      const env =
        typeof process === 'undefined' ? undefined : process.env?.NODE_ENV;
      if (env !== 'production') {
        console.warn(message);
      }
    });
  const received = theme as unknown as Record<string, unknown>;
  for (const part of WEB_PARTS) {
    if (hasContent(received[part])) {
      report(
        `defineNativeTheme(${theme.name}): "${part.replace(/^__/, '')}" is web-only and has ` +
          'no native meaning; use native platform entries instead',
      );
    }
  }

  const portable: PortableThemeLike = {
    name: theme.name,
    tokens: theme.tokens,
    ...(theme.localTokens ? {localTokens: theme.localTokens} : {}),
  };
  return {theme: portable, config: merged};
}

export interface ResolvedNativeTheme {
  readonly material?: string;
  readonly components: Readonly<
    Record<string, Readonly<Record<string, string | number>>>
  >;
  readonly icons: Readonly<Record<string, PlatformIcon>>;
}

/** Applies durable intent, then each matching platform entry in order. */
export function resolveNativeTheme(
  nativeTheme: NativeTheme,
  target: {readonly platform: NativePlatform; readonly osVersion: string},
): ResolvedNativeTheme {
  let resolved: ResolvedNativeTheme = {
    ...(nativeTheme.config.material
      ? {material: nativeTheme.config.material}
      : {}),
    components: {},
    icons: {},
  };
  const entries = (nativeTheme.config.platforms?.[target.platform] ??
    []) as ReadonlyArray<PlatformEntry<NativePlatform>>;
  for (const entry of entries) {
    if (
      entry.minVersion &&
      compareVersions(target.osVersion, entry.minVersion) < 0
    ) {
      continue;
    }
    if (
      entry.maxVersion &&
      compareVersions(target.osVersion, entry.maxVersion) > 0
    ) {
      continue;
    }
    const {minVersion: _min, maxVersion: _max, ...members} = entry;
    resolved = {...resolved, ...members};
  }
  return resolved;
}
