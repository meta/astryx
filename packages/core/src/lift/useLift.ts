// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLift.ts
 * @input React
 * @output Exports useLift: a component's one lift (lift.ts), ended when the
 *   component unmounts
 * @position The React entry to the lift presentation; internal to core and
 *   opt-in, like the module itself
 *
 * SYNC: When modified, update /packages/core/src/lift/lift.test.ts
 */

import {useEffect, useRef} from 'react';
import {createLift, type Lift} from './lift';

/**
 * The component's lift. It stays the same object for the component's life;
 * an unmount ends whatever it has up and leaves the page as it was
 * (spec:AST-094 FR24).
 */
export function useLift(): Lift {
  const liftRef = useRef<Lift | null>(null);
  liftRef.current ??= createLift();
  const lift = liftRef.current;
  useEffect(() => () => lift.dispose(), [lift]);
  return lift;
}
