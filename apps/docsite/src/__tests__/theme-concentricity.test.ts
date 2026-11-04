// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {expandRadiusScale, spacingDefaults} from '@astryxdesign/core/theme';
import {UNIFIED_PRESETS} from '../app/playground/themeEditor/constants';
import {
  buildSpacingScale,
  getConcentricityWarning,
  spacingToPx,
} from '../app/playground/themeEditor/helpers';

const px = (value: string): number => parseInt(value, 10);

/**
 * Concentricity: two rounded rects nested with a gap between their edges look
 * concentric when `inner-radius = outer-radius - gap`. The theme editor nests
 * one spacing step (`--spacing-1`) between each radius rung, so the relation is
 * checked against the scales the editor actually generates rather than a
 * hardcoded table of expected px values.
 */
describe('theme editor presets — concentricity', () => {
  for (const [name, preset] of Object.entries(UNIFIED_PRESETS)) {
    it(`${name} preset nests its radius rungs concentrically`, () => {
      const radii = expandRadiusScale({base: preset.radius, multiplier: 1});
      const gap = spacingToPx(buildSpacingScale(preset.spacing)['--spacing-1']);
      const inner = px(radii['--radius-inner']);
      const element = px(radii['--radius-element']);
      const container = px(radii['--radius-container']);

      // container ⊃ element
      expect(container - gap).toBe(element);
      // element ⊃ inner
      expect(element - gap).toBe(inner);
    });
  }
});

describe('getConcentricityWarning', () => {
  it('returns null when the radius and spacing bases match', () => {
    expect(getConcentricityWarning('radius', 4, 4)).toBeNull();
    expect(getConcentricityWarning('spacing', 4, 4)).toBeNull();
    expect(getConcentricityWarning('radius', 0, 0)).toBeNull();
  });

  it('returns null for every built-in preset', () => {
    for (const preset of Object.values(UNIFIED_PRESETS)) {
      expect(
        getConcentricityWarning('radius', preset.radius, preset.spacing),
      ).toBeNull();
      expect(
        getConcentricityWarning('spacing', preset.radius, preset.spacing),
      ).toBeNull();
    }
  });

  it('warns with concrete numbers when the bases diverge', () => {
    const warning = getConcentricityWarning('radius', 12, 8);
    expect(warning).not.toBeNull();
    // container(36) − spacing-1(8) = 28, but element is 24.
    expect(warning?.description).toContain('36px');
    expect(warning?.description).toContain('8px');
    expect(warning?.description).toContain('28px');
    expect(warning?.description).toContain('24px');
  });

  it('suggests changing the control it sits under', () => {
    expect(getConcentricityWarning('radius', 12, 8)?.description).toContain(
      'Set radius to 8px',
    );
    expect(getConcentricityWarning('spacing', 12, 8)?.description).toContain(
      'Set spacing to 12px',
    );
  });

  it('has a short title for the Banner header', () => {
    const warning = getConcentricityWarning('radius', 12, 8);
    expect(warning?.title).toBeTruthy();
    expect(warning?.title.length).toBeLessThanOrEqual(40);
  });

  it('returns null when a base is not a usable number', () => {
    expect(getConcentricityWarning('radius', Number.NaN, 8)).toBeNull();
    expect(getConcentricityWarning('spacing', 12, Number.NaN)).toBeNull();
  });
});

describe('buildSpacingScale', () => {
  it('reproduces the default spacing scale from the default base', () => {
    // Picking the default base must not write a single override, so the ramp
    // it builds is the defaults themselves, unit included.
    expect(buildSpacingScale(4)).toEqual(spacingDefaults);
  });

  it('reads a step in px whether it is written in rem or in px', () => {
    expect(spacingToPx('0.5rem')).toBe(8);
    expect(spacingToPx('12px')).toBe(12);
    expect(spacingToPx('var(--spacing-2)')).toBeNaN();
  });
});
