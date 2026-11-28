// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file curveEnds.ts
 * @input An animator animation or handle, and when its curves end
 * @output curveEnds: when each one's curves end, on the motion clock
 * @position The motion animator (animator.ts) writes it as it plays a run;
 *   the input hold (Layer/inputHold.ts) reads it to end a touch entrance's
 *   hold on screen. A module of its own, so the hold reads it without
 *   pulling in the animator.
 */

import {sharedWeakMap} from '../utils/sharedRealm';

/**
 * When each running animator animation's curve ends, and when each handle's
 * curves end once its start is known. An animation's effect runs on past that
 * end, holding the end value, so its own timing does not tell.
 */
export const curveEnds = sharedWeakMap<object, number>(
  'motion/curve-ends/curve-ends',
  1,
);
