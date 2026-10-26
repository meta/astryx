// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * Astryx Theme System
 *
 * Exports:
 * - Theme: Provider component that applies theme
 * - defineTheme: Create themes with token + component overrides
 * - Token exports for direct use in StyleX
 *
 * Themes are in separate packages:
 *   import { neutralTheme } from '@astryxdesign/theme-neutral';
 *   import { neutralTheme } from '@astryxdesign/theme-neutral';
 */

export {Theme} from './Theme';
export {MediaTheme} from './MediaTheme';
export type {MediaThemeProps, MediaThemeMode} from './MediaTheme';
export {
  defineTheme,
  generateThemeCSS,
  generateOnMediaCSS,
  generateAdaptationCSS,
  generateThemeRules,
  generateThemeRulesSplit,
  type ThemeCSSOutput,
  type ThemeRulesSplit,
  isDefinedTheme,
  tokenDefaults,
} from './defineTheme';
export {
  registerTheme,
  getRegisteredTheme,
  getRegisteredThemes,
  resetThemes,
} from './themeRegistry';
export type {
  DefineThemeInput,
  DefinedTheme,
  ResolvedDefinedTheme,
  CoreTokenName,
  TokenName,
  TokenValue,
  ComponentStyleMap,
  StyleOverrides,
} from './defineTheme';

// Ordered environment-conditioned theme adaptations
export {
  DEFAULT_COMPACT_DEFINITION,
  DEFAULT_WIDTH_BREAKPOINTS,
  WIDTH_BREAKPOINT_NAMES,
  compactDefinition,
} from './themeAdaptations';
export type {
  CompactDefinition,
  WidthBreakpointName,
  WidthBreakpoints,
  ThemeAdaptations,
  ThemeAdaptationCondition,
  ThemeAdaptationWidthCondition,
  ThemeAdaptationRule,
  ThemeAdaptationValue,
  ThemeAdaptationTypographyConfig,
} from './themeAdaptations';

export type {
  SyntaxTokenName,
  DomainTokenName,
  DataTokenName,
} from './domainTokens';

export {
  syntaxTokenDefaults,
  domainTokenDefaults,
  dataTokenDefaults,
} from './domainTokens';

// Syntax theme API
export {defineSyntaxTheme} from './syntax';
export type {
  SyntaxThemeDefinition,
  SyntaxThemeInput,
  SyntaxThemeTokenKey,
  SyntaxThemeTokenMap,
  SyntaxThemeTokenInput,
  SyntaxTokenValue,
} from './syntax';

// SyntaxTheme provider
export {SyntaxTheme, useSyntaxTheme} from './syntax';
export type {UseSyntaxThemeReturn} from './syntax';

export {expandTypeScale, generateTypeScaleComponents} from './expandTypeScale';
export type {TypeScaleConfig, TypeScaleTokens} from './expandTypeScale';

export {expandRadiusScale} from './expandRadiusScale';
export type {RadiusScaleConfig, RadiusScaleTokens} from './expandRadiusScale';

export {expandColorScale} from './expandColorScale';
export type {ColorScaleConfig, ColorScaleTokens} from './expandColorScale';

export {expandMotionScale} from './expandMotionScale';
export type {MotionScaleConfig, MotionScaleTokens} from './expandMotionScale';

// Export token defaults and vars for use in custom components and themes
export {
  colorDefaults,
  spacingDefaults,
  sizeDefaults,
  borderDefaults,
  focusDefaults,
  radiusDefaults,
  shadowDefaults,
  durationDefaults,
  easeDefaults,
  typographyDefaults,
  textSizeDefaults,
  fontWeightDefaults,
  typeScaleDefaults,
  colorVars,
  spacingVars,
  sizeVars,
  borderVars,
  focusVars,
  radiusVars,
  shadowVars,
  durationVars,
  easeVars,
  typographyVars,
  textSizeVars,
  fontWeightVars,
  typeScaleVars,
} from './tokens.stylex';

// Export token key types for theme authoring
export type {
  ColorVarName,
  SpacingVarName,
  SizeVarName,
  BorderVarName,
  RadiusVarName,
  ShadowVarName,
  DurationVarName,
  EaseVarName,
  TypographyVarName,
  TextSizeVarName,
  FontWeightVarName,
  TypeScaleVarName,
} from './tokens.stylex';

export {useTheme, useThemeName, ThemeContext} from './useTheme';
export type {UseThemeReturn, ThemeContextValue} from './useTheme';

export type {
  IndicatorComponent,
  IndicatorFamily,
  IndicatorFamilyMap,
  IndicatorMap,
  IndicatorName,
  IndicatorNameOfFamily,
  IndicatorProps,
  IndicatorRegistry,
  IndicatorSize,
  IndicatorState,
} from '../Indicator';
export {
  resolveThemeToken,
  resolveThemeTokens,
  tokenVar,
  tokenVars,
} from './tokens';
export type {
  ResolveThemeTokenOptions,
  ResolveThemeTokensOptions,
  ResolvedThemeMode,
} from './tokens';

export type {TextColorMap} from '../Text';
export type {
  ThemeMode,
  HeadingTag,
  TextType,
  BuiltinTextType,
  CustomTextTypes,
  TextSize,
  TextWeight,
  TextColor,
  BuiltinTextColor,
  TypographyConfig,
  TypographyRole,
  FontWeight,
} from './types';
