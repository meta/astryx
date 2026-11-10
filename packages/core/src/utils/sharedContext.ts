// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file sharedContext.ts
 * @input A registered name and its protocol version
 * @output A React context, or any React-bound value, per key and React,
 *   shared by every copy of Core that runs on that React
 * @position Shared runtime state: a swizzled copy and the package use the same
 *   contexts and stores when their protocol versions match
 */

import {createContext, type Context} from 'react';
import {realmValue, sharedKey} from './sharedRealm';

/**
 * A React context registered under a versioned key, so a provider in one copy
 * of Core reaches consumers in another. Each React gets its own context under
 * the key: a server can load two Reacts, and a streaming render leaves context
 * values that only its own React restores, so requests on two Reacts must not
 * share a context.
 */
export function createSharedContext<T>(
  name: string,
  version: number,
  defaultValue: T,
): Context<T> {
  const byReact = realmValue(
    sharedKey(`context/${name}`, version),
    () => new WeakMap<typeof createContext, Context<unknown>>(),
    value => value instanceof WeakMap,
  );
  const existing = byReact.get(createContext);
  if (existing != null) {
    return existing as Context<T>;
  }
  const SharedContext = createContext(defaultValue);
  SharedContext.displayName = name;
  byReact.set(createContext, SharedContext as Context<unknown>);
  return SharedContext;
}

/**
 * One value per React under a registered name, shared by every copy of Core
 * on that React. Use it for state that holds React components or elements: a
 * copy on another React keeps its own value, so it never renders a component
 * written against the other React.
 */
export function sharedForReact<T>(
  name: string,
  version: number,
  create: () => T,
): T {
  const byReact = realmValue(
    sharedKey(`react/${name}`, version),
    () => new WeakMap<typeof createContext, T>(),
    value => value instanceof WeakMap,
  );
  if (byReact.has(createContext)) {
    return byReact.get(createContext) as T;
  }
  const value = create();
  byReact.set(createContext, value);
  return value;
}
