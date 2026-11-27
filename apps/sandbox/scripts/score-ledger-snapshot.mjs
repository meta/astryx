// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file score-ledger-snapshot.mjs
 * @description Reads parts of the wiki ledger into the snapshot that
 *   generate-score-ledger.mjs inlines as a typed literal.
 * @input A part of the parsed wiki ledger.
 * @output The part the snapshot can carry, and a record of each item it
 *   skipped: where the item was, the item, and why.
 * @position Imported by generate-score-ledger.mjs. score-ledger-snapshot.test.mjs
 *   pins each case.
 *
 *   The ledger is wiki content that no pull request reviews, so a bad row
 *   never stops the build. An item that repairs without loss is repaired. Any
 *   other item that the snapshot cannot carry is skipped, and the skip is
 *   recorded, so the generated file shows it, not only the build log.
 */

/**
 * @typedef {object} SkippedItem
 * @property {string} where the row and the place in it, e.g.
 *   `Button: sections.behavior.blocks[0]`
 * @property {string} item the item as the wiki wrote it, as JSON
 * @property {string} reason why the snapshot cannot carry it
 */

const isObject = value =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/**
 * Reads one section's `blocks`. They are BLOCK objects, the shape of the
 * entry's `blocks.open`. A bare id string is repaired from the entry's BLOCK
 * with that id. Any other item is skipped, and `skip` records it.
 * @param {unknown} blocks the section's `blocks`, as the wiki wrote them
 * @param {unknown[]} openBlocks the entry's `blocks.open`
 * @param {string} where the section's `blocks`, e.g.
 *   `Button: sections.behavior.blocks`
 * @param {(skipped: SkippedItem) => void} skip records a skipped item
 * @returns {object[]} the section's BLOCKs that the snapshot can carry
 */
export function readSectionBlocks(blocks, openBlocks, where, skip) {
  if (!Array.isArray(blocks)) {
    skip({where, item: JSON.stringify(blocks), reason: 'not a list of BLOCKs'});
    return [];
  }
  const read = [];
  blocks.forEach((item, index) => {
    const at = `${where}[${index}]`;
    if (typeof item === 'string') {
      const match = openBlocks.find(
        block => isObject(block) && block.id === item,
      );
      if (match) read.push(match);
      else {
        skip({
          where: at,
          item: JSON.stringify(item),
          reason: 'blocks.open lists no BLOCK with this id',
        });
      }
    } else if (isObject(item)) {
      read.push(item);
    } else {
      skip({where: at, item: JSON.stringify(item), reason: 'not a BLOCK'});
    }
  });
  return read;
}

/**
 * Keeps the ledger's rows that are objects. A row that is not one, such as
 * `null`, is skipped, and `skip` records it. So is a `components` that is not
 * a list, which leaves no rows.
 * @param {unknown} components the ledger's `components`
 * @param {(skipped: SkippedItem) => void} skip records a skipped item
 * @returns {object[]} the rows that the snapshot can read
 */
export function readRows(components, skip) {
  if (!Array.isArray(components)) {
    skip({
      where: 'components',
      item: String(JSON.stringify(components)),
      reason: 'not a list of rows',
    });
    return [];
  }
  return components.filter((row, index) => {
    if (isObject(row)) return true;
    skip({
      where: `components[${index}]`,
      item: JSON.stringify(row),
      reason: 'not a ledger row',
    });
    return false;
  });
}
