// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLiftFromTrigger.ts
 * @input React
 * @output Exports useLiftFromTrigger: a component's one lift (liftFromTrigger.ts), ended when the
 *   component unmounts
 * @position The React entry to the lift presentation; internal to core and
 *   opt-in, like the module itself
 *
 * SYNC: When modified, update /packages/core/src/liftFromTrigger/liftFromTrigger.test.ts
 */

import {useEffect, useRef} from 'react';
import {createLiftFromTrigger, type LiftFromTrigger} from './liftFromTrigger';

/**
 * The component's lift. It stays the same object for the component's life;
 * an unmount ends whatever it has up and leaves the page as it was
 * (spec:AST-094 FR24).
 */
export function useLiftFromTrigger(): LiftFromTrigger {
  const liftRef = useRef<LiftFromTrigger | null>(null);
  liftRef.current ??= createLiftFromTrigger();
  const lift = liftRef.current;
  useEffect(() => () => lift.dispose(), [lift]);
  return lift;
}
