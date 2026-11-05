// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Component stability projection tests.
 * @input componentStability() and the generated component registry
 * @output Regression coverage for the stability a component page header shows
 * @position Build-time docsite data verification
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, expect, it} from 'vitest';
import {
  LAB_PACKAGE_NAME,
  componentStability,
} from '../../scripts/lib/component-stability.mjs';
import {components} from '../generated/componentRegistry';

describe('component stability', () => {
  it('is lab for a Lab component, experimental when its docs say so, otherwise stable', () => {
    const experimental = {stability: 'experimental'};
    expect(componentStability(LAB_PACKAGE_NAME, {})).toBe('lab');
    expect(componentStability(LAB_PACKAGE_NAME, experimental)).toBe('lab');
    expect(componentStability('@astryxdesign/core', experimental)).toBe(
      'experimental',
    );
    // A part of an experimental family is experimental.
    expect(componentStability('@astryxdesign/core', {}, experimental)).toBe(
      'experimental',
    );
    expect(componentStability('@astryxdesign/core', {}, null)).toBeNull();
    expect(componentStability('@astryxdesign/charts', {})).toBeNull();
  });

  it('reaches the generated registry', () => {
    for (const [packageName, entries] of Object.entries(components)) {
      for (const entry of entries) {
        if (packageName === LAB_PACKAGE_NAME) {
          expect(entry.stability, entry.name).toBe('lab');
        } else {
          expect(entry.stability, entry.name).not.toBe('lab');
        }
      }
    }
    // An experimental prop does not make its stable component experimental.
    const drawer = components['@astryxdesign/core'].find(
      entry => entry.name === 'Drawer',
    );
    expect(drawer?.props.some(prop => prop.stability === 'experimental')).toBe(
      true,
    );
    expect(drawer?.stability).toBeNull();
  });
});
