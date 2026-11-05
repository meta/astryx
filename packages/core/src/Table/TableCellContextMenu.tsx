// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableCellContextMenu.tsx
 * @input React (lazy, Suspense), StyleX, tableContextActions
 * @output TableCellContextMenu, loadTableContextMenu
 * @position Renders a cell's `contextMenuActions` for TableCell and
 * TableHeaderCell. The context menu (ContextMenu, its menu hooks and touch
 * sheet) loads only for cells that have actions, so a table without context
 * menus doesn't ship it.
 *
 * The cell renders the right-click trigger and its cursor anchor itself, and
 * the menu loads as their sibling, so the cell's content keeps its DOM node,
 * focus and state when the menu arrives. Until then right-click shows the
 * browser's menu.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/tableContextMenu.tsx (TableContextMenuForTrigger)
 * - /packages/core/src/ContextMenu/ContextMenu.tsx (trigger and cursorAnchor
 *   styles, ContextMenuForTrigger)
 */

import {lazy, Suspense, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  ContextMenuExternalTrigger,
  ContextMenuTriggerHandlers,
} from '../ContextMenu/ContextMenu';
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

// Mirror ContextMenu's trigger wrapper and cursor anchor, which the menu
// positions itself against once it loads.
const styles = stylex.create({
  trigger: {
    position: 'relative',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  },
  cursorAnchor: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
  },
});

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
  const triggerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const handlersRef = useRef<ContextMenuTriggerHandlers | null>(null);
  const triggerHandle = useRef<ContextMenuExternalTrigger>({
    triggerRef,
    anchorRef,
    onHandlersChange: handlers => {
      handlersRef.current = handlers;
    },
  }).current;

  if (actions === undefined || !hasContextActions(actions)) {
    return children;
  }
  const extra = triggerXstyle
    ? Array.isArray(triggerXstyle)
      ? triggerXstyle
      : [triggerXstyle]
    : [];
  return (
    <>
      <div
        ref={triggerRef}
        onContextMenu={event => handlersRef.current?.onContextMenu(event)}
        onTouchStart={event => handlersRef.current?.onTouchStart(event)}
        onTouchMove={event => handlersRef.current?.onTouchMove(event)}
        onTouchEnd={event => handlersRef.current?.onTouchEnd(event)}
        onTouchCancel={event => handlersRef.current?.onTouchCancel(event)}
        {...stylex.props(styles.trigger, ...extra)}>
        {children}
        <span
          ref={anchorRef}
          aria-hidden="true"
          {...stylex.props(styles.cursorAnchor)}
        />
      </div>
      <Suspense fallback={null}>
        <LazyTableContextMenu actions={actions} trigger={triggerHandle} />
      </Suspense>
    </>
  );
}
