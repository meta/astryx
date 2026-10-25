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
export declare function toHexColor(value: string): string | null;
export declare function toPoints(value: string): number | null;
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
  mode: 'light' | 'dark',
): ShadowLayer[] | null;
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
export declare function renderSwiftTheme(
  theme: DefinedTheme,
  options?: {source?: string; regenerate?: string},
): Promise<string>;
export declare function publishedThemePackages(): PublishedThemePackage[];
export declare function renderAll(
  load: ThemeLoader,
): Promise<Record<string, string>>;
