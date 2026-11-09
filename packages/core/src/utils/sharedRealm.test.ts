// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedRealm.test.ts
 * @input Two loads of sharedRealm.ts, as the package and a swizzled copy each
 *   carry one
 * @output Proves each shared shape gives both loads one value: state, maps,
 *   stores, brands and sequences, and that the test reset forgets them
 * @position Unit tests for utils/sharedRealm.ts (spec:AST-110 FR3)
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import type * as RealmModule from './sharedRealm';
import type {SharedBrand} from './sharedRealm';

type Realm = typeof RealmModule;

/** Two loads of the module: the package's and a copy's. */
async function twoCopies(): Promise<[Realm, Realm]> {
  const pkg = await import('./sharedRealm');
  vi.resetModules();
  const copy = await import('./sharedRealm');
  expect(copy).not.toBe(pkg);
  return [pkg, copy];
}

afterEach(async () => {
  (await import('./sharedRealm')).resetSharedStateForTest('test/');
  vi.resetModules();
});

describe('shared realm shapes (spec:AST-110 FR3)', () => {
  it('gives two copies one state object', async () => {
    const [pkg, copy] = await twoCopies();
    const a = pkg.sharedState('test/state', 1, () => ({count: 0}));
    const b = copy.sharedState('test/state', 1, () => ({count: 0}));
    a.count += 1;
    expect(b.count).toBe(1);
    expect(copy.sharedState('test/state', 2, () => ({count: 0}))).not.toBe(a);
  });

  it('gives two copies one map, weak map and weak set', async () => {
    const [pkg, copy] = await twoCopies();
    const doc = {};
    pkg.sharedMap<string, number>('test/map', 1).set('a', 1);
    expect(copy.sharedMap<string, number>('test/map', 1).get('a')).toBe(1);
    pkg.sharedWeakMap<object, number>('test/weak-map', 1).set(doc, 2);
    expect(
      copy.sharedWeakMap<object, number>('test/weak-map', 1).get(doc),
    ).toBe(2);
    pkg.sharedWeakSet<object>('test/weak-set', 1).add(doc);
    expect(copy.sharedWeakSet<object>('test/weak-set', 1).has(doc)).toBe(true);
  });

  it("reaches a copy's listeners from a package set", async () => {
    const [pkg, copy] = await twoCopies();
    const heard: number[] = [];
    const store = copy.sharedStore('test/store', 1, 0);
    store.subscribe(() => heard.push(store.get()));
    pkg.sharedStore('test/store', 1, 0).set(3);
    expect(heard).toEqual([3]);
  });

  it('reads a value a copy branded, and nothing on an unbranded one', async () => {
    const [pkg, copy] = await twoCopies();
    const pkgBrand = pkg.sharedBrand<{size: number}>('test/brand', 1);
    const copyBrand = copy.sharedBrand<{size: number}>('test/brand', 1);
    const branded = {[copyBrand.key]: {size: 4}};
    expect(pkgBrand.read(branded)).toEqual({size: 4});
    expect(pkgBrand.read({size: 4})).toBeUndefined();
    // The type member is required, so a plain object is not branded.
    // @ts-expect-error -- `{}` lacks the brand.
    const unbranded: SharedBrand<'test/brand/v1'> = {};
    expect(pkgBrand.read(unbranded)).toBeUndefined();
    expect(pkgBrand.read(null)).toBeUndefined();
  });

  it('continues one sequence across copies', async () => {
    const [pkg, copy] = await twoCopies();
    const next = pkg.sharedSequence('test/sequence', 1);
    const copyNext = copy.sharedSequence('test/sequence', 1);
    expect([next(), copyNext(), next()]).toEqual([1, 2, 3]);
  });

  it('forgets shared values under a prefix', async () => {
    const realm = await import('./sharedRealm');
    realm.sharedState('test/reset', 1, () => ({count: 5}));
    realm.resetSharedStateForTest('test/reset');
    expect(realm.sharedState('test/reset', 1, () => ({count: 0})).count).toBe(
      0,
    );
  });
});
