// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeIndicators.ts
 * @input A theme, or a registered theme's name
 * @output Exports IndicatorRegistrySource and getThemeIndicators: the
 *   indicators a theme supplies, without the built-ins
 * @position The one theme lookup for indicators: the registry reads it before
 *   its built-ins, and a host that draws its own picture unless a theme
 *   supplies one reads it alone
 */

import type {DefinedTheme} from '../theme/defineTheme';
import {getRegisteredTheme} from '../theme/themeRegistry';
import type {IndicatorRegistry} from './types';

export type IndicatorRegistrySource = DefinedTheme | string | null | undefined;

/** The indicators a theme supplies, or null when it supplies none. */
export function getThemeIndicators(
  source: IndicatorRegistrySource,
): IndicatorRegistry | null {
  if (source == null) {
    return null;
  }
  const theme =
    typeof source === 'string' ? getRegisteredTheme(source) : source;
  return theme?.indicators ?? null;
}
