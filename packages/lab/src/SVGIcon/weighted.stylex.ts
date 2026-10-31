// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file weighted.stylex.ts
 * @input The weight probe font (see weightProbe.ts) and an optional `--astryx-icon-weight` override
 * @output The probe container that reads the font weight, and per-layer visibility styles
 * @position Styles for WeightedSVGIcon
 *
 * Reading the weight: the icon's probe element is `1ch` wide in the probe
 * font, so its width is (1000 + weight) / 1000 em. Container queries on that
 * width set `--astryx-icon-weight-read` (300-700) on the icon's svg. Only
 * container queries are needed, no length division.
 *
 * Showing a drawing: every layer computes the current weight itself, so the
 * rules work unchanged inside `<use>` sprite instances, where page selectors
 * cannot reach through the instance boundary but inherited properties do.
 * Current weight, snapped to 300-700: `--astryx-icon-weight` when an ancestor
 * sets it (explicit override), else the probe reading, else 400.
 *
 * A layer covering [from, to] is opaque when `from <= weight <= to`:
 * `clamp(0, min(weight - (from - 100), (to + 100) - weight) / 100, 1)`.
 * Weights are multiples of 100, so the result is exactly 0 or 1.
 * The 15 entries below are every contiguous range of the five weights.
 */

import * as stylex from '@stylexjs/stylex';

const PROBE = '@container astryx-icon-weight';

export const weightProbeStyles = stylex.create({
  // Width is (1000 + weight) / 1000 em; it must not shrink to the icon box.
  probe: {
    containerName: 'astryx-icon-weight',
    containerType: 'inline-size',
    flexShrink: 0,
    width: '1ch',
    height: '100%',
  },
  svg: {
    '--astryx-icon-weight-read': {
      default: null,
      [`${PROBE} (width >= 1.25em) and (width < 1.35em)`]: '300',
      [`${PROBE} (width >= 1.35em) and (width < 1.45em)`]: '400',
      [`${PROBE} (width >= 1.45em) and (width < 1.55em)`]: '500',
      [`${PROBE} (width >= 1.55em) and (width < 1.65em)`]: '600',
      [`${PROBE} (width >= 1.65em) and (width < 2.1em)`]: '700',
    },
  },
});

export const weightRanges = stylex.create({
  r300_300: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 200, 400 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r300_400: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 200, 500 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r300_500: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 200, 600 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r300_600: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 200, 700 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r300_700: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 200, 800 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r400_400: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 300, 500 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r400_500: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 300, 600 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r400_600: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 300, 700 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r400_700: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 300, 800 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r500_500: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 400, 600 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r500_600: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 400, 700 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r500_700: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 400, 800 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r600_600: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 500, 700 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r600_700: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 500, 800 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
  r700_700: {
    opacity:
      'clamp(0, min(clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700) - 600, 800 - clamp(300, round(var(--astryx-icon-weight, var(--astryx-icon-weight-read, 400)), 100), 700)) / 100, 1)',
  },
});
