// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Starter apps, pages and pictures said and written truly: an option
 * of `preview app` given no value is named, with a line that works; no
 * folder offers a free one; a variable font package's index loads every
 * weight it names; version-control and package folders stay out of the
 * starter; a url reached through a link inside the theme folder is
 * refused before writing; every example of an open overlay is drawn; a
 * file of yours at preview.html, sheet.html or a section's sheet is left
 * alone and named; a theme source that does not build offers its own way
 * on; `set --png` names only the pictures it did not take again; a
 * section's --png takes the open states too; and `preview remove` says
 * when nothing was removed.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {SHEET_CSS, pageSource} from './_catalog.mjs';
import {splitCommand} from './_vet.mjs';
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

// The renders are stood in for, and a picture is a few bytes where the
// browser would write it: these tests are about files and results.
vi.mock('./_preview.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  const stubbed = (
    await import('../../test-utils/theme-render-stub.mjs')
  ).stubRenders(real);
  return {
    ...stubbed,
    screenshot: async (
      /** @type {any} */ _project,
      /** @type {string} */ _html,
      /** @type {string} */ png,
    ) => {
      fs.writeFileSync(png, 'png');
      return {ok: true};
    },
  };
});

const T = 240_000;
const posix = process.platform !== 'win32';
const PV = ['experimental', 'theme', 'preview'];

/** @type {string} */
let cwd;
/** @type {string} */
let dir;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt191-', FIXTURE_PACKAGES);
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

/**
 * Run the CLI with --json; the envelope it prints.
 * @param {string[]} args
 * @returns {Promise<any>}
 */
const cli = async args => {
  const r = await runCli([...args, '--json'], cwd);
  return JSON.parse(r.stdout);
};

/**
 * The words of an offered command after the CLI itself (from its first
 * command word on).
 * @param {string} line
 */
const argsOf = line => {
  const words = splitCommand(line) ?? [];
  return words.slice(
    words.findIndex(w => w === 'experimental' || w === 'theme'),
  );
};

/** The suggestion names. @param {any} r */
const names = r =>
  (r.suggestions ?? r.error?.suggestions ?? []).map(
    (/** @type {any} */ x) => x.name,
  );

/** @param {string} p */
const rm = p => fs.rmSync(path.join(cwd, p), {recursive: true, force: true});

describe('preview app with an option given no value (#7)', () => {
  it(
    'names the option, never glues the next value onto the folder, and offers only lines that work',
    async () => {
      for (const args of [
        ['app', 'q7', '--theme', '--path', 'x'],
        ['app', 'q7 x', '--theme', '--path'],
        ['app', 'q7', '--theme', '--top', '2'],
      ]) {
        const r = await cli([...PV, ...args]);
        const message = r.error?.message ?? r.error ?? r.message;
        expect(String(JSON.stringify(r))).toContain(
          '--theme was given no value',
        );
        expect(String(message)).not.toContain('is not a theme name');
        const offered = names(r);
        expect(offered.length).toBeGreaterThan(0);
        expect(offered.join('\n')).not.toMatch(/'q7 x'|'q7 2'|editor new/);
        for (const line of offered) {
          const run = await runCli(argsOf(line), cwd);
          expect(run.code ?? run.status).toBe(0);
        }
      }
      expect(fs.existsSync(path.join(cwd, 'q7'))).toBe(false);
    },
    T,
  );
});

describe('preview app with no folder (#11)', () => {
  it(
    'offers a free folder and the help, and the folder line works',
    async () => {
      const r = await cli([...PV, 'app']);
      const offered = names(r);
      expect(offered[0]).toMatch(/ experimental theme preview app theme-app$/);
      expect(offered[1]).toMatch(/ preview app --help$/);
      try {
        const made = await cli(argsOf(offered[0]));
        expect(made.error).toBeUndefined();
        expect(fs.existsSync(path.join(cwd, 'theme-app/package.json'))).toBe(
          true,
        );
        // The next free name, now that theme-app is taken.
        expect(names(await cli([...PV, 'app']))[0]).toMatch(
          / preview app theme-app-2$/,
        );
      } finally {
        rm('theme-app');
      }
    },
    T,
  );
});

describe('a starter on a variable Fontsource family (#13)', () => {
  it(
    'reads the weights its index loads: every one, so no 400-only note and no sheet it lacks',
    async () => {
      const pkg = path.join(cwd, 'node_modules/@fontsource-variable/inter');
      fs.mkdirSync(pkg, {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          name: '@fontsource-variable/inter',
          version: '5.2.5',
          main: 'index.css',
        }),
      );
      fs.writeFileSync(
        path.join(pkg, 'index.css'),
        "@font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;src:url(./files/x.woff2)}\n",
      );
      const pj = path.join(cwd, 'package.json');
      const was = fs.readFileSync(pj, 'utf8');
      const p = JSON.parse(was);
      p.dependencies['@fontsource-variable/inter'] = '^5.2.5';
      fs.writeFileSync(pj, JSON.stringify(p));
      await themeEditSet('t', 'font', 'Inter Variable', {cwd});
      try {
        const r = /** @type {any} */ (
          await themeEditPreviewApp('q13', {cwd, theme: 't'})
        );
        const notes = r.data.notes.join('\n');
        expect(notes).not.toContain('weight 400 only');
        expect(notes).not.toContain('@fontsource-variable/inter/500.css');
        const route = fs.readFileSync(
          path.join(cwd, 'q13/src/app/theme-preview/page.tsx'),
          'utf8',
        );
        expect(route).toContain('@fontsource-variable/inter/index.css');
        // A sheet that loads 400 alone names what it lacks, with no import
        // of a file the package does not ship.
        fs.writeFileSync(
          path.join(pkg, 'index.css'),
          "@font-face{font-family:'Inter Variable';font-weight:400;src:url(./files/x.woff2)}\n",
        );
        rm('q13');
        const r2 = /** @type {any} */ (
          await themeEditPreviewApp('q13', {cwd, theme: 't'})
        );
        const note = r2.data.notes.find((/** @type {string} */ n) =>
          n.includes('at weight 400 only'),
        );
        expect(note).toContain('ships no stylesheet for those weights');
        expect(note).not.toContain('/500.css');
      } finally {
        rm('q13');
        fs.writeFileSync(pj, was);
        await themeEditUndo('t', {cwd});
        fs.rmSync(pkg, {recursive: true, force: true});
      }
    },
    T,
  );
});

describe('a starter from a theme folder kept in its own repository (#15)', () => {
  it(
    'leaves version control and installed packages out, and says so',
    async () => {
      fs.mkdirSync(path.join(dir, '.git/objects'), {recursive: true});
      fs.writeFileSync(path.join(dir, '.git/HEAD'), 'ref: refs/heads/main\n');
      fs.mkdirSync(path.join(dir, 'node_modules/x'), {recursive: true});
      fs.writeFileSync(path.join(dir, 'node_modules/x/index.js'), '//\n');
      try {
        const r = /** @type {any} */ (
          await themeEditPreviewApp('q15', {cwd, theme: 't'})
        );
        expect(fs.existsSync(path.join(cwd, 'q15/themes/t/t.css'))).toBe(true);
        expect(fs.existsSync(path.join(cwd, 'q15/themes/t/.git'))).toBe(false);
        expect(fs.existsSync(path.join(cwd, 'q15/themes/t/node_modules'))).toBe(
          false,
        );
        expect(r.data.notes.join('\n')).toContain(
          'left out themes/t/.git, themes/t/node_modules: version control and installed packages are no part of the theme',
        );
      } finally {
        rm('q15');
        fs.rmSync(path.join(dir, '.git'), {recursive: true, force: true});
        fs.rmSync(path.join(dir, 'node_modules'), {
          recursive: true,
          force: true,
        });
      }
    },
    T,
  );
});

describe('a url through a link inside the theme folder (#16)', () => {
  it.skipIf(!posix)(
    'is refused before writing, and the offered line works once the file is in place',
    async () => {
      fs.mkdirSync(path.join(dir, 'img'), {recursive: true});
      fs.writeFileSync(path.join(dir, 'img/bg.png'), 'png');
      fs.symlinkSync('img', path.join(dir, 'alias'));
      await themeEditSet('t', 'background-image', 'url(./alias/bg.png)', {
        cwd,
        on: 'card',
      });
      try {
        const e = await refusal(() =>
          themeEditPreviewApp('q16', {cwd, theme: 't'}),
        );
        expect(e.message).toContain(
          'themes/t/t.css uses url(./alias/bg.png) through themes/t/alias, a link, which the copy does not follow',
        );
        expect(fs.existsSync(path.join(cwd, 'q16'))).toBe(false);
        // The fix the message names: the file itself where it is named.
        fs.rmSync(path.join(dir, 'alias'));
        fs.mkdirSync(path.join(dir, 'alias'));
        fs.copyFileSync(
          path.join(dir, 'img/bg.png'),
          path.join(dir, 'alias/bg.png'),
        );
        expect(e.run).toHaveLength(1);
        const made = await cli(argsOf(e.run[0]));
        expect(made.error).toBeUndefined();
        expect(fs.existsSync(path.join(cwd, 'q16/themes/t/alias/bg.png'))).toBe(
          true,
        );
      } finally {
        rm('q16');
        fs.rmSync(path.join(dir, 'alias'), {recursive: true, force: true});
        fs.rmSync(path.join(dir, 'img'), {recursive: true, force: true});
        await themeEditUndo('t', {cwd});
      }
    },
    T,
  );
});

describe('every example of an open overlay is drawn (#2)', () => {
  it('a panel that fills the window takes an equal share of its cell for each example', () => {
    expect(SHEET_CSS).toContain(
      '.cs-open-group .cs-cell dialog{max-height:calc((860px - (var(--cs-examples, 1) - 1) * 34px) / var(--cs-examples, 1))!important}',
    );
    expect(SHEET_CSS).not.toContain(
      '.cs-open-group .cs-cell dialog{max-height:860px!important}',
    );
    const source = pageSource({
      items: [],
      imports: {},
      theme: /** @type {any} */ ({module: './t.js', css: []}),
      layout: 'sheet',
    });
    expect(source).toContain("'--cs-examples': c.list.length");
  });
});

describe('a file of yours at a page the editor writes (#8)', () => {
  it(
    'is left alone and named by show, show --section and set; once moved, the offered show writes the page',
    async () => {
      const mine = '<p>my own notes</p>\n';
      const own = ['sheet.html', 'sheet-inputs.html', 'preview.html'];
      for (const n of own) fs.writeFileSync(path.join(dir, n), mine);
      try {
        const shown = /** @type {any} */ (await themeEditShow('t', {cwd}));
        const notes = shown.data.notes.join('\n');
        expect(notes).toContain(
          'themes/t/sheet.html is a file the editor did not write, and it is left as it is, so the sheet was not made',
        );
        expect(notes).toContain(
          'themes/t/preview.html is a file the editor did not write, and it is left as it is, so the sample page was not made',
        );
        const section = /** @type {any} */ (
          await themeEditShow('t', {cwd, section: 'inputs', png: true})
        );
        expect(section.data.pictureProblem).toContain(
          'themes/t/sheet-inputs.html is a file the editor did not write, and it is left as it is, so the inputs sheet was not made and themes/t/sheet-inputs.png was not taken',
        );
        expect(section.data.pictures).not.toContain(
          'themes/t/sheet-inputs.png',
        );
        expect(section.data.pictures).not.toContain('themes/t/preview.png');
        const set = /** @type {any} */ (
          await themeEditSet('t', 'corners', 'square', {cwd})
        );
        expect(JSON.stringify(set.data)).toContain(
          'themes/t/preview.html is a file the editor did not write, and it is left as it is, so the sample page was not made',
        );
        for (const n of own)
          expect(fs.readFileSync(path.join(dir, n), 'utf8')).toBe(mine);
        // Moved: the line the note names makes the pages.
        for (const n of own) fs.rmSync(path.join(dir, n));
        const line = /then run (.+ show t)$/.exec(
          notes
            .split('\n')
            .find(n => n.startsWith('themes/t/sheet.html is a file')) ?? '',
        )?.[1];
        expect(line).toBeTruthy();
        const again = await cli(argsOf(String(line)));
        expect(again.error).toBeUndefined();
        expect(fs.readFileSync(path.join(dir, 'sheet.html'), 'utf8')).not.toBe(
          mine,
        );
        expect(
          fs.readFileSync(path.join(dir, 'preview.html'), 'utf8'),
        ).not.toBe(mine);
      } finally {
        for (const n of own) fs.rmSync(path.join(dir, n), {force: true});
        await themeEditUndo('t', {cwd});
      }
    },
    T,
  );
});

describe('a theme source that does not build (#9)', () => {
  it(
    'offers the build failure’s own way on, never a list of dials',
    async () => {
      const source = path.join(dir, 't.theme.ts');
      const was = fs.readFileSync(source, 'utf8');
      fs.mkdirSync(path.join(cwd, 'lib'), {recursive: true});
      fs.writeFileSync(
        path.join(cwd, 'lib/brand.ts'),
        "export const brand = '#0b6e4f';\n",
      );
      fs.writeFileSync(
        path.join(cwd, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {baseUrl: '.', paths: {'@/*': ['./*']}},
        }),
      );
      fs.writeFileSync(source, `import '@/lib/brand';\n${was}`);
      try {
        const e = await refusal(() => themeEditShow('t', {cwd}));
        expect(e.code).toBe('ERR_THEME_INVALID');
        expect(e.run.join('\n')).not.toContain('how --list dials');
        expect(e.run.length).toBeGreaterThan(0);
        // Each line offered runs (the annotated source, written beside).
        const scratch = fs.mkdtempSync(path.join(cwd, 'scratch-'));
        try {
          for (const line of e.run) {
            const r = await runCli(argsOf(line), scratch);
            expect(r.code ?? r.status).toBe(0);
          }
        } finally {
          fs.rmSync(scratch, {recursive: true, force: true});
        }
      } finally {
        fs.writeFileSync(source, was);
        rm('lib');
        rm('tsconfig.json');
        await themeEditShow('t', {cwd});
      }
    },
    T,
  );
});

describe('set --png and the pictures it took again (#10)', () => {
  it(
    'names as removed only the pictures it did not take again, with the show that takes them',
    async () => {
      await themeEditShow('t', {cwd, png: true});
      expect(fs.existsSync(path.join(dir, 'sheet.png'))).toBe(true);
      try {
        const set = /** @type {any} */ (
          await themeEditSet('t', 'corners', 'square', {cwd, png: true})
        );
        expect(set.data.pictures).toContain('themes/t/preview.png');
        expect(set.data.pictures).toContain('themes/t/sheet-overlays.png');
        const removed = set.data.notes.find((/** @type {string} */ n) =>
          n.startsWith('removed '),
        );
        expect(removed).toMatch(
          /^removed themes\/t\/sheet-dark\.png, themes\/t\/sheet\.png: pictures of t as it was before this build; .+ show t --png take new ones$/,
        );
        expect(removed).not.toContain('preview');
        expect(removed).not.toContain('sheet-overlays');
        const line = /before this build; (.+ show t --png) take new ones$/.exec(
          removed,
        )?.[1];
        const again = await cli(argsOf(String(line)));
        expect(again.error).toBeUndefined();
        expect(fs.existsSync(path.join(dir, 'sheet.png'))).toBe(true);
      } finally {
        await themeEditUndo('t', {cwd});
      }
    },
    T,
  );
});

describe('show --png with a section (#17)', () => {
  it(
    'takes the open states as every --png does, with the section’s sheet',
    async () => {
      const r = /** @type {any} */ (
        await themeEditShow('t', {cwd, section: 'pages', png: true})
      );
      expect(r.data.pictures).toContain('themes/t/sheet-overlays.png');
      expect(r.data.pictures).toContain('themes/t/sheet-pages.png');
      expect(r.data.pictureProblem ?? null).toBeNull();
    },
    T,
  );
});

describe('preview remove when nothing was removed (#3)', () => {
  it.skipIf(!posix)(
    'says nothing was removed; once the page is a plain file, the offered remove removes it',
    async () => {
      await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/p3'});
      const file = path.join(cwd, 'src/app/p3/_pages/components.tsx');
      const was = fs.readFileSync(file);
      fs.rmSync(file);
      execFileSync('mkfifo', [file]);
      try {
        const r = await runCli(
          [...PV, 'remove', 'components', '--path', 'src/app/p3'],
          cwd,
        );
        expect(r.stdout).toContain(
          '[ok] nothing was removed: components stays in the theme preview',
        );
        expect(r.stdout).not.toContain('[ok] removed components');
        const j = await cli([
          ...PV,
          'remove',
          'components',
          '--path',
          'src/app/p3',
        ]);
        const note = j.data.notes.join('\n');
        const line =
          /then run (.+ preview remove components --path src\/app\/p3) again/.exec(
            note,
          )?.[1];
        fs.rmSync(file);
        fs.writeFileSync(file, was);
        const again = await runCli(argsOf(String(line)), cwd);
        expect(again.stdout).toContain(
          '[ok] removed components from the theme preview',
        );
      } finally {
        rm('src/app/p3');
      }
    },
    T,
  );
});
