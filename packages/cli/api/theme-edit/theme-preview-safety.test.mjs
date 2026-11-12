// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx experimental theme preview`: what the preview commands do
 * with damaged data, files changed by hand, odd folders and refusals. A
 * refusal changes nothing, a file the preview did not write (or that was
 * changed since) is never replaced or deleted, and every result says what
 * happened.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditUndo,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewList,
  themeEditPreviewRemove,
  themeEditShow,
} from './theme-edit.mjs';
import {stopPreviewCommitAt} from './_preview-app.mjs';
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

const APP_PACKAGES = appPackages({packageManager: 'npm@10.9.0'});
const ROUTE = 'src/app/theme-preview';

/** @type {string} */
let cwd;
const {read, exists} = projectFiles(() => cwd);

/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), {recursive: true});
  fs.writeFileSync(path.join(cwd, rel), text);
};

/** A hash of every file and link outside node_modules, to prove a refusal wrote nothing. */
function tree() {
  const h = createHash('sha256');
  /** @param {string} dir */
  const walk = dir => {
    for (const e of fs
      .readdirSync(dir, {withFileTypes: true})
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      h.update(path.relative(cwd, p));
      if (e.isSymbolicLink()) h.update(`->${fs.readlinkSync(p)}`);
      else if (e.isDirectory()) walk(p);
      else h.update(fs.readFileSync(p));
    }
  };
  walk(cwd);
  return h.digest('hex');
}

/** @param {string[]} args */
const cli = args =>
  runCli(['--json', 'experimental', 'theme', 'preview', ...args], {cwd});

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-preview-safety-', [
    ...FIXTURE_PACKAGES,
    '@types/react',
    '@types/react-dom',
    '@heroicons/react',
    'lucide-react',
    'recharts',
  ]);
  writeFixtureBaseTheme(cwd, 'neutral');
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    `${JSON.stringify(APP_PACKAGES)}\n`,
  );
  fs.mkdirSync(path.join(cwd, 'src/app'), {recursive: true});
  // A routes folder has a root layout, which loads Core's stylesheet.
  if (!fs.existsSync(path.join(cwd, 'src/app/layout.tsx')))
    fs.writeFileSync(
      path.join(cwd, 'src/app/layout.tsx'),
      "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n",
    );
  await themeEditNew('brand', {cwd, like: 'neutral'});
  await themeEditSet('brand', 'accent', '#7c3aed', {cwd});
  await themeEditNew('sea', {cwd, like: 'neutral'});
}, 180_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

const ROOT_LAYOUT =
  "import '@astryxdesign/core/astryx.css';\nexport default function RootLayout({children}) { return children; }\n";

beforeEach(() => {
  for (const d of fs.readdirSync(path.join(cwd, 'src/app')))
    fs.rmSync(path.join(cwd, 'src/app', d), {recursive: true, force: true});
  // Every test starts from an app with its root layout.
  fs.writeFileSync(path.join(cwd, 'src/app/layout.tsx'), ROOT_LAYOUT);
  for (const t of ['brand', 'sea'])
    fs.rmSync(path.join(cwd, 'themes', t, 'previews.json'), {force: true});
});

describe('where the pages go', () => {
  it('writes the pages into _pages/, which Next never routes', async () => {
    const r = await themeEditPreviewAdd(undefined, {cwd, theme: 'brand'});
    expect(r.data.pages).toEqual(['overview', 'components', 'colors']);
    expect(exists(`${ROUTE}/_pages/overview.tsx`)).toBe(true);
    expect(exists(`${ROUTE}/pages`)).toBe(false);
    expect(read(`${ROUTE}/page.tsx`)).toContain('"./_pages/overview"');
  }, 120_000);

  it('moves a preview an older release wrote into pages/, keeping its files', async () => {
    write(
      `${ROUTE}/pages/mine.tsx`,
      'export default function M() { return null; }\n',
    );
    write(
      `${ROUTE}/pages/old.tsx`,
      'export default function O() { return null; }\n',
    );
    write(`${ROUTE}/page.tsx`, '// old route\n');
    write(
      `${ROUTE}/theme-preview.json`,
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [
          {id: 'old', label: 'Old', file: 'pages/old'},
          {id: 'mine', label: 'Mine', file: 'pages/mine'},
        ],
        files: ['pages/old.tsx', 'page.tsx', 'theme-preview.json'],
      }),
    );
    const r = await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    expect(read(`${ROUTE}/_pages/old.tsx`)).toContain('function O');
    expect(exists(`${ROUTE}/pages/old.tsx`)).toBe(false);
    // A page the preview did not write keeps its place.
    expect(exists(`${ROUTE}/pages/mine.tsx`)).toBe(true);
    expect(read(`${ROUTE}/page.tsx`)).toContain('"./_pages/old"');
    expect(read(`${ROUTE}/page.tsx`)).toContain('"./pages/mine"');
    expect(r.data.notes.join(' ')).toContain(
      'moved old from pages/ to _pages/',
    );
  }, 120_000);

  it('refuses --path that Next would route as pages, or that is reserved, writing nothing', async () => {
    write('src/app/page.tsx', 'export default 1;\n');
    const before = tree();
    for (const [where, code] of /** @type {const} */ ([
      ['pages/theme-preview', 'ERR_INVALID_ARGUMENT'],
      ['.', 'ERR_INVALID_ARGUMENT'],
      ['src', 'ERR_INVALID_ARGUMENT'],
      ['src/app', 'ERR_INVALID_ARGUMENT'],
      ['src/pages/pv', 'ERR_INVALID_ARGUMENT'],
      ['themes/pv', 'ERR_INVALID_ARGUMENT'],
      ['themes/brand', 'ERR_INVALID_ARGUMENT'],
      ['node_modules/pv', 'ERR_INVALID_ARGUMENT'],
      ['src/app/page.tsx', 'ERR_INVALID_ARGUMENT'],
      ['src\\app\\win', 'ERR_INVALID_ARGUMENT'],
      ['C:\\x', 'ERR_INVALID_ARGUMENT'],
      ['~/x', 'ERR_INVALID_ARGUMENT'],
      [' src/app/pv', 'ERR_INVALID_ARGUMENT'],
      ['src/app/_private/pv', 'ERR_INVALID_ARGUMENT'],
      ['src/app/@modal/pv', 'ERR_INVALID_ARGUMENT'],
      ['src/app/[slug]/pv', 'ERR_INVALID_ARGUMENT'],
      ['../x', 'ERR_PATH_TRAVERSAL'],
    ])) {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, path: where}),
      );
      expect(r.code, where).toBe(code);
      expect(r.run.length, where).toBeGreaterThan(0);
    }
    const win = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: 'src\\app\\win'}),
    );
    expect(win.run).toEqual([
      'astryx experimental theme preview add --path src/app/win',
    ]);
    expect(tree()).toBe(before);
  }, 120_000);

  it('opens a route group folder at its real URL, encoded', async () => {
    const group = await themeEditPreviewAdd(undefined, {
      cwd,
      path: 'src/app/(tools)/my preview',
    });
    expect(group.data.open).toBe('open /my%20preview in the running app');
  }, 120_000);

  it('finds a preview recorded with --path when no --path is given', async () => {
    await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 'sea',
      path: 'src/app/pv',
    });
    expect((await themeEditPreviewList({cwd})).data.folder).toBe('src/app/pv');
    const r = await themeEditPreviewRemove('components', {cwd});
    expect(r.data.folder).toBe('src/app/pv');
    await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 'sea',
      path: 'src/app/pv2',
    });
    const two = await refusal(() => themeEditPreviewList({cwd}));
    expect(two.code).toBe('ERR_INVALID_ARGUMENT');
    expect(two.run).toEqual([
      'astryx experimental theme preview list --path src/app/pv',
      'astryx experimental theme preview list --path src/app/pv2',
    ]);
  }, 120_000);
});

describe('damaged theme-preview.json', () => {
  for (const [label, text] of [
    ['not JSON', '{bad'],
    ['null', 'null'],
    ['a list', '[]'],
    [
      'files not a list',
      '{"version":1,"theme":null,"pages":[],"files":"page.tsx"}',
    ],
    ['no pages', '{"version":1,"theme":null,"files":["page.tsx"]}'],
    [
      'ids not objects',
      '{"version":1,"theme":null,"pages":["overview"],"files":[]}',
    ],
    ['a number in files', '{"version":1,"theme":null,"pages":[],"files":[5]}'],
    [
      'an absolute file',
      '{"version":1,"theme":null,"pages":[],"files":["/etc/passwd"]}',
    ],
    [
      'a page file outside pages',
      '{"version":1,"theme":null,"pages":[{"id":"a","label":"A","file":"../../../../etc/passwd"}],"files":[]}',
    ],
    [
      'a duplicate page',
      '{"version":1,"theme":null,"pages":[{"id":"a","label":"A","file":"_pages/a"},{"id":"a","label":"A","file":"_pages/a"}],"files":["_pages/a.tsx"]}',
    ],
    ['version 99', '{"version":99,"theme":null,"pages":[],"files":[]}'],
  ])
    it(`refuses ${label} in add, list and remove, naming the file and changing nothing`, async () => {
      write(`${ROUTE}/theme-preview.json`, text);
      write(`${ROUTE}/page.tsx`, 'export default 1;\n');
      write(`${ROUTE}/_pages/a.tsx`, 'export default 1;\n');
      const before = tree();
      for (const fn of [
        () => themeEditPreviewAdd(undefined, {cwd}),
        () => themeEditPreviewList({cwd}),
        () => themeEditPreviewRemove(undefined, {cwd}),
        () => themeEditPreviewRemove('a', {cwd}),
      ]) {
        const r = await refusal(fn);
        expect(r.code).toBe('ERR_THEME_INVALID');
        expect(r.message).toContain(`${ROUTE}/theme-preview.json is damaged`);
        expect(r.run.join(' ')).not.toMatch(/(^|\s)(rm|mv)\s/);
        expect(r.message).toContain('a new name that starts with _');
      }
      expect(tree()).toBe(before);
    }, 60_000);
});

describe('preview remove', () => {
  it('refuses a page remove when the theme does not load, deleting nothing', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'brand'});
    const settings = read('themes/brand/brand.settings.json');
    write('themes/brand/brand.settings.json', '{x');
    try {
      const before = tree();
      const r = await refusal(() => themeEditPreviewRemove('colors', {cwd}));
      expect(r.code).toBe('ERR_THEME_INVALID');
      expect(r.run[0]).toBe('astryx experimental theme preview remove');
      expect(tree()).toBe(before);
    } finally {
      write('themes/brand/brand.settings.json', settings);
    }
  }, 120_000);

  it('wears the app theme when the recorded theme is gone, and the route still names every page', async () => {
    await themeEditNew('gone', {cwd, like: 'neutral'});
    await themeEditSet('gone', 'accent', '#e11d48', {cwd});
    await themeEditPreviewAdd(undefined, {cwd, theme: 'gone'});
    fs.rmSync(path.join(cwd, 'themes/gone'), {recursive: true});
    const r = await themeEditPreviewRemove('overview', {cwd});
    expect(r.data.notes.join(' ')).toContain('wore gone, which is gone');
    expect(r.data.pages).toEqual(['components', 'colors']);
    const route = read(`${ROUTE}/page.tsx`);
    expect(route).not.toContain('themes/gone');
    expect(route).toContain('"./_pages/colors"');
    expect(read(`${ROUTE}/_pages/colors.tsx`)).not.toContain('themes/gone');
    expect(r.data.rewritten).toContain(`${ROUTE}/page.tsx`);
  }, 120_000);

  it('keeps a page file the preview did not write, and one changed by hand, and says so', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const data = JSON.parse(read(`${ROUTE}/theme-preview.json`));
    data.pages.push({id: 'mine', label: 'Mine', file: '_pages/mine'});
    write(`${ROUTE}/theme-preview.json`, JSON.stringify(data));
    write(
      `${ROUTE}/_pages/mine.tsx`,
      'export default function Mine() { return null; }\n',
    );
    const mine = await themeEditPreviewRemove('mine', {cwd});
    expect(mine.data.removed).toEqual([]);
    expect(mine.data.kept).toEqual([`${ROUTE}/_pages/mine.tsx`]);
    expect(exists(`${ROUTE}/_pages/mine.tsx`)).toBe(true);

    fs.appendFileSync(
      path.join(cwd, ROUTE, '_pages/overview.tsx'),
      '// MINE\n',
    );
    const edited = await themeEditPreviewRemove('overview', {cwd});
    expect(edited.data.kept).toEqual([`${ROUTE}/_pages/overview.tsx`]);
    expect(read(`${ROUTE}/_pages/overview.tsx`)).toContain('// MINE');
    expect(edited.data.notes.join(' ')).toContain('changed by hand');

    fs.rmSync(path.join(cwd, ROUTE, '_pages/components.tsx'));
    const whole = await themeEditPreviewRemove(undefined, {cwd});
    expect(whole.data.missing).toEqual([`${ROUTE}/_pages/components.tsx`]);
    expect(whole.data.removed).toEqual([
      `${ROUTE}/page.tsx`,
      `${ROUTE}/theme-preview.json`,
    ]);
  }, 120_000);

  it('keeps a file changed by hand on a whole remove', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    fs.appendFileSync(
      path.join(cwd, ROUTE, '_pages/overview.tsx'),
      '// MINE\n',
    );
    const r = await themeEditPreviewRemove(undefined, {cwd});
    expect(r.data.kept).toEqual([`${ROUTE}/_pages/overview.tsx`]);
    expect(read(`${ROUTE}/_pages/overview.tsx`)).toContain('// MINE');
    expect(exists(`${ROUTE}/page.tsx`)).toBe(false);
  }, 120_000);

  it('refuses a folder listed in files before deleting anything', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const data = JSON.parse(read(`${ROUTE}/theme-preview.json`));
    data.files.unshift('_pages');
    write(`${ROUTE}/theme-preview.json`, JSON.stringify(data));
    const before = tree();
    const r = await refusal(() => themeEditPreviewRemove(undefined, {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).toContain('which is a folder');
    expect(tree()).toBe(before);
  }, 120_000);

  it('matches a page id in any case, and names the nearest page with one page left', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    expect(
      (await themeEditPreviewRemove('Components', {cwd})).data.pages,
    ).toEqual(['overview']);
    const r = await refusal(() => themeEditPreviewRemove('overveiw', {cwd}));
    expect(r.code).toBe('ERR_NOT_FOUND');
    expect(r.run).toContain('overview');
  }, 120_000);

  it('puts every file back when a write fails, and refuses with ERR_WRITE_FAILED', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const before = tree();
    fs.chmodSync(path.join(cwd, ROUTE, '_pages'), 0o555);
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: 'blank'}),
      );
      expect(r.code).toBe('ERR_WRITE_FAILED');
      expect(r.message).toContain('put back as it was');
    } finally {
      fs.chmodSync(path.join(cwd, ROUTE, '_pages'), 0o755);
    }
    expect(tree()).toBe(before);
    expect(
      (await themeEditPreviewAdd(undefined, {cwd, template: 'blank'})).data
        .added,
    ).toEqual(['blank']);
  }, 120_000);
});

describe('preview add', () => {
  it('refuses an empty --template, writing nothing', async () => {
    const before = tree();
    for (const template of ['', '   ']) {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template}),
      );
      expect(r.code).toBe('ERR_INVALID_ARGUMENT');
    }
    expect(tree()).toBe(before);
  });

  it('refuses a block passed to --template, suggesting page templates as commands', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {
        cwd,
        template: 'AlertDialogDeleteConfirmation',
      }),
    );
    expect(r.code).toBe('ERR_UNKNOWN_TEMPLATE');
    expect(r.message).toContain('is a block template, not a page');
    const typo = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: 'dashbaord'}),
    );
    expect(typo.run.length).toBeLessThanOrEqual(6);
    expect(typo.run[0]).toBe(
      'astryx experimental theme preview add --template dashboard',
    );
    expect(typo.run.at(-1)).toBe('astryx template --list --type page');
  }, 60_000);

  it('never replaces a page changed by hand, and adopts an identical page it did not record', async () => {
    await themeEditPreviewAdd(undefined, {cwd, template: 'login'});
    fs.appendFileSync(
      path.join(cwd, ROUTE, '_pages/login.tsx'),
      '// MY EDIT\n',
    );
    const before = tree();
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: 'login'}),
    );
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(r.message).toContain('changed by hand');
    expect(tree()).toBe(before);

    // A page file an interrupted run wrote but did not record.
    const login = read(`${ROUTE}/_pages/login.tsx`).replace('// MY EDIT\n', '');
    fs.rmSync(path.join(cwd, ROUTE), {recursive: true});
    write(`${ROUTE}/_pages/login.tsx`, login);
    const adopted = await themeEditPreviewAdd(undefined, {
      cwd,
      template: 'login',
    });
    expect(adopted.data.added).toEqual(['login']);
  }, 120_000);

  it('writes the default pages again when the theme changes, and forgets the old theme', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'brand'});
    expect(read(`${ROUTE}/_pages/components.tsx`)).toContain(
      'editor set brand',
    );
    const r = await themeEditPreviewAdd(undefined, {
      cwd,
      theme: 'sea',
      template: 'blank',
    });
    expect(r.data.notes.join(' ')).toContain('now wears sea (was brand)');
    expect(read(`${ROUTE}/_pages/components.tsx`)).not.toContain(
      'editor set brand',
    );
    expect(exists('themes/brand/previews.json')).toBe(false);
    expect(read('themes/sea/previews.json')).toContain(ROUTE);
  }, 120_000);

  it('falls back to the app theme when the recorded theme is gone', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const data = JSON.parse(read(`${ROUTE}/theme-preview.json`));
    data.theme = 'vanished';
    write(`${ROUTE}/theme-preview.json`, JSON.stringify(data));
    const listed = await themeEditPreviewList({cwd});
    expect(listed.data).toMatchObject({theme: 'vanished', themeMissing: true});
    expect(listed.data.notes.join(' ')).toContain(
      'the preview wears vanished, which is gone, so its route does not build; astryx experimental theme preview add switches it to',
    );
    const r = await themeEditPreviewAdd(undefined, {cwd, template: 'blank'});
    expect((await themeEditPreviewList({cwd})).data.themeMissing).toBe(false);
    expect(r.data.theme).toBe(null);
    expect(r.data.notes.join(' ')).toContain('wore vanished, which is gone');
  }, 120_000);

  it('names the closest editor theme for a wrong --theme, and what a package theme does', async () => {
    const typo = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, theme: 'Brand'}),
    );
    expect(typo.run).toEqual([
      'astryx experimental theme preview add --theme brand',
    ]);
    const pkg = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, theme: 'neutral'}),
    );
    expect(pkg.message).toContain('is a package theme');
    expect(pkg.run[0]).toBe('astryx experimental theme preview add');
  });

  it('skips a page whose package is named but not installed, naming the install', async () => {
    const link = path.join(path.dirname(cwd), 'node_modules', 'lucide-react');
    const target = fs.readlinkSync(link);
    fs.rmSync(link);
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: 'theme-showcase'}),
      );
      expect(r.code).toBe('ERR_DEP_MISSING');
      expect(r.message).toContain('names but is not installed');
      expect(r.run).toContain('npm install');
      expect(r.message.match(/Nothing was/g)).toHaveLength(1);
    } finally {
      fs.symlinkSync(target, link, 'dir');
    }
  }, 120_000);

  it('parses --top as typed, and refuses it with nothing to rank', async () => {
    for (const top of ['2e0', ' 2', '0x2', 'x', '', '4']) {
      const r = await refusal(() =>
        themeEditPreviewAdd('a sales dashboard', {cwd, top}),
      );
      expect(r.code, top).toBe('ERR_INVALID_ARGUMENT');
      expect(r.message, top).toContain(`not "${top}"`);
    }
    expect(
      (await refusal(() => themeEditPreviewAdd(undefined, {cwd, top: 2}))).code,
    ).toBe('ERR_INVALID_ARGUMENT');
    expect(
      (
        await refusal(() =>
          themeEditPreviewAdd(undefined, {cwd, template: 'login', top: 1}),
        )
      ).code,
    ).toBe('ERR_INVALID_ARGUMENT');
  });

  it('ranks only the first 40 words of a long description, and says so', async () => {
    const words = Array.from({length: 120}, (_, i) => `w${i}`).join(' ');
    const ok = await themeEditPreviewAdd(
      `an analytics dashboard ${'with charts and tables '.repeat(12)}${words}`,
      {cwd},
    );
    expect(ok.data.notes.join(' ')).toContain('the first 40 different ones');
  }, 120_000);

  it('suggests addable pages and the template list for an unrelated description, shell-safe', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd('zzzz', {cwd, path: "src/app/$(id)'x"}),
    );
    expect(r.code).toBe('ERR_NOT_FOUND');
    expect(r.run.at(-1)).toBe('astryx template --list --type page');
    for (const cmd of r.run.slice(0, -1))
      expect(cmd).toContain(`--path 'src/app/$(id)'\\''x'`);
    expect(r.run.join(' ')).not.toContain('shell-top-nav');
  }, 60_000);

  it('takes every word of an unquoted description, and refuses extra arguments to list and remove', async () => {
    const add = await cli(['add', 'zzzz', 'qqqq']);
    expect(add.status).toBe(1);
    expect(add.stdout).toContain('zzzz qqqq');
    for (const args of [
      ['list', 'x'],
      ['remove', 'a', 'b'],
      ['app', 'x1', 'x2'],
    ]) {
      const r = await cli(args);
      expect(r.status, args.join(' ')).toBe(1);
      expect(JSON.parse(r.stdout).code, args.join(' ')).toBe(
        'ERR_INVALID_ARGUMENT',
      );
    }
    expect(exists('x1')).toBe(false);
  }, 60_000);
});

describe('preview app', () => {
  it('refuses odd and reserved folders with a code and a command, writing nothing', async () => {
    write('afile', 'x\n');
    fs.symlinkSync('nowhere', path.join(cwd, 'dangling'));
    try {
      const before = tree();
      for (const [dir, code] of /** @type {const} */ ([
        ['afile', 'ERR_FILE_EXISTS'],
        ['dangling', 'ERR_FILE_EXISTS'],
        ['a'.repeat(300), 'ERR_INVALID_ARGUMENT'],
        ['src/app/demo', 'ERR_INVALID_ARGUMENT'],
        ['themes/newapp', 'ERR_INVALID_ARGUMENT'],
        ['node_modules/zz', 'ERR_INVALID_ARGUMENT'],
        ['sub\\app', 'ERR_INVALID_ARGUMENT'],
        ['x ', 'ERR_INVALID_ARGUMENT'],
      ])) {
        const r = await refusal(() => themeEditPreviewApp(dir, {cwd}));
        expect(r.code, dir).toBe(code);
        expect(r.run.length, dir).toBeGreaterThan(0);
      }
      expect(tree()).toBe(before);
    } finally {
      fs.rmSync(path.join(cwd, 'afile'));
      fs.rmSync(path.join(cwd, 'dangling'));
    }
  });

  it('suggests a free folder inside the current one for a folder that is not empty', async () => {
    const r = await refusal(() => themeEditPreviewApp('.', {cwd}));
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(r.run).toEqual(['astryx experimental theme preview app theme-app']);
  });

  it('writes into a folder with only .git in it, with a home page, a .gitignore and a quoted open line', async () => {
    const dir = 'my app';
    fs.mkdirSync(path.join(cwd, dir, '.git'), {recursive: true});
    try {
      const r = await themeEditPreviewApp(dir, {cwd});
      expect(r.data.open).toBe(
        "cd 'my app' && npm install && npm run dev, then open /theme-preview",
      );
      expect(read(`${dir}/.gitignore`).split('\n')).toEqual(
        expect.arrayContaining([
          'node_modules',
          '*.tsbuildinfo',
          'next-env.d.ts',
        ]),
      );
      expect(read(`${dir}/src/app/page.tsx`)).toContain(
        'href="/theme-preview"',
      );
      expect(read(`${dir}/src/app/layout.tsx`)).toContain(
        "title: 'Theme preview'",
      );
      expect(read(`${dir}/src/app/theme-preview/page.tsx`)).toContain(
        'Written by `astryx experimental theme preview app`',
      );
      expect(r.data.notes.join(' ')).not.toContain('tsconfig');
    } finally {
      fs.rmSync(path.join(cwd, dir), {recursive: true, force: true});
    }
  }, 120_000);

  it('leaves nothing behind when a write fails', async () => {
    fs.mkdirSync(path.join(cwd, 'ro'));
    fs.chmodSync(path.join(cwd, 'ro'), 0o555);
    try {
      const before = tree();
      const r = await refusal(() => themeEditPreviewApp('ro/app', {cwd}));
      expect(r.code).toBe('ERR_WRITE_FAILED');
      expect(tree()).toBe(before);
    } finally {
      fs.chmodSync(path.join(cwd, 'ro'), 0o755);
      fs.rmSync(path.join(cwd, 'ro'), {recursive: true});
    }
  }, 60_000);

  it('adds the Colors page, every open font pinned, and one mode for a one-mode theme', async () => {
    await themeEditNew('fox', {cwd, like: 'neutral'});
    await themeEditSet('fox', 'accent', '#0ea5e9', {cwd});
    await themeEditSet('fox', 'font', 'inter', {cwd});
    await themeEditSet('fox', 'mode', 'dark-only', {cwd});
    try {
      const r = await themeEditPreviewApp('fa', {cwd, theme: 'fox'});
      expect(r.data.pages).toEqual(['overview', 'components', 'colors']);
      const pkg = JSON.parse(read('fa/package.json'));
      expect(pkg.dependencies['@fontsource/inter']).toBe('^5.0.0');
      const route = read('fa/src/app/theme-preview/page.tsx');
      expect(route).toContain('import "@fontsource/inter/index.css"');
      expect(route).toContain('const mode: Mode = "dark"');
      expect(read('fa/src/app/theme-preview/_pages/colors.tsx')).toContain(
        '../../../../themes/fox/tokens/fox.palette',
      );
      const wrong = await refusal(() =>
        themeEditPreviewApp('fb', {cwd, theme: 'fux'}),
      );
      expect(wrong.run).toEqual([
        'astryx experimental theme preview app fb --theme fox',
      ]);
    } finally {
      fs.rmSync(path.join(cwd, 'fa'), {recursive: true, force: true});
      fs.rmSync(path.join(cwd, 'themes/fox'), {recursive: true, force: true});
    }
  }, 180_000);
});

describe('pass 2', () => {
  /** Every suggestion of a refusal is an astryx command, never a shell command that deletes or moves. @param {{run: string[]}} r */
  const safe = r => {
    for (const cmd of r.run) expect(cmd).not.toMatch(/^(rm|mv)\b/);
  };

  it('finds an older preview at src/, refuses to add beside it, and removes it', async () => {
    write(
      'src/theme-preview.json',
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [{id: 'login', label: 'Login', file: 'pages/login'}],
        files: ['pages/login.tsx', 'page.tsx', 'theme-preview.json'],
      }),
    );
    write('src/pages/login.tsx', 'export default 1;\n');
    write('src/page.tsx', 'export default 1;\n');
    try {
      expect((await themeEditPreviewList({cwd})).data.folder).toBe('src');
      const r = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
      expect(r.code).toBe('ERR_INVALID_ARGUMENT');
      expect(r.run).toEqual([
        'astryx experimental theme preview remove --path src',
      ]);
      const at = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, path: 'src'}),
      );
      expect(at.run).toEqual([
        'astryx experimental theme preview remove --path src',
      ]);
      // The older preview recorded no hashes, so its files are kept and
      // named; only its record goes.
      const rem = await themeEditPreviewRemove(undefined, {cwd, path: 'src'});
      expect(rem.data.kept).toEqual(['src/pages/login.tsx', 'src/page.tsx']);
      expect(exists('src/theme-preview.json')).toBe(false);
    } finally {
      for (const f of ['src/pages', 'src/page.tsx', 'src/theme-preview.json'])
        fs.rmSync(path.join(cwd, f), {recursive: true, force: true});
    }
  });

  it('stops a whole remove when page.tsx was changed by hand, deleting nothing', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    fs.appendFileSync(path.join(cwd, ROUTE, 'page.tsx'), '// MINE\n');
    const before = tree();
    const r = await refusal(() => themeEditPreviewRemove(undefined, {cwd}));
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(r.message).toContain('imports the preview pages');
    safe(r);
    expect(tree()).toBe(before);
  }, 120_000);

  it('does not count a formatter run as a change by hand', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const file = path.join(cwd, ROUTE, 'page.tsx');
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replace(/"/g, "'").replace(/;\n/g, '\n'),
    );
    const r = await themeEditPreviewAdd(undefined, {cwd, template: 'blank'});
    expect(r.data.added).toEqual(['blank']);
  }, 120_000);

  it('names the preview files a theme change left as they were, changed by hand', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'brand'});
    fs.appendFileSync(path.join(cwd, ROUTE, '_pages/colors.tsx'), '// MINE\n');
    const r = await themeEditSet('brand', 'accent', '#e11d48', {cwd});
    expect(/** @type {any} */ (r.data).previewStale).toEqual([
      `${ROUTE}/_pages/colors.tsx`,
    ]);
    await themeEditSet('brand', 'accent', '#7c3aed', {cwd});
  }, 180_000);

  it('blocks a page kept after an edit with a plain way out, never a second preview', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    fs.appendFileSync(
      path.join(cwd, ROUTE, '_pages/overview.tsx'),
      '// MINE\n',
    );
    await themeEditPreviewRemove('overview', {cwd});
    const r = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(r.message).toContain('another name');
    expect(r.run.join(' ')).not.toContain('theme-preview-2');
    safe(r);
  }, 120_000);

  it('writes a recorded page again when its file is gone, or leaves it out of the nav', async () => {
    await themeEditPreviewAdd(undefined, {cwd, template: 'login'});
    const data = JSON.parse(read(`${ROUTE}/theme-preview.json`));
    data.pages.push({id: 'nosuch', label: 'No such', file: '_pages/nosuch'});
    data.files.push('_pages/nosuch.tsx');
    write(`${ROUTE}/theme-preview.json`, JSON.stringify(data));
    fs.rmSync(path.join(cwd, ROUTE, '_pages/login.tsx'));
    const r = await themeEditPreviewAdd(undefined, {cwd, template: 'blank'});
    expect(exists(`${ROUTE}/_pages/login.tsx`)).toBe(true);
    expect(r.data.pages).toEqual(['login', 'blank']);
    expect(read(`${ROUTE}/page.tsx`)).not.toContain('nosuch');
    expect(r.data.notes.join(' ')).toContain('wrote login again');
    expect(r.data.notes.join(' ')).toContain('left nosuch out of the nav');
  }, 120_000);

  it('records a hash for a page it moves, so a later edit is protected', async () => {
    write(
      `${ROUTE}/pages/old.tsx`,
      'export default function O() { return null; }\n',
    );
    write(`${ROUTE}/page.tsx`, '// old route\n');
    write(
      `${ROUTE}/theme-preview.json`,
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [{id: 'old', label: 'Old', file: 'pages/old'}],
        files: ['pages/old.tsx', 'page.tsx', 'theme-preview.json'],
      }),
    );
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const data = JSON.parse(read(`${ROUTE}/theme-preview.json`));
    expect(data.hashes['_pages/old.tsx']).toBeTruthy();
    fs.appendFileSync(path.join(cwd, ROUTE, '_pages/old.tsx'), '// MINE\n');
    const r = await themeEditPreviewRemove('old', {cwd});
    expect(r.data.kept).toEqual([`${ROUTE}/_pages/old.tsx`]);
  }, 120_000);

  it('says which step failed, and leaves no new folder after a rollback', async () => {
    write(
      `${ROUTE}/pages/old.tsx`,
      'export default function O() { return null; }\n',
    );
    write(
      `${ROUTE}/theme-preview.json`,
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [{id: 'old', label: 'Old', file: 'pages/old'}],
        files: ['pages/old.tsx', 'theme-preview.json'],
      }),
    );
    fs.chmodSync(path.join(cwd, ROUTE, 'pages'), 0o555);
    try {
      const before = tree();
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, theme: 'sea'}),
      );
      expect(r.code).toBe('ERR_WRITE_FAILED');
      expect(r.message).toContain('could not be removed');
      expect(exists(`${ROUTE}/_pages`)).toBe(false);
      expect(tree()).toBe(before);
    } finally {
      fs.chmodSync(path.join(cwd, ROUTE, 'pages'), 0o755);
    }
  }, 120_000);

  it('keeps the mode of a read-only preview file it writes again', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    fs.chmodSync(path.join(cwd, ROUTE, 'page.tsx'), 0o444);
    await themeEditPreviewAdd(undefined, {cwd, template: 'blank'});
    expect(fs.statSync(path.join(cwd, ROUTE, 'page.tsx')).mode & 0o777).toBe(
      0o444,
    );
    fs.chmodSync(path.join(cwd, ROUTE, 'page.tsx'), 0o644);
  }, 120_000);

  it('repeats --theme in the retry after a failed app write', async () => {
    fs.mkdirSync(path.join(cwd, 'ro'));
    fs.chmodSync(path.join(cwd, 'ro'), 0o555);
    try {
      const r = await refusal(() =>
        themeEditPreviewApp('ro/app', {cwd, theme: 'sea'}),
      );
      expect(r.code).toBe('ERR_WRITE_FAILED');
      expect(r.run[0]).toContain('--theme sea');
    } finally {
      fs.chmodSync(path.join(cwd, 'ro'), 0o755);
      fs.rmSync(path.join(cwd, 'ro'), {recursive: true});
    }
  }, 120_000);

  it('runs preview app --theme one after another with a set on the same theme', async () => {
    try {
      await Promise.all([
        themeEditSet('sea', 'corners', 'pill', {cwd}),
        themeEditPreviewApp('cc', {cwd, theme: 'sea'}),
      ]);
      expect(read('themes/sea/sea.css')).toContain('9999px');
      const settings = read('cc/themes/sea/sea.settings.json').includes('pill');
      expect(read('cc/themes/sea/sea.css').includes('9999px')).toBe(settings);
    } finally {
      fs.rmSync(path.join(cwd, 'cc'), {recursive: true, force: true});
      await themeEditUndo('sea', {cwd});
    }
  }, 180_000);
});

describe('pass 3', () => {
  /** @param {string} rel */
  const rm = rel =>
    fs.rmSync(path.join(cwd, rel), {recursive: true, force: true});

  it('never deletes a project file a theme-preview.json at the root lists', async () => {
    const pkg = read('package.json');
    write(
      'theme-preview.json',
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [{id: 'login', label: 'Login', file: 'pages/login'}],
        files: [
          'package.json',
          'page.tsx',
          'pages/login.tsx',
          'theme-preview.json',
        ],
      }),
    );
    write('page.tsx', '// mine\n');
    write('pages/login.tsx', 'export default 1;\n');
    try {
      const r = await themeEditPreviewRemove(undefined, {cwd, path: '.'});
      expect(r.data.removed).toEqual(['theme-preview.json']);
      expect(r.data.kept).toEqual([
        'package.json',
        'page.tsx',
        'pages/login.tsx',
      ]);
      expect(read('package.json')).toBe(pkg);
      expect(exists('page.tsx')).toBe(true);
      expect(exists('pages/login.tsx')).toBe(true);
      expect(r.data.notes.join(' ')).toContain(
        'no record of how the preview wrote it',
      );
    } finally {
      for (const f of ['page.tsx', 'pages', 'theme-preview.json']) rm(f);
    }
  });

  it('keeps a page with no recorded hash on a single remove', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const data = JSON.parse(read(`${ROUTE}/theme-preview.json`));
    delete data.hashes['_pages/overview.tsx'];
    write(`${ROUTE}/theme-preview.json`, JSON.stringify(data));
    const r = await themeEditPreviewRemove('overview', {cwd});
    expect(r.data.removed).toEqual([]);
    expect(r.data.kept).toEqual([`${ROUTE}/_pages/overview.tsx`]);
  }, 120_000);

  it('refuses --path at a folder with a package.json', async () => {
    write('src/app/pkg/package.json', '{}\n');
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: 'src/app/pkg'}),
    );
    expect(r.code).toBe('ERR_INVALID_ARGUMENT');
  });

  it('reads only real imports: words in comments and strings are not packages', async () => {
    const r = await themeEditPreviewAdd(undefined, {
      cwd,
      template: 'form-wizard',
    });
    expect(r.data.added).toEqual(['form-wizard']);
  }, 120_000);

  it('names a StyleX package that is not named in package.json, with the command that adds it', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: 'table-collapsible'}),
    );
    expect(r.code).toBe('ERR_DEP_MISSING');
    expect(r.message).not.toContain('names but is not installed');
    expect(r.run).toContain('npm install @stylexjs/stylex');
  }, 60_000);

  it('refuses a folder whose URL another page already serves', async () => {
    write('src/app/(marketing)/theme-preview/page.tsx', 'export default 1;\n');
    const group = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
    expect(group.code).toBe('ERR_FILE_EXISTS');
    expect(group.run[0]).toContain('--path src/app/theme-preview-2');
    rm('src/app/(marketing)');
    // A route handler in a route group, and the app's own route or page in
    // the folder itself.
    for (const file of [
      'src/app/(api)/theme-preview/route.ts',
      'src/app/theme-preview/route.ts',
      'src/app/theme-preview/page.jsx',
    ]) {
      const had = exists('src/app/theme-preview/page.tsx');
      write(file, 'export default 1;\n');
      try {
        const r = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
        expect(r.code, file).toBe('ERR_FILE_EXISTS');
        expect(r.message, file).toContain(
          `${file} already serves /theme-preview`,
        );
        expect(exists('src/app/theme-preview/page.tsx'), file).toBe(had);
      } finally {
        rm(file);
      }
    }
    rm('src/app/(api)');
    write('src/pages/theme-preview.tsx', 'export default 1;\n');
    try {
      const pages = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
      expect(pages.code).toBe('ERR_FILE_EXISTS');
    } finally {
      rm('src/pages');
    }
  });

  it('refuses where Next does not serve page.tsx, and follows a root layout in [locale]', async () => {
    write(
      'next.config.mjs',
      "export default {pageExtensions: ['page.tsx']};\n",
    );
    try {
      const ext = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
      expect(ext.message).toContain('pageExtensions');
      // The way on: this app once "tsx" is in pageExtensions, or a new app.
      expect(ext.run).toEqual([
        'astryx experimental theme preview add --path src/app/theme-preview',
        'astryx experimental theme preview app theme-app',
      ]);
    } finally {
      rm('next.config.mjs');
    }
    // The root layout is in [locale]/, not in src/app/.
    rm('src/app/layout.tsx');
    write(
      'src/app/[locale]/layout.tsx',
      'export default function L({children}: any) { return children; }\n',
    );
    const r = await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    expect(r.data.folder).toBe('src/app/[locale]/theme-preview');
    expect(r.data.open).toContain('/<locale>/theme-preview');
    const outside = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: 'src/app/pv'}),
    );
    expect(outside.message).toContain('no root layout above it');
  }, 120_000);

  it('refuses a preview in src/app/ when app/ is what Next serves', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    write('app/layout.tsx', 'export default 1;\n');
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: 'blank'}),
      );
      expect(r.code).toBe('ERR_INVALID_ARGUMENT');
      expect(r.message).toContain('Next serves app/');
      expect(r.run[0]).toBe(
        `astryx experimental theme preview remove --path ${ROUTE}`,
      );
    } finally {
      rm('app');
    }
  }, 120_000);

  it('counts an edit inside a string as a change by hand', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const file = path.join(cwd, ROUTE, 'page.tsx');
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace('label: "Overview"', 'label: "Over, view"'),
    );
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: 'login'}),
    );
    expect(r.code).toBe('ERR_FILE_EXISTS');
    expect(read(`${ROUTE}/page.tsx`)).toContain('Over, view');
  }, 120_000);

  it('builds a theme with no build only once every check passed, and says so', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const js = path.join(cwd, 'themes/sea/sea.js');
    const css = path.join(cwd, 'themes/sea/sea.css');
    const keep = [fs.readFileSync(js), fs.readFileSync(css)];
    fs.rmSync(js);
    fs.rmSync(css);
    fs.appendFileSync(path.join(cwd, ROUTE, 'page.tsx'), '// mine\n');
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: 'login'}),
      );
      expect(r.code).toBe('ERR_FILE_EXISTS');
      expect(fs.existsSync(js)).toBe(false);
      rm(ROUTE);
      const ok = await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
      expect(ok.data.notes.join(' ')).toContain('built themes/sea/ first');
      expect(fs.existsSync(js)).toBe(true);
    } finally {
      if (!fs.existsSync(js)) {
        fs.writeFileSync(js, keep[0]);
        fs.writeFileSync(css, keep[1]);
      }
    }
  }, 180_000);

  it('runs a read-only command without the lock when node_modules cannot be written', async () => {
    const modules = path.join(path.dirname(cwd), 'node_modules');
    fs.rmSync(path.join(modules, '.cache'), {recursive: true, force: true});
    fs.chmodSync(modules, 0o555);
    try {
      const r = await themeEditShow('sea', {cwd});
      expect(r.data.theme).toBe('sea');
    } finally {
      fs.chmodSync(modules, 0o755);
    }
  }, 180_000);

  it('names renaming the record, not the folder, for a damaged record at the root', async () => {
    write('theme-preview.json', '{');
    try {
      const add = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, path: '.'}),
      );
      expect(add.message).toContain('another name');
      expect(add.run.join(' ')).not.toContain('remove');
      const remove = await refusal(() =>
        themeEditPreviewRemove(undefined, {cwd, path: '.'}),
      );
      expect(remove.code).toBe('ERR_THEME_INVALID');
      expect(remove.message).toContain('theme-preview.json.broken');
      expect(remove.message).not.toContain('starts with _');
    } finally {
      rm('theme-preview.json');
    }
  });

  it('reads a record that starts with a byte-order mark', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    const file = path.join(cwd, ROUTE, 'theme-preview.json');
    fs.writeFileSync(file, `\uFEFF${fs.readFileSync(file, 'utf8')}`);
    expect(
      (await themeEditPreviewList({cwd})).data.pages.length,
    ).toBeGreaterThan(0);
  }, 120_000);

  it('treats a base theme as a package theme, installed or not', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, theme: 'butter'}),
    );
    expect(r.message).toContain('is a package theme');
    expect(r.run).toContain('npm install @astryxdesign/theme-butter');
    expect(r.run.at(-1)).toContain('editor new my-butter --like butter');
  });

  it('retries a theme given as a folder with its name', async () => {
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {
        cwd,
        template: 'login',
        theme: 'themes/sea',
      }),
    );
    expect(r.run).toEqual([
      'astryx experimental theme preview add --template login --theme sea',
    ]);
  });

  it('takes --template in any case', async () => {
    const r = await themeEditPreviewAdd(undefined, {cwd, template: 'LOGIN'});
    expect(r.data.added).toEqual(['login']);
  }, 120_000);

  it("refuses Next's build folder for an app or a preview: the next build empties it", async () => {
    for (const dir of ['.next/demo', 'out/demo'])
      expect(
        (await refusal(() => themeEditPreviewApp(dir, {cwd}))).message,
        dir,
      ).toContain('is where Next writes its build');
    const add = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: '.next/tp'}),
    );
    expect(add.code).toBe('ERR_INVALID_ARGUMENT');
    write('next.config.mjs', "export default {distDir: 'build'};\n");
    try {
      expect(
        (await refusal(() => themeEditPreviewApp('build/demo', {cwd}))).message,
      ).toContain('build/ is where Next writes its build');
    } finally {
      rm('next.config.mjs');
    }
    for (const dir of ['.next', 'out', 'build'])
      expect(exists(`${dir}/demo`), dir).toBe(false);
  });

  it('refuses an app in public/ or with a name Windows does not allow', async () => {
    write('public/robots.txt', 'x\n');
    try {
      for (const dir of ['public/demo', 'con', '...'])
        expect(
          (await refusal(() => themeEditPreviewApp(dir, {cwd}))).code,
          dir,
        ).toBe('ERR_INVALID_ARGUMENT');
    } finally {
      rm('public');
    }
  });

  it('removes the route group folder that only held the preview', async () => {
    await themeEditPreviewAdd(undefined, {
      cwd,
      path: 'src/app/(tools)/theme-preview',
    });
    await themeEditPreviewRemove(undefined, {
      cwd,
      path: 'src/app/(tools)/theme-preview',
    });
    expect(exists('src/app/(tools)')).toBe(false);
  }, 120_000);

  it('says in list that the theme the preview wears is gone', async () => {
    await themeEditNew('gone2', {cwd, like: 'neutral'});
    await themeEditPreviewAdd(undefined, {cwd, theme: 'gone2'});
    rm('themes/gone2');
    const r = await themeEditPreviewList({cwd});
    expect(r.data.notes.join(' ')).toContain('gone2, which is gone');
  }, 120_000);
});

describe('pass 4', () => {
  it('places the preview under any of several root layouts, one per route group', async () => {
    const layout =
      'export default function L({children}: any) { return children; }\n';
    // The root layouts are in the route groups, not in src/app/.
    fs.rmSync(path.join(cwd, 'src/app/layout.tsx'), {force: true});
    write('src/app/(marketing)/layout.tsx', layout);
    write('src/app/(shop)/layout.tsx', layout);
    const r = await themeEditPreviewAdd(undefined, {
      cwd,
      path: 'src/app/(shop)/theme-preview',
    });
    expect(r.data.folder).toBe('src/app/(shop)/theme-preview');
    expect(r.data.open).toBe('open /theme-preview in the running app');
    const outside = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, path: 'src/app/pv'}),
    );
    expect(outside.message).toContain('no root layout above it');
    expect(outside.run).toEqual([
      "astryx experimental theme preview add --path 'src/app/(marketing)/theme-preview'",
      "astryx experimental theme preview add --path 'src/app/(shop)/theme-preview'",
    ]);
  }, 120_000);
});

describe('a change stopped part way', () => {
  /** Files under the route folder, relative, temp files included. */
  const listing = () =>
    /** @type {string[]} */ (
      fs.readdirSync(path.join(cwd, ROUTE), {recursive: true})
    )
      .map(f => f.split(path.sep).join('/'))
      .sort();
  /** Stop at the `n`th rename of the next change, as a kill would. @param {number} n */
  const stopAfter = n => {
    let renames = 0;
    stopPreviewCommitAt(step => step === 'rename' && ++renames === n);
  };
  const olderPreview = () => {
    for (const id of ['overview', 'components'])
      write(
        `${ROUTE}/pages/${id}.tsx`,
        `export default function P() { return '${id}'; }\n`,
      );
    write(`${ROUTE}/page.tsx`, '// older route\n');
    write(
      `${ROUTE}/theme-preview.json`,
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [
          {id: 'overview', label: 'Overview', file: 'pages/overview'},
          {id: 'components', label: 'Components', file: 'pages/components'},
        ],
        files: [
          'pages/overview.tsx',
          'pages/components.tsx',
          'page.tsx',
          'theme-preview.json',
        ],
      }),
    );
  };

  it('undoes a page move stopped after the first rename, and the next add moves the pages', async () => {
    olderPreview();
    stopAfter(1);
    try {
      await expect(
        themeEditPreviewAdd(undefined, {cwd, template: 'blank'}),
      ).rejects.toBeTypeOf('symbol');
    } finally {
      stopPreviewCommitAt(null);
    }
    expect(listing()).toContain('.theme-preview.pending.json');
    const r = await themeEditPreviewAdd(undefined, {cwd, template: 'blank'});
    expect(r.data.notes.join(' ')).toContain('undid a preview change');
    expect(r.data.pages).toEqual(['overview', 'components', 'blank']);
    expect(listing().filter(f => /\.tmp$|pending|^pages/.test(f))).toEqual([]);
    const data = JSON.parse(read(`${ROUTE}/theme-preview.json`));
    expect(data.pages.map((/** @type {any} */ p) => p.file)).toEqual([
      '_pages/overview',
      '_pages/components',
      '_pages/blank',
    ]);
  }, 120_000);

  it('removes the whole preview after a change stopped before its record was written', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    stopAfter(2);
    try {
      await expect(
        themeEditPreviewAdd(undefined, {cwd, template: 'blank'}),
      ).rejects.toBeTypeOf('symbol');
    } finally {
      stopPreviewCommitAt(null);
    }
    const r = await themeEditPreviewRemove(undefined, {cwd});
    expect(r.data.kept).toEqual([]);
    expect(exists(ROUTE)).toBe(false);
  }, 120_000);
});

describe('final pass', () => {
  const stopAt = (/** @type {string} */ step, /** @type {number} */ n) => {
    let seen = 0;
    stopPreviewCommitAt(s => s === step && ++seen === n);
  };
  /** Stop the next add of `template` at `step` number `n`. */
  const stoppedAdd = async (
    /** @type {string} */ template,
    /** @type {string} */ step,
    /** @type {number} */ n,
  ) => {
    stopAt(step, n);
    try {
      await expect(
        themeEditPreviewAdd(undefined, {cwd, template}),
      ).rejects.toBeTypeOf('symbol');
    } finally {
      stopPreviewCommitAt(null);
    }
  };

  it('names npm, never npx, when nothing says which package manager the app uses', async () => {
    const pkgFile = path.join(cwd, 'package.json');
    const pkg = fs.readFileSync(pkgFile, 'utf8');
    const {packageManager, ...rest} = JSON.parse(pkg);
    void packageManager;
    fs.writeFileSync(pkgFile, `${JSON.stringify(rest)}\n`);
    // A package manager running the tests (pnpm in CI) is the last thing the
    // finder reads; with it gone, nothing says.
    const agent = process.env.npm_config_user_agent;
    delete process.env.npm_config_user_agent;
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: 'table-collapsible'}),
      );
      expect(r.run).toContain('npm install @stylexjs/stylex');
      expect(r.run.join(' ')).not.toMatch(/\bnpx (add|install)\b/);
    } finally {
      if (agent != null) process.env.npm_config_user_agent = agent;
      fs.writeFileSync(pkgFile, pkg);
    }
  }, 60_000);

  it('names the package manager the app declares', async () => {
    const pkgFile = path.join(cwd, 'package.json');
    const pkg = fs.readFileSync(pkgFile, 'utf8');
    fs.writeFileSync(
      pkgFile,
      `${JSON.stringify({...JSON.parse(pkg), packageManager: 'pnpm@9.0.0'})}\n`,
    );
    try {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: 'table-collapsible'}),
      );
      expect(r.run).toContain('pnpm add @stylexjs/stylex');
    } finally {
      fs.writeFileSync(pkgFile, pkg);
    }
  }, 60_000);

  it('undoes a change stopped before the route landed, so list shows what the route shows', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    await stoppedAdd('login', 'rename', 1);
    await refusal(() => themeEditPreviewRemove('nosuch', {cwd}));
    const list = await themeEditPreviewList({cwd});
    expect(list.data.pages.map(p => p.id)).not.toContain('login');
    expect(exists(`${ROUTE}/_pages/login.tsx`)).toBe(false);
    expect(read(`${ROUTE}/page.tsx`)).not.toContain('login');
  }, 120_000);

  it('says on a refusal what finishing a stopped change wrote', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    await stoppedAdd('login', 'pending', 1);
    const r = await refusal(() =>
      themeEditPreviewAdd(undefined, {cwd, template: 'nosuch-page'}),
    );
    expect(r.message).toContain('Before that, it undid a preview change');
    expect(r.message).not.toContain('Nothing was changed');
  }, 120_000);

  it('names the preview in editor set while a stopped change waits', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'brand'});
    await stoppedAdd('login', 'rename', 1);
    try {
      const r = await themeEditSet('brand', 'accent', '#e11d48', {cwd});
      expect(/** @type {any} */ (r.data).previewStale.join(' ')).toContain(
        'stopped part way',
      );
    } finally {
      await themeEditSet('brand', 'accent', '#7c3aed', {cwd});
    }
  }, 180_000);

  it('cleans the temp files of a damaged step record', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    await stoppedAdd('login', 'pending', 1);
    write(`${ROUTE}/.theme-preview.pending.json`, '{');
    // The stopped change ran in this process; a killed one is gone, so its
    // temp files name a process that no longer runs.
    for (const f of /** @type {string[]} */ (
      fs.readdirSync(path.join(cwd, ROUTE), {recursive: true})
    ).filter(x => /\.astryx-\d+-[a-z0-9]+\.tmp$/.test(String(x))))
      fs.renameSync(
        path.join(cwd, ROUTE, f),
        path.join(
          cwd,
          ROUTE,
          String(f).replace(/astryx-\d+-/, 'astryx-999999-'),
        ),
      );
    await themeEditPreviewAdd(undefined, {cwd, template: 'blank'});
    const left = /** @type {string[]} */ (
      fs.readdirSync(path.join(cwd, ROUTE), {recursive: true})
    ).filter(f => /\.tmp$/.test(String(f)));
    expect(left).toEqual([]);
  }, 120_000);

  it('names a page file a damaged step record left, and remove names it too', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    await stoppedAdd('login', 'rename', 1);
    write(`${ROUTE}/.theme-preview.pending.json`, '{');
    const stray = `${ROUTE}/_pages/login.tsx`;
    expect(exists(stray)).toBe(true);
    const added = await themeEditPreviewAdd(undefined, {
      cwd,
      template: 'blank',
    });
    expect(JSON.stringify(added.data)).toContain(
      `${stray} is in no preview record and may be from that change, so it stays until you remove it`,
    );
    const removed = await themeEditPreviewRemove(undefined, {cwd});
    expect(removed.data.kept).toContain(stray);
    expect(removed.data.notes.join(' ')).toContain(
      `${stray} is kept: the preview has no record of writing it`,
    );
    expect(exists(stray)).toBe(true);
    fs.rmSync(path.join(cwd, ROUTE), {recursive: true, force: true});
  }, 120_000);

  it('suggests a plain remove, not an add that is refused, for a folder that holds the app', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    for (const where of ['src/app', '.', 'src']) {
      const r = await refusal(() =>
        themeEditPreviewRemove(undefined, {cwd, path: where}),
      );
      expect(r.run, where).toEqual([
        'astryx experimental theme preview remove',
      ]);
    }
  }, 120_000);

  it('writes --path and app folder suggestions from the folder the command ran in', async () => {
    const sub = path.join(cwd, 'src/app');
    const pkgFile = path.join(cwd, 'package.json');
    const pkg = fs.readFileSync(pkgFile, 'utf8');
    fs.writeFileSync(
      pkgFile,
      JSON.stringify({
        ...JSON.parse(pkg),
        dependencies: {
          ...JSON.parse(pkg).dependencies,
          '@astryxdesign/core': '*',
        },
      }),
    );
    try {
      const app = await refusal(() => themeEditPreviewApp('demo2', {cwd: sub}));
      expect(app.run[0]).toBe(
        'astryx experimental theme preview app ../../theme-app',
      );
      write(
        'src/app/(marketing)/theme-preview/page.tsx',
        'export default 1;\n',
      );
      const add = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd: sub}),
      );
      expect(add.run[0]).toContain('--path theme-preview-2');
    } finally {
      fs.writeFileSync(pkgFile, pkg);
    }
  }, 120_000);

  it('hints at -- for an app folder whose name starts with -', async () => {
    const r = await cli(['app', '-app']);
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('preview app -- -app');
  });
});

describe('an older preview move stopped part way', () => {
  it('finishes deleting the old pages after a stop between deletes, and leaves nothing unmanaged', async () => {
    for (const id of ['overview', 'components'])
      write(
        `${ROUTE}/pages/${id}.tsx`,
        `export default function P() { return '${id}'; }\n`,
      );
    write(`${ROUTE}/page.tsx`, '// older route\n');
    write(
      `${ROUTE}/theme-preview.json`,
      JSON.stringify({
        version: 1,
        theme: null,
        pages: [
          {id: 'overview', label: 'Overview', file: 'pages/overview'},
          {id: 'components', label: 'Components', file: 'pages/components'},
        ],
        files: [
          'pages/overview.tsx',
          'pages/components.tsx',
          'page.tsx',
          'theme-preview.json',
        ],
      }),
    );
    // The add moves both pages and writes them again for the theme, so the
    // new copies differ from the old ones; it stops after the first delete.
    let deletes = 0;
    stopPreviewCommitAt(step => step === 'delete' && ++deletes === 1);
    try {
      await expect(
        themeEditPreviewAdd(undefined, {cwd, theme: 'sea'}),
      ).rejects.toBeTypeOf('symbol');
    } finally {
      stopPreviewCommitAt(null);
    }
    expect(exists(`${ROUTE}/pages`)).toBe(true);
    const r = await themeEditPreviewRemove(undefined, {cwd});
    expect(r.data.notes.join(' ')).toContain('finished a preview change');
    expect(r.data.kept).toEqual([]);
    expect(exists(ROUTE)).toBe(false);
  }, 120_000);
});

describe('a formatter over the preview', () => {
  it('prettier with its default options over every preview file is no change by hand', async () => {
    const prettier = await import('prettier');
    await themeEditPreviewAdd(undefined, {cwd, theme: 'brand'});
    const files = /** @type {string[]} */ (
      fs.readdirSync(path.join(cwd, ROUTE), {recursive: true})
    )
      .map(String)
      .filter(f => f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const file = path.join(cwd, ROUTE, f);
      const text = fs.readFileSync(file, 'utf8');
      // Defaults: double quotes, keys unquoted as needed, parentheses
      // around every arrow parameter, trailing commas, its own wrapping.
      const formatted = await prettier.format(text, {filepath: file});
      fs.writeFileSync(file, formatted);
    }
    expect(read(`${ROUTE}/page.tsx`)).toContain('"use client"');
    const added = await themeEditPreviewAdd(undefined, {
      cwd,
      template: 'login',
    });
    expect(added.data.added).toEqual(['login']);
    const removed = await themeEditPreviewRemove('colors', {cwd});
    expect(removed.data.removed).toEqual([`${ROUTE}/_pages/colors.tsx`]);
    expect(removed.data.kept).toEqual([]);
  }, 120_000);

  it('still sees an edit to code, a string or a comment after formatting', async () => {
    await themeEditPreviewAdd(undefined, {cwd, theme: 'sea'});
    // page.tsx is written again on every add, so its edits are checked.
    const file = path.join(cwd, ROUTE, 'page.tsx');
    const text = fs.readFileSync(file, 'utf8');
    for (const edited of [
      text.replace('// Written by', '// Mine. Written by'),
      text.replace('label="Theme preview"', 'label="Theme previews"'),
      text.replace("position: 'fixed'", "position: 'absolute'"),
    ]) {
      expect(edited).not.toBe(text);
      fs.writeFileSync(file, edited);
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, template: 'blank'}),
      );
      expect(r.code).toBe('ERR_FILE_EXISTS');
    }
    fs.writeFileSync(file, text);
  }, 120_000);
});

describe('final pass 5', () => {
  /** @param {string} rel */
  const rm = rel =>
    fs.rmSync(path.join(cwd, rel), {recursive: true, force: true});
  /** Move a file or folder aside for `fn`, then put it back. @param {string} rel @param {() => Promise<void>} fn */
  const aside = async (rel, fn) => {
    const had = exists(rel);
    if (had) fs.renameSync(path.join(cwd, rel), path.join(cwd, `${rel}.aside`));
    try {
      await fn();
    } finally {
      rm(rel);
      if (had)
        fs.renameSync(path.join(cwd, `${rel}.aside`), path.join(cwd, rel));
    }
  };

  it('refuses a folder with a catch-all route in it or at its URL', async () => {
    for (const [file, where] of [
      ['src/app/cx/[[...x]]/page.tsx', 'src/app/cx'],
      ['src/app/(g)/cz/[[...x]]/page.tsx', 'src/app/cz'],
    ]) {
      write(file, 'export default 1;\n');
      try {
        const r = await refusal(() =>
          themeEditPreviewAdd(undefined, {cwd, path: where}),
        );
        expect(r.code, file).toBe('ERR_FILE_EXISTS');
        expect(r.message, file).toContain(`${file} already serves`);
        expect(exists(`${where}/page.tsx`), file).toBe(false);
      } finally {
        rm(file.split('/').slice(0, 3).join('/'));
      }
    }
  });

  it('refuses an app with no root layout anywhere, naming preview app', async () => {
    await aside('src/app/layout.tsx', async () => {
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {cwd, path: 'src/app/nl'}),
      );
      expect(r.code).toBe('ERR_INVALID_ARGUMENT');
      expect(r.message).toContain('src/app/ has no root layout');
      expect(r.run[0]).toMatch(
        /^astryx experimental theme preview app theme-app/,
      );
      expect(exists('src/app/nl')).toBe(false);
    });
  });

  it('refuses a default preview folder that leads outside the project', async () => {
    const outside = fs.mkdtempSync(path.join(path.dirname(cwd), 'astryx-out-'));
    try {
      await aside('src/app/theme-preview', async () => {
        fs.symlinkSync(outside, path.join(cwd, 'src/app/theme-preview'));
        const r = await refusal(() => themeEditPreviewAdd(undefined, {cwd}));
        expect(r.code).toBe('ERR_PATH_TRAVERSAL');
        expect(r.run[0]).toContain('--path src/app/theme-preview-2');
        expect(fs.readdirSync(outside)).toEqual([]);
      });
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });

  it('lets a required catch-all route live in the preview folder: it never serves the folder URL', async () => {
    write('src/app/cy/[...slug]/page.tsx', 'export default 1;\n');
    try {
      const r = await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/cy'});
      expect(r.data.folder).toBe('src/app/cy');
    } finally {
      rm('src/app/cy');
    }
  }, 120_000);

  it('finds a root layout in nested route groups', async () => {
    fs.rmSync(path.join(cwd, 'src/app/layout.tsx'), {force: true});
    write(
      'src/app/(a)/(b)/layout.tsx',
      'export default function L({children}: any) { return children; }\n',
    );
    const r = await themeEditPreviewAdd(undefined, {
      cwd,
      path: 'src/app/(a)/(b)/nested',
    });
    expect(r.data.folder).toBe('src/app/(a)/(b)/nested');
    rm('src/app/(a)');
  }, 120_000);

  it('reads next.config from its syntax: comments, spreads, nested keys and constants', async () => {
    /** @param {string} file @param {string} text @param {string} where */
    const addWith = async (file, text, where) => {
      write(file, text);
      try {
        return await themeEditPreviewAdd(undefined, {cwd, path: where});
      } finally {
        rm(file);
        rm(where);
      }
    };
    // A commented-out list is no setting.
    const commented = await addWith(
      'next.config.mjs',
      "export default {\n  // pageExtensions: ['mdx'],\n};\n",
      'src/app/c1',
    );
    expect(commented.data.notes.join(' ')).not.toContain('pageExtensions');
    // A spread list is only known by running the config: a note, no refusal.
    const spread = await addWith(
      'next.config.mjs',
      "const base = ['tsx', 'ts', 'jsx', 'js'];\nexport default {pageExtensions: [...base, 'mdx']};\n",
      'src/app/c2',
    );
    expect(spread.data.notes.join(' ')).toContain(
      'next.config.mjs sets pageExtensions in a way only running it tells',
    );
    // A key inside another object is not the app's basePath.
    const nested = await addWith(
      'next.config.mjs',
      "export default {env: {basePath: '/notit'}};\n",
      'src/app/c3',
    );
    expect(nested.data.open).toContain('open /c3 in the running app');
    // A shorthand key takes its constant.
    const shorthand = await addWith(
      'next.config.mjs',
      "const basePath = '/x';\nexport default {basePath};\n",
      'src/app/c4',
    );
    expect(shorthand.data.open).toContain('open /x/c4 in the running app');
    // A typed TypeScript config, exported by name.
    const typed = await addWith(
      'next.config.ts',
      "import type {NextConfig} from 'next';\nconst nextConfig: NextConfig = {basePath: '/t/'};\nexport default nextConfig;\n",
      'src/app/c5',
    );
    expect(typed.data.open).toContain('open /t/c5 in the running app');
  }, 180_000);

  it('notes pageExtensions only when the config may set it in a way it cannot read', async () => {
    /** @param {string} text @param {string} where */
    const notesWith = async (text, where) => {
      write('next.config.mjs', text);
      try {
        return (
          await themeEditPreviewAdd(undefined, {cwd, path: where})
        ).data.notes.join(' ');
      } finally {
        rm('next.config.mjs');
        rm(where);
      }
    };
    const NOTE = 'sets pageExtensions in a way only running it tells';
    // A spread of a constant object is read in place.
    expect(
      await notesWith(
        'const base = {reactStrictMode: true};\nexport default {...base};\n',
        'src/app/n1',
      ),
    ).not.toContain(NOTE);
    // A literal list after a spread of anything wins.
    expect(
      await notesWith(
        "import shared from './shared.mjs';\nexport default {...shared, pageExtensions: ['tsx', 'mdx']};\n",
        'src/app/n2',
      ),
    ).not.toContain(NOTE);
    // Methods and other keys say nothing about it.
    expect(
      await notesWith(
        'export default {reactStrictMode: true, async headers() { return []; }};\n',
        'src/app/n3',
      ),
    ).not.toContain(NOTE);
    // A spread of an import may carry it, and so may a function config.
    expect(
      await notesWith(
        "import shared from './shared.mjs';\nexport default {...shared};\n",
        'src/app/n4',
      ),
    ).toContain(NOTE);
    expect(
      await notesWith(
        'export default phase => ({reactStrictMode: true});\n',
        'src/app/n5',
      ),
    ).toContain(NOTE);
  }, 180_000);

  it('reads basePath without comments, and says when code sets it', async () => {
    write('next.config.mjs', "export default {\n  // basePath: '/old',\n};\n");
    try {
      const plain = await themeEditPreviewAdd(undefined, {
        cwd,
        path: 'src/app/b1',
      });
      expect(plain.data.open).toContain('open /b1 in the running app');
      write(
        'next.config.mjs',
        'export default {basePath: process.env.BASE_PATH};\n',
      );
      const env = await themeEditPreviewAdd(undefined, {
        cwd,
        path: 'src/app/b2',
      });
      expect(env.data.open).toContain(
        'open /b2 in the running app, after the basePath next.config sets from code',
      );
    } finally {
      rm('next.config.mjs');
      rm('src/app/b1');
      rm('src/app/b2');
    }
  }, 120_000);

  it('puts basePath in front of the URL to open', async () => {
    write('next.config.mjs', "export default {basePath: '/docs'};\n");
    try {
      const r = await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/bp'});
      expect(r.data.open).toContain('open /docs/bp in the running app');
    } finally {
      rm('next.config.mjs');
      rm('src/app/bp');
    }
  }, 120_000);

  it("names the import line when the app never loads Core's stylesheet", async () => {
    const layout = read('src/app/layout.tsx');
    write(
      'src/app/layout.tsx',
      'export default function RootLayout({children}) { return children; }\n',
    );
    try {
      const r = await themeEditPreviewAdd(undefined, {cwd, path: 'src/app/ns'});
      expect(r.data.notes.join(' ')).toContain(
        "the app does not import Core's stylesheet, so the preview's components render unstyled and some show nothing; add import '@astryxdesign/core/astryx.css'; to src/app/layout.tsx",
      );
    } finally {
      write('src/app/layout.tsx', layout);
      rm('src/app/ns');
    }
  }, 120_000);

  it('keeps the app building when the theme loses its colors under a kept Colors page', async () => {
    await themeEditNew('c1', {cwd, like: 'neutral'});
    try {
      await themeEditSet('c1', 'danger', '#dc2626', {cwd});
      await themeEditPreviewAdd(undefined, {
        cwd,
        theme: 'c1',
        path: 'src/app/pc',
      });
      const page = 'src/app/pc/_pages/colors.tsx';
      write(page, `${read(page)}// my note\n`);
      const r = await themeEditUndo('c1', {cwd, thing: 'danger'});
      const stale = /** @type {any} */ (r.data).previewStale.join(' ');
      expect(stale).toContain(
        'holds an empty stand-in that keeps the app building',
      );
      const palette = read('themes/c1/tokens/c1.palette.ts');
      expect(palette).toContain('export const palette = {} as const;');
      // The stand-in is the editor's own: a new color replaces it, unasked.
      const again = await themeEditSet('c1', 'danger', '#b91c1c', {cwd});
      expect(again.data.notes.join(' ')).not.toContain('edited by hand');
      expect(read('themes/c1/tokens/c1.palette.ts')).not.toContain('stand-in');
    } finally {
      rm('src/app/pc');
      rm('themes/c1');
    }
  }, 180_000);

  it('names the link when a folder inside the preview leads outside', async () => {
    const outside = fs.mkdtempSync(path.join(path.dirname(cwd), 'astryx-out-'));
    try {
      await themeEditPreviewAdd(undefined, {
        cwd,
        theme: 'sea',
        path: 'src/app/pn',
      });
      rm('src/app/pn/_pages');
      fs.symlinkSync(outside, path.join(cwd, 'src/app/pn/_pages'));
      const r = await refusal(() =>
        themeEditPreviewAdd(undefined, {
          cwd,
          path: 'src/app/pn',
          template: 'blank',
        }),
      );
      expect(r.code).toBe('ERR_PATH_TRAVERSAL');
      expect(r.message).toContain(
        `${path.join(cwd, 'src/app/pn/_pages')} is a link to ${outside}`,
      );
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      rm('src/app/pn');
      fs.rmSync(outside, {recursive: true, force: true});
    }
  }, 120_000);
});
