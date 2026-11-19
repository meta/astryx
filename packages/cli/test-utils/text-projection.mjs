// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Assert that a command's text view shows every field its JSON carries
 *   (spec AST-017 FR13).
 */

import {expect} from 'vitest';

/**
 * Assert the text shows every field of each JSON item: the record whose
 * `keys` lines match the item holds each of its non-empty fields, with the
 * value the formatter renders (arrays comma-joined, `severity` as its status
 * token). An empty value has no line, as the formatter skips it.
 * @param {string} output the command's text output
 * @param {Record<string, unknown>[]} items
 * @param {string[]} keys fields that pick out each item's record
 */
export function expectRecordsCarry(output, items, keys) {
  const blocks = output.split(/\n{2,}/).map(block =>
    Object.fromEntries(
      block.split('\n').flatMap(line => {
        const match = /^([A-Za-z]+):\s+(.*)$/.exec(line);
        return match ? [[match[1], match[2]]] : [];
      }),
    ),
  );
  /** @param {string} field @param {unknown} value */
  const shown = (field, value) =>
    field === 'severity'
      ? {warning: '[warn]', error: '[fail]'}[String(value)]
      : Array.isArray(value)
        ? value.join(', ')
        : String(value);
  for (const item of items) {
    const block = blocks.find(b =>
      keys.every(key => b[key] === shown(key, item[key])),
    );
    expect(block, JSON.stringify(item)).toBeDefined();
    for (const [field, value] of Object.entries(item)) {
      if (value == null || value === '') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      expect([field, block?.[field]]).toEqual([field, shown(field, value)]);
    }
  }
}
