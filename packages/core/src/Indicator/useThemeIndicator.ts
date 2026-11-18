// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useThemeIndicator.ts
 * @input Indicator name
 * @output Exports useThemeIndicator: the active theme's own indicator for a
 *   name, or undefined
 * @position Client hook for a host that draws its own picture unless the
 *   theme supplies one (Spinner, TreeList). It finds the theme as useIndicator
 *   does, the nearest Theme or else the root theme, and never loads the
 *   built-in indicators
 */

import {useThemeName} from '../theme/useTheme';
import {getThemeIndicators} from './themeIndicators';
import type {IndicatorComponent, IndicatorMap, IndicatorName} from './types';

export function useThemeIndicator<N extends IndicatorName>(
  name: N,
): IndicatorComponent<IndicatorMap[N]> | undefined {
  return getThemeIndicators(useThemeName())?.[name];
}
