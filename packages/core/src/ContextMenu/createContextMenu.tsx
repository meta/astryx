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
 *   attach one, and the two share one implementation. useContextMenu is its
 *   React wrapper (spec:AST-107 FR6)
 *
 * The options mean what ContextMenu's props of the same names mean. The menu
 * is ContextMenu's: its rows, keys, typeahead, sub-menus, dismissal and
 * focus return. It lives in a container at the end of the body that carries
 * the theme attributes of the element's themed ancestor, so the element's
 * own markup is untouched (a `li` row keeps its list valid) and an event
 * inside the menu never passes through the element.
 */

import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {attachContextRequest} from '../gestures/contextRequest';
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {dataAttr} from '../naming';
import {
  ContextMenuView,
  type ContextMenuAttachedHandle,
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

/** @internal The React wrapper's extras: React content and a provider bridge. */
export interface ContextMenuInternals {
  reactContent?: ReactNode;
  wrap?: (menu: ReactNode) => ReactNode;
}

/** @internal createContextMenu with the hook's extras, and a way to update. */
export interface InternalContextMenuController extends ContextMenuController {
  update(
    options: CreateContextMenuOptions | ContextMenuSharedOptions,
    internals?: ContextMenuInternals,
  ): void;
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

/** The `render` option's content: its callback fills a container. */
function RenderedContent({render}: {render: ContextMenuContentRenderer}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    const cleanup = render(container);
    return () => {
      cleanup?.();
      container.replaceChildren();
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
  internals: ContextMenuInternals;
  forwarded: Forwarded | null;
  onOpenChange: (isOpen: boolean) => void;
}

/** ContextMenu's menu, attached to the element, driven by forwarded requests. */
function AttachedMenu({
  element,
  options,
  internals,
  forwarded,
  onOpenChange,
}: AttachedMenuProps) {
  const handleRef = useRef<ContextMenuAttachedHandle | null>(null);
  const [attachment] = useState(() => ({element, handleRef}));
  // `render` fills the menu each time it opens, and its cleanup
  // runs as it closes (the menu has no exit animation to keep it for).
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const handleOpenChange = (next: boolean) => {
    setIsMenuOpen(next);
    onOpenChange(next);
  };
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
    onOpenChange: handleOpenChange,
  };
  // The element is the trigger, so the menu has no children of its own.
  return options.items !== undefined ? (
    <ContextMenuView {...shared} items={[...options.items]}>
      {null}
    </ContextMenuView>
  ) : (
    <ContextMenuView
      {...shared}
      menuContent={
        internals.reactContent !== undefined ? (
          internals.reactContent
        ) : options.render !== undefined && isMenuOpen ? (
          <RenderedContent render={options.render} />
        ) : null
      }>
      {null}
    </ContextMenuView>
  );
}

/**
 * Attaches a context menu to `element` (spec:AST-107 FR8). It opens on the
 * element's context request, at `open(at)`'s point when given, and `destroy`
 * removes every listener and node it added.
 */
export function createContextMenu(
  element: HTMLElement,
  options: CreateContextMenuOptions,
): ContextMenuController {
  return createInternalContextMenu(element, options);
}

/** @internal createContextMenu, plus the React wrapper's update. */
export function createInternalContextMenu(
  element: HTMLElement,
  initialOptions: CreateContextMenuOptions | ContextMenuSharedOptions,
  initialInternals: ContextMenuInternals = {},
): InternalContextMenuController {
  const doc = element.ownerDocument;
  let options = initialOptions as CreateContextMenuOptions;
  let internals = initialInternals;
  let forwarded: Forwarded | null = null;
  let seq = 0;
  let isOpen = false;
  let isDestroyed = false;
  let detachRequest: () => void = () => {};

  // A child of the body, not of the element: an event inside the menu never
  // passes through the element on its way to the document.
  const host = doc.createElement('div');
  host.setAttribute(dataAttr('context-menu-host'), '');
  mirrorTheme(host, element);
  doc.body.append(host);
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
        internals={internals}
        forwarded={forwarded}
        onOpenChange={onOpenChange}
      />
    );
    root.render(internals.wrap != null ? internals.wrap(menu) : menu);
  };

  const forward = (request: Forwarded['request']) => {
    if (isDestroyed) {
      return;
    }
    seq += 1;
    forwarded = {seq, request};
    render();
  };

  const attach = () => {
    detachRequest();
    detachRequest = attachContextRequest(element, {
      onRequest: request => forward({kind: request.kind, point: request.point}),
      isEnabled: () => !isDestroyed && options.isDisabled !== true,
    });
  };
  attach();
  render();

  return {
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
      detachRequest();
      detachRequest = () => {};
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
    update(nextOptions, nextInternals = internals) {
      const wasDisabled = options.isDisabled === true;
      options = nextOptions as CreateContextMenuOptions;
      internals = nextInternals;
      if (wasDisabled !== (options.isDisabled === true) && !isDestroyed) {
        if (options.isDisabled === true) {
          forward('close');
        }
        // A disabled request registers nothing (spec:AST-094 FR24), so
        // enabling attaches it again.
        attach();
      }
      render();
    },
  };
}
