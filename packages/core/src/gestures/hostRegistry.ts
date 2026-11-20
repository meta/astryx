// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hostRegistry.ts
 * @input Documents, and the gesture host created for each
 * @output Exports gestureHosts: each document's gesture host, once something
 *   has asked getGestureHost for it, shared by every copy of Core
 * @position Shared by GestureHost.ts, which creates and records the hosts, and
 *   code that only asks a host that already exists (pageHold.ts), which then
 *   imports nothing of the host itself.
 *
 * SYNC: When modified, update GestureHost.ts (getGestureHost) and pageHold.ts.
 */

import type {GestureHost} from './GestureHost';
import {realmValue, sharedKey} from '../utils/sharedRealm';

/**
 * Each document's gesture host, recorded when getGestureHost creates it. The
 * map is registered, so a swizzled copy's gesture code joins the package's
 * host instead of starting a second one.
 */
export const gestureHosts = realmValue(
  sharedKey('gestures/host', 1),
  () => new WeakMap<Document, GestureHost>(),
);
