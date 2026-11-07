// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hostRegistry.ts
 * @input Documents, and the gesture host created for each
 * @output Exports gestureHosts: each document's gesture host, once something
 *   has asked getGestureHost for it
 * @position Shared by GestureHost.ts, which creates and records the hosts, and
 *   code that only asks a host that already exists (pageHold.ts), which then
 *   imports nothing of the host itself.
 *
 * SYNC: When modified, update GestureHost.ts (getGestureHost) and pageHold.ts.
 */

import type {GestureHost} from './GestureHost';

/** Each document's gesture host, recorded when getGestureHost creates it. */
export const gestureHosts = new WeakMap<Document, GestureHost>();
