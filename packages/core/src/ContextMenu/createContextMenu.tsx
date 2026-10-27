// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file createContextMenu.tsx
 * @input An element, its menu (`items`, or a `render` callback that fills it),
 *   and the menu's label, enablement, open-state callback and presentation
 * @output createContextMenu: attaches a context menu to any element. It opens
 *   on the element's context request (a held finger or pen, a right click,
 *   Shift+F10 or the context-menu key) or on open(at); destroy removes
 *   every listener and node it added (spec:AST-107 FR8)
 * @position Public factory, framework-agnostic for its caller: ContextMenu's
 *   own menu renders in an internal React root, so a page without React can
 *   attach one. ContextMenu is built on it (spec:AST-107 FR8, FR7), and
 *   useContextMenu is its React wrapper (FR6); both hand it a `render` for
 *   React rows (contextMenuRows.tsx) and pass later options through
 *   updateContextMenu
 *
 * Under the touch model the element's hold runs on UIKit's timeline, with
 * ContextMenu's press feedback and, on a block element, the lift.
 *
 * The `render` slot publishes what the menu's rows read from inside the menu
 * (its row context, its open state, its layer and layer depth) for its
 * container, so content a React caller portals into the container keeps the
 * rows' behavior: a choice closes the menu, a sub-menu drills in or flies out
 * above it, and a layer in the rows takes Escape before the menu.
 *
 * The options mean what ContextMenu's props of the same names mean. The menu
 * is ContextMenu's: its rows, keys, typeahead, sub-menus, dismissal and
 * focus return. It lives in a container that carries the theme attributes of
 * the element's themed ancestor, at the end of the element's nearest dialog
 * or popover, or of its shadow root or the body: the element's own markup is
 * untouched (a `li` row keeps its list valid), an event inside the menu never
 * passes through the element, a modal dialog around the element leaves the
 * menu usable, opening it leaves an open popover around the element open, and
 * a shadow root's styles reach it.
 */

import {use, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {
  DropdownMenuContext,
  DropdownMenuRootOpenContext,
  type DropdownMenuContextValue,
} from '../DropdownMenu/DropdownMenuContext';
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {LayerContext, type LayerContextValue} from '../Layer/LayerContext';
import {LayerDepthContext} from '../Layer/LayerDepthContext';
import {DEFAULT_COMPACT_DEFINITION} from '../theme/themeAdaptations';
import {readPresentation} from '../utils/presentation';
import {dataAttr} from '../naming';
import {flushSync} from 'react-dom';
import {
  attachContextMenuRequests,
  type ContextMenuForwarded,
  type ContextMenuRequestOptions,
} from './contextMenuRequests';
import {
  CONTEXT_MENU_TOUCH_HOLD,
  ContextMenuView,
  type ContextMenuViewExtras,
  type ContextMenuAttachedHandle,
  type ContextMenuAttachment,
  type ContextMenuAttachedRequest,
  type ContextMenuOption,
} from './ContextMenu';

/** A point in client coordinates. */
export interface ContextMenuPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Renders a menu's content into `container` without React; returns a cleanup
 * that runs when the menu closes.
 */
export type ContextMenuContentRenderer = (
  container: HTMLElement,
) => (() => void) | undefined;

interface ContextMenuSharedOptions {
  /** Names the menu for assistive technology. */
  label?: string;
  /** While true, the element makes no context request and keeps the browser's own menu. */
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

const rowsContexts = new WeakMap<HTMLElement, RowsContextEntry>();

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

/** @internal The rows context published for `container`, while its menu is open. */
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

/**
 * The React callers' way in (useContextMenu, ContextMenu): later options,
 * their Core providers, and ContextMenu's own surface.
 */
interface ContextMenuWrapperAccess {
  update(options: CreateContextMenuOptions): void;
  bridge(wrap: (menu: ReactNode) => ReactNode): void;
  view(view: ContextMenuViewExtras): void;
}

const wrapperAccess = new WeakMap<
  ContextMenuController,
  ContextMenuWrapperAccess
>();

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
 * @internal ContextMenu's own surface for the menu it is built on: the
 * menu's size, width and styles, the cursor anchor inside its trigger, and
 * whether the trigger is inline.
 */
export function viewContextMenu(
  controller: ContextMenuController,
  view: ContextMenuViewExtras,
): void {
  wrapperAccess.get(controller)?.view(view);
}

/**
 * @internal Carries a React caller's Core providers (theme, layer, link,
 * i18n) into the menu's own root (useContextMenu's and ContextMenu's path).
 */
export function bridgeContextMenu(
  controller: ContextMenuController,
  wrap: (menu: ReactNode) => ReactNode,
): void {
  wrapperAccess.get(controller)?.bridge(wrap);
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
  readonly request: ContextMenuAttachedRequest | 'close';
}

interface AttachedMenuProps {
  element: HTMLElement;
  options: CreateContextMenuOptions;
  view: ContextMenuViewExtras;
  forwarded: Forwarded | null;
  /** The menu's hold, for the element's context request. */
  configureRequests: ContextMenuAttachment['configureRequests'];
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * ContextMenu's menu, attached to the element: it attaches the element's
 * context request itself, and open() and close() reach it as forwarded
 * requests.
 */
function AttachedMenu({
  element,
  options,
  view,
  forwarded,
  configureRequests,
  onOpenChange,
}: AttachedMenuProps) {
  const handleRef = useRef<ContextMenuAttachedHandle | null>(null);
  const [attachment] = useState<ContextMenuAttachment>(() => ({
    element,
    handleRef,
    configureRequests,
  }));
  // A plain element that lays out inline keeps the menu at the finger, as
  // ContextMenu's inline trigger does: it has no preview to lift.
  const [isInlineElement] = useState(
    () =>
      element.ownerDocument.defaultView
        ?.getComputedStyle(element)
        .display.startsWith('inline') ?? false,
  );
  const handleOpenChange = onOpenChange;
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
    isInline: isInlineElement,
    ...view,
    attachment,
    label: options.label,
    isDisabled: options.isDisabled,
    presentation: options.presentation,
    onOpenChange: handleOpenChange,
  };
  return options.items !== undefined ? (
    <ContextMenuView {...shared} items={[...options.items]} />
  ) : (
    <ContextMenuView
      {...shared}
      // `render` fills the menu's container once, as the menu is attached,
      // and its cleanup runs as it is destroyed: the rows stay in the closed
      // menu, as ContextMenu's do.
      menuContent={
        options.render !== undefined ? (
          <RenderedContent render={options.render} />
        ) : null
      }
    />
  );
}

/**
 * Attaches a context menu to `element` (spec:AST-107 FR8). It opens on the
 * element's context request, at `open(at)`'s point when given, and `destroy`
 * removes every listener and node it added.
 */
export function createContextMenu(
  element: HTMLElement,
  initialOptions: CreateContextMenuOptions,
): ContextMenuController {
  const doc = element.ownerDocument;
  let options = initialOptions;
  let wrap: ((menu: ReactNode) => ReactNode) | null = null;
  let view: ContextMenuViewExtras = {};
  let forwarded: Forwarded | null = null;
  let seq = 0;
  let isOpen = false;
  let isDestroyed = false;

  // Not a child of the element: an event inside the menu never passes
  // through the element on its way to the document.
  const host = doc.createElement('div');
  host.setAttribute(dataAttr('context-menu-host'), '');
  // No box of its own: the menu is in the top layer, and an empty block
  // beside an inline trigger would break its line.
  host.style.display = 'contents';
  // Each open first moves the container to where the element is now: the
  // end of its dialog or popover, or of its shadow root or the body
  // (containerParentFor). A shown menu stays put, since moving a node hides
  // the popovers in it.
  const placeHost = () => {
    mirrorTheme(host, element);
    // ContextMenu gives its menu a place beside its trigger.
    const parent = view.containerParent ?? containerParentFor(element);
    if (parent.lastElementChild !== host) {
      parent.append(host);
    }
  };
  placeHost();
  const beforeOpen = () => {
    if (!isOpen && !isDestroyed) {
      placeHost();
    }
  };
  const root: Root = createRoot(host);

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
        view={view}
        forwarded={forwarded}
        configureRequests={configureRequests}
        onOpenChange={onOpenChange}
      />
    );
    root.render(wrap != null ? wrap(menu) : menu);
  };

  const forward = (request: ContextMenuForwarded) => {
    if (isDestroyed) {
      return;
    }
    if (request !== 'close') {
      beforeOpen();
    }
    seq += 1;
    forwarded = {seq, request};
    render();
  };

  // The element's context request, from the start, with UIKit's timeline
  // where the touch model applies; the menu refines its hold once it renders
  // (the theme's compact definition, and the haptic at the commit).
  let requestConfig: Pick<ContextMenuRequestOptions, 'hold' | 'onHold'> = {
    hold: readPresentation(options.presentation, {
      whenOmitted: 'touch',
      view: doc.defaultView,
      compact: DEFAULT_COMPACT_DEFINITION,
    }).touchModes
      ? CONTEXT_MENU_TOUCH_HOLD
      : undefined,
  };
  const requests = attachContextMenuRequests(
    element,
    {isDisabled: options.isDisabled, ...requestConfig},
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
  function configureRequests(
    config: Pick<ContextMenuRequestOptions, 'hold' | 'onHold'>,
  ) {
    requestConfig = config;
    requests.update({isDisabled: options.isDisabled, ...requestConfig});
  }
  render();

  const controller: ContextMenuController = {
    open(at) {
      forward({kind: 'open', point: at ?? null});
    },
    close() {
      forward('close');
    },
    destroy() {
      if (isDestroyed) {
        return;
      }
      const hadFocus = host.contains(doc.activeElement);
      isDestroyed = true;
      requests.destroy();
      root.unmount();
      host.remove();
      if (isOpen) {
        isOpen = false;
        options.onOpenChange?.(false);
      }
      if (hadFocus && element.isConnected) {
        element.focus();
      }
    },
  };
  wrapperAccess.set(controller, {
    update(nextOptions) {
      options = nextOptions;
      requests.update({isDisabled: options.isDisabled, ...requestConfig});
      render();
    },
    view(nextView) {
      view = nextView;
      if (!isOpen) {
        placeHost();
      }
      render();
    },
    bridge(nextWrap) {
      if (nextWrap === wrap) {
        return;
      }
      wrap = nextWrap;
      render();
    },
  });
  return controller;
}
