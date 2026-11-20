// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/itemKey.stylex.ts
 * @input A List row's own `itemKey`
 * @output itemKeyProps, which marks a row with its key, and itemKeyOf, which
 *   reads it
 * @position Owner module of the private item-key attribute: the only file
 *   that writes its name. ListItem marks its row, and List/listLayoutUpdates.ts
 *   matches rows by it across renders. No package entry exports it.
 */

const ITEM_KEY = 'data-astryx-item-key';

/** Spread on a List row: marks it with its `itemKey`, when it has one. */
export function itemKeyProps(
  itemKey: string | number | undefined,
): Readonly<Record<string, string>> {
  return itemKey == null ? {} : {[ITEM_KEY]: String(itemKey)};
}

/** The item key a row carries, or null for a row without one. */
export function itemKeyOf(row: Element): string | null {
  return row.getAttribute(ITEM_KEY);
}
