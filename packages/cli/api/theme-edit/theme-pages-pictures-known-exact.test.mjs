// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundred-and-forty-first pass: the editor's pages and pictures
 * are known by their exact names (a file or link of the user's named like
 * one is theirs); preview add at a workspace root gets the shared app
 * finder's answer; refusals keep the options given (--png on a --section
 * refusal; the command without an option written with no value); an empty
 * --template offers preview add itself; a template typo offers only pages
 * it can add now; a starter app names an open font it cannot install; the
 * sheet names a template page's charts it cannot draw.
 */

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditPreviewAdd,
  themeEditPreviewApp,
} from './theme-edit.mjs';
import {EDITOR_PAGES, isEditorPage} from './_settings.mjs';
import {checkSection, context} from './_context.mjs';
import {showcaseItems} from './_preview.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-pages-pictures-known-exact-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fs.mkdirSync(path.join(cwd, 'app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'app/layout.tsx'),
    'export default function L({children}: {children: React.ReactNode}) { return <html><body>{children}</body></html>; }\n',
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
  );
  pkg.dependencies = {...pkg.dependencies, next: '*'};
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(pkg));
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => unknown} run */
async function refusal(run) {
  try {
    await run();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
}
const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ s) => s.name);

/** The CLI's --json answer, run in the fixture. @param {string[]} args */
function cli(args) {
  const r = spawnSync(process.execPath, [BIN, ...args, '--json'], {
    cwd,
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout);
}

describe("the editor's pages and pictures, by exact name", () => {
  it('names the pages and pictures it writes, and no look-alike', () => {
    for (const n of [
      'preview.png',
      'sheet-dark.png',
      'sheet-inputs.html',
      'sheet-inputs-dark.png',
    ])
      expect(EDITOR_PAGES.has(n)).toBe(true);
    for (const n of [
      'sheet-mockup.png',
      'sheet-old.png',
      'preview-v.html',
      'preview-dark.html',
    ])
      expect(isEditorPage(n)).toBe(false);
    expect(isEditorPage('sheet-mockup.png', {'sheet-mockup.png': 'x'})).toBe(
      true,
    );
  });

  it("a link of the user's at a picture's name refuses no change", async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-mock-'));
    const mock = path.join(outside, 'mock.png');
    fs.writeFileSync(mock, 'png');
    const dir = path.join(cwd, 'themes/t');
    try {
      for (const n of ['sheet-mockup.png', 'preview.png']) {
        fs.symlinkSync(mock, path.join(dir, n));
        try {
          await themeEditSet(
            't',
            'corners',
            n === 'preview.png' ? 'square' : 'pill',
            {cwd},
          );
        } finally {
          fs.rmSync(path.join(dir, n), {force: true});
        }
      }
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  }, 240_000);

  it("preview app copies the user's files named like a picture", async () => {
    const dir = path.join(cwd, 'themes/t');
    fs.writeFileSync(path.join(dir, 'sheet-old.png'), 'mine');
    fs.writeFileSync(path.join(dir, 'preview-v.html'), '<p>mine</p>');
    try {
      await themeEditPreviewApp('starter1', {cwd, theme: 't'});
      expect(
        fs.existsSync(path.join(cwd, 'starter1/themes/t/sheet-old.png')),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(cwd, 'starter1/themes/t/preview-v.html')),
      ).toBe(true);
    } finally {
      fs.rmSync(path.join(dir, 'sheet-old.png'), {force: true});
      fs.rmSync(path.join(dir, 'preview-v.html'), {force: true});
    }
  }, 240_000);
});

describe('refusals keep what was asked for', () => {
  it('preview add at a workspace root names the app to cd into', async () => {
    const ws = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-ws141-')),
    );
    try {
      fs.writeFileSync(
        path.join(ws, 'package.json'),
        JSON.stringify({name: 'root', private: true}),
      );
      fs.writeFileSync(
        path.join(ws, 'pnpm-workspace.yaml'),
        'packages:\n  - "apps/*"\n',
      );
      fs.mkdirSync(path.join(ws, 'apps/web'), {recursive: true});
      fs.writeFileSync(
        path.join(ws, 'apps/web/package.json'),
        JSON.stringify({
          name: 'web',
          dependencies: {'@astryxdesign/core': '*', next: '*'},
        }),
      );
      const e = await refusal(() => themeEditPreviewAdd(undefined, {cwd: ws}));
      expect(e.message).not.toMatch(/No package\.json here/);
      expect(e.message).toMatch(/workspace root/);
      expect(names(e)).toEqual(['cd apps/web']);
    } finally {
      fs.rmSync(ws, {recursive: true, force: true});
    }
  });

  it('a --section refusal keeps --png, and an option eaten as the value stays one', () => {
    const run = (/** @type {string} */ s) =>
      names(
        (() => {
          try {
            checkSection(s, 't', ' --png');
          } catch (e) {
            return e;
          }
          return {};
        })(),
      );
    expect(run('inptus')).toContain(
      'astryx experimental theme editor show t --png --section inputs',
    );
    expect(run('all')).toEqual([
      'astryx experimental theme editor show t --png',
    ]);
    expect(run('')).toEqual(['astryx experimental theme editor show t --png']);
    expect(run('--png')).toEqual([
      'astryx experimental theme editor show t --png',
    ]);
  });

  it('an option written last with no value offers the command without it', () => {
    const show = cli([
      'experimental',
      'theme',
      'editor',
      'show',
      't',
      '--png',
      '--section',
    ]);
    expect(show.suggestions[0].name).toMatch(/editor show t --png$/);
    expect(
      show.suggestions.every((/** @type {any} */ s) => s.reason !== 'usage'),
    ).toBe(true);
    const add = cli(['experimental', 'theme', 'preview', 'add', '--template']);
    expect(add.suggestions[0].name).toMatch(/theme preview add$/);
    // Without its page, a remove would remove the whole preview: not offered.
    const remove = cli([
      'experimental',
      'theme',
      'preview',
      'remove',
      '--path',
    ]);
    expect(remove.suggestions.map((/** @type {any} */ s) => s.name)).toEqual([
      expect.stringMatching(/preview remove --help$/),
    ]);
  }, 60_000);

  it('an empty --template offers preview add itself', async () => {
    const e = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: ''}),
    );
    expect(names(e)[0]).toBe('astryx experimental theme preview add');
  }, 240_000);

  it('a template typo offers only a page it can add now', async () => {
    const e = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: 'colours'}),
    );
    // t has no generated colors: the Colors page cannot be added.
    expect(names(e)).not.toContain(
      'astryx experimental theme preview add --template colors',
    );
  }, 240_000);
});

describe('fonts and charts the result names', () => {
  it('a starter app names an open font it cannot install', async () => {
    await themeEditSet(
      't',
      '--font-family-body',
      'Lato, "Helvetica Neue", Arial',
      {cwd},
    );
    const r = /** @type {any} */ (
      await themeEditPreviewApp('starter2', {cwd, theme: 't'})
    );
    expect(
      r.data.notes.some((/** @type {string} */ n) =>
        /^"Lato" is not a font the CLI knows to be open, .*@fontsource\/lato/.test(
          n,
        ),
      ),
    ).toBe(true);
  }, 240_000);

  it("the sheet names a template page's charts drawn in the browser", async () => {
    const cliModules = path.resolve(import.meta.dirname, '../../node_modules');
    const mods = path.join(cwd, 'node_modules');
    fs.mkdirSync(path.join(mods, '@heroicons'), {recursive: true});
    fs.symlinkSync(
      fs.realpathSync(path.join(cliModules, 'recharts')),
      path.join(mods, 'recharts'),
    );
    fs.symlinkSync(
      fs.realpathSync(path.join(cliModules, '@heroicons/react')),
      path.join(mods, '@heroicons/react'),
    );
    const ctx = await context(cwd);
    expect(
      showcaseItems(ctx.project, 'pages').notes.some(n =>
        /^the dashboard page's charts are drawn in the browser \(recharts\)/.test(
          n,
        ),
      ),
    ).toBe(true);
  }, 240_000);
});
