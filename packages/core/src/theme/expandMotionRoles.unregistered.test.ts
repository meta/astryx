// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file expandMotionRoles.unregistered.test.ts
 * @input expandMotionRoles.ts alone: no motion table is imported
 * @output Proof that a theme's role ids and kinds are checked against the
 *   generated list of roles, whatever the app has imported
 * @position Testing for /packages/core/src/theme/expandMotionRoles.ts (the
 *   path through `@astryxdesign/core/theme` alone)
 */

import {describe, expect, it} from 'vitest';
import {listMotionRoles} from '../motion/roles';
import {expandMotionRoles} from './expandMotionRoles';

describe('motion role checks without the motion tables', () => {
  it('runs with no table registered', () => {
    expect(listMotionRoles()).toEqual([]);
  });

  it('refuses a misspelt role id', () => {
    expect(() =>
      expandMotionRoles(
        {springs: {'springs.sheetPresnt': {duration: 0.5, bounce: 0}}},
        'm',
      ),
    ).toThrow(
      /m\.springs\["springs\.sheetPresnt"\]: "springs\.sheetPresnt" is not a motion role/,
    );
  });

  it('refuses a role under the wrong group', () => {
    expect(() =>
      expandMotionRoles({durations: {'springs.sheetPresent': 300}}, 'm'),
    ).toThrow(/"springs\.sheetPresent" is a spring/);
  });

  it('accepts a known role', () => {
    expect(
      expandMotionRoles({durations: {'navigation.transitionMs': 300}}, 'm'),
    ).toEqual({'--motion-navigation-transition-ms': '300ms'});
  });
});
