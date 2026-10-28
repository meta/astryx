// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file contextMenuRows.tsx
 * @input createContextMenu's rows context for its `render` slot, and a React
 *   caller's Core providers
 * @output createMenuRowsSlot, MenuRows and useCoreBridge: how a React caller
 *   hands createContextMenu a `render` for its rows (spec:AST-107 FR8). The
 *   rows stay rendered into a host the menu's container adopts while the menu
 *   is open, so its first enabled row is there when focus starts, and they
 *   read the menu's own row context, open state and layer
 * @position Internal to ContextMenu: shared by useContextMenu (its rows in a
 *   root it owns) and ContextMenu (its rows portaled from its own tree, so a
 *   caller's own contexts reach them)
 */

import {use, useCallback, useSyncExternalStore, type ReactNode} from 'react';
import {
  DropdownMenuContext,
  DropdownMenuRootOpenContext,
} from '../DropdownMenu/DropdownMenuContext';
import {InternationalizationContext} from '../i18n/InternationalizationContext';
import {LayerContext} from '../Layer/LayerContext';
import {LayerDepthContext} from '../Layer/LayerDepthContext';
import {LinkContext} from '../Link/LinkContext';
import {ThemeContext} from '../theme/useTheme';
import {
  readRowsContext,
  subscribeRowsContext,
  type ContextMenuRowsContext,
} from './createContextMenu';

/** Wraps a menu in a React caller's Core providers. */
export type CoreBridge = (menu: ReactNode) => ReactNode;

/** Where a React caller's rows render, and the `render` that shows them. */
export interface MenuRowsSlot {
  /** Where the rows render; the menu's container adopts it while open. */
  readonly host: HTMLElement;
  /** createContextMenu's `render`: the container adopts the host. */
  readonly render: (container: HTMLElement) => () => void;
  /** Calls `listener` when the menu's rows context changes. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The menu's rows context while it is open; null while it is closed. */
  readonly getRowsContext: () => ContextMenuRowsContext | null;
}

export function createMenuRowsSlot(doc: Document): MenuRowsSlot {
  const host = doc.createElement('div');
  let rows: ContextMenuRowsContext | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    host,
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
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getRowsContext: () => rows,
  };
}

/**
 * Gives a React caller's rows what they read from inside the menu while it
 * is open: its row context (a choice closes it, a sub-menu drills in), its
 * open state, its layer (a flyout stacks above it) and its layer depth (a
 * layer in the rows takes Escape before the menu).
 */
export function MenuRows({
  slot,
  children,
}: {
  slot: MenuRowsSlot;
  children: ReactNode;
}) {
  const rows = useSyncExternalStore(
    slot.subscribe,
    slot.getRowsContext,
    slot.getRowsContext,
  );
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

/** The caller's Core providers (theme, layer, link, i18n), for the menu. */
export function useCoreBridge(): CoreBridge {
  const theme = use(ThemeContext);
  const layer = use(LayerContext);
  const link = use(LinkContext);
  const intl = use(InternationalizationContext);
  return useCallback<CoreBridge>(
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
}
