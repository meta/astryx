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
// A press in flight at the load finishes by its click. The touch parts track
// only the presses that start after they mount.
//
// A field focused before the load keeps the browser's own reveal and does not
// ride the on-screen keyboard: the ride moves the field with the animator.

import {useEffect, useSyncExternalStore} from 'react';
import {createModuleLoader, type ModuleLoader} from './moduleLoader';
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
let hasLoadStarted = false;
const listeners = new Set<() => void>();
const parts = new Set<ModuleLoader<unknown>>();
const loadedParts = new Map<ModuleLoader<unknown>, unknown>();

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

function notify(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

function publish(loaded: TouchRuntime): void {
  runtime = loaded;
  notify();
}

const runtimeModule = createModuleLoader(
  async () => import('./touchRuntimeModules'),
);

async function loadPart(part: ModuleLoader<unknown>): Promise<void> {
  try {
    loadedParts.set(part, await part.load());
    notify();
  } catch {
    // A part that fails to load leaves its component on taps, clicks and
    // keys.
  }
}

async function load(): Promise<void> {
  hasLoadStarted = true;
  await Promise.all([
    runtimeModule.load().then(
      loaded => publish(loaded.touchRuntime),
      () => {
        // A chunk that fails to load leaves the page on taps, clicks and
        // keys.
      },
    ),
    ...[...parts].map(loadPart),
  ]);
}

function whenIdle(view: Window, start: () => void): void {
  if (typeof view.requestIdleCallback === 'function') {
    view.requestIdleCallback(start, {timeout: LOAD_CAP_MS});
  } else {
    view.setTimeout(start, 0);
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
  // The timers belong to this window, so they end with its document.
  const view = window;
  // A frame callback runs before the frame paints. The task it queues runs
  // after that paint.
  view.requestAnimationFrame(() => {
    view.setTimeout(() => whenIdle(view, () => void load()), 0);
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

/**
 * A component's touch part: the touch code only that component uses, in a
 * module only that component imports. The component's module registers it
 * as it loads, and the loader loads every registered part with the shared
 * runtime. So a page loads only the parts of the components it imports.
 * `importPart` is the part module's `import()`.
 */
export function createTouchPart<T>(
  importPart: () => Promise<T>,
): ModuleLoader<T> {
  const part = createModuleLoader(importPart);
  parts.add(part);
  return part;
}

/**
 * A touch part once the page has loaded it, else `null`. Its first mount
 * schedules the page's one touch load, which loads the part with the shared
 * runtime. A part that first mounts after that load has started loads at
 * this mount. Never on an input.
 */
export function useTouchPart<T>(part: ModuleLoader<T>): T | null {
  const current = useSyncExternalStore(
    subscribe,
    () => (loadedParts.get(part) as T | undefined) ?? null,
    () => null,
  );
  // Syncs the part's load with its first mount.
  useEffect(() => {
    if (hasLoadStarted) {
      void loadPart(part);
    } else {
      scheduleTouchRuntimeLoad();
    }
  }, [part]);
  return current;
}

/** Test only: loads the runtime and every part now; every reader sees them. */
export async function __loadTouchRuntimeForTest(): Promise<TouchRuntime> {
  isScheduled = true;
  await load();
  if (runtime == null) {
    throw new Error('The touch runtime did not load.');
  }
  return runtime;
}

/**
 * Test only: forgets the loaded parts and keeps the runtime, as on a page
 * where a component's part was not loaded with the page load.
 */
export function __forgetLoadedPartsForTest(): void {
  loadedParts.clear();
  notify();
}

/** Test only: forgets the loaded runtime and any scheduled load. */
export function __resetTouchRuntimeForTest(): void {
  runtime = null;
  isScheduled = false;
  hasLoadStarted = false;
  loadedParts.clear();
  notify();
}
