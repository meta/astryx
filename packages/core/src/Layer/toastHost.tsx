// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file toastHost.tsx
 * @input The toast viewport that Toast registers, and LayerProvider's toast
 *   configuration
 * @output ToastContext, registerToastHost, ToastHostOutlet, and the toast
 *   queue that the outlet and useToast's fallback root share
 * @position Private layer infrastructure. LayerProvider renders the outlet,
 *   and Toast/ToastViewport.tsx registers itself and reads the context.
 *
 * SYNC: When modified, update /packages/core/src/Layer/toastHost.test.tsx and
 *   /docs/architecture/layer-runtime.md
 */

import {
  createContext,
  use,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react';
import type {ToastDismissReason, ToastEntry} from '../Toast/types';
import type {LayerInset, LayerToastConfig} from './LayerContext';
import {createSharedContext} from '../utils/sharedContext';
import {realmValue, sharedKey} from '../utils/sharedRealm';

/** Internal context value for toast state management. */
export interface ToastContextValue {
  /** Add a toast. */
  addToast: (entry: ToastEntry) => void;
  /** Remove a toast by ID with a reason. */
  removeToast: (id: string, reason: ToastDismissReason) => void;
  /** Find a toast by uniqueID. */
  findByUniqueID: (uniqueID: string) => ToastEntry | undefined;
}

/**
 * React context for toast state. It lives in Layer, so LayerProvider can
 * provide it without importing Toast. With no provider it is null, and
 * `useToast` mounts a viewport of its own.
 */
export const ToastContext = createSharedContext<ToastContextValue | null>(
  'ToastContext',
  1,
  null,
);
ToastContext.displayName = 'ToastContext';

/**
 * Finds the toast a new one meets by uniqueID, and whether the new one is
 * dropped. An empty uniqueID names no toast. With a namesake held, an ignored
 * toast is dropped and an overwrite takes its place. The viewport and the
 * waiting queue both decide through it, so the rule has one home.
 */
export function findToastNamesake<T extends ToastEntry>(
  held: ReadonlyArray<T>,
  entry: ToastEntry,
): {namesake: T | undefined; isDropped: boolean} {
  const {uniqueID, collisionBehavior = 'overwrite'} = entry.options;
  const namesake = uniqueID
    ? held.find(candidate => candidate.options.uniqueID === uniqueID)
    : undefined;
  return {
    namesake,
    isDropped: namesake != null && collisionBehavior === 'ignore',
  };
}

/** The props an outlet gives the registered viewport. */
export interface ToastHostProps {
  position?: LayerToastConfig['position'];
  maxVisible?: LayerToastConfig['maxVisible'];
  inset?: LayerToastConfig['inset'];
  layerInset?: LayerInset;
  children?: ReactNode;
}

interface ToastHostRegistry {
  host: ComponentType<ToastHostProps> | null;
  readonly listeners: Set<() => void>;
}

// Every copy of Core on this React uses one registry, so a swizzled
// LayerProvider renders the viewport the package's Toast registers. The
// registry holds a component, so a copy on another React keeps its own.
const hostRegistry = (() => {
  const byReact = realmValue(
    sharedKey('layer/toast-host', 1),
    () => new WeakMap<typeof createContext, ToastHostRegistry>(),
    value => value instanceof WeakMap,
  );
  let registry = byReact.get(createContext);
  if (registry == null) {
    registry = {host: null, listeners: new Set()};
    byReact.set(createContext, registry);
  }
  return registry;
})();

/**
 * Registers the toast viewport, which every LayerProvider renders from then
 * on. Toast's viewport module calls it as it loads, so an app that never
 * imports Toast carries none of it.
 */
export function registerToastHost(host: ComponentType<ToastHostProps>): void {
  if (hostRegistry.host === host) {
    return;
  }
  hostRegistry.host = host;
  for (const listener of hostRegistry.listeners) {
    listener();
  }
}

/** Test-only: forget the registered viewport, as on a fresh page. */
export function __resetToastHostForTest(): void {
  hostRegistry.host = null;
}

function subscribeToHost(listener: () => void): () => void {
  hostRegistry.listeners.add(listener);
  return () => {
    hostRegistry.listeners.delete(listener);
  };
}

const readHost = () => hostRegistry.host;
// The server and the hydrating render show no viewport. The viewport has
// nothing to show there, and it mounts right after hydration.
const readNoHost = () => null;

/**
 * A toast context that holds toasts until a viewport's own context takes
 * them. LayerProvider's outlet and useToast's fallback root each use one.
 */
export interface ToastQueue {
  /** The context to provide. It forwards to the viewport once one connects. */
  readonly context: ToastContextValue;
  /** Connects the viewport's context, or disconnects it with null. */
  connect: (viewport: ToastContextValue | null) => void;
}

export function createToastQueue(): ToastQueue {
  let viewport: ToastContextValue | null = null;
  let waiting: ToastEntry[] = [];
  return {
    context: {
      addToast: entry => {
        if (viewport != null) {
          viewport.addToast(entry);
          return;
        }
        // A waiting toast meets a namesake as the viewport's toasts do.
        const {namesake, isDropped} = findToastNamesake(waiting, entry);
        if (isDropped) {
          return;
        }
        waiting =
          namesake == null
            ? [...waiting, entry]
            : waiting.map(candidate =>
                candidate === namesake ? entry : candidate,
              );
      },
      removeToast: (id, reason) => {
        if (viewport != null) {
          viewport.removeToast(id, reason);
          return;
        }
        const entry = waiting.find(candidate => candidate.id === id);
        if (entry == null) {
          return;
        }
        waiting = waiting.filter(candidate => candidate !== entry);
        // A toast dismissed while it waits still reports its hide, as the
        // viewport reports one for a toast that has not rendered yet. A
        // replaced or ignored namesake is not waiting, so it reports none.
        entry.options.onHide?.(reason);
      },
      findByUniqueID: uniqueID =>
        viewport == null
          ? waiting.find(entry => entry.options.uniqueID === uniqueID)
          : viewport.findByUniqueID(uniqueID),
    },
    connect: next => {
      viewport = next;
      if (next == null) {
        return;
      }
      const entries = waiting;
      waiting = [];
      for (const entry of entries) {
        next.addToast(entry);
      }
    },
  };
}

/** Connects a queue to the toast context of the viewport that renders it. */
export function ToastQueueConnector({queue}: {queue: ToastQueue}) {
  const viewport = use(ToastContext);
  // Points the queue at the viewport's toast context once the viewport
  // commits, so its addToast can set its state. The context changes with the
  // viewport's props, and the queue stays connected across that change.
  useEffect(() => {
    queue.connect(viewport);
  }, [queue, viewport]);
  // Disconnects the queue when the viewport unmounts.
  useEffect(
    () => () => {
      queue.connect(null);
    },
    [queue],
  );
  return null;
}

/**
 * LayerProvider's toast outlet. It always provides the toast context, so the
 * app keeps its place in the tree when the viewport arrives. A toast added
 * before the viewport can take it waits in the queue, and the toasts that
 * wait show in order.
 */
export function ToastHostOutlet({children, ...config}: ToastHostProps) {
  const Host = useSyncExternalStore(subscribeToHost, readHost, readNoHost);
  const [queue] = useState(createToastQueue);
  return (
    <ToastContext value={queue.context}>
      {children}
      {Host == null ? null : (
        <Host {...config}>
          <ToastQueueConnector queue={queue} />
        </Host>
      )}
    </ToastContext>
  );
}
