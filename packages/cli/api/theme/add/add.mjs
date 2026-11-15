// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme add` — add built theme output to the app.
 *
 * Plain `theme add` and the compatibility `--import` spelling both record the
 * built theme in the generated app module. Source copying belongs only to
 * `theme eject`.
 */

import {addThemeToApp, listAvailableThemeState} from '../_adapter.mjs';
import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
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
  const result = await addThemeToApp(slug, options);
  if (!result.data.change.firstAdd) return result;
  // The providers installed packages name as the ones that wire their
  // themes: read from their manifests, never from the app's source (doctor
  // checks where the app renders one). The result says how Themes nest and
  // never says to replace a provider, which may do more than theming.
  const {themes} = await listAvailableThemeState(options.cwd ?? process.cwd());
  /** Each provider once, with the package that declares it. */
  const byProvider = new Map(
    themes.flatMap(theme =>
      theme.provider
        ? [
            [
              `${theme.provider.export} from ${theme.provider.from}`,
              `${theme.provider.export} (declared by ${theme.package ?? theme.provider.from})`,
            ],
          ]
        : [],
    ),
  );
  if (byProvider.size === 0) return result;
  const named = [...byProvider.values()].join(' or ');
  return {
    ...result,
    data: {
      ...result.data,
      appProvider: {
        wiredBy: [...byProvider.keys()],
        wire: `This app may already get its theme from ${named}. The outermost Theme sets the page's theme and mode, and an inner Theme covers only what it wraps; \`${getCliInvocation(options.cwd ?? process.cwd())} doctor\` checks where the app renders it.`,
      },
    },
  };
}
