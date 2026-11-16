// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The open states page and the starter app, said and written truly: a
 * file of yours at the open states page's name is never written over, and
 * every --png says why its picture was not taken; open overlays are shown at
 * the height of what they hold, and a submenu opens with rows; a starter
 * refuses an image reached through a link out of the theme folder, carries
 * the packages its theme source imports, and adds no font package a
 * fallback or the base's fonts sheet already covers; a page file that is no
 * regular file is named so, and its page stays to remove again; and a
 * description beside --template is offered only when it relates to a page.
 */

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewRemove,
  themeEditSet,
  themeEditShow,
} from './theme-edit.mjs';
import {demoProps} from './_parts.mjs';
import {openProject} from './_project.mjs';
import {SHEET_CSS} from './_catalog.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {appPackages, refusal} from '../../test-utils/theme-edit-fixture.mjs';

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

/** @type {string} */
let cwd;
/** @type {string} */
let dir;

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-open-states-page-starter-',
    FIXTURE_PACKAGES,
  );
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

describe('the open states page and something of yours at its name', () => {
  it(
    'a file of yours is never written over, and set and show say why the picture was not taken',
    async () => {
      const page = path.join(dir, 'sheet-overlays.html');
      fs.writeFileSync(page, '<p>my own notes</p>\n');
      try {
        const set = /** @type {any} */ (
          await themeEditSet('t', 'corners', 'square', {cwd, png: true})
        );
        expect(fs.readFileSync(page, 'utf8')).toBe('<p>my own notes</p>\n');
        expect(set.data.pictures).not.toContain('themes/t/sheet-overlays.png');
        expect(set.data.pictureProblem).toContain(
          'themes/t/sheet-overlays.html is a file the editor did not write, and it is left as it is, so themes/t/sheet-overlays.png (the open states) was not taken',
        );
        const shown = /** @type {any} */ (
          await themeEditShow('t', {cwd, png: true})
        );
        expect(fs.readFileSync(page, 'utf8')).toBe('<p>my own notes</p>\n');
        expect(shown.data.pictureProblem).toContain(
          'themes/t/sheet-overlays.html is a file the editor did not write',
        );
      } finally {
        fs.rmSync(page, {force: true});
      }
      // A folder there: one rule for set and show, neither refused.
      fs.mkdirSync(page);
      try {
        for (const r of [
          await themeEditSet('t', 'corners', 'pill', {cwd, png: true}),
          await themeEditShow('t', {cwd, png: true}),
        ])
          expect(/** @type {any} */ (r).data.pictureProblem).toContain(
            'themes/t/sheet-overlays.html is a folder, where the open states page goes',
          );
      } finally {
        fs.rmSync(page, {recursive: true, force: true});
      }
    },
    T,
  );
});

describe('open overlays drawn whole', () => {
  it(
    'the overlays section sizes its panels to a window, and a submenu opens with rows',
    async () => {
      // A cell grows to what it holds; a panel over the page in it takes a
      // window's height, shared among its examples.
      expect(SHEET_CSS).toContain(
        '.cs-open-group .cs-cell dialog{max-height:calc((860px - (var(--cs-examples, 1) - 1) * 34px) / var(--cs-examples, 1))!important}',
      );
      const project = await openProject(cwd);
      const props = /** @type {any} */ (
        demoProps(project, 'DropdownMenuSubMenu')
      );
      expect(props.children.map((/** @type {any} */ c) => c.__element)).toEqual(
        ['DropdownMenuItem', 'DropdownMenuItem', 'DropdownMenuItem'],
      );
    },
    T,
  );
});

describe('a starter app', () => {
  it.skipIf(!posix)(
    'refuses an image reached through a link out of the theme folder',
    async () => {
      fs.mkdirSync(path.join(cwd, 'shared'), {recursive: true});
      fs.writeFileSync(path.join(cwd, 'shared/bg.png'), 'png');
      fs.symlinkSync('../../shared', path.join(dir, 'img'));
      await themeEditSet('t', 'background-image', 'url(./img/bg.png)', {
        cwd,
        on: 'card',
      });
      try {
        const e = await refusal(() =>
          themeEditPreviewApp('q1', {cwd, theme: 't'}),
        );
        expect(e.message).toContain(
          'themes/t/t.css uses url(./img/bg.png), a file outside themes/t/',
        );
        expect(fs.existsSync(path.join(cwd, 'q1'))).toBe(false);
      } finally {
        fs.rmSync(path.join(dir, 'img'), {force: true});
        fs.rmSync(path.join(cwd, 'shared'), {recursive: true, force: true});
        execFileSync(
          process.execPath,
          [
            path.resolve(
              import.meta.dirname,
              '../../clients/cli/bin/astryx.mjs',
            ),
            'experimental',
            'theme',
            'editor',
            'undo',
            't',
            'background-image',
            '--on',
            'card',
          ],
          {cwd, stdio: 'ignore'},
        );
      }
    },
    T,
  );

  it(
    'carries the packages its theme source imports, at this project’s version, and refuses one it cannot resolve',
    async () => {
      const pkg = path.join(cwd, 'node_modules/tintx');
      fs.mkdirSync(pkg, {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({name: 'tintx', version: '2.3.4', main: 'index.js'}),
      );
      fs.writeFileSync(path.join(pkg, 'index.js'), 'module.exports = {};\n');
      const source = path.join(dir, 't.theme.ts');
      const was = fs.readFileSync(source, 'utf8');
      fs.writeFileSync(source, `import 'tintx';\n${was}`);
      try {
        await themeEditShow('t', {cwd});
        await themeEditPreviewApp('q8', {cwd, theme: 't'});
        const deps = JSON.parse(
          fs.readFileSync(path.join(cwd, 'q8/package.json'), 'utf8'),
        ).dependencies;
        expect(deps.tintx).toBe('2.3.4');
        // Neither a fallback system face nor a family the base's fonts
        // sheet loads gets a package of its own.
        expect(Object.keys(deps)).not.toContain('@fontsource/roboto');
        expect(Object.keys(deps)).not.toContain('@fontsource/figtree');
        fs.rmSync(pkg, {recursive: true, force: true});
        const e = await refusal(() =>
          themeEditPreviewApp('q9', {cwd, theme: 't'}),
        );
        expect(e.message).toContain(
          'its source imports tintx, which this project does not have installed',
        );
        expect(fs.existsSync(path.join(cwd, 'q9'))).toBe(false);
      } finally {
        fs.writeFileSync(source, was);
        fs.rmSync(pkg, {recursive: true, force: true});
        fs.rmSync(path.join(cwd, 'q8'), {recursive: true, force: true});
      }
    },
    T,
  );
});

describe('a page file that is no regular file', () => {
  it.skipIf(!posix)(
    'is named so, and its page stays to remove again',
    async () => {
      await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/p10'});
      const file = path.join(cwd, 'src/app/p10/_pages/components.tsx');
      fs.rmSync(file);
      execFileSync('mkfifo', [file]);
      try {
        const r = /** @type {any} */ (
          await themeEditPreviewRemove('components', {
            cwd,
            path: 'src/app/p10',
          })
        );
        expect(r.data.pages).toContain('components');
        const note = r.data.notes.join('\n');
        expect(note).toContain(
          'src/app/p10/_pages/components.tsx is not a regular file (a pipe, a device or a folder), so it is never read',
        );
        expect(note).toMatch(
          /replace it with a plain file or move it out of the folder, then run .* preview remove components --path src\/app\/p10 again/,
        );
        expect(note).not.toContain('fix its permissions');
      } finally {
        fs.rmSync(path.join(cwd, 'src/app/p10'), {
          recursive: true,
          force: true,
        });
      }
    },
    T,
  );
});

describe('a description beside --template', () => {
  it(
    'is offered only when it relates to a page; with neither, the default pages',
    async () => {
      const e = await refusal(() =>
        themeEditPreviewAdd('extra', {
          cwd,
          template: 'dashboard',
          path: 'src/app/f17',
        }),
      );
      expect(e.message).toContain('No page template relates to "extra"');
      expect(e.run.some(n => / add 'extra'| add extra/.test(n))).toBe(false);
      expect(e.run).toContainEqual(
        expect.stringMatching(/ preview add --path src\/app\/f17$/),
      );
    },
    T,
  );
});
