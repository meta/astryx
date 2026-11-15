// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundred-and-twenty-first pass: the preview follows through. A
 * stop removes the render's temp folders; the static pages carry the root
 * Theme's attributes on <html>; every `preview app` pointer works where it
 * is printed (after `--` for a name starting with `-`, rebased onto a
 * subfolder, from the app that holds the theme, a repaired name free); a
 * starter app gets every open font the theme builds; a change names the
 * pictures it removed and keeps a section sheet's; and a theme that imports
 * a file outside its folder is not copied into a new app.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditPreviewAdd,
  themeEditPreviewApp,
} from './theme-edit.mjs';
import {previewCommandsFrom} from './_adapter.mjs';
import {recordWritten} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt121-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
}, 240_000);
afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
}
const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ s) => s.name).join('\n');

describe('a stop', () => {
  it('removes a temp folder tracked while its work runs, for each stop signal', async () => {
    for (const sig of /** @type {const} */ (['SIGINT', 'SIGTERM', 'SIGHUP'])) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-stopclean-'));
      const temp = path.join(dir, 'temp');
      const driver = path.join(dir, 'driver.mjs');
      fs.writeFileSync(
        driver,
        `import * as fs from 'node:fs';\nimport {removeOnStop} from ${JSON.stringify(pathToFileURL(path.join(here, '../../foundation/fs/stop-cleanup.mjs')).href)};\nfs.mkdirSync(${JSON.stringify(temp)});\nremoveOnStop(${JSON.stringify(temp)});\nprocess.stdout.write('ready');\nsetInterval(() => {}, 1000);\n`,
      );
      try {
        const child = spawn(process.execPath, [driver], {
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        await new Promise(r => child.stdout.once('data', r));
        const ended = new Promise(r => child.once('close', (_, s) => r(s)));
        child.kill(sig);
        expect(await ended).toBe(sig);
        expect(fs.existsSync(temp)).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    }
  }, 60_000);
});

describe('the static pages', () => {
  it("carry the root Theme's attributes on <html>, as a browser's root Theme sets them", async () => {
    await themeEditShow('t', {cwd});
    const html = fs.readFileSync(path.join(cwd, 'themes/t/sheet.html'), 'utf8');
    expect(html).toMatch(/<html lang="en" data-astryx-theme="t"[ >]/);
  }, 240_000);
});

describe('preview app pointers', () => {
  it('a folder name that starts with "-" goes after --, flags first', async () => {
    fs.mkdirSync(path.join(cwd, '-dash'), {recursive: true});
    fs.writeFileSync(path.join(cwd, '-dash/keep'), 'x');
    try {
      const e = await refusal(() => themeEditPreviewApp('-dash', {cwd}));
      expect(names(e)).toMatch(/preview app -- -dash-preview$/m);
      const t = await refusal(() =>
        themeEditPreviewApp('-dash', {cwd, theme: 't'}),
      );
      expect(names(t)).toMatch(/preview app --theme t -- -dash-preview$/m);
    } finally {
      fs.rmSync(path.join(cwd, '-dash'), {recursive: true, force: true});
    }
  }, 240_000);

  it('a repaired folder name is offered only free', async () => {
    fs.mkdirSync(path.join(cwd, 'x'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'x/keep'), 'x');
    try {
      const e = await refusal(() => themeEditPreviewApp('x ', {cwd}));
      expect(names(e)).toMatch(/preview app x-2$/m);
    } finally {
      fs.rmSync(path.join(cwd, 'x'), {recursive: true, force: true});
    }
  }, 240_000);

  it('from a subfolder, the see line names a folder that works from there', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('t', 'accent', '#ff0066', {
        cwd: path.join(cwd, 'themes/t'),
      })
    );
    expect(r.data.see).toMatch(/preview app \.\.\/\.\.\/theme-app --theme t/);
    expect(
      previewCommandsFrom(
        'cd /r && astryx experimental theme preview add --path apps/web/x',
        '/r',
        '/r/apps/web',
      ),
    ).toBe('cd /r && astryx experimental theme preview add --path apps/web/x');
  }, 240_000);

  it("from a root, the starter line for a workspace app's theme runs from that app", async () => {
    const web = path.join(cwd, 'apps/web');
    fs.mkdirSync(path.join(web, 'app'), {recursive: true});
    fs.mkdirSync(path.join(web, 'themes/w'), {recursive: true});
    fs.writeFileSync(path.join(web, 'themes/w/w.settings.json'), '{}');
    fs.writeFileSync(
      path.join(web, 'package.json'),
      JSON.stringify({name: 'web', dependencies: {next: '*'}}),
    );
    fs.writeFileSync(
      path.join(web, 'app/layout.tsx'),
      'export default function L({children}) { return children; }\n',
    );
    try {
      const e = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, theme: 'w'}),
      );
      expect(names(e)).toMatch(
        /^cd apps\/web && .*preview app theme-app --theme w/m,
      );
      expect(names(e)).not.toMatch(
        /^astryx experimental theme preview app .*--theme w/m,
      );
    } finally {
      fs.rmSync(path.join(cwd, 'apps'), {recursive: true, force: true});
    }
  }, 240_000);
});

describe('a starter app and a change', () => {
  it('a starter app gets every open font the theme builds, installed here or not', async () => {
    await themeEditSet('t', '--font-family-heading', 'Inter, sans-serif', {
      cwd,
    });
    await themeEditPreviewApp('fb', {cwd, theme: 't'});
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, 'fb/package.json'), 'utf8'),
    );
    expect(Object.keys(pkg.dependencies)).toContain('@fontsource/inter');
  }, 240_000);

  it('a change names the pictures it removed, and keeps a section sheet’s', async () => {
    const dir = path.join(cwd, 'themes/t');
    const files = ['preview.png', 'sheet-dark.png', 'sheet-inputs.png'].map(n =>
      path.join(dir, n),
    );
    for (const f of files) fs.writeFileSync(f, `shot ${path.basename(f)}`);
    recordWritten(cwd, 't', files);
    const r = /** @type {any} */ (
      await themeEditSet('t', 'corners', 'pill', {cwd})
    );
    const note = r.data.notes.find((/** @type {string} */ n) =>
      n.startsWith('removed '),
    );
    expect(note).toMatch(/themes\/t\/preview\.png/);
    expect(note).toMatch(/themes\/t\/sheet-dark\.png/);
    expect(note).not.toMatch(/sheet-inputs/);
    expect(fs.existsSync(path.join(dir, 'sheet-inputs.png'))).toBe(true);
  }, 240_000);

  it('a theme that imports a file outside its folder is not copied into a new app', async () => {
    const ts = path.join(cwd, 'themes/t/t.theme.ts');
    const was = fs.readFileSync(ts, 'utf8');
    fs.mkdirSync(path.join(cwd, 'shared'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'shared/brand.ts'),
      'export const b = 1;\n',
    );
    fs.writeFileSync(
      ts,
      `import {b} from '../../shared/brand';\nvoid b;\n${was}`,
    );
    try {
      const e = await refusal(() =>
        themeEditPreviewApp('pa', {cwd, theme: 't'}),
      );
      expect(String(e.message)).toMatch(
        /imports '\.\.\/\.\.\/shared\/brand', a file outside themes\/t\//,
      );
      expect(fs.existsSync(path.join(cwd, 'pa'))).toBe(false);
    } finally {
      fs.writeFileSync(ts, was);
    }
  }, 240_000);
});
