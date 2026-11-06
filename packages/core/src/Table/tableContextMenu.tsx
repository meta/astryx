// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file tableContextMenu.tsx
 * @input React, ContextMenu, Icon, types
 * @output TableContextMenuForTrigger
 * @position The lazily loaded context menu for a body or header cell with
 * `contextMenuActions`
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/TableCellContextMenu.tsx (lazy loader)
 * - /packages/core/src/Table/tableContextActions.ts (resolveContextActions)
 * - /packages/core/src/Table/types.ts (TableContextAction)
 */

import {useState, type ReactNode} from 'react';
import {
  ContextMenuForTrigger,
  type ContextMenuExternalTrigger,
  type ContextMenuOption,
} from '../ContextMenu/ContextMenu';
import {Icon} from '../Icon/Icon';
import type {TableContextAction, TableContextActions} from './types';

// Re-exported for existing imports. Cells and plugins import
// tableContextActions, which does not load the menu.
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
 * The menu for a cell whose trigger TableCellContextMenu renders. It loads
 * lazily beside the cell's content, so the content never remounts. A getter
 * resolves when the menu opens and stays memoized until the menu closes. So
 * a plugin that passes a getter builds no action array on each cell render.
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
