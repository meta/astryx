// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The home and temp folders a node-project run gives its tests, so no
 *   test reads or writes the developer's real per-user folders.
 * @input The run's home and temp folders, and the environment to change.
 * @output `moveUserHome` moves them; `foldersOutside` names a per-user folder
 *   outside the run's home; `playwrightBrowsersFolder` and `gitGlobalConfig`
 *   name what keeps being read in place.
 * @position Used by vitest.global-setup.node.mjs (before the workers fork)
 *   and vitest.setup.node.mjs (refuses a worker outside the run's home).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {inside} from '../foundation/agent-docs/folder-scope.mjs';
import {
  absoluteDirSetting,
  userCacheDir,
  userConfigDir,
} from '../foundation/env/user-dirs.mjs';

/** Package-manager folder settings that would point outside the run's home. */
export const PACKAGE_MANAGER_HOMES = [
  'PNPM_HOME',
  'COREPACK_HOME',
  'BUN_INSTALL',
  'YARN_GLOBAL_FOLDER',
  'npm_config_global_folder',
];

/** The environment variable that names the run's home folder to workers. */
export const TEST_HOME_ENV = 'ASTRYX_TEST_HOME';

/**
 * Where Playwright keeps its browsers for this environment: its own setting,
 * else the platform's cache folder.
 * @param {Record<string, string | undefined>} [env]
 * @param {NodeJS.Platform} [platform]
 * @param {string} [home]
 */
export function playwrightBrowsersFolder(
  env = process.env,
  platform = process.platform,
  home = os.homedir(),
) {
  if (env.PLAYWRIGHT_BROWSERS_PATH) return env.PLAYWRIGHT_BROWSERS_PATH;
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    return path.win32.join(
      local && path.win32.isAbsolute(local)
        ? local
        : path.win32.join(home, 'AppData', 'Local'),
      'ms-playwright',
    );
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Caches', 'ms-playwright');
  }
  return path.join(
    absoluteDirSetting(env.XDG_CACHE_HOME) ?? path.join(home, '.cache'),
    'ms-playwright',
  );
}

/**
 * The developer's global git configuration file, when there is one: git's
 * own setting, else `~/.gitconfig`, else the XDG one. Git keeps reading it in
 * place after the home folder moves, so a checkout that needs its settings
 * (`safe.directory`) still reads as a git work tree.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [home]
 * @returns {string | null}
 */
export function gitGlobalConfig(env = process.env, home = os.homedir()) {
  if (env.GIT_CONFIG_GLOBAL) return env.GIT_CONFIG_GLOBAL;
  const xdg = path.join(
    absoluteDirSetting(env.XDG_CONFIG_HOME) ?? path.join(home, '.config'),
    'git',
    'config',
  );
  return (
    [path.join(home, '.gitconfig'), xdg].find(file => fs.existsSync(file)) ??
    null
  );
}

/**
 * Points the home folder and every per-user folder setting at `home`, and
 * the temp folder at `tmp`, and unsets the package managers' own folder
 * settings, so npm, pnpm, corepack, Yarn and Bun use folders in `home`.
 * Playwright still finds the browsers the developer installed, and git its
 * global configuration: each reads them in place and writes nothing there.
 * The temp folder must not hold `home`: the CLI takes no scratch copy in a
 * temp folder that holds the home folder.
 * @param {string} home
 * @param {string} tmp
 * @param {Record<string, string | undefined>} [env]
 */
export function moveUserHome(home, tmp, env = process.env) {
  // The home folder these settings are read from is the one being moved.
  const realHome =
    (process.platform === 'win32' ? env.USERPROFILE : env.HOME) || os.homedir();
  env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsersFolder(
    env,
    process.platform,
    realHome,
  );
  const gitConfig = gitGlobalConfig(env, realHome);
  if (gitConfig) env.GIT_CONFIG_GLOBAL = gitConfig;
  env[TEST_HOME_ENV] = home;
  env.HOME = home;
  env.USERPROFILE = home;
  env.XDG_CONFIG_HOME = path.join(home, '.config');
  env.XDG_CACHE_HOME = path.join(home, '.cache');
  env.XDG_DATA_HOME = path.join(home, '.local', 'share');
  env.XDG_STATE_HOME = path.join(home, '.local', 'state');
  env.APPDATA = path.join(home, 'AppData', 'Roaming');
  env.LOCALAPPDATA = path.join(home, 'AppData', 'Local');
  env.npm_config_cache = path.join(home, '.npm');
  // Package managers that keep folders of their own outside the settings
  // above. Unset, each takes its default under the moved home folder.
  for (const key of PACKAGE_MANAGER_HOMES) delete env[key];
  env.TMPDIR = tmp;
  env.TEMP = tmp;
  env.TMP = tmp;
}

/**
 * The per-user folders this process reads that are not inside `home`: the
 * home folder itself, and the CLI's cache and configuration folders.
 * @param {string} home
 * @returns {string[]}
 */
export function foldersOutside(home) {
  return [os.homedir(), userCacheDir(), userConfigDir()].filter(
    folder => !inside(folder, home),
  );
}
