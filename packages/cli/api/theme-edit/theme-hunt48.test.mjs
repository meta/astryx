// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file hunt48: a picture is written only over one the editor took; the
 * record of those pictures lives in the theme folder and moves with it; a
 * `new` refused for its name never suggests a dial value the dial refuses;
 * a section sheet's banner names its own show.
 *
 * @position api/theme-edit — tests
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {editorWrote, recordWritten} from './_settings.mjs';
import {pictures} from './_context.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt48-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('hunt48 (1): --png never writes over a file of the user', () => {
  it('names the file and takes no picture', async () => {
    const dir = path.join(cwd, 'themes/t');
    const png = path.join(dir, 'preview.png');
    fs.writeFileSync(png, 'my own picture');
    const r = await pictures(
      /** @type {any} */ ({cwd}),
      [{html: path.join(dir, 'preview.html'), png}],
      ['light'],
    );
    expect(r.files).toEqual([]);
    expect(r.problem).toContain(
      'themes/t/preview.png is a file the editor did not write',
    );
    expect(fs.readFileSync(png, 'utf8')).toBe('my own picture');
    fs.rmSync(png);
  });
});

describe('hunt48 (2): the picture record moves with the theme', () => {
  it('is a file of the theme folder, read the same after the app moves', () => {
    const dir = path.join(cwd, 'themes/t');
    fs.writeFileSync(path.join(dir, 'sheet.png'), 'shot');
    recordWritten(cwd, 't', [path.join(dir, 'sheet.png')]);
    expect(fs.existsSync(path.join(dir, 't.pictures.json'))).toBe(true);
    const moved = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-h48-')),
    );
    try {
      fs.cpSync(path.join(cwd, 'themes'), path.join(moved, 'themes'), {
        recursive: true,
      });
      expect(
        editorWrote(moved, 't', path.join(moved, 'themes/t/sheet.png')),
      ).toBe(true);
    } finally {
      fs.rmSync(moved, {recursive: true, force: true});
      fs.rmSync(path.join(dir, 'sheet.png'));
    }
  });
});

describe('hunt48 (3): a new refused for its name', () => {
  it('leaves a refused dial value out of the suggestion and says so', async () => {
    for (const name of ['t', 'neutral', 'Bad Name']) {
      const err = await refusal(() =>
        themeEditNew(name, {
          cwd,
          settings: {corners: 'banana', accent: 'teal'},
        }),
      );
      expect(err.run.join('\n'), name).not.toContain('banana');
      expect(err.run.join('\n'), name).toContain('--accent teal');
      expect(err.message, name).toContain('leaves out --corners banana');
    }
  }, 120_000);
});

describe('hunt48 (4): a section sheet banner names its own show', () => {
  it('says show t --section overlays', async () => {
    const file = path.join(cwd, 'themes/t/sheet-overlays.html');
    fs.writeFileSync(
      file,
      '<html><body>x</body></html>\n<!-- astryx: sheet of build 0123456789abcdef -->\n',
    );
    const r = await themeEditSet('t', 'corners', 'round', {cwd});
    expect(fs.readFileSync(file, 'utf8')).toMatch(
      /show t --section overlays to make it again/,
    );
    expect(/** @type {any} */ (r.data).sheetStale).toContain(
      'show t --section overlays makes sheet-overlays.html again',
    );
  }, 120_000);
});

describe('hunt48 R22-B: a theme folder renamed by hand', () => {
  it('lists every step, and following them lets the theme be edited', async () => {
    await themeEditNew('ra', {cwd, like: 'neutral'});
    fs.renameSync(path.join(cwd, 'themes/ra'), path.join(cwd, 'themes/rc'));
    const err = await refusal(() =>
      themeEditSet('rc', 'spacing', 'roomy', {cwd}),
    );
    expect(err.message).toContain(
      "then in rc.theme.ts change './ra.settings' to './rc.settings', raSettings to rcSettings",
    );
    expect(err.run.join('\n')).not.toMatch(/\b(rm|mv)\b/);
    const dir = path.join(cwd, 'themes/rc');
    for (const n of fs.readdirSync(dir).filter(n => n.startsWith('ra.')))
      fs.renameSync(path.join(dir, n), path.join(dir, `rc${n.slice(2)}`));
    const src = path.join(dir, 'rc.theme.ts');
    fs.writeFileSync(
      src,
      fs
        .readFileSync(src, 'utf8')
        .replace("'./ra.settings'", "'./rc.settings'")
        .replaceAll('raSettings', 'rcSettings')
        .replace("name: 'ra'", "name: 'rc'")
        .replace('raTheme', 'rcTheme'),
    );
    const r = await themeEditSet('rc', 'spacing', 'roomy', {cwd});
    expect(r.data.setting.value).toBe('roomy');
  }, 240_000);
});
