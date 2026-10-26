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
        {springs: {'springs.settel': {duration: 0.5, bounce: 0}}},
        'm',
      ),
    ).toThrow(
      /m\.springs\["springs\.settel"\]: "springs\.settel" is not a motion role/,
    );
  });

  it('refuses a component\u2019s measured value: only the roles FR4 names are roles', () => {
    expect(() =>
      expandMotionRoles(
        {springs: {'springs.sheetPresent': {duration: 0.6, bounce: 0.1}}},
        'm',
      ),
    ).toThrow(/"springs\.sheetPresent" is not a motion role/);
  });

  it('refuses a role under the wrong group', () => {
    expect(() =>
      expandMotionRoles({durations: {'springs.settle': 300}}, 'm'),
    ).toThrow(/"springs\.settle" is a spring/);
  });

  it('accepts a known role', () => {
    expect(
      expandMotionRoles({durations: {'timing.stateChangeMs': 300}}, 'm'),
    ).toEqual({'--motion-timing-state-change-ms': '300ms'});
  });
});
