// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text form of an icon set's definition coverage: how many of
 * Astryx's icon definitions its map covers, of how many.
 *
 * @input `{mapped, total}`, as astryxDefinitionCoverage returns it
 * @output one short string, `38/52`
 * @position packages/cli/foundation/text — printed by `experimental icon
 *   --list` and by discover's icon set page
 */

/**
 * The text form of a definition coverage, as every text view prints it.
 * @param {{mapped: number, total: number}} coverage
 * @returns {string}
 */
export function definitionCoverageText(coverage) {
  return `${coverage.mapped}/${coverage.total}`;
}
