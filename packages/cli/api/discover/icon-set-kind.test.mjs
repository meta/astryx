// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Discover reads the experimental `icon-set` kind exactly where the
 * icon feature gate is on: an installed icon-set package or
 * `experimental.iconSet`.
 */

import {describe, expect, it} from 'vitest';
import {STABLE_KINDS, readKinds} from './_adapter.mjs';
import {DISCOVER_KINDS} from '../../authoring/discover/parse.mjs';

const pack = {name: '@acme/glyphs', iconSets: '/x/icon-sets'};
const other = {name: '@acme/widgets', components: '/x/components'};

/** @param {Record<string, unknown>} config @param {unknown[]} loaded */
const project = (config, loaded) =>
  /** @type {any} */ ({config, loadedIntegrations: loaded});

describe('discover item kinds', () => {
  it('no icon-set package and no experimental.iconSet: the stable kinds', () => {
    expect(readKinds(undefined)).toEqual(STABLE_KINDS);
    expect(readKinds(project({}, [other]))).toEqual(STABLE_KINDS);
  });

  it('one or two installed icon-set packages: every kind', () => {
    expect(readKinds(project({}, [pack]))).toEqual(DISCOVER_KINDS);
    expect(
      readKinds(project({}, [pack, {...pack, name: '@acme/lines'}])),
    ).toEqual(DISCOVER_KINDS);
  });

  it('experimental.iconSet: every kind', () => {
    expect(readKinds(project({experimental: {iconSet: 'glyphs'}}, []))).toEqual(
      DISCOVER_KINDS,
    );
  });
});
