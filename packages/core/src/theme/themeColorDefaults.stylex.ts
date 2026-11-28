// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeColorDefaults.stylex.ts
 * @input colorVars from tokens.stylex.ts
 * @output coreColorDefaults: the Core color defaults that differ by color
 *   mode, as a StyleX theme that Theme.tsx applies on each wrapper that
 *   applies a theme. A default with one value in both modes is left out.
 * @position Internal to Theme.tsx; not a package export
 *
 * SYNC: The values copy colorDefaults in tokens.stylex.ts. StyleX compiles a
 * theme only from values in its own file, so they cannot be imported.
 * themeColorDefaults.test.ts fails when the set or a value drifts.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars} from './tokens.stylex';

export const coreColorDefaultValues = {
  '--color-accent': 'light-dark(#0064E0, #0171E3)',
  '--color-accent-muted': 'light-dark(#0082FB33, #0082FB3F)',
  '--color-neutral':
    'light-dark(rgba(5, 54, 89, 0.1), rgba(223, 226, 229, 0.2))',
  '--color-background-surface': 'light-dark(#FFFFFF, #1F1F22)',
  '--color-background-body': 'light-dark(#F1F4F7, #111112)',
  '--color-overlay': 'light-dark(#01122866, #11111299)',
  '--color-overlay-hover': 'light-dark(#0536590C, #FFFFFF0C)',
  '--color-overlay-pressed': 'light-dark(#05365919, #FFFFFF19)',
  '--color-background-muted': 'light-dark(#0536590C, #1111127F)',
  '--color-text-primary': 'light-dark(#0A1317, #DFE2E5)',
  '--color-text-secondary': 'light-dark(#445564, #B0B5BB)',
  '--color-text-disabled': 'light-dark(#A4B0BC, #6F747C)',
  '--color-text-accent': 'light-dark(#0064E0, #3E9EFB)',
  '--color-icon-accent': 'light-dark(#0064E0, #2694FE)',
  '--color-icon-primary': 'light-dark(#0A1317, #DFE2E5)',
  '--color-icon-secondary': 'light-dark(#4E606F, #AAAFB5)',
  '--color-icon-disabled': 'light-dark(#A4B0BC, #6F747C)',
  '--color-background-card': 'light-dark(#FFFFFF, #1F1F22)',
  '--color-background-popover': 'light-dark(#FFFFFF, #28292C)',
  '--color-background-inverted': 'light-dark(#0A1317, #FFFFFF)',
  '--color-background-error-inverted': 'light-dark(#AA071E, #E3193B)',
  '--color-info-muted': 'light-dark(#0082FB33, #0082FB3F)',
  '--color-success-muted': 'light-dark(#0B991F33, #0B991F3F)',
  '--color-error': 'light-dark(#E3193B, #F5394F)',
  '--color-error-muted': 'light-dark(#E3193B33, #F5394F3F)',
  '--color-on-error': 'light-dark(#FFFFFF, #0A1317)',
  '--color-warning': 'light-dark(#E9AF08, #F2C00B)',
  '--color-warning-muted': 'light-dark(#E2A40033, #E2A4003F)',
  '--color-text-info': 'var(--color-text-blue)',
  '--color-text-success': 'var(--color-text-green)',
  '--color-text-warning': 'var(--color-text-yellow)',
  '--color-text-error': 'var(--color-text-red)',
  '--color-icon-info': 'var(--color-text-info)',
  '--color-icon-success': 'var(--color-text-success)',
  '--color-icon-warning': 'var(--color-text-warning)',
  '--color-icon-error': 'var(--color-text-error)',
  '--color-border-info': 'var(--color-text-info)',
  '--color-border-success': 'var(--color-text-success)',
  '--color-border-warning': 'var(--color-text-warning)',
  '--color-border-error': 'var(--color-text-error)',
  '--color-on-info-muted': 'var(--color-text-blue)',
  '--color-on-success-muted': 'var(--color-text-green)',
  '--color-on-warning-muted': 'var(--color-text-yellow)',
  '--color-on-error-muted': 'var(--color-text-red)',
  '--color-border': 'light-dark(#05365919, #F2F4F619)',
  '--color-border-emphasized': 'light-dark(#CCD3DB, #494D53)',
  '--color-skeleton': 'light-dark(#CCD3DB, #5A5E66)',
  '--color-track': 'light-dark(#CCD3DB, #5A5E66)',
  '--color-shadow': 'light-dark(rgba(5, 54, 89, 0.1), rgba(0, 0, 0, 0.3))',
  '--color-tint-hover': 'light-dark(black, white)',
  '--color-border-blue': 'light-dark(#0064E0, #2694FE)',
  '--color-icon-blue': 'light-dark(#0064E0, #2694FE)',
  '--color-text-blue': 'light-dark(#042F97, #AFD7FF)',
  '--color-border-cyan': 'light-dark(#089DD0, #0171A4)',
  '--color-icon-cyan': 'light-dark(#00ACC1, #26C6DA)',
  '--color-text-cyan': 'light-dark(#014975, #A1EEF9)',
  '--color-background-gray': 'light-dark(#0A131733, #666A724C)',
  '--color-border-gray': 'light-dark(#647685, #748695)',
  '--color-icon-gray': 'light-dark(#4E606F, #AAAFB5)',
  '--color-text-gray': 'light-dark(#0A1317, #E7EAED)',
  '--color-border-green': 'light-dark(#0D8626, #0B991F)',
  '--color-icon-green': 'light-dark(#0D8626, #26A756)',
  '--color-text-green': 'light-dark(#09441F, #A5F690)',
  '--color-border-orange': 'light-dark(#EB6E00, #B34A01)',
  '--color-icon-orange': 'light-dark(#E9690B, #FB8C00)',
  '--color-text-orange': 'light-dark(#6B2203, #FDB876)',
  '--color-border-pink': 'light-dark(#F351C0, #C02294)',
  '--color-icon-pink': 'light-dark(#C2185B, #EC407A)',
  '--color-text-pink': 'light-dark(#650053, #FEADE3)',
  '--color-border-purple': 'light-dark(#9081FF, #7340FE)',
  '--color-icon-purple': 'light-dark(#5B08D8, #7952FF)',
  '--color-text-purple': 'light-dark(#3E0697, #B3B0FE)',
  '--color-border-red': 'light-dark(#E3193B, #F5394F)',
  '--color-icon-red': 'light-dark(#D31130, #E3193B)',
  '--color-text-red': 'light-dark(#7B0210, #FFB2B8)',
  '--color-border-teal': 'light-dark(#08A3A3, #08767D)',
  '--color-icon-teal': 'light-dark(#009688, #26A69A)',
  '--color-text-teal': 'light-dark(#083943, #40DCCD)',
  '--color-border-yellow': 'light-dark(#C58600, #B47700)',
  '--color-icon-yellow': 'light-dark(#FBC02D, #FFEE58)',
  '--color-text-yellow': 'light-dark(#753F07, #FBCE03)',
} as const;

export const coreColorDefaults = stylex.createTheme(
  colorVars,
  coreColorDefaultValues,
);
