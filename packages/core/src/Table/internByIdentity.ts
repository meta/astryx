// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file internByIdentity.ts
 * @input An array of objects.
 * @output Exports internByIdentity, which returns one array for each list of
 *   objects, compared by identity and in order.
 * @position Private to Table: keeps the resolved columns and the merged
 *   plugins the same array while their items are the same.
 */

interface Node {
  // The next object on a path, mapped to the node after it.
  readonly next: WeakMap<object, Node>;
  // The array returned for the path that ends here.
  array?: ReadonlyArray<object>;
}

// Each path from the root is one list of objects. A node is held weakly by
// the object before it, so a path goes away with its objects. A render React
// discards can only add a path. Every array on one path holds the same
// objects, so no later render reads a different list.
const root: Node = {next: new WeakMap()};

/**
 * Returns the first array seen that holds the same objects as `items`, in the
 * same order. The first time, it stores and returns a copy, so an edit to the
 * caller's array later reaches no other caller.
 */
export function internByIdentity<T extends object>(items: T[]): T[] {
  let node = root;
  for (const item of items) {
    let child = node.next.get(item);
    if (child === undefined) {
      child = {next: new WeakMap()};
      node.next.set(item, child);
    }
    node = child;
  }
  node.array ??= items.slice();
  return node.array as T[];
}
