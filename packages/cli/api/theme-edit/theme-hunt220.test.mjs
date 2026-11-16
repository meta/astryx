// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The starter and the pictures say and write what is true: an unknown
 * font's import names a sheet for each weight the theme uses; the overlays
 * section is photographed once; every version-control folder stays out of
 * the starter; a pipe at the pictures record is left and named; and the
 * editor's writer leaves a file holding the same bytes untouched.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewApp,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
import {writeWhole} from './_palette.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const posix = process.platform !== 'win32';

/** @type {string} */
let cwd;
/** @type {string} */
let dir;
/** @type {string} */
let settings;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt220-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
  dir = path.join(cwd, 'themes/t');
  settings = fs.readFileSync(path.join(dir, 't.settings.json'), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a starter with a font the CLI does not know', () => {
  it(
    "names a sheet for each weight the theme uses, never the index's 400 alone",
    async () => {
      await themeEditSet(
        't',
        '--font-family-heading',
        "'Playfair Display', serif",
        {cwd},
      );
      try {
        const r = await themeEditPreviewApp('q3', {cwd, theme: 't'});
        const note = r.data.notes.find((/** @type {string} */ n) =>
          n.includes('"Playfair Display" is not a font'),
        );
        expect(note).toContain("'@fontsource/playfair-display/600.css'");
        expect(note).toContain("'@fontsource/playfair-display/700.css'");
        expect(note).not.toContain("import '@fontsource/playfair-display' ");
      } finally {
        fs.rmSync(path.join(cwd, 'q3'), {recursive: true, force: true});
        fs.writeFileSync(path.join(dir, 't.settings.json'), settings);
        await themeEditShow('t', {cwd});
      }
    },
    T,
  );
});

describe('show --png --section overlays', () => {
  it(
    'makes and lists the open states page once',
    async () => {
      const r = await themeEditShow('t', {cwd, png: true, section: 'overlays'});
      const listed = /** @type {string[]} */ (r.data.pictures);
      expect(listed.length).toBe(new Set(listed).size);
    },
    T,
  );
});

describe('a starter from a theme folder that holds repositories', () => {
  it(
    'leaves every version-control folder out',
    async () => {
      const vcs = ['.sl', '.git', '.bzr', '.pijul', 'CVS', '_darcs'];
      for (const v of vcs) {
        fs.mkdirSync(path.join(dir, v), {recursive: true});
        fs.writeFileSync(path.join(dir, v, 'x'), 'x');
      }
      try {
        const r = await themeEditPreviewApp('q5', {cwd, theme: 't'});
        for (const v of vcs) {
          expect(fs.existsSync(path.join(cwd, 'q5/themes/t', v)), v).toBe(
            false,
          );
          expect(r.data.notes.join(' '), v).toContain(`themes/t/${v}`);
        }
      } finally {
        for (const v of vcs)
          fs.rmSync(path.join(dir, v), {recursive: true, force: true});
        fs.rmSync(path.join(cwd, 'q5'), {recursive: true, force: true});
      }
    },
    T,
  );
});

describe.skipIf(!posix)('a pipe at the pictures record', () => {
  it(
    'is left as it is and named, and no picture is taken',
    async () => {
      const record = path.join(dir, 't.pictures.json');
      fs.rmSync(record, {force: true});
      execFileSync('mkfifo', [record]);
      try {
        const r = await themeEditShow('t', {cwd, png: true});
        expect(fs.lstatSync(record).isFIFO()).toBe(true);
        expect(r.data.pictureProblem).toContain(
          "themes/t/t.pictures.json is not a plain file, where the record of the editor's pictures goes",
        );
        expect(r.data.pictures).toEqual([]);
      } finally {
        fs.rmSync(record, {force: true});
      }
    },
    T,
  );
});

describe("the editor's writer", () => {
  it(
    'leaves a file that holds the same bytes as it is, time included',
    () => {
      const file = path.join(dir, 'same.txt');
      fs.writeFileSync(file, 'same');
      const past = new Date(Date.now() - 60_000);
      fs.utimesSync(file, past, past);
      const before = fs.statSync(file);
      writeWhole(file, 'same');
      writeWhole(file, Buffer.from('same'));
      const after = fs.statSync(file);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      expect(after.ino).toBe(before.ino);
      writeWhole(file, 'other');
      expect(fs.readFileSync(file, 'utf8')).toBe('other');
      fs.rmSync(file);
    },
    T,
  );

  it.skipIf(!posix)(
    'never replaces a pipe',
    () => {
      const file = path.join(dir, 'pipe.txt');
      execFileSync('mkfifo', [file]);
      try {
        expect(() => writeWhole(file, 'x')).toThrow(
          /is a named pipe, not a file/,
        );
        expect(fs.lstatSync(file).isFIFO()).toBe(true);
      } finally {
        fs.rmSync(file, {force: true});
      }
    },
    T,
  );
});
