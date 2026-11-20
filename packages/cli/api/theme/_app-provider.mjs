// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The provider an installed integration names as the one that wires
 * its themes (its manifest's `themeProvider`), on the receipts that show the
 * app's wiring: the first add, a later add that first lists `themeModes`,
 * and the removal of the last theme.
 *
 * Read from the packages' manifests, never from the app's source. The
 * receipt says how Themes nest and never says to replace a provider, which
 * may do more than theming. Shared by `theme add` and `theme remove`, and
 * by `build`'s playbook, which names the same wiring.
 */

import {listAvailableThemeState} from './_adapter.mjs';

/**
 * @typedef {{export: string, from: string, themeProp?: string, modeProp?: string}} AppProvider
 */

/**
 * The providers installed packages name as the one that wires their themes,
 * each once with the package that declares it, and the one the app passes
 * its theme to: the only provider, when it takes a theme object
 * (`themeProp`). With two, which one wires the app is not ours to say.
 * @param {string} cwd
 * @returns {Promise<{found: Array<{provider: AppProvider, owner: string}>, taking: {provider: AppProvider, owner: string} | null}>}
 */
export async function appProviders(cwd) {
  const {themes} = await listAvailableThemeState(cwd);
  return providersOf(themes);
}

/**
 * The provider's opening tag with the generated module's theme passed, and
 * its mode when the provider takes one and the theme has one color mode.
 * @param {AppProvider} provider a provider that takes the theme (`themeProp`)
 * @param {boolean} oneMode the theme has one color mode
 * @returns {string}
 */
export function providerLine(provider, oneMode) {
  const mode =
    oneMode && provider.modeProp
      ? ` ${provider.modeProp}={themeModes[defaultThemeSlug]}`
      : '';
  return `<${provider.export} ${provider.themeProp}={themes[defaultThemeSlug]}${mode}>`;
}

/**
 * `appProviders` for themes already listed.
 * @param {Awaited<ReturnType<typeof listAvailableThemeState>>['themes']} themes
 * @returns {{found: Array<{provider: AppProvider, owner: string}>, taking: {provider: AppProvider, owner: string} | null}}
 */
export function providersOf(themes) {
  /** @type {Map<string, {provider: AppProvider, owner: string}>} */
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
  const found = [...byProvider.values()];
  const taking =
    found.length === 1 && found[0].provider.themeProp ? found[0] : null;
  return {found, taking};
}

/**
 * A receipt with its `appProvider` (theme.type.mjs ThemeAppResponse) when an
 * installed package names a provider and the receipt shows wiring.
 *
 * - First add: `wire` says the app may already get its theme from each such
 *   provider, naming the props it takes. With exactly one provider, and that
 *   one taking a theme object (`themeProp`), the wiring is that provider
 *   with the theme passed (`line`, its opening JSX); otherwise each
 *   provider's trade-off follows and the `Theme` wiring stays.
 * - A later add that first lists `themeModes`, or the removal of the last
 *   theme: only when that one provider takes the theme, `wire` and `line`
 *   say how its wiring changes.
 *
 * @template {import('./theme.type.mjs').ThemeAppResponse} R
 * @param {R} result
 * @param {string} cwd
 * @returns {Promise<R>}
 */
export async function withAppProvider(result, cwd) {
  const change = result.data.change;
  const kind = change.moduleRemoved
    ? 'removed'
    : change.firstAdd
      ? 'first'
      : change.wireModes
        ? 'modes'
        : null;
  if (!kind) return result;
  const {found, taking} = await appProviders(cwd);
  if (!found.length || (kind !== 'first' && !taking)) return result;
  // The wiring passes a mode when the provider takes one and an added theme
  // has one color mode, as the Theme wiring does.
  const oneMode =
    kind === 'modes'
      ? true
      : kind === 'removed'
        ? Boolean(change.themeModes)
        : result.data.themes.some(t => t.mode);
  const modeProp = oneMode ? taking?.provider.modeProp : undefined;
  const line = taking ? providerLine(taking.provider, oneMode) : null;
  const name = taking?.provider.export;
  let wire;
  if (kind === 'first') {
    const named = found
      .map(({provider, owner}) => {
        const props = [
          ...(provider.themeProp ? [`the theme as ${provider.themeProp}`] : []),
          ...(provider.modeProp ? [`the mode as ${provider.modeProp}`] : []),
        ];
        return `${provider.export} (from ${provider.from}, declared by ${owner}${props.length ? `; it takes ${props.join(' and ')}` : ''})`;
      })
      .join(' or ');
    const from = `This app may already get its theme from ${named}.`;
    wire = taking
      ? `${from} Pass this theme to it in the app root:`
      : [
          from,
          ...found.map(
            ({provider}) =>
              `Replacing ${provider.export} applies this theme everywhere but also drops anything else it sets up; a Theme inside it themes only what it wraps.`,
          ),
        ].join(' ');
  } else if (kind === 'modes')
    wire = modeProp
      ? `The theme module now exports themeModes. Pass the selected theme's mode to ${name} in the app root:`
      : `The theme module now exports themeModes; ${name} (from ${taking?.provider.from}), which takes the theme as ${taking?.provider.themeProp}, takes no mode, so its wiring stays as it is.`;
  else
    wire = `Undo its wiring in the app root: delete the module's import and the props that pass its theme to ${name}, and keep ${name}, which may set up more than the theme:`;
  return {
    ...result,
    data: {
      ...result.data,
      appProvider: {
        // A later receipt names only the props its wiring uses: a mode prop
        // the line does not pass is left out, as the text leaves it out.
        wiredBy: found.map(({provider}) =>
          kind === 'first' || modeProp
            ? provider
            : {
                export: provider.export,
                from: provider.from,
                ...(provider.themeProp ? {themeProp: provider.themeProp} : {}),
              },
        ),
        wire,
        ...(taking && line && (kind !== 'modes' || modeProp)
          ? {themeProp: String(taking.provider.themeProp), line}
          : {}),
      },
    },
  };
}
