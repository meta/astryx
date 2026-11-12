// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one-line summary of the icon definitions the bundled templates
 * use that an icon set leaves unmapped (AST-084 FR13, FR15).
 *
 * @input The unmapped meanings, most used first, and the set's name
 * @output One line, or null when the set maps them all
 * @position packages/cli/foundation/text — read by the icon authoring
 *   receipts and the `integration check` icon-set list
 */

/** How many unmapped meanings a one-line summary names before it stops. */
const SHOWN = 8;

/**
 * The one-line summary of the template meanings a set leaves unmapped, with
 * the command that maps one; null when it maps them all.
 * @param {Array<{definition: string, templates: number}>} unmapped most used
 *   first
 * @param {string} set the set's name
 * @param {string} [run] how to invoke the CLI (default `astryx`)
 * @returns {string | null}
 */
export function templateMeaningsLine(unmapped, set, run = 'astryx') {
  if (unmapped.length === 0) return null;
  const named = unmapped
    .slice(0, SHOWN)
    .map(
      (each, index) =>
        `${each.definition} (${each.templates}${index === 0 ? (each.templates === 1 ? ' template' : ' templates') : ''})`,
    )
    .join(', ');
  const more =
    unmapped.length > SHOWN ? `, and ${unmapped.length - SHOWN} more` : '';
  return `Templates use ${unmapped.length} ${unmapped.length === 1 ? 'meaning' : 'meanings'} this set does not map: ${named}${more}. Map one: \`${run} experimental icon map <definition> <icon id> --set ${set}\`.`;
}
