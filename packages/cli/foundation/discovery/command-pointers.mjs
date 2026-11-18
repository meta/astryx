// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a command doc's pointers to other commands join its summary.
 * @input a CommandDoc's `summary` and `pointers`
 * @output pointerClause() and publishedSummary()
 * @position foundation/discovery — shared by help, which can leave a pointer
 *   out, and the docs and search, which read the whole summary
 */

/**
 * The clause a pointer adds after a command's summary.
 * @param {string} text
 * @returns {string}
 */
export function pointerClause(text) {
  return ` (${text})`;
}

/**
 * A command doc's summary as `astryx docs` and search read it: the summary,
 * then the clause of each pointer.
 * @param {{summary?: string, pointers?: {text: string}[]}} doc
 * @returns {string}
 */
export function publishedSummary(doc) {
  return (
    (doc.summary ?? '') +
    (doc.pointers ?? []).map(pointer => pointerClause(pointer.text)).join('')
  );
}
