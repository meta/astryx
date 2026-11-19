// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What to do when no icon set is installed (AST-084 FR6, FR7): the
 * sentence the finder and `--list` print, and the two commands it names.
 *
 * @input How to print a command
 * @output The sentence, and the commands for suggestions
 * @position packages/cli/foundation/text — read by the `icon` leaves and the
 *   `experimental icon` command
 */

/** The command that makes an installed set the project's main set. */
export const ICON_USE_COMMAND = 'astryx experimental icon use <set>';

/** The command that reads the guide to making an icon set. */
export const ICON_SET_GUIDE_COMMAND = 'astryx docs cli/experimental/icon-sets';

/**
 * What to do when no icon set is installed: no command can list sets to
 * install, since discover reads icon sets only in a project that already
 * chose one. The commands are bare in JSON, and in text each is printed as
 * the CLI picks it (`format`).
 * @param {(command: string) => string} [format]
 * @returns {string}
 */
export function noIconSetNext(format = command => command) {
  return `Install a package that ships an icon set, then run \`${format(ICON_USE_COMMAND)}\`. To make your own set, read \`${format(ICON_SET_GUIDE_COMMAND)}\`.`;
}
