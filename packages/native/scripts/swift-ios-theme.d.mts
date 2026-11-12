// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {DefinedTheme} from '@astryxdesign/core/theme';

export type TokenGroup = 'color' | 'space' | 'radius' | 'size' | 'font';
export interface SwiftMember {
  group: TokenGroup;
  member: string;
}
export interface PublishedThemePackage {
  packageName: string;
  dir: string;
  exportName: string;
  sourceFile: string;
}
export type ThemeLoader = (file: string) => Promise<Record<string, unknown>>;

export declare const SWIFT_THEME_DIR: string;
export declare const SWIFT_TOKENS_FILE: string;
export declare function swiftMember(token: string): SwiftMember | null;
export declare function swiftThemeName(themeName: string): string;
export declare function themeFileName(swiftName: string): string;
/** `#RRGGBBAA` in sRGB, or `display-p3 #RRGGBBAA` outside sRGB. */
export declare function toColor(value: string, notes?: string[]): string;
export declare function toPoints(
  value: string,
  notes?: string[],
  options?: {borderWidth?: boolean},
): number;
export declare function toWeight(value: string, notes?: string[]): number;
export declare function toLeading(
  value: string,
  fontSize: number | undefined,
  notes?: string[],
): number;
export interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  isInset: boolean;
  color: string;
}
export declare function toShadow(
  value: string,
  notes?: string[],
): ShadowLayer[];
export declare function toFamilies(value: string): string[] | null;
export declare function valueForMode(
  value: string,
  mode: 'light' | 'dark',
): string;
export declare const CORE_DEFAULTS: DefinedTheme;
export declare function localTokensLeftOut(theme: DefinedTheme): string[];
export declare function tokenSurface(
  resolved: Record<string, SwiftMember>,
): Record<TokenGroup, {token: string; member: string; type: string}[]>;
export declare function renderTokenTypes(
  surface: Record<TokenGroup, {token: string; member: string; type: string}[]>,
): string;
export declare function defaultTheme(): Promise<DefinedTheme>;
export declare function defineTheme(input: {
  name: string;
  tokens: Record<string, string | [string, string]>;
  localTokens?: Record<string, string | [string, string]>;
}): Promise<DefinedTheme>;
export interface RenderOptions {
  source?: string;
  regenerate?: string;
  /** Collects one line per lossy conversion; omitted, each prints to stderr (G15). */
  warnings?: string[];
  /** Fails on any lossy conversion instead (G15). */
  strict?: boolean;
}
export declare function renderSwiftTheme(
  theme: DefinedTheme,
  options?: RenderOptions,
): Promise<string>;
export declare function strictError(warnings: string[]): Error;
export declare function finishRun(
  warnings: string[],
  strict: boolean,
  write: () => void,
): void;
export declare function publishedThemePackages(): PublishedThemePackage[];
export declare function renderAll(
  load: ThemeLoader,
  options?: {warnings?: string[]},
): Promise<Record<string, string>>;
