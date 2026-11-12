// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme eject` leaf — selects an available theme and delegates
 * its atomic source-copy transaction to the app-theme adapter.
 */

import * as path from 'node:path';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {
  ejectThemeFiles,
  findTheme,
  forkNeeds,
  listAvailableThemes,
  themeCommandsFor,
} from '../_adapter.mjs';

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
    command: 'theme eject',
  });
  if (!match) {
    const available = await listAvailableThemes(cwd, {includeLocal: false});
    throw new AstryxError(
      `Unknown theme "${slug}"${packageName ? ` in package "${packageName}"` : ''}`,
      themeCommandsFor('theme eject', slug, available, cwd).map(
        ({theme, name}) => ({
          name,
          reason: theme.bundled
            ? 'bundled theme'
            : `provided by ${theme.package}`,
        }),
      ),
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  }

  const {outputDir, files} = ejectThemeFiles(match, {
    cwd,
    targetPath,
    overwrite,
    takenSlugs: await availableSlugs(cwd),
  });
  const {missingPackages, installCommand} = forkNeeds(outputDir, files, cwd);
  return {
    type: 'theme.eject',
    data: {
      slug: match.slug,
      displayName: match.displayName,
      maintained: match.maintained,
      package: match.package,
      outputDir,
      // A fork named after a new folder names its entry and export after it.
      ...(files[0] === match.files[0]
        ? {entry: match.entry, exportName: match.exportName}
        : {
            entry: files[0],
            exportName: path.basename(files[0]).replace(/\.[^.]+$/, ''),
          }),
      files,
      missingPackages,
      installCommand,
    },
  };
}

/**
 * The slugs of the themes the project can use, which a fork's new folder name
 * may not take. A project whose themes cannot be listed names none.
 * @param {string} cwd
 * @returns {Promise<Set<string>>}
 */
async function availableSlugs(cwd) {
  try {
    return new Set((await listAvailableThemes(cwd)).map(theme => theme.slug));
  } catch {
    return new Set();
  }
}
