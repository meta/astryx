// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as path from 'node:path';

/**
 * @file Theme-list projections. `themeList()` retains its historical synchronous
 * bundled-only API contract. `themeListCopySources()` preserves the released
 * `theme add --list` fields. `themeListAvailable()` is the project-aware command
 * seam that adds installed integration themes, local themes, and app state.
 */

import {getCliInvocation} from '../../../foundation/env/package-manager.mjs';
import {
  listAvailableThemeState,
  listAvailableThemes,
  listThemes,
  listUnmigratedThemeCopies,
  readThemeListState,
  themeInPackage,
  themeRecordOwner,
} from '../_adapter.mjs';

/** @param {string} root @param {string} file */
function pathForProject(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * List themes bundled with this CLI build.
 * @returns {import('../theme.type.mjs').ThemeListResponse}
 */
export function themeList() {
  return {
    type: 'theme.list',
    data: listThemes().map(theme => ({
      slug: theme.slug,
      displayName: theme.displayName,
      description: theme.description,
      maintained: theme.maintained,
    })),
  };
}

/**
 * Preserve the released `theme add --list` projection. It lists bundled and
 * package source themes only, without local themes or generated app state.
 * @param {{cwd?: string, package?: string}} [options]
 * @returns {Promise<import('../theme.type.mjs').ThemeListResponse>}
 */
export async function themeListCopySources(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const themes = await listAvailableThemes(cwd, {includeLocal: false});
  return {
    type: 'theme.list',
    data: themes
      .filter(theme => themeInPackage(theme, options.package))
      .map(theme => ({
        slug: theme.slug,
        displayName: theme.displayName,
        description: theme.description,
        maintained: theme.maintained,
        package: theme.package,
      })),
  };
}

/**
 * List bundled and installed integration themes available to this project.
 * @param {{cwd?: string, package?: string}} [options]
 * @returns {Promise<import('../theme.type.mjs').ThemeListResponse>}
 */
export async function themeListAvailable(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const state = readThemeListState(cwd);
  const {themes, skipped} = await listAvailableThemeState(cwd);
  // Where the app renders the provider a package wires its themes with, as
  // doctor's wiring scan finds it: run only when a theme names one.
  // Doctor's scan is loaded only then: the theme commands start without
  // doctor's modules and their dependencies.
  const wiring = themes.some(theme => theme.provider)
    ? await (
        await import('../../doctor/theme-checks.mjs')
      ).themeImportWiring(cwd)
    : {wired: [], unconfirmed: []};
  const byProvider = wiring.wired.filter(entry => entry.wiredBy);
  const renderedIn = (/** @type {{slug: string, package: string}} */ theme) =>
    byProvider.find(
      entry =>
        entry.slug === theme.slug &&
        entry.owner === themeRecordOwner(/** @type {any} */ (theme)),
    )?.file;
  const data = themes
    .filter(theme => themeInPackage(theme, options.package))
    .map(theme => {
      const added = state.themes[theme.slug] === themeRecordOwner(theme);
      return {
        slug: theme.slug,
        displayName: theme.displayName,
        description: theme.description,
        maintained: theme.maintained,
        package: theme.package,
        added,
        default: added && state.defaultSlug === theme.slug,
        source: theme.source,
        // The package wires its themes with its own provider component, not
        // with Astryx's Theme: the app renders that component.
        ...(theme.provider
          ? {
              wiredBy: {
                export: theme.provider.export,
                from: theme.provider.from,
              },
            }
          : {}),
        // The app file that renders that provider for this theme.
        ...(theme.provider && renderedIn(theme)
          ? {renderedIn: renderedIn(theme)}
          : {}),
      };
    });
  const upgradeCommand = `${getCliInvocation(state.projectDir)} upgrade --from 0.6.4 --path . --apply`;
  const unmigratedCopies = (
    options.package == null ? listUnmigratedThemeCopies(state.projectDir) : []
  ).map(copy => ({
    slug: copy.slug,
    path: pathForProject(state.projectDir, copy.sourceDir),
    source: pathForProject(
      state.projectDir,
      path.join(copy.sourceDir, copy.entry),
    ),
    descriptor: pathForProject(
      state.projectDir,
      path.join(copy.sourceDir, copy.descriptor),
    ),
    upgradeCommand,
  }));
  const skippedThemes = options.package == null ? skipped : [];
  // Where the app renders a provider and the theme it wires, or the themes
  // it may be when doctor cannot tell which.
  const appTheme = [
    ...byProvider.map(entry => ({
      wiredBy: /** @type {string} */ (entry.wiredBy),
      file: entry.file,
      themes: [entry.slug],
    })),
    ...wiring.unconfirmed.flatMap(entry =>
      entry.wiredBy
        ? [
            {
              wiredBy: entry.wiredBy,
              file: entry.file,
              themes: entry.themes ?? [],
            },
          ]
        : [],
    ),
  ];
  return {
    type: 'theme.list',
    data,
    ...(unmigratedCopies.length > 0 ||
    skippedThemes.length > 0 ||
    appTheme.length > 0
      ? {
          meta: {
            unmigratedCopies,
            ...(skippedThemes.length > 0 ? {skippedThemes} : {}),
            ...(appTheme.length > 0 ? {appTheme} : {}),
          },
        }
      : {}),
  };
}
