// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Direct API tests for `themeTemplate()` — the function behind
 * `astryx theme template` and `astryx init --features theme`.
 *
 * What matters here is that it never destroys work: the template lands once,
 * a second run leaves an edited copy alone, and a path that escapes the
 * project is refused.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {themeTemplate as publicThemeTemplate} from '../../index.mjs';
import {themeTemplate, THEME_TEMPLATE_DEFAULT_PATH} from './template.mjs';
import {isErrorCode} from '../../../foundation/response/error-codes.mjs';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-template-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('themeTemplate()', () => {
  it('is available through the public API entry point', () => {
    expect(publicThemeTemplate).toBe(themeTemplate);
  });

  it('writes the template and returns a theme.template receipt', () => {
    const res = themeTemplate({cwd: tmpDir});

    expect(res).toEqual({
      type: 'theme.template',
      data: {path: THEME_TEMPLATE_DEFAULT_PATH, written: true, reason: null},
    });
    const written = fs.readFileSync(path.join(tmpDir, THEME_TEMPLATE_DEFAULT_PATH), 'utf-8');
    expect(written).toMatch(/defineTheme/);
  });

  it('does not carry our copyright header into the consumer tree', () => {
    themeTemplate({cwd: tmpDir});
    const written = fs.readFileSync(path.join(tmpDir, THEME_TEMPLATE_DEFAULT_PATH), 'utf-8');
    expect(written).not.toMatch(/Copyright \(c\) Meta Platforms/);
    expect(written.startsWith('/**')).toBe(true);
  });

  it('leaves an existing file alone and says so', () => {
    const dest = path.join(tmpDir, THEME_TEMPLATE_DEFAULT_PATH);
    fs.writeFileSync(dest, '// mine\n');

    const res = themeTemplate({cwd: tmpDir});

    expect(res.data).toEqual({
      path: THEME_TEMPLATE_DEFAULT_PATH,
      written: false,
      reason: 'exists',
    });
    expect(fs.readFileSync(dest, 'utf-8')).toBe('// mine\n');
  });

  it('overwrites when asked', () => {
    const dest = path.join(tmpDir, THEME_TEMPLATE_DEFAULT_PATH);
    fs.writeFileSync(dest, '// mine\n');

    const res = themeTemplate({cwd: tmpDir, overwrite: true});

    expect(res.data.written).toBe(true);
    expect(fs.readFileSync(dest, 'utf-8')).toMatch(/defineTheme/);
  });

  it('honors a custom path and creates its directory', () => {
    const res = themeTemplate({cwd: tmpDir, targetPath: 'src/themes/starter.ts'});

    expect(res.data.path).toBe(path.join('src', 'themes', 'starter.ts'));
    expect(fs.existsSync(path.join(tmpDir, 'src/themes/starter.ts'))).toBe(true);
  });

  it('refuses a path that escapes the project', () => {
    expect(() => themeTemplate({cwd: tmpDir, targetPath: '../escaped.ts'})).toThrow(
      /theme template path/,
    );
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'escaped.ts'))).toBe(false);
  });

  it('reports a failed write with a registered error code', () => {
    fs.writeFileSync(path.join(tmpDir, 'blocker'), '');

    let error;
    try {
      themeTemplate({cwd: tmpDir, targetPath: 'blocker/theme.ts'});
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({code: 'ERR_WRITE_FAILED'});
    expect(isErrorCode(error.code)).toBe(true);
  });
});
