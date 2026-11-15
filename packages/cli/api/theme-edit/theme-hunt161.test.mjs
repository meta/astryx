// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The previews and the starter app, said and written truly: a
 * refused preview command writes nothing; a starter whose stylesheet leads
 * out of the theme folder, a theme file too large for a read or one that
 * cannot be read is refused by name; a pipe at a file the editor reads is
 * never opened; image names are URL text; a section's pictures go with the
 * others; a starter names the font weights it does not load; and preview
 * options, --top and an empty --theme get the command meant.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewList,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
import {editorWrote, recordWritten} from './_settings.mjs';
import {readRecordIn, readRegularFile} from './_palette.mjs';
import {
  assetRef,
  CSS_URL,
  cssUrlRef,
} from '../../foundation/render/render-page.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages, refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt161-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(appPackages({packageManager: 'npm@10.9.0'}))}\n`,
  );
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
  dir = path.join(cwd, 'themes/t');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** A named pipe at `file`, which no writer ever opens. @param {string} file */
const fifo = file => execFileSync('mkfifo', [file]);

/** Every file of the theme folder with its bytes. */
const snapshot = () =>
  Object.fromEntries(
    /** @type {string[]} */ (fs.readdirSync(dir, {recursive: true}))
      .map(String)
      .filter(f => fs.statSync(path.join(dir, f)).isFile())
      .sort()
      .map(f => [f, fs.readFileSync(path.join(dir, f), 'base64')]),
  );

describe('a refused preview command', () => {
  it(
    'writes nothing when the theme source does not load, and is refused the same way again',
    async () => {
      const source = path.join(dir, 't.theme.ts');
      const was = fs.readFileSync(source, 'utf8');
      fs.writeFileSync(
        source,
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {tSettings} from './t.settings';\nimport {accent} from './nope';\nexport const tTheme = defineTheme({extends: tSettings, name: 't', components: {card: {base: {borderColor: accent}}}});\n",
      );
      try {
        const before = snapshot();
        for (const run of [
          () => themeEditPreviewApp('q12', {cwd, theme: 't'}),
          () => themeEditPreviewApp('q12', {cwd, theme: 't'}),
          () => themeEditPreviewAdd(undefined, {cwd, path: 'src/app/p12'}),
        ]) {
          const e = await refusal(run);
          expect(e.message).toContain("Cannot find module './nope'");
          expect(snapshot()).toEqual(before);
        }
        expect(fs.existsSync(path.join(cwd, 'q12'))).toBe(false);
      } finally {
        fs.writeFileSync(source, was);
        fs.rmSync(path.join(cwd, 'src/app/p12'), {
          recursive: true,
          force: true,
        });
      }
    },
    T,
  );
});

describe('preview app and the theme folder', () => {
  it(
    'refuses a stylesheet url that leads out of the theme folder, naming it',
    async () => {
      fs.mkdirSync(path.join(cwd, 'shared'), {recursive: true});
      fs.writeFileSync(path.join(cwd, 'shared/bg.png'), 'png');
      await themeEditSet('t', 'background-image', 'url(../../shared/bg.png)', {
        cwd,
        on: 'card',
      });
      try {
        const e = await refusal(() =>
          themeEditPreviewApp('q7', {cwd, theme: 't'}),
        );
        expect(e.message).toContain(
          'themes/t/t.css uses url(../../shared/bg.png), a file outside themes/t/',
        );
        expect(fs.existsSync(path.join(cwd, 'q7'))).toBe(false);
      } finally {
        await runCli(
          [
            'experimental',
            'theme',
            'editor',
            'undo',
            't',
            'background-image',
            '--on',
            'card',
          ],
          cwd,
        );
        fs.rmSync(path.join(cwd, 'shared'), {recursive: true, force: true});
      }
    },
    T,
  );

  it.skipIf(!posix)(
    'refuses a file too large for one read, and one that cannot be read, by name',
    async () => {
      const big = path.join(dir, 'intro.mp4');
      fs.writeFileSync(big, '');
      fs.truncateSync(big, 3 * 1024 ** 3);
      try {
        const e = await refusal(() =>
          themeEditPreviewApp('q8', {cwd, theme: 't'}),
        );
        expect(e.code).toBe('ERR_INVALID_ARGUMENT');
        expect(e.message).toContain(
          'themes/t/intro.mp4 is 3.0 GB, more than one file read can take',
        );
      } finally {
        fs.rmSync(big, {force: true});
      }
      if (process.getuid?.() === 0) return;
      const grain = path.join(dir, 'grain.png');
      fs.writeFileSync(grain, 'png');
      fs.chmodSync(grain, 0o000);
      try {
        const e = await refusal(() =>
          themeEditPreviewApp('q10', {cwd, theme: 't'}),
        );
        expect(e.code).toBe('ERR_READ_FAILED');
        expect(e.message).toContain(
          'themes/t/grain.png could not be read (EACCES)',
        );
        expect(fs.existsSync(path.join(cwd, 'q10'))).toBe(false);
      } finally {
        fs.chmodSync(grain, 0o644);
        fs.rmSync(grain, {force: true});
      }
    },
    T,
  );

  it(
    'names the weights of a font the new app adds that it does not load',
    async () => {
      await themeEditSet('t', 'font', 'IBM Plex Sans', {cwd});
      try {
        const r = await themeEditPreviewApp('q4', {cwd, theme: 't'});
        expect(r.data.notes).toContainEqual(
          expect.stringMatching(
            /^the new app loads IBM Plex Sans at weight 400 only \(@fontsource\/ibm-plex-sans\/index\.css\): t also uses .*'@fontsource\/ibm-plex-sans\/600\.css'/,
          ),
        );
      } finally {
        await runCli(
          ['experimental', 'theme', 'editor', 'undo', 't', 'font'],
          cwd,
        );
        fs.rmSync(path.join(cwd, 'q4'), {recursive: true, force: true});
      }
    },
    T,
  );
});

describe('a file the editor reads that is not a regular file', () => {
  it.skipIf(!posix)(
    'is never opened: a pipe at a picture, the pictures record and the preview record',
    async () => {
      const started = Date.now();
      const pic = path.join(dir, 'preview.png');
      fifo(pic);
      try {
        expect(editorWrote(cwd, 't', pic)).toBe(false);
        expect(() => readRegularFile(pic)).toThrow(/not a regular file/);
      } finally {
        fs.rmSync(pic, {force: true});
      }
      const rec = path.join(dir, 't.pictures.json');
      const recWas = fs.existsSync(rec) ? fs.readFileSync(rec) : null;
      fs.rmSync(rec, {force: true});
      fifo(rec);
      try {
        expect(readRecordIn(dir, 't')).toEqual({});
        await themeEditSet('t', 'corners', 'square', {cwd});
      } finally {
        fs.rmSync(rec, {force: true});
        if (recWas) fs.writeFileSync(rec, recWas);
      }
      await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/p2'});
      const data = path.join(cwd, 'src/app/p2/theme-preview.json');
      const dataWas = fs.readFileSync(data);
      fs.rmSync(data);
      fifo(data);
      try {
        const e = await refusal(() =>
          themeEditPreviewList({cwd, path: 'src/app/p2'}),
        );
        expect(e.message).toContain(
          'theme-preview.json is damaged: it is not a regular file',
        );
      } finally {
        fs.rmSync(data, {force: true});
        fs.writeFileSync(data, dataWas);
      }
      const route = path.join(cwd, 'src/app/p2/page.tsx');
      fs.rmSync(route);
      fifo(route);
      try {
        await themeEditSet('t', 'corners', 'round', {cwd});
      } finally {
        fs.rmSync(path.join(cwd, 'src/app/p2'), {recursive: true, force: true});
      }
      // A read of any of these pipes would never have ended.
      expect(Date.now() - started).toBeLessThan(T / 2);
    },
    T,
  );
});

describe('theme image names', () => {
  it('are URL text, and a quoted url may hold parentheses', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-names-'));
    try {
      for (const n of ['a b.png', 'a(1).png', 'é.png'])
        fs.writeFileSync(path.join(tmp, n), 'png');
      const at = {dir: tmp, root: tmp};
      const css =
        'a{background:url(./a%20b.png)} b{background:url(./%C3%A9.png)} c{background:url("./a(1).png")} d{background:url( \'./a b.png\' )}';
      const refs = [...css.matchAll(new RegExp(CSS_URL.source, 'g'))].map(
        cssUrlRef,
      );
      expect(refs).toEqual([
        './a%20b.png',
        './%C3%A9.png',
        './a(1).png',
        './a b.png',
      ]);
      for (const ref of refs) expect(assetRef(ref, at)?.kind, ref).toBe('file');
    } finally {
      fs.rmSync(tmp, {recursive: true, force: true});
    }
  });
});

describe("a section sheet's pictures", () => {
  it(
    'go with the others when the look changes, and the command that retakes them is named',
    async () => {
      const shots = ['sheet-inputs.png', 'sheet-inputs-dark.png'].map(n =>
        path.join(dir, n),
      );
      for (const f of shots) fs.writeFileSync(f, 'png');
      recordWritten(cwd, 't', shots);
      const r = await themeEditSet('t', 'corners', 'pill', {cwd});
      for (const f of shots) expect(fs.existsSync(f)).toBe(false);
      expect(r.data.notes.join('\n')).toContain(
        'show t --png --section inputs take new ones',
      );
    },
    T,
  );
});

describe('preview options as typed', () => {
  it(
    'a typed dash, --top beside a default page, and an empty --theme get the command meant',
    async () => {
      const ask = async (/** @type {string[]} */ args) =>
        JSON.parse(
          (
            await runCli(
              ['experimental', 'theme', 'preview', ...args, '--json'],
              cwd,
            )
          ).stdout,
        );
      const first = (/** @type {any} */ r) => r.suggestions?.[0]?.name ?? '';
      const dash = await ask(['add', '—template', 'overview']);
      expect(dash.error).toContain(
        "unknown option '—template' (did you mean --template?)",
      );
      expect(first(dash)).toMatch(/ preview add --template overview$/);
      const top = await ask(['add', '--template', 'overview', '--top', '2']);
      expect(top.error).toContain('overview names one page, so drop --top');
      expect(first(top)).toMatch(/ preview add --template overview$/);
      const word = await ask(['add', 'overview', '--top', '3']);
      expect(first(word)).toMatch(/ preview add overview$/);
      const bare = await ask(['add', '--top', '2']);
      expect(first(bare)).toMatch(/ preview add$/);
      // A page this app cannot add (the dashboard needs packages it does
      // not have) is not offered beside a description.
      const both = await ask(['add', '--template', 'dashboard', 'extra']);
      for (const s of both.suggestions ?? [])
        expect(s.name).not.toMatch(/--template dashboard/);
      expect(first(both)).toMatch(/ preview add extra$/);
      const empty = await ask(['app', 'q11', '--theme=']);
      expect(first(empty)).toMatch(/ preview app q11 --theme t$/);
      for (const s of empty.suggestions ?? [])
        expect(s.name).not.toMatch(/ editor show /);
    },
    T,
  );
});

describe('show and an unreadable theme image', () => {
  it.skipIf(!posix || process.getuid?.() === 0)(
    'shows the theme without it and says so, never as React',
    async () => {
      const grain = path.join(dir, 'grain.png');
      fs.writeFileSync(grain, 'png');
      fs.chmodSync(grain, 0o000);
      await themeEditSet('t', 'background-image', 'url(./grain.png)', {
        cwd,
        on: 'button',
      });
      try {
        const r = await themeEditShow('t', {cwd});
        expect(
          /** @type {string[]} */ (/** @type {any} */ (r.data).notes).join(
            '\n',
          ),
        ).toContain('themes/t/grain.png cannot be read (no permission)');
      } finally {
        fs.chmodSync(grain, 0o644);
        fs.rmSync(grain, {force: true});
        await runCli(
          [
            'experimental',
            'theme',
            'editor',
            'undo',
            't',
            'background-image',
            '--on',
            'button',
          ],
          cwd,
        );
      }
    },
    T,
  );
});
