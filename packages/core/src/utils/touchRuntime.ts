// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file touchRuntime.ts
 * @input Nothing from the caller: a component that uses the shared touch
 *   modules calls `useTouchRuntime`, or reads `getTouchRuntime` at use time
 * @output The shared touch runtime (the animator, the gesture code and the
 *   touch parts built on them) once the page has loaded it, else `null`
 * @position Core's one touch loader. No component imports the touch modules
 *   statically; this file loads them once per page after first paint, at
 *   idle within a time cap, whatever the input
 */

// The touch modules (the animator, the gesture host, the recognizers and the
// touch parts built on them) are about 45 KB gzip. A page that never sees a
// finger must not pay for them in its first load, and every page still has
// them once it settles. So the first component that uses them schedules one
// load: after the page's first paint, when the main thread is idle, and no
// later than LOAD_CAP_MS after that paint. An input never starts or hurries
// the load.
//
// Until the load ends, a component that uses the runtime works by taps,
// clicks and keys, with no drag tracking and no spring. A gesture that is in
// flight when the load ends finishes that way: the touch parts attach only
// when they mount, so the next press is the first one they track.
//
// A field focused before the load keeps the browser's own reveal and does not
// ride the on-screen keyboard: the ride moves the field with the animator.

import {useEffect, useSyncExternalStore} from 'react';
import {createModuleLoader} from './moduleLoader';
import type {TouchRuntime} from './touchRuntimeModules';

export type {TouchRuntime} from './touchRuntimeModules';

/**
 * The latest the load starts after first paint, in ms, when the main thread
 * never goes idle. Measured on a throttled phone profile: an idle period
 * comes well before this on a settled page.
 */
export const LOAD_CAP_MS = 2000;

let runtime: TouchRuntime | null = null;
let isScheduled = false;
const listeners = new Set<() => void>();

/** The loaded touch runtime, or `null` before the page has loaded it. */
export function getTouchRuntime(): TouchRuntime | null {
  return runtime;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(loaded: TouchRuntime): void {
  runtime = loaded;
  for (const listener of [...listeners]) {
    listener();
  }
}

const runtimeModule = createModuleLoader(
  async () => import('./touchRuntimeModules'),
);

async function load(): Promise<void> {
  try {
    publish((await runtimeModule.load()).touchRuntime);
  } catch {
    // A chunk that fails to load leaves the page on taps, clicks and keys.
  }
}

function whenIdle(start: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, {timeout: LOAD_CAP_MS});
  } else {
    setTimeout(start, 0);
  }
}

/**
 * Schedules the page's one load of the touch runtime. The first call starts
 * the wait for first paint; every later call does nothing.
 */
export function scheduleTouchRuntimeLoad(): void {
  if (isScheduled || runtime != null || typeof window === 'undefined') {
    return;
  }
  isScheduled = true;
  // A frame callback runs before the frame paints. The task it queues runs
  // after that paint.
  window.requestAnimationFrame(() => {
    setTimeout(() => whenIdle(() => void load()), 0);
  });
}

/**
 * The touch runtime once the page has loaded it, else `null`. The first
 * mount on the page schedules the load. The server and the hydration render
 * read `null`, so the markup matches.
 */
export function useTouchRuntime(): TouchRuntime | null {
  const current = useSyncExternalStore(subscribe, getTouchRuntime, () => null);
  // Syncs the page's one load of the touch runtime with the first mount.
  useEffect(scheduleTouchRuntimeLoad, []);
  return current;
}

/** Test only: loads the runtime now and makes every reader see it. */
export async function __loadTouchRuntimeForTest(): Promise<TouchRuntime> {
  const loaded = (await runtimeModule.load()).touchRuntime;
  publish(loaded);
  isScheduled = true;
  return loaded;
}

/** Test only: forgets the loaded runtime and any scheduled load. */
export function __resetTouchRuntimeForTest(): void {
  runtime = null;
  isScheduled = false;
  for (const listener of [...listeners]) {
    listener();
  }
}
