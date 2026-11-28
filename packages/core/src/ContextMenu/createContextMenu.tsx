// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createContextMenu.tsx
 * @input An element, its menu (`items`, or a `render` callback that fills
 *   it), and the menu's label, enablement, open-state callback and
 *   presentation
 * @output createContextMenu: attaches a context menu to any element. It opens
 *   on the element's context request (a held finger or pen, a right click,
 *   Shift+F10 or the context-menu key) or on open(at); destroy removes every
 *   listener and node it added
 * @position Public factory, framework-agnostic for its caller: ContextMenu's
 *   own menu (ContextMenuAttached) renders in an internal React root, so a
 *   page without React can attach one. useContextMenu is its React wrapper.
 *
 * The options mean what ContextMenu's props of the same names mean, and the
 * menu is ContextMenu's: its rows, keys, typeahead, sub-menus, presentations,
 * dismissal and focus return. It lives in a container outside the element,
 * at the end of the element's nearest dialog or popover, or of its shadow
 * root or the body, and the container carries the theme attributes of the
 * element's themed ancestor. So the element's own markup is untouched (a
 * `li` row keeps its list valid), an event inside the menu never passes
 * through the element, a modal dialog around the element leaves the menu
 * usable, opening it leaves an open popover around the element open, and a
 * shadow root's styles reach it.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/ContextMenu/createContextMenu.doc.mjs
 * - /packages/core/src/ContextMenu/useContextMenu.tsx
 */

import {use, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {
  DropdownMenuContext,
  DropdownMenuRootOpenContext,
  type DropdownMenuContextValue,
} from '../DropdownMenu/DropdownMenuContext';
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {LayerContext, type LayerContextValue} from '../Layer/LayerContext';
import {LayerDepthContext} from '../Layer/LayerDepthContext';
import {dataAttr} from '../naming';
import {sharedWeakMap} from '../utils/sharedRealm';
import {
  ContextMenuAttached,
  type ContextMenuAttachedHandle,
  type ContextMenuAttachment,
  type ContextMenuOption,
} from './ContextMenu';
import {
  attachContextMenuRequests,
  type ContextMenuForwarded,
} from './contextMenuRequests';

/** A point in client coordinates. */
export interface ContextMenuPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Renders a menu's content into `container` without React; returns a cleanup
 * that runs when the menu is destroyed.
 */
export type ContextMenuContentRenderer = (
  container: HTMLElement,
) => (() => void) | undefined;

interface ContextMenuSharedOptions {
  /** Names the menu for assistive technology. */
  label?: string;
  /**
   * While true, the element makes no context request and keeps the browser's
   * own menu.
   */
  isDisabled?: boolean;
  /** Called with true when the menu opens and false when it closes. */
  onOpenChange?: (isOpen: boolean) => void;
  /** Where the menu appears, as ContextMenu's `presentation`. */
  presentation?: AdaptivePresentation;
}

export type CreateContextMenuOptions = ContextMenuSharedOptions &
  (
    | {items: ReadonlyArray<ContextMenuOption>; render?: undefined}
    | {
        items?: undefined;
        /** Fills the menu's container with custom content in plain DOM. */
        render: ContextMenuContentRenderer;
      }
  );

/** What createContextMenu returns. */
export interface ContextMenuController {
  /** Opens the menu at `at`, client coordinates; at the element without it. */
  open(at?: ContextMenuPoint): void;
  /** Closes the menu. */
  close(): void;
  /** Closes the menu and removes every listener and node the factory added. */
  destroy(): void;
}

/**
 * @internal What a menu's rows read from inside the menu, published for the
 * `render` slot's container.
 */
export interface ContextMenuRowsContext {
  readonly menu: DropdownMenuContextValue | null;
  readonly isOpen: boolean | null;
  readonly layer: LayerContextValue | null;
  /** The layer depth inside the menu, which ranks a layer in its rows above it. */
  readonly depth: number;
}

interface RowsContextEntry {
  value: ContextMenuRowsContext;
  readonly listeners: Set<() => void>;
}

const rowsContexts = sharedWeakMap<HTMLElement, RowsContextEntry>(
  'context-menu/create-context-menu/rows-contexts',
  1,
);

function publishRowsContext(
  container: HTMLElement,
  value: ContextMenuRowsContext,
): void {
  const entry = rowsContexts.get(container);
  if (entry == null) {
    rowsContexts.set(container, {value, listeners: new Set()});
    return;
  }
  entry.value = value;
  for (const listener of entry.listeners) {
    listener();
  }
}

/** @internal The rows context published for `container`. */
export function readRowsContext(
  container: HTMLElement,
): ContextMenuRowsContext | null {
  return rowsContexts.get(container)?.value ?? null;
}

/** @internal Calls `listener` when `container`'s rows context changes. */
export function subscribeRowsContext(
  container: HTMLElement,
  listener: () => void,
): () => void {
  const entry = rowsContexts.get(container);
  entry?.listeners.add(listener);
  return () => {
    entry?.listeners.delete(listener);
  };
}

/** A React caller's way in (useContextMenu): later options and its providers. */
interface ContextMenuWrapperAccess {
  update(options: CreateContextMenuOptions): void;
  bridge(wrap: (menu: ReactNode) => ReactNode): void;
  destroyFromReact(): void;
}

const wrapperAccess = sharedWeakMap<
  ContextMenuController,
  ContextMenuWrapperAccess
>('context-menu/create-context-menu/wrapper-access', 1);

/**
 * @internal Passes later options to a menu createContextMenu attached
 * (useContextMenu's path): the factory takes its options once, and creating
 * it again would close a menu that is open.
 */
export function updateContextMenu(
  controller: ContextMenuController,
  options: CreateContextMenuOptions,
): void {
  wrapperAccess.get(controller)?.update(options);
}

/**
 * @internal Carries a React caller's Core providers (theme, layer, link,
 * i18n) into the menu's own root (useContextMenu's path).
 */
export function bridgeContextMenu(
  controller: ContextMenuController,
  wrap: (menu: ReactNode) => ReactNode,
): void {
  wrapperAccess.get(controller)?.bridge(wrap);
}

/**
 * @internal Destroys a menu from a React effect's cleanup (useContextMenu's
 * path). React cannot unmount a root while it commits another, so the menu's
 * own root renders nothing instead, an update React takes in its own time,
 * and is dropped with its node; the element's request and the menu's node go
 * at once, as `destroy` does.
 */
export function destroyContextMenuFromReact(
  controller: ContextMenuController,
): void {
  wrapperAccess.get(controller)?.destroyFromReact();
}

/** Whether two option objects hold the same values under the same keys. */
function isShallowEqual(a: object, b: object): boolean {
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  return (
    keys.length === Object.keys(bRecord).length &&
    keys.every(
      key =>
        Object.prototype.hasOwnProperty.call(bRecord, key) &&
        Object.is(aRecord[key], bRecord[key]),
    )
  );
}

const THEME_ATTRIBUTES = ['data-theme', dataAttr('theme')] as const;

/** The theme attributes of `element`'s nearest themed ancestor, onto `host`. */
function mirrorTheme(host: HTMLElement, element: Element): void {
  const themed = element.closest(
    THEME_ATTRIBUTES.map(attribute => `[${attribute}]`).join(','),
  );
  for (const attribute of THEME_ATTRIBUTES) {
    const value = themed?.getAttribute(attribute);
    if (value == null) {
      host.removeAttribute(attribute);
    } else {
      host.setAttribute(attribute, value);
    }
  }
}

/**
 * Where the menu's container belongs, in the element's own tree: the end of
 * its nearest dialog or popover (a modal dialog leaves everything outside it
 * inert, and a menu outside an open popover would dismiss it), or of its
 * shadow root (whose styles reach the menu there), or of the body.
 */
function containerParentFor(element: Element): ParentNode {
  const scope = element.parentElement?.closest('dialog, [popover]');
  if (scope != null) {
    return scope;
  }
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root : element.ownerDocument.body;
}

/**
 * The `render` option's content: its callback fills a container, and the
 * container's rows context is published for content a React caller portals
 * into it.
 */
function RenderedContent({render}: {render: ContextMenuContentRenderer}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menu = use(DropdownMenuContext);
  const isOpen = use(DropdownMenuRootOpenContext);
  const layer = use(LayerContext);
  const depth = use(LayerDepthContext);
  // Declared first, so the container's rows context is out before `render`
  // runs, and follows the menu after.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container != null) {
      publishRowsContext(container, {menu, isOpen, layer, depth});
    }
  }, [menu, isOpen, layer, depth]);
  // Syncs the container's content with the caller's `render`: it fills the
  // container, and its cleanup empties it.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    const cleanup = render(container);
    return () => {
      cleanup?.();
      container.replaceChildren();
      rowsContexts.delete(container);
    };
  }, [render]);
  return <div ref={containerRef} />;
}

/** One request to forward, numbered so a repeat still reaches the menu. */
interface Forwarded {
  readonly seq: number;
  readonly request: ContextMenuForwarded;
}

interface AttachedMenuProps {
  element: HTMLElement;
  options: CreateContextMenuOptions;
  forwarded: Forwarded | null;
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * ContextMenu's menu, attached to the element: the element's requests and
 * the controller's open() and close() reach it as forwarded requests.
 */
function AttachedMenu({
  element,
  options,
  forwarded,
  onOpenChange,
}: AttachedMenuProps) {
  const handleRef = useRef<ContextMenuAttachedHandle | null>(null);
  const [attachment] = useState<ContextMenuAttachment>(() => ({
    element,
    handleRef,
  }));
  // Synchronizes the menu with requests from outside React: each forwarded
  // request reaches the menu's handle once the menu has rendered; the menu
  // reports `onOpenChange` from its own show and hide.
  useLayoutEffect(() => {
    if (forwarded == null) {
      return;
    }
    if (forwarded.request === 'close') {
      handleRef.current?.close();
    } else {
      handleRef.current?.open(forwarded.request);
    }
  }, [forwarded]);
  const shared = {
    attachment,
    label: options.label,
    isDisabled: options.isDisabled,
    presentation: options.presentation,
    onOpenChange,
  };
  return options.items !== undefined ? (
    <ContextMenuAttached {...shared} items={[...options.items]} />
  ) : (
    <ContextMenuAttached
      {...shared}
      // `render` fills the menu's container once, as the menu is attached,
      // and its cleanup runs as it is destroyed: the rows stay in the closed
      // menu, as ContextMenu's do.
      menuContent={<RenderedContent render={options.render} />}
    />
  );
}

/**
 * Attaches a context menu to `element`. It opens on the element's context
 * request (a held finger or pen, a right click, Shift+F10 or the
 * context-menu key), or at `open(at)`'s point, and `destroy` removes every
 * listener and node it added.
 *
 * @example
 * ```
 * const menu = createContextMenu(row, {
 *   label: 'Actions for Inbox',
 *   items: [
 *     {label: 'Archive', onClick: archive},
 *     {label: 'Delete', onClick: remove},
 *   ],
 * });
 * // Later:
 * menu.destroy();
 * ```
 */
export function createContextMenu(
  element: HTMLElement,
  initialOptions: CreateContextMenuOptions,
): ContextMenuController {
  const doc = element.ownerDocument;
  let options = initialOptions;
  let wrap: ((menu: ReactNode) => ReactNode) | null = null;
  let forwarded: Forwarded | null = null;
  let seq = 0;
  let isOpen = false;
  let isDestroyed = false;

  // Not a child of the element: an event inside the menu never passes
  // through the element on its way to the document.
  const host = doc.createElement('div');
  // No box of its own: the menu is in the top layer, and an empty block
  // beside an inline element would break its line.
  host.style.display = 'contents';
  // Each open first moves the container to where the element is now: the
  // end of its dialog or popover, or of its shadow root or the body. A shown
  // menu stays put, since moving a node hides the popovers in it.
  const placeHost = () => {
    mirrorTheme(host, element);
    const parent = containerParentFor(element);
    if (parent.lastElementChild !== host) {
      parent.append(host);
    }
  };
  placeHost();
  const root = createRoot(host);

  const onOpenChange = (next: boolean) => {
    if (next === isOpen) {
      return;
    }
    isOpen = next;
    options.onOpenChange?.(next);
  };

  const render = () => {
    if (isDestroyed) {
      return;
    }
    const menu = (
      <AttachedMenu
        element={element}
        options={options}
        forwarded={forwarded}
        onOpenChange={onOpenChange}
      />
    );
    root.render(wrap != null ? wrap(menu) : menu);
  };

  const forward = (request: ContextMenuForwarded) => {
    if (isDestroyed) {
      return;
    }
    if (request !== 'close' && !isOpen) {
      placeHost();
    }
    seq += 1;
    forwarded = {seq, request};
    render();
  };

  const requests = attachContextMenuRequests(
    element,
    {isDisabled: options.isDisabled},
    request => {
      // A close comes from disabling the menu, inside a render's effects.
      if (request === 'close') {
        forward(request);
        return;
      }
      // An open comes from a listener on the element, and commits in the
      // request's own task, before the next input, as React commits a
      // request it dispatches itself: inside a shadow root `window.event` is
      // unset there, so React cannot tell it is a discrete input, and would
      // commit the open in a later task, where a press outside in between
      // would find no listener.
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the open must commit before the next input, inside a shadow root too
      flushSync(() => forward(request));
    },
  );
  render();

  const controller: ContextMenuController = {
    open(at) {
      forward({kind: 'open', point: at ?? null});
    },
    close() {
      forward('close');
    },
    destroy() {
      teardown(false);
    },
  };
  /** `destroy`; from React's commit, the root renders nothing instead. */
  function teardown(isInReact: boolean) {
    if (isDestroyed) {
      return;
    }
    const hadFocus = host.contains(doc.activeElement);
    isDestroyed = true;
    requests.destroy();
    if (isInReact) {
      root.render(null);
    } else {
      root.unmount();
    }
    host.remove();
    if (isOpen) {
      isOpen = false;
      options.onOpenChange?.(false);
    }
    if (hadFocus && element.isConnected) {
      element.focus();
    }
  }
  wrapperAccess.set(controller, {
    update(nextOptions) {
      // The same options render nothing new (a React caller passes them on
      // every render of its own).
      if (isShallowEqual(options, nextOptions)) {
        return;
      }
      options = nextOptions;
      requests.update({isDisabled: options.isDisabled});
      render();
    },
    bridge(nextWrap) {
      if (nextWrap === wrap) {
        return;
      }
      wrap = nextWrap;
      render();
    },
    destroyFromReact() {
      teardown(true);
    },
  });
  return controller;
}
