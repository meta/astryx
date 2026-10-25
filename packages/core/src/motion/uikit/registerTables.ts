// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file registerTables.ts
 * @input The shared UIKit tables (springs, scroll, timing, navigation)
 * @output registerSharedTables: registers their motion roles, once
 * @position Called by resolveMotion before it resolves a role. The tables
 *   themselves are plain data with no side effect on import, so code that only
 *   reads a value (a press timing, a gesture threshold) does not register
 *   anything, and a build that never resolves a role drops the registry.
 *
 * SYNC: When a shared table is added or its excluded keys change, update this
 * file and run scripts/generate-motion-roles.mjs.
 */

import {registerMotionTable} from '../roles';
import {navigation} from './navigation';
import {scroll} from './scroll';
import {springs} from './springs';
import {timing} from './timing';

let registered = false;

/** Registers the shared tables' motion roles, the first time it runs. */
export function registerSharedTables(): void {
  if (registered) {
    return;
  }
  registered = true;
  registerMotionTable('springs', springs);
  registerMotionTable('scroll', scroll, {
    // Arbitration: who gets the touch, not how anything moves.
    exclude: ['delaysContentTouchesMs'],
  });
  registerMotionTable('timing', timing, {
    // Arbitration: who gets the touch, not how anything moves.
    exclude: ['press.scrollBrakeMs'],
  });
  registerMotionTable('navigation', navigation);
}
