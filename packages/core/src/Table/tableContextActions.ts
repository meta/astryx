// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableContextActions.ts
 * @input types
 * @output resolveContextActions, hasContextActions
 * @position Dependency-free helpers for `contextMenuActions`, shared by cells
 * and plugins, so reading actions never pulls in the context menu itself.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/tableContextMenu.tsx (re-exports resolveContextActions)
 * - /packages/core/src/Table/types.ts (TableContextAction)
 */

import type {TableContextAction, TableContextActions} from './types';

/**
 * Resolve a `contextMenuActions` value (array or getter) to a plain array.
 * Use this when composing actions from a prior plugin's render props so you
 * don't have to branch on the array-vs-getter form:
 *
 * ```
 * contextMenuActions: () => [
 *   ...resolveContextActions(props.contextMenuActions),
 *   ...myActions,
 * ]
 * ```
 */
export function resolveContextActions(
  actions: TableContextActions | undefined,
): TableContextAction[] {
  if (typeof actions === 'function') {
    return actions();
  }
  return actions ?? [];
}

/**
 * Whether a `contextMenuActions` value can open a menu: a getter (resolved on
 * open) or a non-empty array.
 */
export function hasContextActions(
  actions: TableContextActions | undefined,
): boolean {
  return (
    typeof actions === 'function' ||
    (Array.isArray(actions) && actions.length > 0)
  );
}
