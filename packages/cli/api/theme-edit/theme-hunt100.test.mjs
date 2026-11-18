// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundredth pass: the preview follows through. A copy of a
 * picture is never deleted; every browser run has one temp folder, one time
 * bound and the real cause of a failure; a theme folder that cannot be
 * written is a write failure; a renamed preview is found by add; a theme
 * the route imports from outside the project folder is not gone; refusals
 * offer only pages the app can show and the whole-preview remove; and the
 * pictures that were not taken are said.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditPreviewAdd,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
import {themeEditShow as showInside} from './_edit.mjs';
import {screenshot} from './_preview.mjs';
import {EDITOR_STAMP, pngTexts, withPngText} from './_png.mjs';
import {doc as removeDoc} from './themeEditPreviewRemove.doc.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** A valid 1x1 PNG (its chunk checksums right, so a stamp can be added). */
const PNG = (() => {
  /** @param {string} type @param {Buffer} data */
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 0, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
})();

/** A project folder with a stand-in Playwright and a page to picture. */
function pwProject(/** @type {string} */ launchSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-pw100-'));
  const pw = path.join(dir, 'node_modules/playwright');
  fs.mkdirSync(pw, {recursive: true});
  fs.writeFileSync(
    path.join(pw, 'package.json'),
    JSON.stringify({name: 'playwright', main: 'index.js'}),
  );
  fs.writeFileSync(path.join(pw, 'index.js'), launchSource);
  fs.writeFileSync(path.join(dir, 'package.json'), '{}');
  const html = path.join(dir, 'p.html');
  fs.writeFileSync(html, '<p>x</p>');
  return {
    dir,
    html,
    project: {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
  };
}

describe('the browser run', () => {
  const savedPath = process.env.PATH;
  afterAll(() => {
    process.env.PATH = savedPath;
  });

  it('Playwright runs in a temp folder of its own, removed after a failed launch', async () => {
    const {dir, html, project} = pwProject(
      `const fs = require('fs'), os = require('os'), path = require('path');
       exports.chromium = {async launch() {
         fs.mkdirSync(path.join(os.tmpdir(), 'playwright-artifacts-x'));
         fs.writeFileSync(${JSON.stringify(path.join(os.tmpdir(), 'astryx-pw100-tmp'))}, os.tmpdir());
         throw new Error("browserType.launch: Executable doesn't exist; run npx playwright install");
       }};`,
    );
    process.env.PATH = dir;
    try {
      const r = /** @type {any} */ (
        await screenshot(project, html, path.join(dir, 'p.png'), 'light')
      );
      expect(r.ok).toBe(false);
      const used = fs.readFileSync(
        path.join(os.tmpdir(), 'astryx-pw100-tmp'),
        'utf8',
      );
      expect(used).not.toBe(os.tmpdir());
      expect(fs.existsSync(used)).toBe(false);
      expect(r.reason).toMatch(/npx playwright install chromium/);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(path.join(os.tmpdir(), 'astryx-pw100-tmp'), {force: true});
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('a browser that does not start keeps its real cause, and no Chrome is named when there is none', async () => {
    const {dir, html, project} = pwProject(
      `exports.chromium = {async launch() {
         throw new Error('browserType.launch: Target page, context or browser has been closed\\n=== logs ===\\n[pid=1][err] error while loading shared libraries: libnss3.so');
       }};`,
    );
    process.env.PATH = dir;
    try {
      const r = /** @type {any} */ (
        await screenshot(project, html, path.join(dir, 'p.png'), 'light')
      );
      expect(r.reason).toMatch(/libnss3\.so/);
      expect(r.reason).not.toMatch(/check that .* starts/);
      expect(r.reason).toMatch(/install Google Chrome or Chromium/);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt100-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(
    path.join(cwd, 'src/app/layout.tsx'),
    "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
  );
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('pictures', () => {
  it('a copy of a picture, stamp and all, is never deleted by a change', async () => {
    const copy = path.join(cwd, 'themes/t/preview-before.png');
    fs.writeFileSync(copy, withPngText(PNG, EDITOR_STAMP, 't'));
    // The copy carries the editor's stamp, as a byte copy of its picture.
    expect(pngTexts(fs.readFileSync(copy))[EDITOR_STAMP]).toBe('t');
    await themeEditSet('t', 'corners', 'pill', {cwd});
    expect(fs.existsSync(copy)).toBe(true);
    fs.rmSync(copy);
  }, 240_000);

  it('a theme folder that cannot be written is a write failure naming it', async () => {
    await themeEditShow('t', {cwd});
    const dir = path.join(cwd, 'themes/t');
    fs.rmSync(path.join(dir, 'sheet.html'), {force: true});
    fs.chmodSync(dir, 0o555);
    let err;
    try {
      await themeEditShow('t', {cwd});
    } catch (e) {
      err = /** @type {any} */ (e);
    } finally {
      fs.chmodSync(dir, 0o755);
    }
    expect(err?.code).toBe('ERR_WRITE_FAILED');
    expect(String(err?.message)).toMatch(/themes\/t\/ cannot be written/);
  }, 240_000);

  it('pictures asked for in a read-only show are said not to be taken', async () => {
    const r = /** @type {any} */ (
      await showInside('t', {cwd, png: true, readOnly: true})
    );
    expect(r.data.pictures).toEqual([]);
    expect(r.data.pictureProblem).toMatch(/no picture was taken/);
  }, 240_000);
});

describe('the in-app preview', () => {
  it('add finds a preview renamed by hand instead of starting a second one', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 't'});
    await themeEditPreviewRemove('components', {cwd});
    fs.renameSync(
      path.join(cwd, 'src/app/theme-preview'),
      path.join(cwd, 'src/app/look'),
    );
    // The page goes into the renamed preview; no second preview starts.
    const r = /** @type {any} */ (
      await themeEditPreviewAdd(undefined, {cwd, template: 'components'})
    );
    expect(r.data.folder).toBe('src/app/look');
    expect(r.data.added).toEqual(['components']);
    expect(fs.existsSync(path.join(cwd, 'src/app/theme-preview'))).toBe(false);
    expect(
      fs.existsSync(path.join(cwd, 'src/app/look/theme-preview.json')),
    ).toBe(true);
  }, 240_000);

  it('a default page asked for again says only it was added', async () => {
    // A preview of its own with one default page missing (overview).
    const at = {cwd, path: 'src/app/again'};
    await themeEditPreviewAdd(undefined, {...at, theme: 't'});
    try {
      await themeEditPreviewRemove('overview', at);
      await themeEditPreviewRemove('components', at);
      const r = /** @type {any} */ (
        await themeEditPreviewAdd(undefined, {...at, template: 'components'})
      );
      const notes = r.data.notes.join('\n');
      expect(notes).not.toMatch(
        /brings back the default pages that are missing, as/,
      );
      expect(r.data.added).toEqual(['components']);
      expect(notes).toMatch(
        /only components was added; .*preview add with no page brings back the other default pages that are missing \(overview/,
      );
    } finally {
      await themeEditPreviewRemove(undefined, at);
    }
  }, 240_000);

  it('a page remove over a theme that does not parse names the whole-preview remove', async () => {
    await themeEditPreviewAdd(undefined, {cwd});
    const ts = path.join(cwd, 'themes/t/t.theme.ts');
    const was = fs.readFileSync(ts, 'utf8');
    fs.appendFileSync(ts, '\nexport default {{{ broken\n');
    let err;
    try {
      await themeEditPreviewRemove('overview', {cwd});
    } catch (e) {
      err = /** @type {any} */ (e);
    } finally {
      fs.writeFileSync(ts, was);
    }
    expect(err?.code).toBe('ERR_THEME_INVALID');
    expect(
      (err.suggestions ?? []).map((/** @type {any} */ s) => s.name).join('\n'),
    ).toMatch(/preview remove$/m);
  }, 240_000);

  it('the remove help says what happens to a path outside the folder', () => {
    expect(removeDoc.description).toMatch(
      /dropped from the record and named in a note/,
    );
  });
});

describe('a workspace app', () => {
  it('a theme the route imports from outside the project folder is not gone', async () => {
    const web = path.join(cwd, 'apps/web');
    fs.mkdirSync(path.join(web, 'app'), {recursive: true});
    fs.writeFileSync(
      path.join(web, 'package.json'),
      JSON.stringify({
        name: 'web',
        dependencies: {next: '15.0.0', '@astryxdesign/core': '*'},
      }),
    );
    fs.writeFileSync(
      path.join(web, 'app/layout.tsx'),
      'export default function L({children}) { return children; }\n',
    );
    // Added from the workspace root, as a workspace app's preview is.
    const aside = path.join(cwd, 'src/app-aside');
    fs.renameSync(path.join(cwd, 'src/app'), aside);
    const at = path.join(web, 'app/theme-preview');
    try {
      await themeEditPreviewAdd(undefined, {
        cwd,
        theme: 't',
        path: 'apps/web/app/theme-preview',
      });
    } finally {
      fs.renameSync(aside, path.join(cwd, 'src/app'));
    }
    let err;
    try {
      await themeEditPreviewRemove('components', {cwd: web});
    } catch (e) {
      err = /** @type {any} */ (e);
    }
    expect(String(err?.message)).toMatch(/outside this project folder/);
    expect(
      JSON.parse(fs.readFileSync(path.join(at, 'theme-preview.json'), 'utf8'))
        .theme,
    ).toBe('t');
  }, 240_000);
});
