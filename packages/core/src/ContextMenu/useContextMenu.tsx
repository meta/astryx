// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useContextMenu.tsx
 * @input A ref to the element, and createContextMenu's options with a
 *   ReactNode `menuContent`
 * @output useContextMenu: the React wrapper over createContextMenu,
 *   returning `{open, close}` (spec:AST-107 FR8, FR6)
 * @position Public hook over the public factory: it hands createContextMenu
 *   a `render` that portals `menuContent` into the menu's container, carries
 *   the caller's Core providers (theme, layer, link, i18n) into the menu, and
 *   passes later options through updateContextMenu. `menuContent` stays
 *   rendered, in a root the hook owns, into a host the container adopts
 *   while the menu is open, so its first enabled row is there when focus
 *   starts; its rows read the menu's own row context, open state and layer
 */

import {
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {
  DropdownMenuContext,
  DropdownMenuRootOpenContext,
} from '../DropdownMenu/DropdownMenuContext';
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {InternationalizationContext} from '../i18n/InternationalizationContext';
import {LayerContext} from '../Layer/LayerContext';
import {LayerDepthContext} from '../Layer/LayerDepthContext';
import {LinkContext} from '../Link/LinkContext';
import {ThemeContext} from '../theme/useTheme';
import type {ContextMenuOption} from './ContextMenu';
import {
  bridgeContextMenu,
  destroyContextMenuFromReact,
  createContextMenu,
  readRowsContext,
  subscribeRowsContext,
  updateContextMenu,
  type ContextMenuController,
  type ContextMenuPoint,
  type ContextMenuRowsContext,
  type CreateContextMenuOptions,
} from './createContextMenu';

interface UseContextMenuSharedOptions {
  /** Names the menu for assistive technology. */
  label?: string;
  /** While true, the element makes no context request and keeps the browser's own menu. */
  isDisabled?: boolean;
  /** Called with true when the menu opens and false when it closes. */
  onOpenChange?: (isOpen: boolean) => void;
  /** Where the menu appears, as ContextMenu's `presentation`. */
  presentation?: AdaptivePresentation;
}

export type UseContextMenuOptions = UseContextMenuSharedOptions &
  (
    | {items: ReadonlyArray<ContextMenuOption>; menuContent?: undefined}
    | {items?: undefined; menuContent: ReactNode}
  );

/** What useContextMenu returns. */
export interface UseContextMenuResult {
  /** Opens the menu at `at`, client coordinates; at the element without it. */
  open: (at?: ContextMenuPoint) => void;
  /** Closes the menu. */
  close: () => void;
}

type Wrap = (menu: ReactNode) => ReactNode;

interface RowsStore {
  subscribe(listener: () => void): () => void;
  get(): ContextMenuRowsContext | null;
}

/** `menuContent`, kept rendered into a host the menu's container adopts. */
interface MenuContentPortal {
  /** The factory's `render`: the container adopts the host while open. */
  readonly render: (container: HTMLElement) => () => void;
  /** Renders `content` with the caller's providers. */
  draw(content: ReactNode, wrap: Wrap): void;
  unmount(): void;
}

function createMenuContentPortal(doc: Document): MenuContentPortal {
  const host = doc.createElement('div');
  const root = createRoot(doc.createElement('div'));
  let rows: ContextMenuRowsContext | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const store: RowsStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: () => rows,
  };
  return {
    render(container) {
      container.append(host);
      rows = readRowsContext(container);
      const stop = subscribeRowsContext(container, () => {
        rows = readRowsContext(container);
        notify();
      });
      notify();
      return () => {
        stop();
        rows = null;
        notify();
        host.remove();
      };
    },
    draw(content, wrap) {
      root.render(
        createPortal(wrap(<MenuRows store={store}>{content}</MenuRows>), host),
      );
    },
    unmount() {
      host.remove();
      // Called from an effect's cleanup: React cannot unmount a root while
      // it commits another, so this one renders nothing instead, an update
      // React takes in its own time, and is dropped with its node.
      root.render(null);
    },
  };
}

/**
 * Gives `menuContent`'s rows what they read from inside the menu while it is
 * open: its row context (a choice closes it, a sub-menu drills in), its open
 * state, its layer (a flyout stacks above it) and its layer depth (a layer in
 * the rows takes Escape before the menu).
 */
function MenuRows({store, children}: {store: RowsStore; children: ReactNode}) {
  const rows = useSyncExternalStore(store.subscribe, store.get, store.get);
  const callerLayer = use(LayerContext);
  const callerDepth = use(LayerDepthContext);
  return (
    <LayerContext value={rows?.layer ?? callerLayer}>
      <LayerDepthContext value={rows?.depth ?? callerDepth}>
        <DropdownMenuContext value={rows?.menu ?? null}>
          <DropdownMenuRootOpenContext value={rows?.isOpen ?? false}>
            {children}
          </DropdownMenuRootOpenContext>
        </DropdownMenuContext>
      </LayerDepthContext>
    </LayerContext>
  );
}

function factoryOptions(
  options: UseContextMenuOptions,
  onOpenChange: (isOpen: boolean) => void,
  portal: MenuContentPortal | null,
): CreateContextMenuOptions {
  const shared = {
    label: options.label,
    isDisabled: options.isDisabled,
    onOpenChange,
    presentation: options.presentation,
  };
  return portal != null
    ? {...shared, render: portal.render}
    : {...shared, items: options.items ?? []};
}

/** The element the hook's menu is attached to, and how to detach it. */
interface Attached {
  element: HTMLElement;
  hasContent: boolean;
  detach: () => void;
}

/**
 * Attaches a context menu to the element `ref` points at (spec:AST-107 FR8):
 * it opens on that element's context request, and unmounting removes it.
 * When the ref moves to another element, the menu moves with it.
 */
export function useContextMenu(
  ref: RefObject<HTMLElement | null>,
  options: UseContextMenuOptions,
): UseContextMenuResult {
  const theme = use(ThemeContext);
  const layer = use(LayerContext);
  const link = use(LinkContext);
  const intl = use(InternationalizationContext);
  const wrap = useCallback<Wrap>(
    menu => (
      <InternationalizationContext value={intl}>
        <ThemeContext value={theme}>
          <LayerContext value={layer}>
            <LinkContext value={link}>{menu}</LinkContext>
          </LayerContext>
        </ThemeContext>
      </InternationalizationContext>
    ),
    [intl, theme, layer, link],
  );
  const hasContent = options.menuContent !== undefined;
  const latestRef = useRef({options, wrap});
  const controllerRef = useRef<ContextMenuController | null>(null);
  const portalRef = useRef<MenuContentPortal | null>(null);
  const attachedRef = useRef<Attached | null>(null);
  const handleOpenChange = useCallback((isOpen: boolean) => {
    latestRef.current.options.onOpenChange?.(isOpen);
  }, []);

  useLayoutEffect(() => {
    latestRef.current = {options, wrap};
    const controller = controllerRef.current;
    if (controller == null) {
      return;
    }
    const portal = portalRef.current;
    updateContextMenu(
      controller,
      factoryOptions(options, handleOpenChange, portal),
    );
    bridgeContextMenu(controller, wrap);
    if (portal != null) {
      portal.draw(options.menuContent, wrap);
    }
  });

  // Every commit checks the element the ref points at now: a ref moved to
  // another element moves the menu with it.
  useEffect(() => {
    const element = ref.current;
    const attached = attachedRef.current;
    if (
      attached != null &&
      attached.element === element &&
      attached.hasContent === hasContent
    ) {
      return;
    }
    attached?.detach();
    attachedRef.current = null;
    if (element == null) {
      return;
    }
    const latest = latestRef.current;
    const portal = hasContent
      ? createMenuContentPortal(element.ownerDocument)
      : null;
    portal?.draw(latest.options.menuContent, latest.wrap);
    const controller = createContextMenu(
      element,
      factoryOptions(latest.options, handleOpenChange, portal),
    );
    bridgeContextMenu(controller, latest.wrap);
    controllerRef.current = controller;
    portalRef.current = portal;
    attachedRef.current = {
      element,
      hasContent,
      detach: () => {
        destroyContextMenuFromReact(controller);
        portal?.unmount();
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          portalRef.current = null;
        }
      },
    };
  });

  useEffect(
    () => () => {
      attachedRef.current?.detach();
      attachedRef.current = null;
    },
    [],
  );

  return useMemo(
    () => ({
      open: (at?: ContextMenuPoint) => controllerRef.current?.open(at),
      close: () => controllerRef.current?.close(),
    }),
    [],
  );
}
