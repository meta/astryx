// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file css-checks.kept.test.mjs
 * @input Themes whose part styles hold pseudo keys and whose tokens hold
 *   names that are no custom property's, and an installed-looking CLI whose
 *   store keeps summaries
 * @output What theme build's css-tree checks give is read back, with no
 *   css-tree loaded, while the keys and css-tree's files are unchanged; the
 *   problems equal a fresh check's; a theme with nothing to ask css-tree
 *   keeps nothing; a check that throws keeps nothing; a theme's [light,
 *   dark] pairs are judged from a kept answer, with no css-tree loaded
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {performance} from 'node:perf_hooks';

const {TEMP_ROOT} = await vi.hoisted(async () => {
  const nodeFs = await import('node:fs');
  const nodeOs = await import('node:os');
  const nodePath = await import('node:path');
  return {
    TEMP_ROOT: nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'astryx-kept-pseudo-keys-test-'),
    ),
  };
});

vi.mock('../../../foundation/fs/paths.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  CLI_ROOT: path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli'),
}));

/** Each time a check asks for css-tree, and whether its tokenizer fails. */
const cssTreeAsked = vi.hoisted(() => ({count: 0, fail: false}));

/** Whether css-tree's files read as a reinstall while this process runs left them. */
const reinstalled = vi.hoisted(() => ({now: false}));

/** Whether a reinstall pointed css-tree at another copy of mdn-data. */
const relinked = vi.hoisted(() => ({now: false}));

vi.mock('../../../foundation/fs/read-record.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    // A reinstall rewrites css-tree's files: their times are after this
    // process started.
    fileStamp: (/** @type {string} */ file) => {
      const stamp = real.fileStamp(file);
      if (!reinstalled.now || !file.includes(`${path.sep}css-tree${path.sep}`))
        return stamp;
      const [size, , , ino] = stamp.split(':');
      const at = performance.timeOrigin - 1000;
      return `${size}:${at}:${at}:${ino}`;
    },
    // The old copy stays on disk; only the folder the lookup takes points
    // elsewhere.
    resolvedNow: (/** @type {string} */ file) =>
      relinked.now && file.endsWith(path.join('node_modules', 'mdn-data'))
        ? `real:${path.join(path.sep, 'another', 'mdn-data')}`
        : real.resolvedNow(file),
  };
});

vi.mock('../../../foundation/runtime/css-tree.mjs', async importOriginal => {
  const real = /** @type {any} */ (await importOriginal());
  return {
    ...real,
    cssTree: () => {
      cssTreeAsked.count++;
      const tree = real.cssTree();
      if (!cssTreeAsked.fail) return tree;
      return {
        ...tree,
        tokenize: () => {
          throw new Error('tokenizer failed');
        },
      };
    },
  };
});

/** @type {typeof import('./style-keys.mjs')} */
let styleKeys;
/** @type {typeof import('./written-values.mjs')} */
let writtenValues;
const savedCache = process.env.XDG_CACHE_HOME;
const STORE = path.join(TEMP_ROOT, 'cache', 'astryx', 'catalogs');

/** The time a stamp needs to settle before a summary is stored, plus margin. */
const SETTLE_WAIT_MS = 2200;

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A theme whose Button styles hold `pseudo`, on the page and on onDark.
 * @param {Record<string, unknown>} pseudo
 */
const themeWith = pseudo => ({
  components: {
    Button: {
      root: {color: 'red', ...pseudo, '@dark': {':focus': {color: 'blue'}}},
    },
  },
  onDark: {components: {Card: {root: {...pseudo}}}},
});

const PSEUDO = {
  ':hover': {color: 'green'},
  '::before': {content: '""'},
  ':is(.a, .b)': {color: 'gray'},
  ':hover(': {color: 'black'},
  '::befor': {color: 'pink'},
  '::made-up-element': {color: 'teal'},
};

/** The kept checks in the store. */
const keptChecks = () =>
  fs
    .readdirSync(STORE)
    .filter(name => name.endsWith('.json'))
    .filter(name =>
      String(
        JSON.parse(fs.readFileSync(path.join(STORE, name), 'utf8')).key,
      ).includes('theme-pseudo-key-checks'),
    );

/**
 * The problems of `theme`, and how many times its check asked for css-tree.
 * @param {Record<string, any>} theme
 */
const check = theme => {
  const before = cssTreeAsked.count;
  const problems = styleKeys.styleKeyProblems(theme);
  return {problems, asked: cssTreeAsked.count - before};
};

/**
 * The problems of `theme` with no store to keep anything in.
 * @param {Record<string, any>} theme
 */
const fresh = theme => {
  const saved = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'no-store');
  try {
    return styleKeys.styleKeyProblems(theme);
  } finally {
    process.env.XDG_CACHE_HOME = saved;
  }
};

beforeAll(async () => {
  const cli = path.join(TEMP_ROOT, 'node_modules', '@astryxdesign', 'cli');
  fs.mkdirSync(path.join(cli, 'clients', 'cli'), {recursive: true});
  fs.writeFileSync(
    path.join(cli, 'clients', 'cli', 'build-id.generated.json'),
    JSON.stringify({id: 'kept-pseudo-keys-test'}),
  );
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'cache');
  fs.mkdirSync(STORE, {recursive: true, mode: 0o700});
  fs.chmodSync(path.join(TEMP_ROOT, 'cache', 'astryx'), 0o700);
  styleKeys = await import('./style-keys.mjs');
  writtenValues = await import('./written-values.mjs');
  // css-tree's files were stamped long ago; the store keeps an answer only
  // once every stamp has settled.
  await sleep(SETTLE_WAIT_MS);
});

beforeEach(() => {
  for (const name of fs.readdirSync(STORE)) fs.rmSync(path.join(STORE, name));
  cssTreeAsked.fail = false;
  reinstalled.now = false;
  relinked.now = false;
});

afterAll(() => {
  if (savedCache === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = savedCache;
  fs.rmSync(TEMP_ROOT, {recursive: true, force: true});
});

describe("theme build's checks of a theme's pseudo keys", () => {
  it('are read back without css-tree, the same as a fresh check', () => {
    const theme = themeWith(PSEUDO);
    const first = check(theme);
    expect(first.asked).toBeGreaterThan(0);
    // A real mix: problems and a note.
    expect(first.problems.length).toBeGreaterThan(2);
    expect(keptChecks()).toHaveLength(1);
    const again = check(theme);
    expect(again.asked).toBe(0);
    expect(again.problems).toEqual(first.problems);
    expect(again.problems).toEqual(fresh(theme));
  });

  it('keep nothing for a theme with no pseudo key, and load no css-tree', () => {
    const theme = {components: {Button: {root: {color: 'red', '@light': {}}}}};
    const result = check(theme);
    expect(result.asked).toBe(0);
    expect(result.problems).toEqual(fresh(theme));
    expect(keptChecks()).toHaveLength(0);
  });

  it('check again after a pseudo key is added, edited or removed, or a file of css-tree changes', () => {
    check(themeWith(PSEUDO));
    /** @type {Array<[string, Record<string, unknown>]>} */
    const changes = [
      ['a key added', {...PSEUDO, ':focus-visible': {color: 'navy'}}],
      [
        'a key edited',
        {
          ...Object.fromEntries(
            Object.entries(PSEUDO).filter(([k]) => k !== ':hover'),
          ),
          ':hover:not(:disabled)': {color: 'green'},
        },
      ],
      [
        'a key removed',
        Object.fromEntries(
          Object.entries(PSEUDO).filter(([k]) => k !== '::befor'),
        ),
      ],
    ];
    for (const [what, pseudo] of changes) {
      const theme = themeWith(pseudo);
      const after = check(theme);
      expect({what, checked: after.asked > 0}).toEqual({what, checked: true});
      expect(after.problems).toEqual(fresh(theme));
      expect({what, again: check(theme).asked}).toEqual({what, again: 0});
    }

    // As a reinstall that changed one file of css-tree's leaves it.
    for (const name of keptChecks()) {
      const file = path.join(STORE, name);
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
      stored.stamps[0][1] = 'changed';
      fs.writeFileSync(file, JSON.stringify(stored));
    }
    const theme = themeWith(PSEUDO);
    const after = check(theme);
    expect(after.asked).toBeGreaterThan(0);
    expect(after.problems).toEqual(fresh(theme));
  });

  it('keep nothing worked out by the css-tree this process loaded once a reinstall changes its files', () => {
    check(themeWith(PSEUDO));
    reinstalled.now = true;
    const theme = themeWith({...PSEUDO, ':active': {color: 'olive'}});
    const after = check(theme);
    expect(after.asked).toBeGreaterThan(0);
    expect(after.problems).toEqual(fresh(theme));
    // Nothing kept under the new files' stamps: asked again.
    expect(check(theme).asked).toBeGreaterThan(0);
  });

  it('keep nothing from a first check by a css-tree loaded another way before a reinstall', () => {
    // css-tree loaded by another part of the build, before any check.
    createRequire(import.meta.url)('css-tree');
    reinstalled.now = true;
    const theme = themeWith(PSEUDO);
    expect(check(theme).asked).toBeGreaterThan(0);
    expect(keptChecks()).toHaveLength(0);
    expect(check(theme).asked).toBeGreaterThan(0);
  });

  it('check again after a reinstall points css-tree at another copy of mdn-data', () => {
    const theme = themeWith(PSEUDO);
    check(theme);
    const [name] = keptChecks();
    const {stamps} = JSON.parse(
      fs.readFileSync(path.join(STORE, name), 'utf8'),
    );
    // The folder css-tree's lookup took for mdn-data is stamped by the real
    // path it resolves to.
    expect(
      stamps.some(
        (/** @type {[string, string]} */ [file, stamp]) =>
          file.endsWith(path.join('node_modules', 'mdn-data')) &&
          stamp.startsWith('real:'),
      ),
    ).toBe(true);
    expect(check(theme).asked).toBe(0);
    relinked.now = true;
    expect(check(theme).asked).toBeGreaterThan(0);
  });

  it('keep nothing when a check throws', () => {
    cssTreeAsked.fail = true;
    expect(() => check(themeWith(PSEUDO))).toThrow('tokenizer failed');
    expect(keptChecks()).toHaveLength(0);
  });

  it("stamp css-tree's files and the selector data it read", () => {
    check(themeWith(PSEUDO));
    const [name] = keptChecks();
    const {stamps} = JSON.parse(
      fs.readFileSync(path.join(STORE, name), 'utf8'),
    );
    const files = stamps.map((/** @type {[string, string]} */ [file]) => file);
    expect(
      files.some((/** @type {string} */ file) =>
        file.includes(`${path.sep}css-tree${path.sep}`),
      ),
    ).toBe(true);
    expect(
      files.some((/** @type {string} */ file) =>
        file.endsWith(path.join('mdn-data', 'css', 'selectors.json')),
      ),
    ).toBe(true);
  });
});

/** The kept answers of which token names are CSS properties' in the store. */
const keptNames = () =>
  fs
    .readdirSync(STORE)
    .filter(name => name.endsWith('.json'))
    .filter(name =>
      String(
        JSON.parse(fs.readFileSync(path.join(STORE, name), 'utf8')).key,
      ).includes('css-property-names'),
    );

/**
 * The written-value problems of `theme`, how many times the check asked for
 * css-tree, and what a check with no store gives.
 * @param {Record<string, any>} theme
 * @param {Parameters<typeof import('./written-values.mjs').writtenValueProblems>[1]} [options]
 */
const checkValues = (theme, options = {}) => {
  const before = cssTreeAsked.count;
  const problems = writtenValues.writtenValueProblems(theme, options);
  const asked = cssTreeAsked.count - before;
  const saved = process.env.XDG_CACHE_HOME;
  process.env.XDG_CACHE_HOME = path.join(TEMP_ROOT, 'no-store');
  try {
    return {
      problems,
      asked,
      fresh: writtenValues.writtenValueProblems(theme, options),
    };
  } finally {
    process.env.XDG_CACHE_HOME = saved;
  }
};

describe("theme build's check of which token names are CSS properties'", () => {
  it('is read back without css-tree, the same as a fresh check, and asked again for other names', () => {
    const theme = {
      tokens: {'color-scheme': 'light dark', 'colour-accent': 'red'},
      onDark: {tokens: {'--color-accent': 'blue', accent: 'green'}},
    };
    const first = checkValues(theme);
    expect(first.asked).toBeGreaterThan(0);
    expect(first.problems).toEqual(first.fresh);
    // colour-accent and accent are no property's; color-scheme is one.
    expect(first.problems.map(p => p.path.at(-1)).sort()).toEqual([
      'accent',
      'colour-accent',
    ]);
    expect(keptNames()).toHaveLength(1);
    const again = checkValues(theme);
    expect(again.asked).toBe(0);
    expect(again.problems).toEqual(first.problems);

    const other = {...theme, tokens: {...theme.tokens, display: 'block'}};
    const changed = checkValues(other);
    expect(changed.asked).toBeGreaterThan(0);
    expect(changed.problems).toEqual(changed.fresh);
  });

  it('keeps nothing for tokens that are all custom properties, and loads no css-tree', () => {
    const result = checkValues({tokens: {'--color-accent': 'red'}});
    expect(result.asked).toBe(0);
    expect(result.problems).toEqual(result.fresh);
    expect(keptNames()).toHaveLength(0);
  });

  it("keeps nothing for a surface that holds only Core's own tokens, and loads no css-tree", () => {
    const onDark = {'color-scheme': 'dark', '--color-accent': 'white'};
    const result = checkValues(
      {tokens: {'--color-accent': 'red'}, onDark: {tokens: {...onDark}}},
      {surfaceDefaults: {onDark}},
    );
    expect(result.asked).toBe(0);
    expect(result.problems).toEqual(result.fresh);
    expect(keptNames()).toHaveLength(0);
  });
});

describe("theme build's check of a theme's [light, dark] pairs", () => {
  /** The kept answers for [light, dark] halves in the store. */
  const keptHalves = () =>
    fs
      .readdirSync(STORE)
      .filter(name => name.endsWith('.json'))
      .filter(name =>
        String(
          JSON.parse(fs.readFileSync(path.join(STORE, name), 'utf8')).key,
        ).includes('light-dark-non-colors'),
      );

  it('is read back without css-tree, the same as a fresh check', () => {
    const theme = {
      tokens: {
        '--color-accent': ['#fff', '#000'],
        '--color-border': ['red', '4px'],
        '--color-text': ['color-mix(in oklab, red, blue)', 'blue'],
      },
    };
    const first = checkValues(theme);
    expect(first.asked).toBeGreaterThan(0);
    expect(first.problems).toEqual(first.fresh);
    expect(first.problems.map(p => p.path.at(-1))).toEqual(['--color-border']);
    expect(keptHalves()).toHaveLength(1);
    const again = checkValues(theme);
    expect(again.asked).toBe(0);
    expect(again.problems).toEqual(first.problems);
  });
});
