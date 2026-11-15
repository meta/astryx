// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme add` — add built theme output to the app.
 *
 * Plain `theme add` and the compatibility `--import` spelling both record the
 * built theme in the generated app module. Source copying belongs only to
 * `theme eject`.
 */

import {addThemeToApp, listAvailableThemeState} from '../_adapter.mjs';
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
  // themes: read from their manifests, never from the app's source. The
  // result says how Themes nest and never says to replace a provider, which
  // may do more than theming.
  const {themes} = await listAvailableThemeState(options.cwd ?? process.cwd());
  /** Each provider once, with the package that declares it. @type {Map<string, {provider: {export: string, from: string, themeProp?: string, modeProp?: string}, owner: string}>} */
  const byProvider = new Map();
  for (const theme of themes)
    if (theme.provider)
      byProvider.set(`${theme.provider.export}\0${theme.provider.from}`, {
        provider: {
          export: theme.provider.export,
          from: theme.provider.from,
          ...(theme.provider.themeProp
            ? {themeProp: theme.provider.themeProp}
            : {}),
          ...(theme.provider.themeProp && theme.provider.modeProp
            ? {modeProp: theme.provider.modeProp}
            : {}),
        },
        owner: String(theme.package ?? theme.provider.from),
      });
  if (byProvider.size === 0) return result;
  const found = [...byProvider.values()];
  // A provider that takes a theme object: the one change that passes the
  // added theme (as the wiring below imports it) to it. One that does not:
  // what replacing it would cost, and what a Theme inside it covers.
  const taking = found.find(x => x.provider.themeProp);
  // A theme with one color mode passes its mode too, as the Theme wiring
  // does, when the provider takes one; a theme with both modes passes none.
  const oneMode = result.data.themes.some(t => t.mode);
  const modeProp = oneMode ? taking?.provider.modeProp : undefined;
  const line = taking
    ? `<${taking.provider.export} ${taking.provider.themeProp}={themes[defaultThemeSlug]}${modeProp ? ` ${modeProp}={themeModes[defaultThemeSlug]}` : ''}>`
    : null;
  // With a provider that takes the theme, the wiring the text shows is that
  // provider's, in place of a Theme wrap: one instruction, not two.
  const sentences = found.map(({provider, owner}) => {
    const from = `This app may already get its theme from ${provider.export} (from ${provider.from}, declared by ${owner}).`;
    if (provider === taking?.provider)
      return `${from} Pass this theme to it in the app root:`;
    return provider.themeProp
      ? from
      : `${from} Replacing ${provider.export} applies this theme everywhere but also drops anything else it sets up; a Theme inside it themes only what it wraps.`;
  });
  return {
    ...result,
    data: {
      ...result.data,
      appProvider: {
        wiredBy: found.map(x => x.provider),
        wire: sentences.join(' '),
        ...(taking && line
          ? {themeProp: String(taking.provider.themeProp), line}
          : {}),
      },
    },
  };
}
