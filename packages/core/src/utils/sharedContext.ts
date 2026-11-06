// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file sharedContext.ts
 * @input A registered name and its protocol version
 * @output One value or React context per key, shared by every copy of Core
 * @position Shared runtime state: a swizzled copy and the package use the same
 *   contexts and stores when their protocol versions match
 */

import {createContext, type Context} from 'react';

/**
 * The registered key of a shared value. The version is the protocol of the
 * value's shape: change it when a copy built against the old shape can no
 * longer read the value, so the two keep values of their own.
 */
export function sharedKey(name: string, version: number): symbol {
  return Symbol.for(`@astryxdesign/core/${name}/v${version}`);
}

/**
 * The value under `key` in this JavaScript realm, created on first use. Every
 * copy of Core that asks for the same key gets the same value.
 */
export function realmValue<T>(key: symbol, create: () => T): T {
  const realm = globalThis as typeof globalThis & {[key: symbol]: unknown};
  if (Object.hasOwn(realm, key)) {
    return realm[key] as T;
  }
  const value = create();
  Object.defineProperty(realm, key, {value});
  return value;
}

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
