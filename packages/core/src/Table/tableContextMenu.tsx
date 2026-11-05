// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tableContextMenu.tsx
 * @input React, ContextMenu, Icon, types
 * @output wrapInTableContextMenu helper, TableContextMenuForTrigger component
 * @position Renders the aggregated `contextMenuActions` for a header cell / row
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/BaseTable.tsx (call sites)
 * - /packages/core/src/Table/TableCellContextMenu.tsx (lazy loader)
 * - /packages/core/src/Table/tableContextActions.ts (resolveContextActions)
 * - /packages/core/src/Table/types.ts (TableContextAction)
 */

import {useState, type ReactNode} from 'react';
import {ContextMenu, type ContextMenuOption} from '../ContextMenu';
import {
  ContextMenuForTrigger,
  type ContextMenuExternalTrigger,
} from '../ContextMenu/ContextMenu';
import {Icon} from '../Icon';
import type {StyleXStyles} from '../theme/types';
import type {TableContextAction, TableContextActions} from './types';

// Kept here for existing imports; the dependency-free copy lives in
// tableContextActions so cells and plugins can read actions without the menu.
export {resolveContextActions} from './tableContextActions';

/**
 * Convert the flat action list into ContextMenu options, inserting a divider
 * between groups (first-seen group order). Ungrouped actions form a trailing
 * group. A `checked` action shows a trailing check icon.
 */
function toContextMenuOptions(
  actions: TableContextAction[],
): ContextMenuOption[] {
  const order: string[] = [];
  const buckets = new Map<string, TableContextAction[]>();
  for (const action of actions) {
    const key = action.group ?? '__ungrouped__';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(action);
  }

  const options: ContextMenuOption[] = [];
  order.forEach((key, groupIndex) => {
    if (groupIndex > 0) {
      options.push({type: 'divider'});
    }
    for (const action of buckets.get(key) ?? []) {
      options.push({
        label: typeof action.label === 'string' ? action.label : action.id,
        // A checked action (e.g. the active sort direction) shows a checkmark;
        // otherwise the action's own icon. ContextMenu's data form takes a
        // single leading icon, so checked state replaces the icon.
        icon: action.checked ? (
          <Icon icon="check" size="xsm" aria-hidden />
        ) : (
          action.icon
        ),
        isDisabled: action.disabled,
        onClick: action.onSelect,
        variant: action.variant,
      });
    }
  });
  return options;
}

/**
 * Wrap a table element (a header cell's content or a row) in a right-click
 * context menu rendering the aggregated `actions`. When no plugin contributes
 * actions the element is returned untouched so the native browser menu passes
 * through.
 */
/**
 * A context menu whose actions are resolved lazily — only when the user opens
 * the menu (right-click). Deferring the work means plugins that pass a getter
 * don't build an action array (with its closures) for every cell on every
 * render; it's computed on demand and memoized until the menu closes.
 */
function LazyTableContextMenu({
  element,
  getActions,
  triggerXstyle,
}: {
  element: ReactNode;
  getActions: () => TableContextAction[];
  triggerXstyle?: StyleXStyles | StyleXStyles[];
}): ReactNode {
  const [options, setOptions] = useState<ContextMenuOption[] | null>(null);
  return (
    <ContextMenu
      items={options ?? []}
      triggerXstyle={triggerXstyle}
      onOpenChange={open => {
        // Resolve actions when opening; clear on close so state derived later
        // (e.g. current sort direction) is always fresh next open.
        setOptions(open ? toContextMenuOptions(getActions()) : null);
      }}>
      {element}
    </ContextMenu>
  );
}

/**
 * Wrap a table element (a header cell's content or a body cell) in a right-click
 * context menu rendering the aggregated `actions`. Accepts a static array or a
 * getter (resolved lazily on open). When there are no actions the element is
 * returned untouched so the native browser menu passes through.
 *
 * `triggerXstyle` styles the right-click target wrapper. Cells pass a fill +
 * padding style so the entire cell (padding included) opens the menu.
 */
export function wrapInTableContextMenu(
  element: ReactNode,
  actions: TableContextActions | undefined,
  triggerXstyle?: StyleXStyles | StyleXStyles[],
): ReactNode {
  // Getter form → resolve lazily on open.
  if (typeof actions === 'function') {
    return (
      <LazyTableContextMenu
        element={element}
        getActions={actions}
        triggerXstyle={triggerXstyle}
      />
    );
  }
  if (!actions || actions.length === 0) {
    return element;
  }
  // item (it looked like "ascending" was always selected). Focus moves only
  // when the user arrow-keys into the menu.
  return (
    <ContextMenu
      items={toContextMenuOptions(actions)}
      triggerXstyle={triggerXstyle}>
      {element}
    </ContextMenu>
  );
}

/**
 * The menu for a cell whose trigger TableCellContextMenu renders. It loads
 * lazily beside the cell's content, so the content never remounts. A getter
 * is resolved when the menu opens, as in `wrapInTableContextMenu`.
 */
export function TableContextMenuForTrigger({
  actions,
  trigger,
}: {
  actions: TableContextActions;
  trigger: ContextMenuExternalTrigger;
}): ReactNode {
  const [lazyOptions, setLazyOptions] = useState<ContextMenuOption[] | null>(
    null,
  );
  if (typeof actions === 'function') {
    return (
      <ContextMenuForTrigger
        trigger={trigger}
        items={lazyOptions ?? []}
        onOpenChange={open => {
          setLazyOptions(open ? toContextMenuOptions(actions()) : null);
        }}
      />
    );
  }
  return (
    <ContextMenuForTrigger
      trigger={trigger}
      items={toContextMenuOptions(actions)}
    />
  );
}
