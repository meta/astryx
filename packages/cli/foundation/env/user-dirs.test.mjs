// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {absoluteDirSetting, userCacheDir, userConfigDir} from './user-dirs.mjs';

const home = path.join(path.sep, 'home', 'ada');

describe('per-user folders (spec AST-081 FR7)', () => {
  it('uses the platform defaults', () => {
    expect(userCacheDir({home, platform: 'linux', env: {}})).toBe(
      path.join(home, '.cache', 'astryx'),
    );
    expect(userConfigDir({home, platform: 'linux', env: {}})).toBe(
      path.join(home, '.config', 'astryx'),
    );
    expect(userCacheDir({home, platform: 'darwin', env: {}})).toBe(
      path.join(home, 'Library', 'Caches', 'astryx'),
    );
    expect(userConfigDir({home, platform: 'darwin', env: {}})).toBe(
      path.join(home, 'Library', 'Application Support', 'astryx'),
    );
  });

  it('uses an absolute XDG setting and ignores a relative or empty one', () => {
    const xdg = path.join(path.sep, 'xdg');
    expect(
      userCacheDir({home, platform: 'linux', env: {XDG_CACHE_HOME: xdg}}),
    ).toBe(path.join(xdg, 'astryx'));
    expect(
      userConfigDir({home, platform: 'linux', env: {XDG_CONFIG_HOME: xdg}}),
    ).toBe(path.join(xdg, 'astryx'));
    for (const value of ['rel-cache', './cache', '']) {
      expect(
        userCacheDir({home, platform: 'linux', env: {XDG_CACHE_HOME: value}}),
      ).toBe(path.join(home, '.cache', 'astryx'));
      expect(
        userConfigDir({home, platform: 'linux', env: {XDG_CONFIG_HOME: value}}),
      ).toBe(path.join(home, '.config', 'astryx'));
    }
  });

  it('uses LOCALAPPDATA and APPDATA on Windows only when absolute', () => {
    const winHome = 'C:\\Users\\ada';
    expect(
      userCacheDir({
        home: winHome,
        platform: 'win32',
        env: {LOCALAPPDATA: 'D:\\Local'},
      }),
    ).toBe('D:\\Local\\astryx\\Cache');
    expect(
      userConfigDir({
        home: winHome,
        platform: 'win32',
        env: {APPDATA: 'Roaming'},
      }),
    ).toBe('C:\\Users\\ada\\AppData\\Roaming\\astryx');
  });

  it('reads only absolute folder settings', () => {
    expect(absoluteDirSetting(undefined)).toBeNull();
    expect(absoluteDirSetting('')).toBeNull();
    expect(absoluteDirSetting('cache')).toBeNull();
    expect(absoluteDirSetting(path.resolve('cache'))).toBe(
      path.resolve('cache'),
    );
  });

  it("reads a setting with the host's own rules unless the platform is Windows", () => {
    // Unchanged on every real host: without a platform, or with the host's
    // own, a setting is absolute exactly when this host's path rules say so.
    for (const value of ['D:\\Local', '\\\\server\\share', '/abs', 'rel']) {
      const expected = path.isAbsolute(value) ? value : null;
      expect(absoluteDirSetting(value), value).toBe(expected);
      expect(absoluteDirSetting(value, process.platform), value).toBe(expected);
    }
    // Windows rules on any host.
    expect(absoluteDirSetting('D:\\Local', 'win32')).toBe('D:\\Local');
    expect(absoluteDirSetting('\\\\server\\share', 'win32')).toBe(
      '\\\\server\\share',
    );
    expect(absoluteDirSetting('Roaming', 'win32')).toBeNull();
    expect(absoluteDirSetting('', 'win32')).toBeNull();
  });
});
