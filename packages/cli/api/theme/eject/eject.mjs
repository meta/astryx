// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme eject` leaf — selects an available theme and delegates
 * its atomic source-copy transaction to the app-theme adapter.
 */

import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {ejectThemeFiles, findTheme, listAvailableThemes} from '../_adapter.mjs';

/**
 * Copy a bundled or installed theme's complete source inventory into the
 * consumer project as an independent local fork.
 *
 * @param {string} slug
 * @param {{targetPath?: string, overwrite?: boolean, cwd?: string, package?: string}} [options]
 * @returns {Promise<import('../theme.type.mjs').ThemeEjectResponse>}
 */
export async function themeEject(slug, options = {}) {
  const {
    targetPath,
    overwrite = false,
    cwd = process.cwd(),
    package: packageName,
  } = options;

  const match = await findTheme(slug, {
    cwd,
    package: packageName,
    includeLocal: false,
  });
  if (!match) {
    const available = await listAvailableThemes(cwd, {includeLocal: false});
    throw new AstryxError(
      `Unknown theme "${slug}"${packageName ? ` in package "${packageName}"` : ''}`,
      available.map(theme => ({
        name: `${theme.slug} --package ${theme.package}`,
        reason: theme.bundled
          ? 'bundled theme'
          : `provided by ${theme.package}`,
      })),
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  }

  const outputDir = ejectThemeFiles(match, {
    cwd,
    targetPath,
    overwrite,
  });
  return {
    type: 'theme.eject',
    data: {
      slug: match.slug,
      displayName: match.displayName,
      maintained: match.maintained,
      package: match.package,
      outputDir,
      entry: match.entry,
      exportName: match.exportName,
      files: match.files,
    },
  };
}
