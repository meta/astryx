// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a command doc's pointers to other commands join its summary,
 * and how an option's pointer parts join its description.
 * @input a CommandDoc's `summary` and `pointers`, and an option's
 *   `description` and `pointers`
 * @output pointerClause(), publishedSummary(), and
 *   publishedOptionDescription()
 * @position foundation/discovery — shared by help, which can leave a pointer
 *   out, and the docs and search, which read the whole text
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

/**
 * An option doc's description as help, `astryx docs`, and search read it:
 * its own description, else the text it inherits from its API parameter,
 * then the text of every part.
 * @param {{description?: string, pointers?: Array<string | {text: string}>}} option
 * @param {string} [inherited] the text of the API parameter it maps to
 * @returns {string}
 */
export function publishedOptionDescription(option, inherited = '') {
  const lead = option.description ? option.description : inherited;
  return (
    lead +
    (option.pointers ?? [])
      .map(part => (typeof part === 'string' ? part : part.text))
      .join('')
  );
}
