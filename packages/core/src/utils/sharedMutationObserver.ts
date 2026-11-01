// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file sharedMutationObserver.ts
 * @input MutationObserver API
 * @output Exports observeMutations (one shared observer per set of options)
 *   and observeContent, its text-and-children form
 * @position Internal utility; consumed by useTruncation, hitArea and AppShell's
 *   main-overflow observer. The mutation counterpart of sharedResizeObserver:
 *   one observer for every element observed with the same options, so a
 *   repeated cell, row or region does not create one observer per instance.
 */

type MutationCallback = () => void;

const CONTENT_OPTIONS: MutationObserverInit = {
  characterData: true,
  childList: true,
  subtree: true,
};

interface SharedObserver {
  readonly observer: MutationObserver;
  readonly callbacks: Map<Node, Set<MutationCallback>>;
}

/**
 * One observer per distinct set of options: an observer holds one set of
 * options per node, so registrations that need different options cannot
 * share one.
 */
const observers = new Map<string, SharedObserver>();

function optionsKey(options: MutationObserverInit): string {
  return JSON.stringify([
    options.attributes === true,
    options.attributeFilter == null
      ? null
      : [...options.attributeFilter].sort(),
    options.characterData === true,
    options.childList === true,
    options.subtree === true,
  ]);
}

function createSharedObserver(options: MutationObserverInit): SharedObserver {
  const callbacks = new Map<Node, Set<MutationCallback>>();
  const isSubtree = options.subtree === true;
  const observer = new MutationObserver(records => {
    // One call per callback per batch, however many records it received.
    // With `subtree`, a record's target can be any descendant, so walk up to
    // the observed roots; without it, the target is the observed node.
    const pending = new Set<MutationCallback>();
    for (const record of records) {
      if (!isSubtree) {
        callbacks
          .get(record.target)
          ?.forEach(callback => pending.add(callback));
        continue;
      }
      for (
        let node: Node | null = record.target;
        node;
        node = node.parentNode
      ) {
        callbacks.get(node)?.forEach(callback => pending.add(callback));
      }
    }
    pending.forEach(callback => callback());
  });
  return {observer, callbacks};
}

/**
 * Call `callback` for mutations of `element` matching `options`, through the
 * one observer shared by every registration with the same options. Returns an
 * unsubscribe that removes only this registration.
 *
 * MutationObserver has no per-target unobserve, so a released element stays
 * registered with its shared observer until no element remains; its records
 * match no callback and are ignored. An observer disconnects and is released
 * when its last registration goes.
 */
export function observeMutations(
  element: Node,
  options: MutationObserverInit,
  callback: MutationCallback,
): () => void {
  if (typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const key = optionsKey(options);
  let shared = observers.get(key);
  if (shared == null) {
    shared = createSharedObserver(options);
    observers.set(key, shared);
  }
  const {observer, callbacks} = shared;
  const existing = callbacks.get(element);
  if (existing) {
    existing.add(callback);
  } else {
    callbacks.set(element, new Set([callback]));
    observer.observe(element, options);
  }

  let isSubscribed = true;
  return () => {
    if (!isSubscribed) {
      return;
    }
    isSubscribed = false;
    const targetCallbacks = callbacks.get(element);
    targetCallbacks?.delete(callback);
    if (targetCallbacks?.size === 0) {
      callbacks.delete(element);
    }
    if (callbacks.size === 0 && observers.get(key)?.observer === observer) {
      observer.disconnect();
      observers.delete(key);
    }
  };
}

/**
 * Call `callback` when the element's text or children change (including
 * descendants). Returns an unsubscribe that removes only this registration.
 */
export function observeContent(
  element: Element,
  callback: MutationCallback,
): () => void {
  return observeMutations(element, CONTENT_OPTIONS, callback);
}
