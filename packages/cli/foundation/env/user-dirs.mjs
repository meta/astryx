// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The per-user folders the CLI may write to (spec AST-081 FR7): the
 * platform's cache directory and its configuration directory, each with an
 * `astryx` folder of its own.
 *
 * A folder named by the platform's own environment setting
 * (`XDG_CACHE_HOME`, `XDG_CONFIG_HOME`, `LOCALAPPDATA`, `APPDATA`) is used
 * only when it is an absolute path; a relative one is ignored, as the XDG
 * base directory rules require, so a run never writes into the folder it
 * starts in.
 *
 * @input  the home folder, the platform, and those standard settings
 * @output absolute folder paths
 * @position packages/cli/foundation/env
 */

import * as os from 'node:os';
import * as path from 'node:path';

/**
 * An environment folder setting, when it names an absolute path.
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function absoluteDirSetting(value) {
  return typeof value === 'string' && value !== '' && path.isAbsolute(value)
    ? value
    : null;
}

/**
 * @typedef {object} UserDirOptions
 * @property {string} [home] the home folder; defaults to the current user's
 * @property {NodeJS.Platform} [platform]
 * @property {Record<string, string | undefined>} [env]
 */

/**
 * The CLI's per-user cache folder: `~/.cache/astryx` on Linux (or
 * `$XDG_CACHE_HOME/astryx`), `~/Library/Caches/astryx` on macOS, and
 * `%LOCALAPPDATA%\astryx\Cache` on Windows.
 * @param {UserDirOptions} [options]
 * @returns {string}
 */
export function userCacheDir({
  home = os.homedir(),
  platform = process.platform,
  env = process.env,
} = {}) {
  const join = platform === 'win32' ? path.win32.join : path.join;
  if (platform === 'win32') {
    return join(
      absoluteDirSetting(env.LOCALAPPDATA) ?? join(home, 'AppData', 'Local'),
      'astryx',
      'Cache',
    );
  }
  if (platform === 'darwin') return join(home, 'Library', 'Caches', 'astryx');
  return join(
    absoluteDirSetting(env.XDG_CACHE_HOME) ?? join(home, '.cache'),
    'astryx',
  );
}

/**
 * The CLI's per-user configuration folder: `~/.config/astryx` on Linux (or
 * `$XDG_CONFIG_HOME/astryx`), `~/Library/Application Support/astryx` on
 * macOS, and `%APPDATA%\astryx` on Windows.
 * @param {UserDirOptions} [options]
 * @returns {string}
 */
export function userConfigDir({
  home = os.homedir(),
  platform = process.platform,
  env = process.env,
} = {}) {
  const join = platform === 'win32' ? path.win32.join : path.join;
  if (platform === 'win32') {
    return join(
      absoluteDirSetting(env.APPDATA) ?? join(home, 'AppData', 'Roaming'),
      'astryx',
    );
  }
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'astryx');
  }
  return join(
    absoluteDirSetting(env.XDG_CONFIG_HOME) ?? join(home, '.config'),
    'astryx',
  );
}
