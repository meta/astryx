// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What `--only` means on a place is one rule for `set --only` and
 * the settings reader (onlyMeans): on every group `--on` takes, the
 * editor's own (inputs) and each family role (button-like), it means
 * nothing; on a member of a group that spreads it keeps the change there;
 * on any other part it changes nothing.
 */

import {describe, expect, it} from 'vitest';
import {GROUP_ROLES, onlyMeans} from './_tables.mjs';

describe('what --only means on a place', () => {
  it.each([
    ['inputs', 'group'],
    ['button-like', 'group'],
    ['overlay-headers', 'group'],
    ['text-input', 'member'],
    ['badge', 'own'],
  ])('%s: %s', (on, means) => {
    expect(onlyMeans(on)).toBe(means);
  });

  it('reads every family role as a group', () => {
    for (const role of GROUP_ROLES) expect(onlyMeans(role)).toBe('group');
  });
});
