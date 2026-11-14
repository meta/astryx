// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The hundred-and-fifth pass: the preview follows through. A theme
 * the route imports from outside the project folder is kept by add as by
 * remove; two starter apps never share a package name; suggestions name
 * only what works when followed (the app's own folder, a free folder, a
 * page the app can show); and the stylesheet note reads real imports.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt105-', FIXTURE_PACKAGES);
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

describe('suggestions that work when followed', () => {
  it('an empty --template names a page this app can show', async () => {
    const e = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: ''}),
    );
    const id = /--template (\S+)/.exec(names(e))?.[1];
    if (id) {
      const r = /** @type {any} */ (
        await themeEditPreviewAdd(undefined, {cwd, template: id})
      );
      expect(r.data.added).toContain(id);
      await themeEditPreviewRemove(undefined, {cwd});
    }
  }, 240_000);

  it('the stylesheet note reads real imports, not a commented one', async () => {
    const layout = path.join(cwd, 'src/app/layout.tsx');
    fs.writeFileSync(
      layout,
      "// import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
    );
    try {
      const r = /** @type {any} */ (
        await themeEditPreviewAdd(undefined, {cwd, theme: 't'})
      );
      expect(r.data.notes.join('\n')).toMatch(
        /does not import Core's stylesheet/,
      );
    } finally {
      fs.writeFileSync(layout, LAYOUT);
      await themeEditPreviewRemove(undefined, {cwd});
    }
  }, 240_000);
});

describe('starter apps', () => {
  it('two starter apps in one project never share a package name', async () => {
    await themeEditPreviewApp('apps/one', {cwd});
    await themeEditPreviewApp('apps/two', {cwd});
    const name = (/** @type {string} */ d) =>
      JSON.parse(fs.readFileSync(path.join(cwd, d, 'package.json'), 'utf8'))
        .name;
    expect(name('apps/one')).not.toBe(name('apps/two'));
  }, 240_000);
});

describe('a workspace', () => {
  it('from the root, the app below is named with its own folder', async () => {
    const aside = path.join(cwd, 'src/app-aside');
    fs.renameSync(path.join(cwd, 'src/app'), aside);
    try {
      const e = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
      expect(names(e)).toMatch(/^cd apps\/one && .*preview add$/m);
      expect(names(e)).not.toMatch(/--path apps\//);
    } finally {
      fs.renameSync(aside, path.join(cwd, 'src/app'));
    }
  }, 240_000);

  it('add from the app folder keeps a theme the route imports from outside it', async () => {
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
      "import '@astryxdesign/core/astryx.css';\nexport default function L({children}) { return children; }\n",
    );
    const aside = path.join(cwd, 'src/app-aside');
    fs.renameSync(path.join(cwd, 'src/app'), aside);
    try {
      await themeEditPreviewAdd(undefined, {
        cwd,
        theme: 't',
        path: 'apps/web/app/theme-preview',
      });
    } finally {
      fs.renameSync(aside, path.join(cwd, 'src/app'));
    }
    const at = path.join(web, 'app/theme-preview');
    const e = await refusal(() => themeEditPreviewAdd(undefined, {cwd: web}));
    expect(String(e.message)).toMatch(/outside this project folder/);
    expect(names(e)).toMatch(
      /preview add --path apps\/web\/app\/theme-preview/,
    );
    // The suggestion is the same command: --template, or a description
    // with --top, kept.
    const template = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd: web, template: 'blank'}),
    );
    expect(names(template)).toMatch(
      /^cd .* && .*preview add --template blank --path apps\/web\/app\/theme-preview$/m,
    );
    const top = await refusal(() =>
      themeEditPreviewAdd('a settings page', {cwd: web, top: 2}),
    );
    expect(names(top)).toMatch(
      /^cd .* && .*preview add 'a settings page' --top 2 --path apps\/web\/app\/theme-preview$/m,
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(at, 'theme-preview.json'), 'utf8'))
        .theme,
    ).toBe('t');
  }, 240_000);
});
