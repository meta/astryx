// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLinkComponent.ts
 * @input Per-component override, LinkProvider context, and navigation props
 * @output Stable link component with destination checks, router `to` injection,
 *   and a private disabled-navigation boundary
 * @position Shared native and custom link boundary; rejected and initially
 *   disabled destinations render without invoking a router. Mounted routers
 *   retain identity when disabled while their native destination is guarded.
 *
 * SYNC: Link.doc.mjs and LinkProvider.doc.mjs describe this boundary.
 */

import {
  use,
  useMemo,
  useState,
  useCallback,
  createElement,
  type ComponentPropsWithRef,
  type SyntheticEvent,
} from 'react';
import {LinkContext} from './LinkContext';
import {useDisabledLink} from './useDisabledLink';
import {isSafeDestination} from '../utils/safeUrl';
import {mergeRefs} from '../utils/mergeRefs';
import type {LinkComponentType} from './types';

function blockActivation(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function createSafeLink(Component: LinkComponentType): LinkComponentType {
  function SafeLink({
    href,
    to,
    ref,
    _isDisabled,
    ...rest
  }: Omit<ComponentPropsWithRef<'a'>, 'href'> & {
    href?: unknown;
    to?: unknown;
    /** Private opt-in; the caller owns disabled semantics and tab eligibility. */
    _isDisabled?: boolean;
  }) {
    const accepted = isSafeDestination(href) && isSafeDestination(to);
    const [hasMountedRouter, setHasMountedRouter] = useState(false);
    const renderRouter =
      accepted && Component !== 'a' && (!_isDisabled || hasMountedRouter);
    const guardedRef = useDisabledLink(
      Boolean(_isDisabled) && renderRouter,
      ref,
    );

    // Track the actual router node lifetime in state, not a ref read during
    // render. Initially disabled links (including SSR) never mount a router;
    // once enabled, disabling preserves that focus owner. Rejection always
    // bypasses the router and its ref cleanup ends this lifetime.
    const trackRouter = useCallback((node: HTMLAnchorElement | null) => {
      setHasMountedRouter(node !== null);
      if (node) {
        return () => setHasMountedRouter(false);
      }
    }, []);
    const routerRef = useMemo(
      () => mergeRefs(guardedRef, trackRouter),
      [guardedRef, trackRouter],
    );

    const props = {
      ...rest,
      // Keep natural link eligibility explicit across the commit that restores
      // a router's href. Removing tabIndex before the layout-owned restoration
      // would briefly make the focused anchor unfocusable in Chromium.
      tabIndex:
        rest.tabIndex ??
        (_isDisabled !== undefined && accepted && (href != null || renderRouter)
          ? 0
          : undefined),
      ref:
        _isDisabled === undefined ? ref : renderRouter ? routerRef : guardedRef,
      ...(_isDisabled && {
        onClickCapture: blockActivation,
        onDoubleClickCapture: blockActivation,
        onAuxClickCapture: blockActivation,
        onContextMenuCapture: blockActivation,
        onDragStartCapture: blockActivation,
        onKeyDownCapture: (event: React.KeyboardEvent<HTMLAnchorElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            blockActivation(event);
          } else {
            rest.onKeyDownCapture?.(event);
          }
        },
        onKeyUpCapture: (event: React.KeyboardEvent<HTMLAnchorElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            blockActivation(event);
          } else {
            rest.onKeyUpCapture?.(event);
          }
        },
      }),
    };
    if (!renderRouter) {
      return createElement('a', {
        ...props,
        href: accepted && !_isDisabled ? href : undefined,
        ...(_isDisabled && {target: undefined, rel: undefined}),
      });
    }
    // Do not invent a destination or pass undefined to required-href routers.
    // The ref-owned guard removes the concrete href, not the router's input.
    return createElement(Component, {...props, href, to: to ?? href});
  }
  SafeLink.displayName = `SafeLink(${
    typeof Component === 'string'
      ? Component
      : Component.displayName || Component.name || 'Component'
  })`;
  return SafeLink as LinkComponentType;
}

/**
 * Resolve `as`, then LinkProvider, then a native anchor. Both destination props
 * are checked before rendering; accepted structured values retain identity.
 * Custom components receive `to={href}` unless an explicit `to` is supplied.
 *
 * @example
 * ```
 * const LinkComponent = useLinkComponent(as);
 * return <LinkComponent href="/docs">Documentation</LinkComponent>;
 * ```
 */
export function useLinkComponent(as?: LinkComponentType): LinkComponentType {
  const ctx = use(LinkContext);
  const resolved = as ?? ctx?.component ?? 'a';
  return useMemo(() => createSafeLink(resolved), [resolved]);
}
