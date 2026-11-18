// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The previews and the starter offer lines that work and say what is
 * in the way truly: a remove with no preview offers what add itself
 * offers there; a starter whose import loads a link inside the theme
 * folder, whose url() names no file, or with a folder the copy cannot read
 * is refused by name, nothing written; a pipe at any editor page's name is
 * left as it is and named; and a theme given to preview app as a path or a
 * list is offered as the same preview command with that theme.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewApp,
  themeEditPreviewRemove,
  themeEditShow,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages, refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const posix = process.platform !== 'win32';
const root = typeof process.getuid === 'function' && process.getuid() === 0;

/** @type {string} */
let cwd;
/** @type {string} */
let dir;
/** @type {string} */
let source;
/** @type {string} */
let original;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt202-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
  dir = path.join(cwd, 'themes/t');
  source = path.join(dir, 't.theme.ts');
  original = fs.readFileSync(source, 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** The commands a refusal offers, after the CLI's own words. @param {{run: string[]}} e */
const offered = e => e.run.map(x => x.replace(/^.*?experimental theme /, ''));

/** The theme source with these lines after its imports. @param {string} imports @param {string} [fields] */
const withSource = (imports, fields = '') =>
  fs.writeFileSync(
    source,
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\n${imports}\nexport const tTheme = defineTheme({extends: tSettings, name: 't'${fields}});\n`,
  );

describe('preview remove with no preview yet', () => {
  it(
    'offers what add itself offers where add cannot work, and it runs',
    async () => {
      fs.mkdirSync(path.join(cwd, 'app'), {recursive: true});
      try {
        const e = await refusal(() =>
          themeEditPreviewRemove('overview', {cwd}),
        );
        expect(offered(e)).not.toContain('preview add');
        const line = offered(e).find(l => l.startsWith('preview app '));
        expect(line).toMatch(/^preview app [a-z][\w-]*/);
        const name = /** @type {string} */ (line).split(' ')[2];
        const r = await themeEditPreviewApp(name, {cwd});
        expect(fs.existsSync(path.join(cwd, name, 'package.json'))).toBe(true);
        expect(r).toBeTruthy();
        fs.rmSync(path.join(cwd, name), {recursive: true, force: true});
      } finally {
        fs.rmSync(path.join(cwd, 'app'), {recursive: true, force: true});
      }
    },
    T,
  );
});

describe.skipIf(!posix)('a starter the new app could not build', () => {
  it(
    'is refused when an import without its extension loads a link in the folder',
    async () => {
      fs.writeFileSync(
        path.join(dir, 'util.ts'),
        "export const red = '#c00';\n",
      );
      fs.symlinkSync('util.ts', path.join(dir, 'helpers.ts'));
      withSource(
        "import {red} from './helpers';",
        ', components: {button: {base: {borderColor: red}}}',
      );
      try {
        const e = await refusal(() =>
          themeEditPreviewApp('q5', {cwd, theme: 't'}),
        );
        expect(e.message).toContain(
          "imports './helpers' through themes/t/helpers.ts, a link",
        );
        expect(fs.existsSync(path.join(cwd, 'q5'))).toBe(false);
      } finally {
        fs.rmSync(path.join(dir, 'helpers.ts'), {force: true});
        fs.rmSync(path.join(dir, 'util.ts'), {force: true});
        fs.writeFileSync(source, original);
      }
    },
    T,
  );

  it(
    'is refused when a url() names no file (a wrong-case path)',
    async () => {
      fs.mkdirSync(path.join(dir, 'img'), {recursive: true});
      fs.writeFileSync(path.join(dir, 'img/bg.png'), 'png');
      withSource(
        '',
        ", components: {card: {base: {backgroundImage: 'url(./IMG/bg.png)'}}}",
      );
      try {
        await themeEditShow('t', {cwd});
        const e = await refusal(() =>
          themeEditPreviewApp('q9', {cwd, theme: 't'}),
        );
        expect(e.message).toContain('uses url(./IMG/bg.png)');
        expect(e.message).toContain('there is no such file in themes/t/');
        expect(fs.existsSync(path.join(cwd, 'q9'))).toBe(false);
      } finally {
        fs.rmSync(path.join(dir, 'img'), {recursive: true, force: true});
        fs.writeFileSync(source, original);
        await themeEditShow('t', {cwd});
      }
    },
    T,
  );

  it.skipIf(root)(
    'calls a folder it cannot read a read, naming that folder',
    async () => {
      const locked = path.join(dir, 'locked');
      fs.mkdirSync(locked);
      fs.chmodSync(locked, 0o000);
      try {
        const e = await refusal(() =>
          themeEditPreviewApp('q6', {cwd, theme: 't'}),
        );
        expect(e.code).toBe('ERR_READ_FAILED');
        expect(e.message).toContain('themes/t/locked/ could not be read');
        expect(fs.existsSync(path.join(cwd, 'q6'))).toBe(false);
      } finally {
        fs.chmodSync(locked, 0o755);
        fs.rmSync(locked, {recursive: true, force: true});
      }
    },
    T,
  );
});

describe.skipIf(!posix)("a pipe at an editor page's name", () => {
  it(
    'is left as it is and named, at the sheet and at the sample page alike',
    async () => {
      for (const name of ['sheet.html', 'preview.html']) {
        const file = path.join(dir, name);
        fs.rmSync(file, {force: true});
        execFileSync('mkfifo', [file]);
        try {
          const r = await themeEditShow('t', {cwd});
          expect(fs.lstatSync(file).isFIFO(), name).toBe(true);
          expect(JSON.stringify(r.data), name).toContain(
            `themes/t/${name} is not a plain file`,
          );
        } finally {
          fs.rmSync(file, {force: true});
        }
      }
    },
    T,
  );
});

describe('preview app given a theme as a path or a list', () => {
  it(
    'offers the same preview command with that theme',
    async () => {
      for (const theme of ['./themes/t/t.theme.ts', 't,u', 'T, U']) {
        const e = await refusal(() => themeEditPreviewApp('q11', {cwd, theme}));
        expect(offered(e), theme).toContain('preview app q11 --theme t');
        expect(offered(e).join(' '), theme).not.toMatch(/editor show/);
      }
    },
    T,
  );
});
