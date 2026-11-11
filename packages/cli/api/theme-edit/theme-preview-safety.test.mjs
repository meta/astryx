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
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
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

const APP_PACKAGES = {
  name: 'app',
  private: true,
  type: 'module',
  dependencies: {
    '@heroicons/react': '*',
    'lucide-react': '*',
    recharts: '*',
  },
};
const ROUTE = 'src/app/theme-preview';

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
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(cwd, rel));
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
  await themeEditNew('brand', {cwd, like: 'neutral'});
  await themeEditSet('brand', 'accent', '#7c3aed', {cwd});
  await themeEditNew('sea', {cwd, like: 'neutral'});
}, 180_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

beforeEach(() => {
  for (const d of fs.readdirSync(path.join(cwd, 'src/app')))
    fs.rmSync(path.join(cwd, 'src/app', d), {recursive: true, force: true});
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
    const r = await themeEditPreviewAdd(undefined, {cwd, template: 'blank'});
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
      await themeEditPreviewRemove(undefined, {cwd, path: 'src'});
      expect(exists('src/pages')).toBe(false);
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
