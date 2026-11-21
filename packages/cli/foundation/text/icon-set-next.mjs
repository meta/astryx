// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What to do when no icon set is installed (AST-084 FR6, FR7): the
 * sentence the finder and `--list` print, and the commands it names.
 *
 * @input Whether discover lists an icon set the project could add
 * @output The sentence, and the commands for suggestions
 * @position packages/cli/foundation/text — read by the `icon` leaves
 */

/** The discover query that finds the icon packs a project could add. */
export const ICON_PACK_QUERY = 'icon set';

/** The discover search the sentence names. */
const ICON_PACK_FIND_COMMAND = `astryx discover "${ICON_PACK_QUERY}"`;

/** The command that makes an installed set the project's main set. */
export const ICON_USE_COMMAND = 'astryx experimental icon use <set>';

/** The command that reads the guide to making an icon set. */
export const ICON_SET_GUIDE_COMMAND = 'astryx docs cli/experimental/icon-sets';

/**
 * What to do when no icon set is installed: install a package that ships a
 * set and use it, or make a set. Where the discover search for
 * {@link ICON_PACK_QUERY} lists an icon set the project could add, the
 * sentence first names that search. The commands are bare; text prints them as the CLI picks them.
 * @param {boolean} discoverListsPacks that search lists an icon set to add
 * @returns {string}
 */
export function noIconSetNext(discoverListsPacks) {
  const use = `then run \`${ICON_USE_COMMAND}\`. To make your own set, read \`${ICON_SET_GUIDE_COMMAND}\`.`;
  return discoverListsPacks
    ? `Find an icon pack with \`${ICON_PACK_FIND_COMMAND}\`, install it, ${use}`
    : `Install a package that ships an icon set, ${use}`;
}
