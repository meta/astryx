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
  listAvailableThemes,
  listThemes,
  listUnmigratedThemeCopies,
  readThemeListState,
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
      .filter(
        theme => options.package == null || theme.package === options.package,
      )
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
  const themes = await listAvailableThemes(cwd);
  const data = themes
    .filter(
      theme => options.package == null || theme.package === options.package,
    )
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
  return {
    type: 'theme.list',
    data,
    ...(unmigratedCopies.length > 0 ? {meta: {unmigratedCopies}} : {}),
  };
}
