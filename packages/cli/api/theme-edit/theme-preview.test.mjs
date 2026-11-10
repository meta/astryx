// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental theme preview`: the in-app preview route, its
 * pages and data file, the refusals, and the starter app made by `--app`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditPreviewAdd,
  themeEditPreviewList,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = path.resolve(CLI, '../..');

/** @type {string} */
let cwd;

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-preview-', [
    '@astryxdesign',
    'react',
    'react-dom',
  ]);
  await themeEditNew('brand', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('preview add', () => {
  it('refuses with no routes folder, naming --path and --app', async () => {
    const r = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
    expect(r.code).toBe('ERR_NOT_FOUND');
    expect(r.run.join(' ')).toContain('add --path <dir>');
    expect(r.run.join(' ')).toContain('add --app <dir>');
  });

  it('writes the route, the default pages and the data file in the app routes folder', async () => {
    fs.mkdirSync(path.join(cwd, 'src', 'app'), {recursive: true});
    const r = await themeEditPreviewAdd(undefined, {cwd});
    expect(r.type).toBe('themeEdit.previewAdd');
    expect(r.data.folder).toBe('src/app/theme-preview');
    expect(r.data.theme).toBe('brand');
    expect(r.data.added).toEqual(['overview', 'components']);
    expect(r.data.open).toContain('/theme-preview');
    const route = read('src/app/theme-preview/page.tsx');
    expect(route).toContain("from '@astryxdesign/core/AppShell'");
    expect(route).toContain('<SideNavItem');
    expect(route).toContain('<SegmentedControlItem value="system"');
    expect(route).toContain('brandTheme as theme');
    expect(route).not.toMatch(/<html|<body/);
    expect(read('src/app/theme-preview/pages/components.tsx')).toContain(
      'export default function ComponentsPage',
    );
    const data = JSON.parse(read('src/app/theme-preview/theme-preview.json'));
    expect(data.pages.map((/** @type {any} */ p) => p.id)).toEqual([
      'overview',
      'components',
    ]);
    expect(data.files).toContain('page.tsx');
  }, 120_000);

  it('adds the page template the build ranking picks for a description', async () => {
    const r = await themeEditPreviewAdd('an analytics dashboard', {cwd});
    expect(r.data.added).toHaveLength(1);
    const id = r.data.added[0];
    expect(
      fs.existsSync(path.join(cwd, 'src/app/theme-preview/pages', `${id}.tsx`)),
    ).toBe(true);
    expect(read('src/app/theme-preview/page.tsx')).toContain(`./pages/${id}`);
    const list = await themeEditPreviewList({cwd});
    expect(list.data.pages.map(p => p.id)).toEqual([
      'overview',
      'components',
      id,
    ]);
  }, 120_000);

  it('never replaces a file it did not write', async () => {
    const other = path.join(cwd, 'src', 'app', 'other');
    fs.mkdirSync(other, {recursive: true});
    fs.writeFileSync(path.join(other, 'page.tsx'), 'export default 1;\n');
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: 'src/app/other'}),
    );
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(fs.readFileSync(path.join(other, 'page.tsx'), 'utf8')).toBe(
      'export default 1;\n',
    );
  }, 120_000);

  it('refuses a --path outside the project', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: '../elsewhere'}),
    );
    expect(r.code).toBe('ERR_PATH_TRAVERSAL');
  });
});

describe('preview remove', () => {
  it('removes one page, then the whole preview, deleting only its own files', async () => {
    const one = await themeEditPreviewRemove('components', {cwd});
    expect(one.data.pages).not.toContain('components');
    expect(
      fs.existsSync(
        path.join(cwd, 'src/app/theme-preview/pages/components.tsx'),
      ),
    ).toBe(false);
    expect(read('src/app/theme-preview/page.tsx')).not.toContain(
      './pages/components',
    );
    fs.writeFileSync(
      path.join(cwd, 'src/app/theme-preview/notes.md'),
      'mine\n',
    );
    const all = await themeEditPreviewRemove(undefined, {cwd});
    expect(all.data.pages).toEqual([]);
    expect(
      fs.existsSync(path.join(cwd, 'src/app/theme-preview/page.tsx')),
    ).toBe(false);
    expect(read('src/app/theme-preview/notes.md')).toBe('mine\n');
    expect((await themeEditPreviewList({cwd})).data.folder).toBe(null);
  }, 120_000);
});

describe('preview add --app', () => {
  it('writes a starter app with Astryx pinned to this release and the preview route in it', async () => {
    const version = JSON.parse(
      fs.readFileSync(path.join(CLI, 'package.json'), 'utf8'),
    ).version;
    const r = await themeEditPreviewAdd(undefined, {cwd, app: 'fresh'});
    expect(r.data.app?.folder).toBe('fresh');
    expect(r.data.open).toContain('npm install && npm run dev');
    const pkg = JSON.parse(read('fresh/package.json'));
    expect(pkg.dependencies['@astryxdesign/core']).toBe(version);
    expect(pkg.dependencies['@astryxdesign/theme-neutral']).toBe(version);
    for (const f of [
      'next.config.mjs',
      'tsconfig.json',
      '.gitignore',
      'src/app/layout.tsx',
      'src/app/globals.css',
      'src/app/providers.tsx',
      'src/app/page.tsx',
      'src/app/theme-preview/page.tsx',
    ])
      expect(fs.existsSync(path.join(cwd, 'fresh', f)), f).toBe(true);
  }, 120_000);

  it('refuses a folder that is not empty', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, app: 'fresh'}),
    );
    expect(r.code).toBe('ERR_FILE_EXISTS');
  });

  it('works outside a project', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-bare-'));
    try {
      const r = await themeEditPreviewAdd(undefined, {cwd: bare, app: 'app'});
      expect(r.data.app?.files).toContain('app/package.json');
      const none = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd: bare}),
      );
      expect(none.code).toBe('ERR_PROJECT_REQUIRED');
      expect(none.run.join(' ')).toContain('--app <dir>');
    } finally {
      fs.rmSync(bare, {recursive: true, force: true});
    }
  }, 120_000);

  it('keeps the starter files the same as the repository example app', () => {
    const starter = path.join(CLI, 'assets', 'preview-app');
    const example = path.join(REPO, 'apps', 'example-nextjs');
    for (const f of [
      'next.config.mjs',
      'tsconfig.json',
      'css.d.ts',
      'src/app/layout.tsx',
      'src/app/globals.css',
      'src/app/providers.tsx',
      'src/app/page.tsx',
    ])
      expect(fs.readFileSync(path.join(starter, f), 'utf8'), f).toBe(
        fs.readFileSync(path.join(example, f), 'utf8'),
      );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(starter, 'package.json'), 'utf8'),
    );
    const ex = JSON.parse(
      fs.readFileSync(path.join(example, 'package.json'), 'utf8'),
    );
    for (const [name, range] of Object.entries(ex.dependencies))
      expect(pkg.dependencies[name], name).toBe(
        name.startsWith('@astryxdesign/') ? '{{astryxVersion}}' : range,
      );
    expect(pkg.devDependencies).toEqual(ex.devDependencies);
  });
});
