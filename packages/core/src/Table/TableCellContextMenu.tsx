// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableCellContextMenu.tsx
 * @input React (lazy, Suspense), ContextMenuTrigger, tableContextActions
 * @output TableCellContextMenu, loadTableContextMenu
 * @position Renders a cell's `contextMenuActions` for TableCell and
 * TableHeaderCell. The menu code loads only for cells that have actions. The
 * cell renders the trigger, and the menu loads beside it, so the content
 * keeps its node, focus and state. An invocation before the load is held and
 * replayed when the menu arrives.
 */

import {lazy, Suspense, useRef, type ReactNode} from 'react';
import type {
  ContextMenuExternalTrigger,
  ContextMenuTriggerHandlers,
} from '../ContextMenu/ContextMenu';
import {ContextMenuTrigger} from '../ContextMenu/ContextMenuTrigger';
import type {StyleXStyles} from '../theme/types';
import type {TableContextActions} from './types';
import type {TableContextMenuForTrigger} from './tableContextMenu';
import {hasContextActions} from './tableContextActions';

interface TableContextMenuModule {
  TableContextMenuForTrigger: typeof TableContextMenuForTrigger;
}

let menuModule: Promise<TableContextMenuModule> | null = null;

/**
 * Starts loading the table context menu, once. The returned promise settles
 * when the module has loaded; a cell with actions renders its menu a tick
 * later.
 */
export async function loadTableContextMenu(): Promise<TableContextMenuModule> {
  menuModule ??= import('./tableContextMenu');
  return menuModule;
}

const LazyTableContextMenu = lazy(async () =>
  loadTableContextMenu().then(mod => ({
    default: mod.TableContextMenuForTrigger,
  })),
);

/** An invocation that arrived before the menu, replayed when it attaches. */
type HeldInvocation =
  | {kind: 'contextmenu'; event: React.MouseEvent<HTMLElement>}
  | {kind: 'touch'; event: React.TouchEvent<HTMLElement>};

/**
 * A cell's content, wrapped in a right-click context menu when `actions` can
 * open one. Without actions the content is returned untouched, so the native
 * browser menu passes through and the menu code never loads.
 */
export function TableCellContextMenu({
  children,
  actions,
  triggerXstyle,
}: {
  children: ReactNode;
  actions: TableContextActions | undefined;
  triggerXstyle?: StyleXStyles | StyleXStyles[];
}): ReactNode {
  const triggerRef = useRef<HTMLElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const handlersRef = useRef<ContextMenuTriggerHandlers | null>(null);
  const heldRef = useRef<HeldInvocation | null>(null);
  const triggerHandle = useRef<ContextMenuExternalTrigger>({
    triggerRef,
    anchorRef,
    onHandlersChange: handlers => {
      handlersRef.current = handlers;
      const held = heldRef.current;
      heldRef.current = null;
      if (handlers == null || held == null) {
        return;
      }
      // Replay after the commit that attached the menu, so its layer is
      // anchored before it opens.
      queueMicrotask(() => {
        if (handlersRef.current !== handlers) {
          return;
        }
        if (held.kind === 'contextmenu') {
          handlers.onContextMenu(held.event);
        } else {
          handlers.onTouchStart(held.event);
        }
      });
    },
  }).current;

  if (actions === undefined || !hasContextActions(actions)) {
    return children;
  }
  return (
    <>
      <ContextMenuTrigger
        ref={triggerRef}
        anchorRef={anchorRef}
        xstyle={triggerXstyle}
        onContextMenu={event => {
          const handlers = handlersRef.current;
          if (handlers != null) {
            handlers.onContextMenu(event);
            return;
          }
          // Hold the right-click, Shift+F10 or Menu key until the menu loads,
          // so the browser's own menu does not open in its place.
          event.preventDefault();
          heldRef.current = {kind: 'contextmenu', event};
          void loadTableContextMenu();
        }}
        onTouchStart={event => {
          const handlers = handlersRef.current;
          if (handlers != null) {
            handlers.onTouchStart(event);
            return;
          }
          heldRef.current =
            event.touches.length === 1 ? {kind: 'touch', event} : null;
          void loadTableContextMenu();
        }}
        onTouchMove={event => {
          if (handlersRef.current == null) {
            heldRef.current = null;
            return;
          }
          handlersRef.current.onTouchMove(event);
        }}
        onTouchEnd={event => {
          if (handlersRef.current == null) {
            heldRef.current = null;
            return;
          }
          handlersRef.current.onTouchEnd(event);
        }}
        onTouchCancel={event => {
          if (handlersRef.current == null) {
            heldRef.current = null;
            return;
          }
          handlersRef.current.onTouchCancel(event);
        }}>
        {children}
      </ContextMenuTrigger>
      <Suspense fallback={null}>
        <LazyTableContextMenu actions={actions} trigger={triggerHandle} />
      </Suspense>
    </>
  );
}
