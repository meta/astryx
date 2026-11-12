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
    const written = fs.readFileSync(
      path.join(tmpDir, THEME_TEMPLATE_DEFAULT_PATH),
      'utf-8',
    );
    expect(written).toMatch(/defineTheme/);
  });

  it('does not carry our copyright header into the consumer tree', () => {
    themeTemplate({cwd: tmpDir});
    const written = fs.readFileSync(
      path.join(tmpDir, THEME_TEMPLATE_DEFAULT_PATH),
      'utf-8',
    );
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
      overwritable: true,
      alternative: null,
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
    const res = themeTemplate({
      cwd: tmpDir,
      targetPath: 'src/themes/starter.ts',
    });

    expect(res.data.path).toBe(path.join('src', 'themes', 'starter.ts'));
    expect(fs.existsSync(path.join(tmpDir, 'src/themes/starter.ts'))).toBe(
      true,
    );
  });

  it('refuses a path that escapes the project', () => {
    expect(() =>
      themeTemplate({cwd: tmpDir, targetPath: '../escaped.ts'}),
    ).toThrow(/theme template path/);
    expect(fs.existsSync(path.join(path.dirname(tmpDir), 'escaped.ts'))).toBe(
      false,
    );
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

  describe('never replaces a file that is not a theme source', () => {
    it.each([
      ['package.json', 'ERR_INVALID_ARGUMENT'],
      ['styles/x.css', 'ERR_INVALID_ARGUMENT'],
      ['src/app/layout.tsx', 'ERR_FILE_EXISTS'],
    ])(
      'refuses %s with --overwrite and leaves it as it was',
      (target, code) => {
        const dest = path.join(tmpDir, target);
        fs.mkdirSync(path.dirname(dest), {recursive: true});
        fs.writeFileSync(dest, 'mine\n');

        expect(() =>
          themeTemplate({cwd: tmpDir, targetPath: target, overwrite: true}),
        ).toThrow(expect.objectContaining({code}));
        expect(fs.readFileSync(dest, 'utf-8')).toBe('mine\n');
      },
    );

    it('replaces an earlier copy of the template at any .ts path', () => {
      const dest = path.join(tmpDir, 'starter.ts');
      themeTemplate({cwd: tmpDir, targetPath: 'starter.ts'});
      fs.appendFileSync(dest, '// edited\n');

      const res = themeTemplate({
        cwd: tmpDir,
        targetPath: 'starter.ts',
        overwrite: true,
      });

      expect(res.data.written).toBe(true);
      expect(fs.readFileSync(dest, 'utf-8')).not.toMatch(/edited/);
    });

    it('refuses a theme source in a folder the theme editor made', () => {
      const dir = path.join(tmpDir, 'themes', 'my-theme');
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(path.join(dir, 'my-theme.settings.json'), '{}\n');
      const source = "export {myTheme} from './my-theme.settings';\n";
      fs.writeFileSync(path.join(dir, 'my-theme.theme.ts'), source);

      let error;
      try {
        themeTemplate({
          cwd: tmpDir,
          targetPath: 'themes/my-theme/my-theme.theme.ts',
          overwrite: true,
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toMatchObject({code: 'ERR_FILE_EXISTS'});
      expect(error.message).toMatch(
        /theme editor made \(my-theme\.settings\.json is beside it\)/,
      );
      expect(
        fs.readFileSync(path.join(dir, 'my-theme.theme.ts'), 'utf-8'),
      ).toBe(source);
    });

    it('still replaces a theme source beside a settings file the editor did not make', () => {
      const dir = path.join(tmpDir, 'api');
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, 'local.settings.json'), '{}\n');
      fs.writeFileSync(path.join(dir, 'ocean.theme.ts'), '// mine\n');
      const res = themeTemplate({
        cwd: tmpDir,
        targetPath: 'api/ocean.theme.ts',
        overwrite: true,
      });
      expect(res.data.written).toBe(true);
    });

    it('replaces a file named like a theme source', () => {
      fs.writeFileSync(path.join(tmpDir, 'ocean.theme.ts'), '// mine\n');
      const res = themeTemplate({
        cwd: tmpDir,
        targetPath: 'ocean.theme.ts',
        overwrite: true,
      });
      expect(res.data.written).toBe(true);
    });

    it('refuses a folder, with or without a trailing slash, and names the file path', () => {
      fs.mkdirSync(path.join(tmpDir, 'src'));
      for (const target of ['src', 'src/', 'newdir/']) {
        let error;
        try {
          themeTemplate({cwd: tmpDir, targetPath: target, overwrite: true});
        } catch (caught) {
          error = caught;
        }
        expect(error).toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
        expect(error.suggestions[0].name).toMatch(
          /theme template (src|newdir)\/theme\.template\.ts$/,
        );
      }
      expect(fs.existsSync(path.join(tmpDir, 'newdir'))).toBe(false);
    });

    it('refuses a blank path', () => {
      expect(() => themeTemplate({cwd: tmpDir, targetPath: '  '})).toThrow(
        expect.objectContaining({code: 'ERR_INVALID_ARGUMENT'}),
      );
      expect(fs.readdirSync(tmpDir)).toEqual([]);
    });
  });

  it('says when overwrite would refuse an existing file, and names a free path', () => {
    fs.writeFileSync(path.join(tmpDir, 'util.ts'), 'export const x = 1;\n');
    expect(themeTemplate({cwd: tmpDir, targetPath: 'util.ts'}).data).toEqual({
      path: 'util.ts',
      written: false,
      reason: 'exists',
      overwritable: false,
      alternative: THEME_TEMPLATE_DEFAULT_PATH,
    });
    fs.writeFileSync(
      path.join(tmpDir, THEME_TEMPLATE_DEFAULT_PATH),
      '// mine\n',
    );
    expect(
      themeTemplate({cwd: tmpDir, targetPath: 'util.ts'}).data.alternative,
    ).toBe('theme.template-2.ts');

    const editor = path.join(tmpDir, 'themes', 't');
    fs.mkdirSync(editor, {recursive: true});
    fs.writeFileSync(path.join(editor, 't.settings.json'), '{}\n');
    fs.writeFileSync(path.join(editor, 't.theme.ts'), '// editor\n');
    expect(
      themeTemplate({cwd: tmpDir, targetPath: 'themes/t/t.theme.ts'}).data,
    ).toMatchObject({
      overwritable: false,
      alternative: 'themes/t/theme.template.ts',
    });
  });
});

describe('themeTemplate() from a folder inside the project', () => {
  it('reads paths from the current folder within the project root, and writes no path at the root', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"app"}\n');
    const sub = path.join(tmpDir, 'src', 'app');
    fs.mkdirSync(sub, {recursive: true});
    const up = themeTemplate({
      cwd: sub,
      targetPath: '../../themes/zz.theme.ts',
    });
    expect(up.data.written).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'themes', 'zz.theme.ts'))).toBe(
      true,
    );
    const root = themeTemplate({cwd: sub});
    expect(root.data.written).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'theme.template.ts'))).toBe(true);
    expect(fs.existsSync(path.join(sub, 'theme.template.ts'))).toBe(false);
    expect(() =>
      themeTemplate({cwd: sub, targetPath: '../../../out.ts'}),
    ).toThrow(/"\.\.\/\.\.\/\.\.\/out\.ts": resolves outside the project root/);
  });
});

describe('themeTemplate() paths with a backslash', () => {
  it('reads a backslash as a folder separator, as eject does', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-template-bs-'));
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      fs.mkdirSync(path.join(dir, 'themes'));
      const r = themeTemplate({cwd: dir, targetPath: 'themes\\x.theme.ts'});
      expect(r.data.path).toBe(path.join('themes', 'x.theme.ts'));
      expect(fs.existsSync(path.join(dir, 'themes', 'x.theme.ts'))).toBe(true);
      expect(fs.readdirSync(dir)).not.toContain('themes\\x.theme.ts');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});
