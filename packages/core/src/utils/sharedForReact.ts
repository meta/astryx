// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedForReact.ts
 * @input A registered name, its protocol version, and the React this module
 *   loads with
 * @output One value per React under that name, shared by every copy of Core
 *   on that React
 * @position Shared runtime state for values that hold React components or
 *   elements; no client directive, so server modules can use it
 *
 * Server and client React builds are separate instances, so each keeps its
 * own value.
 */

import {createElement} from 'react';
import {realmValue, sharedKey} from './sharedRealm';

/**
 * One value per React under a registered name, shared by every copy of Core
 * on that React. Use it for state that holds React components or elements: a
 * copy on another React keeps its own value, so it never renders a component
 * written against the other React. React's `createElement` names the React;
 * both the client and the server builds export it.
 */
export function sharedForReact<T>(
  name: string,
  version: number,
  create: () => T,
): T {
  const byReact = realmValue(
    sharedKey(`react/${name}`, version),
    () => new WeakMap<typeof createElement, T>(),
    value => value instanceof WeakMap,
  );
  if (byReact.has(createElement)) {
    return byReact.get(createElement) as T;
  }
  const value = create();
  byReact.set(createElement, value);
  return value;
}
