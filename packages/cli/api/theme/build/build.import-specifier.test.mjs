// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the import specifier a theme build prints.
 * @input Output folders relative to the cwd, as path.relative gives them on
 *   this platform.
 * @output The specifier in the install snippet: `./` plus a `/`-joined path,
 *   with a leading `src/` dropped.
 * @position Unit coverage for importSpecifier in build.mjs.
 */

import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {importSpecifier} from './build.mjs';

describe('importSpecifier', () => {
  it('joins a platform path with `/`, whatever the separator', () => {
    expect(importSpecifier(path.join('src', 'themes', 'ocean'), 'ocean')).toBe(
      './themes/ocean/ocean',
    );
    expect(importSpecifier(path.join('themes', 'ocean'), 'ocean')).toBe(
      './themes/ocean/ocean',
    );
  });

  it('drops a leading src/ and keeps the rest', () => {
    expect(importSpecifier('src/themes/gothic', 'gothic')).toBe(
      './themes/gothic/gothic',
    );
    expect(importSpecifier('src', 'ocean')).toBe('./ocean');
    expect(importSpecifier('.', 'ocean')).toBe('./ocean');
  });
});
