// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDisabledLink.ts
 * @input Disabled state and a forwarded custom-link DOM ref
 * @output Stable composed ref guarding the mounted router's native destination
 * @position Private Link runtime boundary; preserves the router's required props
 *   while removing its concrete anchor destination during disabled transitions
 */

import {useCallback, useLayoutEffect, useMemo, useRef, type Ref} from 'react';
import {mergeRefs} from '../utils/mergeRefs';

const activationEvents = [
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'dragstart',
];
const activationKeys = ['keydown', 'keyup'];

function ownDisabledDestination(node: HTMLAnchorElement) {
  let disabled = false;
  let destination: string | null = null;
  let observer: MutationObserver | undefined;

  const block = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const blockKey = (event: Event) => {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter' || key === ' ') {
      block(event);
    }
  };
  const stripDestination = () => {
    const href = node.getAttribute('href');
    if (href !== null) {
      destination = href;
      node.removeAttribute('href');
    }
  };

  const setDisabled = (next: boolean) => {
    if (next === disabled) {
      if (next) {
        stripDestination();
      }
      return;
    }
    disabled = next;
    if (next) {
      destination = node.getAttribute('href');
      stripDestination();
      for (const type of activationEvents) {
        node.addEventListener(type, block, true);
      }
      for (const type of activationKeys) {
        node.addEventListener(type, blockKey, true);
      }
      // Routers may update their resolved href without rerendering the caller.
      // Capture listeners close the synchronous activation window; observation
      // removes browser context-menu/drag destinations before the next input.
      const Observer = node.ownerDocument.defaultView?.MutationObserver;
      if (Observer) {
        observer = new Observer(stripDestination);
        observer.observe(node, {attributes: true, attributeFilter: ['href']});
      }
    } else {
      observer?.disconnect();
      observer = undefined;
      for (const type of activationEvents) {
        node.removeEventListener(type, block, true);
      }
      for (const type of activationKeys) {
        node.removeEventListener(type, blockKey, true);
      }
      // A fresh React/router commit wins over the saved destination. Otherwise
      // restore the href React still believes is already on this same node.
      if (!node.hasAttribute('href') && destination !== null) {
        node.setAttribute('href', destination);
      }
      destination = null;
    }
  };
  return {setDisabled, dispose: () => setDisabled(false)};
}

export function useDisabledLink(
  isDisabled: boolean,
  ref: Ref<HTMLAnchorElement> | undefined,
) {
  const disabledRef = useRef(isDisabled);
  const ownerRef = useRef<ReturnType<typeof ownDisabledDestination> | null>(
    null,
  );
  const attach = useCallback((node: HTMLAnchorElement | null) => {
    if (!node) {
      return;
    }
    const owner = ownDisabledDestination(node);
    ownerRef.current = owner;
    owner.setDisabled(disabledRef.current);
    return () => {
      owner.dispose();
      if (ownerRef.current === owner) {
        ownerRef.current = null;
      }
    };
  }, []);
  const mergedRef = useMemo(() => mergeRefs(attach, ref), [attach, ref]);

  // Synchronize the browser-owned anchor sink after every caller commit,
  // including destination changes while already disabled. Ref ownership covers
  // router-only node changes; the observer covers router-only href changes.
  useLayoutEffect(() => {
    disabledRef.current = isDisabled;
    ownerRef.current?.setDisabled(isDisabled);
  });

  return mergedRef;
}
