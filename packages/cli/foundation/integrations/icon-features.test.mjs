// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon feature gate: on with an installed icon-set package or
 * `experimental.iconSet`, off otherwise.
 */

import {describe, expect, it} from 'vitest';
import {ICON_FEATURES_RELEASED, iconFeatureGate} from './icon-features.mjs';

const pack = {name: '@acme/glyphs', iconSets: '/x/icon-sets'};
const other = {name: '@acme/widgets', components: '/x/components'};

describe('iconFeatureGate', () => {
  it('the release switch is off', () => {
    expect(ICON_FEATURES_RELEASED).toBe(false);
  });

  it('is off with no icon-set package and no experimental.iconSet', () => {
    expect(iconFeatureGate(undefined)).toEqual({on: false, reason: null});
    expect(iconFeatureGate({config: {}, loadedIntegrations: [other]})).toEqual({
      on: false,
      reason: null,
    });
  });

  it('is on with an installed icon-set package', () => {
    expect(
      iconFeatureGate({config: {}, loadedIntegrations: [other, pack]}),
    ).toEqual({on: true, reason: 'pack'});
  });

  it('is on with experimental.iconSet', () => {
    expect(
      iconFeatureGate({
        config: {experimental: {iconSet: 'glyphs'}},
        loadedIntegrations: [],
      }),
    ).toEqual({on: true, reason: 'iconSet'});
  });

  it('the package being authored turns nothing on; experimental.iconSet still does', () => {
    const authored = {...pack, __local: true};
    expect(
      iconFeatureGate({config: {}, loadedIntegrations: [authored]}),
    ).toEqual({on: false, reason: null});
    expect(
      iconFeatureGate({
        config: {experimental: {iconSet: 'glyphs'}},
        loadedIntegrations: [authored],
      }),
    ).toEqual({on: true, reason: 'iconSet'});
  });

  it('a package that failed to load, or lost a provider conflict, turns nothing on', () => {
    expect(
      iconFeatureGate({
        config: {},
        loadedIntegrations: [
          {...pack, __loadError: 'boom'},
          {...pack, __providerConflict: true},
        ],
      }),
    ).toEqual({on: false, reason: null});
  });
});
