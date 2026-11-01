// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {describe, expect, it} from 'vitest';
import {readCoreIconNames} from '../../scripts/core-docs.mjs';
import {
  BUILTIN_ICON_NAMES,
  NATIVE_ICON_DEFAULTS,
  SF_SYMBOL_NAMES,
} from './defaults.js';

// The system's SF Symbols catalog; present on macOS only.
const SF_CATALOG =
  '/System/Library/CoreServices/CoreGlyphs.bundle/Contents/Resources/name_availability.plist';

describe('native icon defaults', () => {
  it("lists exactly core's built-in icon names", () => {
    expect([...BUILTIN_ICON_NAMES].sort()).toEqual(readCoreIconNames().sort());
  });

  it('gives every built-in name a default on each supported platform', () => {
    for (const platform of ['ios', 'macos', 'android'] as const) {
      expect(Object.keys(NATIVE_ICON_DEFAULTS[platform]).sort()).toEqual(
        [...BUILTIN_ICON_NAMES].sort(),
      );
    }
  });

  it.skipIf(!fs.existsSync(SF_CATALOG))(
    'names only SF Symbols the system has',
    () => {
      const json = execFileSync(
        'plutil',
        ['-convert', 'json', '-o', '-', SF_CATALOG],
        {
          maxBuffer: 16 * 1024 * 1024,
        },
      ).toString();
      const symbols = JSON.parse(json).symbols as Record<string, string>;
      const missing = Object.values(SF_SYMBOL_NAMES).filter(
        name => symbols[name] == null,
      );
      expect(missing).toEqual([]);
    },
  );
});
