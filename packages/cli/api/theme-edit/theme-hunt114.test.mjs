// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundred-and-fourteenth pass: the preview follows through. A
 * workspace app's folders get that app's own checks from the root; every
 * pointer is one its command takes (an add only where add takes the
 * folder, a starter folder that is free in every sense, a theme found in
 * the app that holds it); starter package names never collide; a stop
 * after pictures names a picture command; and a preview moved into a folder
 * with an odd name is updated where it is.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditPreviewAdd,
  themeEditPreviewApp,
} from './theme-edit.mjs';
import {stoppedAfterSave} from './_edit.mjs';
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

const LAYOUT =
  "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n";

/** @type {string} */
let cwd;
beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt114-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  fs.writeFileSync(path.join(cwd, 'src/app/layout.tsx'), LAYOUT);
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

/** Run with the app's routes folder moved aside. @param {() => Promise<void>} run */
async function withoutRoutes(run) {
  const aside = path.join(cwd, 'src/app-aside');
  fs.renameSync(path.join(cwd, 'src/app'), aside);
  try {
    await run();
  } finally {
    fs.renameSync(aside, path.join(cwd, 'src/app'));
  }
}

describe('pointers its command takes', () => {
  it('with no routes folder, no pointer names preview add', async () => {
    await withoutRoutes(async () => {
      const e = await refusal(() => themeEditPreviewApp('public/pp', {cwd}));
      expect(names(e)).not.toMatch(/preview add/);
      const r = /** @type {any} */ (
        await themeEditSet('t', 'accent', '#ff0066', {cwd})
      );
      expect(r.data.see).not.toMatch(/preview add/);
      expect(r.data.see).toMatch(/preview app \S+ --theme t/);
    });
  }, 240_000);

  it('a starter folder is passed over when a case twin or a dangling link has its name', async () => {
    fs.mkdirSync(path.join(cwd, 'Theme-App'));
    fs.writeFileSync(path.join(cwd, 'Theme-App/x'), 'x');
    fs.symlinkSync(path.join(cwd, 'no-such'), path.join(cwd, 'theme-app-2'));
    try {
      const e = await refusal(() => themeEditPreviewApp('public/pp', {cwd}));
      expect(names(e)).toMatch(/preview app theme-app-3/);
    } finally {
      fs.rmSync(path.join(cwd, 'Theme-App'), {recursive: true, force: true});
      fs.rmSync(path.join(cwd, 'theme-app-2'), {force: true});
    }
  }, 240_000);

  it('a stop during the pictures names the command that takes them', () => {
    const writes = /** @type {string[]} */ ([]);
    const spy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(s => (writes.push(String(s)), true));
    const sigint = process.listenerCount('SIGINT');
    // A listener keeps the stop from ending the test process.
    const keep = () => {};
    process.on('SIGINT', keep);
    try {
      stoppedAfterSave('t', 'set', cwd, true)('SIGINT');
    } finally {
      process.removeListener('SIGINT', keep);
      spy.mockRestore();
    }
    expect(process.listenerCount('SIGINT')).toBe(sigint);
    expect(writes.join('')).toMatch(/editor show t --png runs them/);
  });

  it('every retry of add keeps --top', async () => {
    await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/one/tp'});
    await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/two/tp'});
    try {
      const e = await refusal(() =>
        themeEditPreviewAdd('a settings page', {cwd, top: 2}),
      );
      expect(names(e)).toMatch(/--top 2 --path/);
    } finally {
      fs.rmSync(path.join(cwd, 'src/app/one'), {recursive: true, force: true});
      fs.rmSync(path.join(cwd, 'src/app/two'), {recursive: true, force: true});
      fs.rmSync(path.join(cwd, 'themes/t/t.previews.json'), {force: true});
    }
  }, 240_000);

  it('a preview moved into a folder with a space is updated where it is', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 't'});
    fs.renameSync(
      path.join(cwd, 'src/app/theme-preview'),
      path.join(cwd, 'src/app/my preview'),
    );
    const r = /** @type {any} */ (await themeEditPreviewAdd(undefined, {cwd}));
    expect(r.data.folder).toMatch(/my preview/);
    fs.rmSync(path.join(cwd, 'src/app/my preview'), {
      recursive: true,
      force: true,
    });
  }, 240_000);
});

describe('starter apps and workspaces', () => {
  it('starter names never collide: a.b, a-b and A_B differ', async () => {
    for (const d of ['apps/a.b', 'apps/a-b', 'apps/A_B'])
      await themeEditPreviewApp(d, {cwd});
    const nameOf = (/** @type {string} */ d) =>
      JSON.parse(fs.readFileSync(path.join(cwd, d, 'package.json'), 'utf8'))
        .name;
    const all = ['apps/a.b', 'apps/a-b', 'apps/A_B'].map(nameOf);
    expect(new Set(all).size).toBe(3);
  }, 240_000);

  it("from the root, a workspace app's folders get that app's own checks", async () => {
    const e = await refusal(() =>
      themeEditPreviewAdd(undefined, {
        cwd,
        path: 'apps/a-b/src/app/_private/tp',
      }),
    );
    expect(String(e.message)).toMatch(/no place for the preview/);
    const pub = await refusal(() =>
      themeEditPreviewApp('apps/a-b/public/x', {cwd}),
    );
    expect(String(pub.message)).toMatch(/public\//);
  }, 240_000);

  it('a theme of a workspace app is found there, with the command run from it', async () => {
    const web = path.join(cwd, 'apps/a-b');
    fs.mkdirSync(path.join(web, 'themes/w'), {recursive: true});
    fs.writeFileSync(path.join(web, 'themes/w/w.settings.json'), '{}');
    const e = await refusal(() =>
      themeEditPreviewApp('demo', {cwd, theme: 'w'}),
    );
    expect(names(e)).toMatch(/^cd apps\/a-b && .*preview app demo --theme w$/m);
  }, 240_000);
});
