// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental theme preview`: the in-app preview route, its
 * pages and data file, the refusals, and the starter app made by `app`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewList,
  themeEditPreviewRemove,
} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

// The page renders cost seconds and these tests read settings, builds and
// files: a stand-in renders unless a test asks for the real thing.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(path.join(CLI, 'package.json'))('typescript');
/** The packages the template pages import, so the ranked pages can be added. */
const APP_PACKAGES = {
  name: 'app',
  private: true,
  type: 'module',
  dependencies: {
    '@heroicons/react': '*',
    '@stylexjs/stylex': '*',
    'lucide-react': '*',
    recharts: '*',
  },
};
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
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');

/** Files under `dir`, relative, or [] when it does not exist. @param {string} dir */
const filesUnder = dir =>
  fs.existsSync(dir)
    ? /** @type {string[]} */ (fs.readdirSync(dir, {recursive: true})).sort()
    : [];

/**
 * Type errors in the .tsx files under `dir`, checked with the starter app's
 * compiler options against Core's types.
 * @param {string} dir
 * @param {boolean} [all] also the .ts files, outside node_modules
 * @returns {string[]}
 */
function typeErrors(dir, all = false) {
  const config = JSON.parse(
    fs.readFileSync(path.join(CLI, 'assets/preview-app/tsconfig.json'), 'utf8'),
  );
  const {options} = ts.convertCompilerOptionsFromJson(
    {...config.compilerOptions, incremental: false, plugins: []},
    cwd,
  );
  const files = [
    path.join(CLI, 'assets/preview-app/css.d.ts'),
    ...filesUnder(dir)
      .filter(
        f =>
          (f.endsWith('.tsx') || (all && f.endsWith('.ts'))) &&
          !f.split(path.sep).includes('node_modules') &&
          !f.endsWith('.d.ts'),
      )
      .map(f => path.join(dir, f)),
  ];
  return ts
    .getPreEmitDiagnostics(ts.createProgram(files, options))
    .map(
      (/** @type {any} */ d) =>
        `${d.file ? path.relative(dir, d.file.fileName) : ''}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
    );
}

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-preview-', [
    ...FIXTURE_PACKAGES,
    '@types/react',
    '@types/react-dom',
    // The template pages' packages are installed, not only named.
    '@heroicons/react',
    '@stylexjs/stylex',
    'lucide-react',
    'recharts',
  ]);
  // CI builds only Core, so the base theme is a fixture, not a built package.
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(APP_PACKAGES)}\n`,
  );
  await themeEditNew('brand', {cwd, like: 'neutral'});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('preview add', () => {
  it('refuses with no routes folder, naming --path and preview app', async () => {
    const r = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
    expect(r.code).toBe('ERR_NOT_FOUND');
    expect(r.run.join(' ')).toContain('add --path app/theme-preview');
    expect(r.run.join(' ')).toContain('preview app theme-app');
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
    expect(read('src/app/theme-preview/_pages/components.tsx')).toContain(
      'export default function ComponentsPage',
    );
    const data = JSON.parse(read('src/app/theme-preview/theme-preview.json'));
    expect(data.pages.map((/** @type {any} */ p) => p.id)).toEqual([
      'overview',
      'components',
    ]);
    expect(data.files).toContain('page.tsx');
  }, 120_000);

  it('writes pages and a route that type-check with the starter app settings', () => {
    const dir = path.join(cwd, 'src/app/theme-preview');
    expect(filesUnder(dir)).toEqual(
      expect.arrayContaining([
        'page.tsx',
        '_pages/overview.tsx',
        '_pages/components.tsx',
      ]),
    );
    for (const f of ['_pages/overview.tsx', '_pages/components.tsx'])
      expect(read(`src/app/theme-preview/${f}`)).not.toMatch(/__element|<XDS/);
    expect(typeErrors(dir)).toEqual([]);
  }, 120_000);

  it('adds a Colors page once the theme has generated colors, and keeps it in step', async () => {
    const dir = path.join(cwd, 'src/app/theme-preview');
    const page = 'src/app/theme-preview/_pages/colors.tsx';
    await themeEditSet('brand', 'accent', '#7c3aed', {cwd});
    const r = await themeEditPreviewAdd(undefined, {cwd});
    expect(r.data.added).toEqual(['colors']);
    expect(r.data.pages).toEqual(['overview', 'components', 'colors']);
    const source = read(page);
    expect(source).toContain(
      'import {palette} from "../../../../themes/brand/tokens/brand.palette";',
    );
    expect(source).toContain('"--color-accent"');
    expect(read('src/app/theme-preview/page.tsx')).toContain('label: "Colors"');
    expect(typeErrors(dir)).toEqual([]);
    // A later change rewrites the tokens that use each shade.
    await themeEditSet('brand', 'neutral', '#64748b', {cwd});
    expect(read(page)).toContain('"--color-background-surface"');
    // With no color left, the page stays and says how to set one.
    await themeEditUndo('brand', {cwd, thing: 'neutral'});
    await themeEditUndo('brand', {cwd, thing: 'accent'});
    expect(read(page)).not.toContain('palette');
    expect(read(page)).toContain('This theme sets no color yet');
    expect(typeErrors(dir)).toEqual([]);
    await themeEditPreviewRemove('colors', {cwd});
    expect(fs.existsSync(path.join(cwd, page))).toBe(false);
  }, 240_000);

  it('writes a components page whose parts work on their own and survive leaving the page', () => {
    const page = read('src/app/theme-preview/_pages/components.tsx');
    // A typeahead with no search source throws as it unmounts, past every
    // boundary, so leaving the page would crash the production route.
    for (const tag of page.match(
      /<C\.(Tokenizer|Typeahead|CommandPalette)\b[^>]*>/g,
    ) ?? [])
      expect(tag).toContain('searchSource={SAMPLE_SOURCE}');
    expect(page).toContain('const SAMPLE_SOURCE = {');
    // A status object takes the value as its type.
    expect(page).not.toMatch(
      /<C\.(Selector|Tokenizer|TextInput)\b[^>]*status="/,
    );
    expect(page).toContain('status={{"type":"error"}}');
    // A part renders inside its parent, or not at all.
    for (const [part, parent] of [
      ['Step', 'Stepper'],
      ['SegmentedControlItem', 'SegmentedControl'],
      ['RadioListItem', 'RadioList'],
    ]) {
      expect(page).not.toMatch(
        new RegExp(`<Safe name="${part}">\\s*<C\\.${part}\\b`),
      );
      expect(page).toMatch(
        new RegExp(`<Safe name="${part}">\\s*<C\\.${parent}\\b`),
      );
    }
    expect(page).not.toContain('<Safe name="DropdownMenuRadioItem">');
    expect(page).toMatch(/<C\.ButtonGroup [^>]*>\s*<C\.Button /);
    expect(page).toContain('could not render here');
    expect(read('src/app/theme-preview/_pages/overview.tsx')).not.toContain(
      'AppShell',
    );
  });

  it('names the install line while missing, and the preview imports it once installed', async () => {
    const pkgDir = path.join(cwd, 'node_modules', '@fontsource', 'inter');
    fs.rmSync(pkgDir, {recursive: true, force: true});
    const set = await themeEditSet('brand', 'font', 'inter', {cwd});
    const note = set.data.notes.join(' ');
    expect(note).toContain('Inter is not installed, so it does not load');
    expect(note).toMatch(
      /(npm install|pnpm add|yarn add|bun add) @fontsource\/inter/,
    );
    const route = 'src/app/theme-preview/page.tsx';
    expect(read(route)).not.toContain('@fontsource/inter');
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      '{"name": "@fontsource/inter", "version": "5.0.0", "main": "index.css"}\n',
    );
    fs.writeFileSync(path.join(pkgDir, 'index.css'), '');
    try {
      const show = await themeEditShow('brand', {cwd});
      expect(show.data.notes.join(' ')).toContain("import '@fontsource/inter'");
      expect(read(route)).toContain('import "@fontsource/inter/index.css";');
    } finally {
      fs.rmSync(path.join(cwd, 'node_modules', '@fontsource'), {
        recursive: true,
        force: true,
      });
      await themeEditUndo('brand', {cwd});
    }
  }, 120_000);

  it('adds the page template the build ranking picks for a description', async () => {
    const r = await themeEditPreviewAdd('an analytics dashboard', {cwd});
    expect(r.data.added).toHaveLength(1);
    const id = r.data.added[0];
    expect(
      fs.existsSync(
        path.join(cwd, 'src/app/theme-preview/_pages', `${id}.tsx`),
      ),
    ).toBe(true);
    expect(read('src/app/theme-preview/page.tsx')).toContain(`./_pages/${id}`);
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

describe('preview options and errors', () => {
  it('refuses conflicting or bad options before writing anything', async () => {
    const at = path.join(cwd, 'src/app/opts');
    for (const [
      words,
      opts,
    ] of /** @type {Array<[string | undefined, any]>} */ ([
      ['a sales dashboard', {template: 'table'}],
      ['a sales dashboard', {top: 4}],
      ['a sales dashboard', {top: 0}],
    ])) {
      const r = await refusal(() =>
        themeEditPreviewAdd(words, {cwd, path: 'src/app/opts', ...opts}),
      );
      expect(r.code).toBe('ERR_INVALID_ARGUMENT');
    }
    const theme = await refusal(() =>
      themeEditPreviewAdd(undefined, {
        cwd,
        path: 'src/app/opts',
        theme: 'nope',
      }),
    );
    expect(theme.code).toBe('ERR_UNKNOWN_THEME');
    const tpl = await refusal(() =>
      themeEditPreviewAdd(undefined, {
        cwd,
        path: 'src/app/opts',
        template: 'no-such-template',
      }),
    );
    expect(tpl.code).toBe('ERR_UNKNOWN_TEMPLATE');
    expect(filesUnder(at)).toEqual([]);
  }, 120_000);

  it('adds one named template, then the top ranked pages, wearing --theme', async () => {
    const one = await themeEditPreviewAdd(undefined, {
      cwd,
      path: 'src/app/opts',
      template: 'table',
      theme: 'brand',
    });
    expect(one.data.added).toEqual(['table']);
    expect(one.data.theme).toBe('brand');
    expect(one.data.skipped).toEqual([]);
    expect(read('src/app/opts/_pages/table.tsx')).toContain('export default');
    const two = await themeEditPreviewAdd('an analytics dashboard', {
      cwd,
      path: 'src/app/opts',
      top: 2,
    });
    expect(two.data.added.length).toBeGreaterThanOrEqual(1);
    expect(two.data.added.length).toBeLessThanOrEqual(2);
    expect(two.data.pages).toEqual(['table', ...two.data.added]);
  }, 120_000);

  it('lists and removes a preview at --path, and names the nearest page for an unknown one', async () => {
    const list = await themeEditPreviewList({cwd, path: 'src/app/opts'});
    expect(list.data.folder).toBe('src/app/opts');
    expect(list.data.theme).toBe('brand');
    const r = await refusal(() =>
      themeEditPreviewRemove('tabel', {cwd, path: 'src/app/opts'}),
    );
    expect(r.code).toBe('ERR_NOT_FOUND');
    expect(r.message).toContain('"tabel"');
    const one = await themeEditPreviewRemove('table', {
      cwd,
      path: 'src/app/opts',
    });
    expect(one.data.pages).not.toContain('table');
    await themeEditPreviewRemove(undefined, {cwd, path: 'src/app/opts'});
    expect(filesUnder(path.join(cwd, 'src/app/opts'))).toEqual([]);
  }, 120_000);

  it('skips a template page whose packages the app lacks, naming the install command, and writes nothing', async () => {
    const pkgFile = path.join(cwd, 'package.json');
    fs.writeFileSync(
      pkgFile,
      JSON.stringify({...APP_PACKAGES, dependencies: {}}),
    );
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {
          cwd,
          path: 'src/app/skip',
          template: 'dashboard',
        }),
      );
      expect(r.code).toBe('ERR_DEP_MISSING');
      expect(r.message).toContain('recharts');
      expect(r.run.join(' ')).toContain('recharts');
      expect(filesUnder(path.join(cwd, 'src/app/skip'))).toEqual([]);
    } finally {
      fs.writeFileSync(pkgFile, `${JSON.stringify(APP_PACKAGES)}\n`);
    }
  }, 120_000);

  it('skips a StyleX template page in an app with no StyleX compiler', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {
        cwd,
        path: 'src/app/stylex',
        template: 'kanban-board',
      }),
    );
    expect(r.code).toBe('ERR_DEP_MISSING');
    expect(r.message).toContain('StyleX');
    expect(filesUnder(path.join(cwd, 'src/app/stylex'))).toEqual([]);
  }, 120_000);

  it('refuses a theme that does not build before it writes any page', async () => {
    const broken = path.join(cwd, 'themes', 'broken');
    fs.mkdirSync(broken, {recursive: true});
    const settings = JSON.parse(read('themes/brand/brand.settings.json'));
    fs.writeFileSync(
      path.join(broken, 'broken.settings.json'),
      JSON.stringify({...settings, name: 'broken'}),
    );
    fs.writeFileSync(
      path.join(broken, 'broken.theme.ts'),
      'export const = ;\n',
    );
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {
          cwd,
          path: 'src/app/broken',
          theme: 'broken',
        }),
      );
      // The source no longer carries the settings: refused before the build.
      expect(r.code).toBe('ERR_THEME_INVALID');
      expect(filesUnder(path.join(cwd, 'src/app/broken'))).toEqual([]);
    } finally {
      fs.rmSync(broken, {recursive: true, force: true});
    }
  }, 120_000);

  it('lists no pages when there is no routes folder', async () => {
    const bare = path.join(cwd, 'bare-app');
    fs.mkdirSync(bare);
    fs.writeFileSync(path.join(bare, 'package.json'), '{"name": "bare"}\n');
    try {
      const r = await themeEditPreviewList({cwd: bare});
      expect(r.data).toEqual({
        folder: null,
        theme: null,
        pages: [],
        notes: [],
      });
    } finally {
      fs.rmSync(bare, {recursive: true, force: true});
    }
  });
});

describe('preview remove', () => {
  it('removes one page, then the whole preview, deleting only its own files', async () => {
    const one = await themeEditPreviewRemove('components', {cwd});
    expect(one.data.pages).not.toContain('components');
    expect(
      fs.existsSync(
        path.join(cwd, 'src/app/theme-preview/_pages/components.tsx'),
      ),
    ).toBe(false);
    expect(read('src/app/theme-preview/page.tsx')).not.toContain(
      './_pages/components',
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

  it('refuses a theme-preview.json path that leads outside the route folder, deleting nothing', async () => {
    const dir = path.join(cwd, 'src/app/escape');
    fs.mkdirSync(path.join(dir, 'pages'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'keep-me.txt'), 'keep\n');
    fs.writeFileSync(path.join(dir, 'page.tsx'), 'export default 1;\n');
    fs.writeFileSync(
      path.join(dir, 'theme-preview.json'),
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [{id: 'a', label: 'A', file: 'pages/a'}],
        files: ['page.tsx', '../../../keep-me.txt', 'theme-preview.json'],
      }),
    );
    const r = await refusal(() =>
      themeEditPreviewRemove(undefined, {cwd, path: 'src/app/escape'}),
    );
    expect(r.code).toBe('ERR_PATH_TRAVERSAL');
    expect(read('keep-me.txt')).toBe('keep\n');
    expect(fs.existsSync(path.join(dir, 'page.tsx'))).toBe(true);
    fs.rmSync(dir, {recursive: true, force: true});
    fs.rmSync(path.join(cwd, 'keep-me.txt'));
  });
});

describe('the preview commands succeed from the command line', () => {
  it('add, list and remove exit 0 with a JSON envelope each', async () => {
    /** @param {string[]} args */
    const ok = async args => {
      const r = await runCli(
        ['--json', 'experimental', 'theme', 'preview', ...args],
        {cwd},
      );
      expect(r.status, args.join(' ')).toBe(0);
      return JSON.parse(r.stdout);
    };
    expect((await ok(['add'])).type).toBe('themeEdit.previewAdd');
    expect((await ok(['list'])).data.pages).toHaveLength(2);
    expect((await ok(['remove', 'components'])).data.pages).toEqual([
      'overview',
    ]);
    expect((await ok(['remove'])).data.pages).toEqual([]);
  }, 120_000);
});

describe('preview app', () => {
  it('writes a starter app with Astryx pinned to this release and the preview route in it', async () => {
    const version = JSON.parse(
      fs.readFileSync(path.join(CLI, 'package.json'), 'utf8'),
    ).version;
    const r = await themeEditPreviewApp('fresh', {cwd});
    expect(r.type).toBe('themeEdit.previewApp');
    expect(r.data.folder).toBe('fresh');
    expect(r.data.theme).toBe(null);
    expect(r.data.pages).toEqual(['overview', 'components']);
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
      'src/app/theme-preview/_pages/overview.tsx',
      'src/app/theme-preview/_pages/components.tsx',
      'src/app/theme-preview/theme-preview.json',
    ]) {
      expect(fs.existsSync(path.join(cwd, 'fresh', f)), f).toBe(true);
      expect(r.data.files, f).toContain(`fresh/${f}`);
    }
    expect(typeErrors(path.join(cwd, 'fresh/src/app/theme-preview'))).toEqual(
      [],
    );
  }, 120_000);

  it('copies --theme into the app, and the pages wear it', async () => {
    // A color makes the theme import its generated colors from tokens/.
    await themeEditSet('brand', 'accent', '#7c3aed', {cwd});
    fs.writeFileSync(
      path.join(cwd, 'themes/brand/logo.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00, 0xfe]),
    );
    const r = await themeEditPreviewApp('themed', {cwd, theme: 'brand'});
    expect(read('themed/themes/brand/tokens/brand.palette.ts')).toBe(
      read('themes/brand/tokens/brand.palette.ts'),
    );
    expect(
      fs.readFileSync(path.join(cwd, 'themed/themes/brand/logo.png')),
    ).toEqual(fs.readFileSync(path.join(cwd, 'themes/brand/logo.png')));
    // The whole app type-checks, the theme folder included. The fixture has
    // no Next.js installed and a base theme without type declarations, so
    // only those two gaps are allowed.
    expect(
      typeErrors(path.join(cwd, 'themed'), true).filter(
        e => !/module 'next(\/|')|theme-neutral\/built'/.test(e),
      ),
    ).toEqual([]);
    fs.rmSync(path.join(cwd, 'themes/brand/logo.png'));
    expect(r.data.theme).toBe('brand');
    for (const f of [
      'brand.settings.json',
      'brand.settings.ts',
      'brand.theme.ts',
      'brand.js',
      'brand.css',
    ])
      expect(read(`themed/themes/brand/${f}`), f).toBe(
        read(`themes/brand/${f}`),
      );
    expect(
      fs.existsSync(path.join(cwd, 'themed/themes/brand/brand.d.ts')),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(cwd, 'themed/themes/brand/preview.html')),
    ).toBe(false);
    const route = read('themed/src/app/theme-preview/page.tsx');
    expect(route).toContain('from "../../../themes/brand/brand"');
    expect(route).toContain('import "../../../themes/brand/brand.css"');
    expect(typeErrors(path.join(cwd, 'themed/src/app/theme-preview'))).toEqual(
      [],
    );
    expect(route).toContain('brandTheme as theme');
    const data = JSON.parse(
      read('themed/src/app/theme-preview/theme-preview.json'),
    );
    expect(data.theme).toBe('brand');
    await themeEditUndo('brand', {cwd, thing: 'accent'});
  }, 120_000);

  it('refuses no folder, a folder that is not empty, and one outside the current folder', async () => {
    expect((await refusal(() => themeEditPreviewApp('', {cwd}))).code).toBe(
      'ERR_INVALID_ARGUMENT',
    );
    expect(
      (await refusal(() => themeEditPreviewApp('fresh', {cwd}))).code,
    ).toBe('ERR_FILE_EXISTS');
    expect(
      (await refusal(() => themeEditPreviewApp('../outside-app', {cwd}))).code,
    ).toBe('ERR_PATH_TRAVERSAL');
  });

  it('refuses an app folder that leads outside through a link, writing nothing', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-outside-'));
    try {
      fs.symlinkSync(outside, path.join(cwd, 'linked'), 'dir');
      const r = await refusal(() => themeEditPreviewApp('linked', {cwd}));
      expect(r.code).toBe('ERR_PATH_TRAVERSAL');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(path.join(cwd, 'linked'), {force: true});
      fs.rmSync(outside, {recursive: true, force: true});
    }
  }, 120_000);

  it('refuses a folder that is not empty, the project included, and names a free one', async () => {
    const app = path.join(cwd, 'mine');
    fs.mkdirSync(path.join(app, 'src/app'), {recursive: true});
    fs.writeFileSync(path.join(app, 'src/app/layout.tsx'), 'MY LAYOUT\n');
    try {
      const r = await refusal(() => themeEditPreviewApp('mine', {cwd}));
      expect(r.code).toBe('ERR_FILE_EXISTS');
      expect(r.message).toContain('mine exists and is not empty');
      expect(r.run[0]).toMatch(/preview app mine-preview$/);
      expect(read('mine/src/app/layout.tsx')).toBe('MY LAYOUT\n');
      expect((await refusal(() => themeEditPreviewApp('.', {cwd}))).code).toBe(
        'ERR_FILE_EXISTS',
      );
    } finally {
      fs.rmSync(app, {recursive: true, force: true});
    }
  }, 120_000);

  it('checks the folder before it builds the theme, so a refusal writes nothing', async () => {
    fs.mkdirSync(path.join(cwd, 'busy'));
    fs.writeFileSync(path.join(cwd, 'busy', 'notes.md'), 'mine\n');
    const js = path.join(cwd, 'themes/brand/brand.js');
    const before = fs.readFileSync(js, 'utf8');
    fs.rmSync(js);
    try {
      const r = await refusal(() =>
        themeEditPreviewApp('busy', {cwd, theme: 'brand'}),
      );
      expect(r.code).toBe('ERR_FILE_EXISTS');
      expect(fs.existsSync(js)).toBe(false);
      expect(fs.readdirSync(path.join(cwd, 'busy'))).toEqual(['notes.md']);
    } finally {
      fs.writeFileSync(js, before);
      fs.rmSync(path.join(cwd, 'busy'), {recursive: true, force: true});
    }
  }, 120_000);

  it('checks the theme before it makes the app, so a refusal makes nothing', async () => {
    const r = await refusal(() =>
      themeEditPreviewApp('never', {cwd, theme: 'nope'}),
    );
    expect(r.code).toBe('ERR_UNKNOWN_THEME');
    expect(fs.existsSync(path.join(cwd, 'never'))).toBe(false);
  }, 120_000);

  it('works outside a project, where add refuses and names app', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-bare-'));
    try {
      const r = await themeEditPreviewApp('app', {cwd: bare});
      expect(r.data.files).toContain('app/package.json');
      const none = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd: bare}),
      );
      expect(none.code).toBe('ERR_PROJECT_REQUIRED');
      expect(none.run.join(' ')).toContain('preview app <dir>');
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
