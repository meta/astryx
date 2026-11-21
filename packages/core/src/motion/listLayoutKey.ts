// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listLayoutKey.ts
 * @input None
 * @output `LIST_LAYOUT`, the registered key under which an `animatedLayout`
 *   handle carries the layout calls a List makes
 * @position Internal leaf module. List/listLayoutUpdates.ts reads the key and
 *   motion/animatedLayout.ts writes it. A List given no handle imports only
 *   this module, so it loads none of motion/animatedLayout.ts.
 */

import {sharedKey} from '../utils/sharedRealm';

export const LIST_LAYOUT = sharedKey('animated-layout/list-layout', 1);
