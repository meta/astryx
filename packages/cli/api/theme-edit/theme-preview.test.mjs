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
import {
  appPackages,
  projectFiles,
  refusal,
} from '../../test-utils/theme-edit-fixture.mjs';

// The page renders cost seconds and these tests read settings, builds and
// files: a stand-in renders unless a test asks for the real thing.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ts = createRequire(path.join(CLI, 'package.json'))('typescript');
const APP_PACKAGES = appPackages({stylex: true});
const REPO = path.resolve(CLI, '../..');

/** @type {string} */
let cwd;
const {read} = projectFiles(() => cwd);

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
 * @param {Record<string, unknown>} [extra] more compiler options
 * @returns {string[]}
 */
function typeErrors(dir, all = false, extra = {}) {
  const config = JSON.parse(
    fs.readFileSync(path.join(CLI, 'assets/preview-app/tsconfig.json'), 'utf8'),
  );
  const {options} = ts.convertCompilerOptionsFromJson(
    {...config.compilerOptions, ...extra, incremental: false, plugins: []},
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
  it('refuses with no routes folder, naming the Next apps below and preview app', async () => {
    const r = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
    expect(r.code).toBe('ERR_NOT_FOUND');
    expect(r.run.join(' ')).not.toContain('--path app/theme-preview');
    expect(r.run.join(' ')).toContain('preview app theme-app');
    // A routes folder made by --path has no root layout: refused, unwritten.
    const made = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: 'app/theme-preview'}),
    );
    expect(made.message).toContain('has no root layout');
    expect(fs.existsSync(path.join(cwd, 'app'))).toBe(false);
    // A workspace root names the Next app below it, run from its folder.
    const web = path.join(cwd, 'apps/web');
    fs.mkdirSync(path.join(web, 'src/app'), {recursive: true});
    fs.writeFileSync(
      path.join(web, 'package.json'),
      '{"name": "web", "dependencies": {"next": "*"}}\n',
    );
    fs.writeFileSync(
      path.join(web, 'src/app/layout.tsx'),
      'export default 1;\n',
    );
    try {
      const ws = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
      expect(ws.message).toContain('the Next app below is apps/web/');
      expect(ws.run[0]).toBe(
        'cd apps/web && astryx experimental theme preview add',
      );
    } finally {
      fs.rmSync(path.join(cwd, 'apps'), {recursive: true, force: true});
    }
  });

  it('writes the route, the default pages and the data file in the app routes folder', async () => {
    fs.mkdirSync(path.join(cwd, 'src', 'app'), {recursive: true});
    // A routes folder has a root layout, which loads Core's stylesheet.
    if (!fs.existsSync(path.join(cwd, 'src/app/layout.tsx')))
      fs.writeFileSync(
        path.join(cwd, 'src/app/layout.tsx'),
        "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
      );
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
    // Strict flags common in Next apps (create-t3-app, @tsconfig/strictest).
    expect(
      typeErrors(dir, false, {
        noUncheckedIndexedAccess: true,
        noImplicitOverride: true,
        noUnusedLocals: true,
      }),
    ).toEqual([]);
  }, 120_000);

  it('writes a one-mode route that imports only what it draws, and says what leaving out --theme does', async () => {
    await themeEditNew('lo', {
      cwd,
      like: 'neutral',
      settings: {mode: 'light-only'},
    });
    const dir = path.join(cwd, 'src/app/lo');
    try {
      await themeEditPreviewAdd(undefined, {
        cwd,
        theme: 'lo',
        path: 'src/app/lo',
      });
      const route = read('src/app/lo/page.tsx');
      expect(route).not.toContain('SegmentedControl');
      expect(
        typeErrors(dir, false, {
          noUncheckedIndexedAccess: true,
          noUnusedLocals: true,
        }),
      ).toEqual([]);
      // With a preview that wears lo, leaving out --theme keeps lo.
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {
          cwd,
          theme: 'neutral',
          path: 'src/app/lo',
        }),
      );
      expect(r.message).toContain(
        'leave out --theme and the preview keeps wearing lo',
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.rmSync(path.join(cwd, 'themes/lo'), {recursive: true, force: true});
    }
  }, 240_000);

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
    // The seed reads as it is stored, never capitalized with the color name.
    expect(source).toContain("textTransform: 'none'");
    expect(read('src/app/theme-preview/page.tsx')).toContain('label: "Colors"');
    expect(typeErrors(dir)).toEqual([]);
    // Strict flags common in Next apps (create-t3-app, @tsconfig/strictest).
    expect(
      typeErrors(dir, false, {
        noUncheckedIndexedAccess: true,
        noImplicitOverride: true,
        noUnusedLocals: true,
      }),
    ).toEqual([]);
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
    // A part its parent does not list as an item renders on its own, and
    // an overlay shows open once.
    expect(page).toContain('<Cell name="Heading">');
    expect(page).not.toContain('variant="fullscreen"');
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

describe('the components page', () => {
  it('shows what each doc sets up, and every cell suggests a command that runs', async () => {
    const page = read('src/app/theme-preview/_pages/components.tsx');
    // A doc for several components gives each its own playground.
    expect(page).toMatch(/<C\.Stack\b[^>]*>\s*<C\.Card/);
    // A nav that opens over the whole page is left out, as a drawer is.
    expect(page).not.toContain('<C.MobileNav');
    // A part as tall as the window scrolls in a frame, and a cell is only
    // as tall as its content.
    expect(page).toContain(
      '.tp-fill{flex:1 1 100%;max-height:300px;overflow:auto}',
    );
    expect(page).toContain('align-items:start}');
    // Pieces of a table render only inside a table.
    expect(page).not.toContain('<Safe name="TableBody">');
    // The route renders its pages only in the browser.
    expect(read('src/app/theme-preview/page.tsx')).toContain(
      '{ready ? <current.Page /> : null}',
    );
    // A part that only draws a line fills its row.
    expect(page).toMatch(
      /<div className="tp-item tp-fill">\s*<Safe name="Divider">/,
    );
    const cmds = [
      ...page.matchAll(/<code className="tp-cmd">\{("[^\n]*")\}<\/code>/g),
    ].map(m => /** @type {string} */ (JSON.parse(m[1])));
    expect(cmds.length).toBeGreaterThan(40);
    expect(cmds).toContain(
      'astryx experimental theme editor set brand --color-text-primary "<color>"',
    );
    for (const c of cmds) {
      const args = [...c.matchAll(/"([^"]*)"|(\S+)/g)]
        .map(m => m[1] ?? m[2])
        .map(w => w.replace('<color>', '#336699'))
        .slice(1);
      const r = await runCli(['--json', ...args], {cwd});
      expect(r.status, `${c}\n${r.stdout.slice(0, 300)}`).toBe(0);
      if (args[3] === 'set')
        await runCli(
          ['--json', 'experimental', 'theme', 'editor', 'undo', args[4]],
          {cwd},
        );
    }
  }, 600_000);
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
    fs.writeFileSync(
      path.join(bare, 'package.json'),
      '{"name": "bare", "dependencies": {"@astryxdesign/core": "*"}}\n',
    );
    try {
      const r = await themeEditPreviewList({cwd: bare});
      expect(r.data).toEqual({
        folder: null,
        theme: null,
        themeMissing: false,
        pages: [],
        // No preview, and add would refuse here: the note says why.
        notes: [expect.stringContaining('preview add refuses this folder')],
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

  it('drops a theme-preview.json path that leads outside the route folder, deleting nothing there', async () => {
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
    const r = await themeEditPreviewRemove(undefined, {
      cwd,
      path: 'src/app/escape',
    });
    expect(r.data.notes.join(' ')).toContain(
      'dropped "../../../keep-me.txt" from theme-preview.json',
    );
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
  it('names a cd that works for a folder named like a flag', async () => {
    const r = await themeEditPreviewApp('-k', {cwd});
    expect(r.data.open.startsWith('cd ./-k && npm install')).toBe(true);
    fs.rmSync(path.join(cwd, '-k'), {recursive: true, force: true});
  }, 120_000);

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
    // The base theme's fonts load, so the Overview shows the family it names.
    expect(read('fresh/src/app/globals.css')).toContain(
      '@import "@astryxdesign/theme-neutral/fonts.css";',
    );
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
    // A temp file a stopped command left in the theme folder stays behind.
    fs.writeFileSync(
      path.join(cwd, 'themes/brand/.brand.css.astryx-999999-abc123.tmp'),
      'half\n',
    );
    const r = await themeEditPreviewApp('themed', {cwd, theme: 'brand'});
    // The copied build was made on this project's base theme (the fixture's
    // is 0.0.0): the new app installs that version, and says so.
    expect(
      JSON.parse(read('themed/package.json')).dependencies[
        '@astryxdesign/theme-neutral'
      ],
    ).toBe('0.0.0');
    expect(r.data.notes.join(' ')).toContain(
      "the new app installs @astryxdesign/theme-neutral 0.0.0, the versions this project has and brand's build was made on",
    );
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
    expect(
      fs.existsSync(
        path.join(
          cwd,
          'themed/themes/brand/.brand.css.astryx-999999-abc123.tmp',
        ),
      ),
    ).toBe(false);
    fs.rmSync(
      path.join(cwd, 'themes/brand/.brand.css.astryx-999999-abc123.tmp'),
      {
        force: true,
      },
    );
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
    // A routes folder has a root layout, which loads Core's stylesheet.
    if (!fs.existsSync(path.join(app, 'src/app/layout.tsx')))
      fs.writeFileSync(
        path.join(app, 'src/app/layout.tsx'),
        "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
      );
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
    // The starter also names Node's types, which `next dev` would otherwise
    // install (and stall on with no network); the example gets them from the
    // workspace.
    expect(pkg.devDependencies).toEqual({
      ...ex.devDependencies,
      '@types/node': pkg.devDependencies['@types/node'],
    });
    expect(pkg.devDependencies['@types/node']).toBeTruthy();
  });
});
