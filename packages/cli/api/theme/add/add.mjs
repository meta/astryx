// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme add` — add built theme output to the app.
 *
 * Plain `theme add` and the compatibility `--import` spelling both record the
 * built theme in the generated app module; forking a theme's source belongs to
 * `theme eject`. Given a shared theme instead of a slug (a folder, a `.tgz`
 * archive, or an https URL to one), which has no package to import from, it
 * copies that theme into the app's local themes root with eject's copy first,
 * installs the Astryx packages it imports that the app lacks, and records it
 * as the default; `theme remove` undoes it (the theme adapter does both).
 */

import {
  addSharedThemeToApp,
  addThemeToApp,
  isSharedThemeSource,
} from '../_adapter.mjs';
import {withAppProvider} from '../_app-provider.mjs';
import {AstryxError} from '../../error.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';

/**
 * Add one available built theme to the generated app module. `import` remains
 * accepted as a no-op so callers that opted in before the cleanup keep working.
 *
 * Removed source-copy options are rejected before discovery or any write, and
 * name the function that now owns them. `overwrite: false` remains an accepted
 * compatibility no-op.
 *
 * A `slug` that is a path, a `.tgz`, or an https URL adds that shared theme
 * (the adapter's addSharedThemeToApp).
 *
 * @param {string} slug
 * @param {{targetPath?: string, overwrite?: boolean, import?: boolean, cwd?: string, package?: string}} [options]
 * @returns {Promise<import('../theme.type.mjs').ThemeAppResponse>}
 */
export async function themeAdd(slug, options = {}) {
  const legacy = /** @type {{targetPath?: unknown, overwrite?: unknown}} */ (
    options
  );
  if (legacy.targetPath != null || legacy.overwrite === true) {
    throw new AstryxError(
      '`themeAdd` no longer copies source or accepts targetPath or overwrite: true. ' +
        'Call `themeEject` with the same slug and copy options to fork source.',
      undefined,
      ERROR_CODES.ERR_THEME_INVALID,
    );
  }
  const cwd = options.cwd ?? process.cwd();
  if (isSharedThemeSource(slug))
    return withAppProvider(
      await addSharedThemeToApp(slug, {...options, cwd}),
      cwd,
    );
  const result = await addThemeToApp(slug, options);
  return withAppProvider(result, cwd);
}
