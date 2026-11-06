// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file sharedContext.ts
 * @input A registered name and its protocol version
 * @output A React context per key, shared by every copy of Core
 * @position Shared runtime state: a swizzled copy and the package use the same
 *   contexts and stores when their protocol versions match
 */

import {createContext, type Context} from 'react';
import {realmValue, sharedKey} from './sharedRealm';

/**
 * A React context registered under a versioned key, so a provider in one copy
 * of Core reaches consumers in another.
 */
export function createSharedContext<T>(
  name: string,
  version: number,
  defaultValue: T,
): Context<T> {
  return realmValue(sharedKey(`context/${name}`, version), () => {
    const SharedContext = createContext(defaultValue);
    SharedContext.displayName = name;
    return SharedContext;
  });
}
