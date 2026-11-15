// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {internByIdentity} from './internByIdentity';

describe('internByIdentity', () => {
  it('returns the first array for a new array of the same objects in order', () => {
    const a = {};
    const b = {};
    const first = internByIdentity([a, b]);

    expect(internByIdentity([a, b])).toBe(first);
  });

  it('returns another array when an object is a new one with the same contents', () => {
    const first = internByIdentity([{key: 'id'}]);

    expect(internByIdentity([{key: 'id'}])).not.toBe(first);
  });

  it('returns another array when the order or the count changes', () => {
    const a = {};
    const b = {};
    const first = internByIdentity([a, b]);

    expect(internByIdentity([b, a])).not.toBe(first);
    expect(internByIdentity([a])).not.toBe(first);
    expect(internByIdentity([a, b, a])).not.toBe(first);
  });

  it('stores a copy, so an edit to the first array reaches no other caller', () => {
    const a = {};
    const b = {};
    const first = [a, b];
    internByIdentity(first);

    first.push({});

    expect(internByIdentity([a, b])).toHaveLength(2);
  });

  it('returns one array for every empty array', () => {
    expect(internByIdentity([])).toBe(internByIdentity([]));
  });
});
