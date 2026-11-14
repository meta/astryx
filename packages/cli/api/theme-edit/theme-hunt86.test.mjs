// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Repairs that work when followed: a damaged mode or base with a
 * second bad value leads with the fix that passes, never a bare undo; a
 * vibrancy line only where it acts, and the reason named; undo keeps its
 * command for a theme name typed in another form; a name with a doubled
 * dash gets the name new takes; the tracking half of headings listed twice
 * is undone by name; stray punctuation and typographic dashes in --on
 * name the part, never its group; a light/dark pair on new offers the
 * user's own colors; a doubled entry for a one-mode theme's own mode is
 * kept with that --mode.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
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

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt86-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

const T = 120_000;

/** A fresh theme with the settings file edited by hand. @param {string} slug @param {(j: any) => void} [edit] @param {Record<string, any>} [opts] */
const fresh = async (slug, edit, opts = {}) => {
  fs.rmSync(path.join(cwd, 'themes', slug), {recursive: true, force: true});
  await themeEditNew(slug, {cwd, like: 'neutral', settings: opts});
  if (edit) {
    const f = path.join(cwd, 'themes', slug, `${slug}.settings.json`);
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    edit(j);
    fs.writeFileSync(f, JSON.stringify(j, null, 2));
  }
};

/** The refusal of a call: its message and suggested commands, bare. @param {() => Promise<unknown>} run */
const refusal = async run => {
  try {
    await run();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ x) =>
        String(x.name).replace(/^.* editor /, ''),
      ),
    };
  }
  throw new Error('expected a refusal');
};

/** Run a suggested editor command. @param {string} line */
const follow = async line => {
  const w = [...line.matchAll(/'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2]);
  const [sub, slug, ...rest] = w;
  /** @type {Record<string, any>} */
  const o = {cwd};
  const pos = [];
  for (let i = 0; i < rest.length; i++)
    if (rest[i].startsWith('--')) o[rest[i].slice(2)] = rest[++i];
    else pos.push(rest[i]);
  if (sub === 'set') return themeEditSet(slug, pos[0], pos[1], o);
  if (sub === 'undo')
    return themeEditUndo(slug, {
      ...o,
      ...(pos[0] ? {thing: pos[0]} : {}),
      ...(pos[1] ? {value: pos[1]} : {}),
    });
  throw new Error(`not followed: ${line}`);
};

describe('a damaged mode or base with a second bad value', () => {
  it.each([
    [
      j => {
        j.mode = 'Dark-Only';
        j.settings[0].value = 'Pill ';
      },
      'mode',
      'dark-only',
    ],
    [
      j => {
        j.like = 'Neutral';
        j.settings[0].value = 'blob';
      },
      'base',
      'neutral',
    ],
  ])(
    'leads with a fix that passes and saves the field, never a bare undo (%#)',
    async (edit, field, saved) => {
      await fresh('h1', j => edit(j), {corners: 'pill', mode: 'dark-only'});
      const r = await refusal(() => themeEditShow('h1', {cwd}));
      expect(r.message).toContain(`saves the ${field} as ${saved}`);
      expect(r.run).not.toContain('undo h1');
      expect(r.run.length).toBeGreaterThan(0);
      await follow(r.run[0]);
      const after = JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/h1/h1.settings.json'), 'utf8'),
      );
      expect(after.mode).toBe('dark-only');
      expect(after.like).toBe('neutral');
      await themeEditShow('h1', {cwd});
    },
    T,
  );
});

describe('vibrancy', () => {
  it(
    'a stored vibrancy is not offered as a set when no color dial is set, and the reason names the token color',
    async () => {
      await fresh('h2', j => {
        j.settings.push({
          thing: '--color-accent',
          value: '#e11d48',
          source: 'token',
        });
        j.settings.push({thing: 'vibrancy', value: '0.5', source: 'dial'});
      });
      const r = await refusal(() => themeEditShow('h2', {cwd}));
      expect(r.run.some(x => /set h2 vibrancy/.test(x))).toBe(false);
      expect(r.run).toContain('undo h2 vibrancy');
      await follow('undo h2 vibrancy');
      const no = await refusal(() =>
        themeEditSet('h2', 'vibrancy', '50', {cwd}),
      );
      expect(no.message).toMatch(
        /values of their own \(--color-accent #e11d48\)/,
      );
    },
    T,
  );
});

describe('theme names', () => {
  it.each(['hTheme', 'H', 'themes/h'])(
    'undo %s suggests undo h with the same thing',
    async typed => {
      await fresh('h', undefined, {corners: 'pill'});
      const r = await refusal(() =>
        themeEditUndo(typed, {cwd, thing: 'corners'}),
      );
      expect(r.run[0]).toBe('undo h corners');
      const bare = await refusal(() => themeEditUndo(typed, {cwd}));
      expect(bare.run[0]).toBe('undo h');
    },
    T,
  );
  it(
    'a doubled or trailing dash gets the cleaned name, never a new new refuses',
    async () => {
      await fresh('h7-dark');
      const r = await refusal(() => themeEditShow('h7--dark', {cwd}));
      expect(r.run[0]).toBe('show h7-dark');
      expect(r.run.some(x => /new h7--dark/.test(x))).toBe(false);
      const gone = await refusal(() => themeEditShow('zz--top', {cwd}));
      expect(gone.run).toContain('new zz-top');
    },
    T,
  );
});

describe('headings tracking listed twice', () => {
  it(
    'show and undo offer the tracking undo, which works',
    async () => {
      await fresh(
        'h9',
        j => {
          j.settings.push({
            thing: 'headings',
            value: 'wide',
            source: 'dial',
            axis: 'tracking',
          });
        },
        {headings: 'tight'},
      );
      const r = await refusal(() => themeEditShow('h9', {cwd}));
      expect(r.run).toContain('undo h9 headings tracking');
      const u = await refusal(() =>
        themeEditUndo('h9', {cwd, thing: 'headings'}),
      );
      expect(u.run[0]).toBe('undo h9 headings tracking');
      await follow('undo h9 headings tracking');
      await themeEditShow('h9', {cwd});
    },
    T,
  );
});

describe('--on with stray punctuation', () => {
  it.each(['text-input,', 'text\u2013input', ' text-input. '])(
    '%s names text-input, never the inputs group',
    async on => {
      await fresh('h11');
      const r = await refusal(() =>
        themeEditSet('h11', 'padding', '8px', {cwd, on}),
      );
      expect(r.run[0]).toBe('set h11 padding 8px --on text-input');
    },
    T,
  );
});

describe('a light/dark pair on new', () => {
  it(
    'offers the dark color for a dark-only theme, never a stock color',
    async () => {
      const r = await refusal(() =>
        themeEditNew('h8', {
          cwd,
          like: 'neutral',
          settings: {mode: 'dark-only', accent: 'light #111111 dark #eeeeee'},
        }),
      );
      expect(r.run[0]).toMatch(/^new h8 .*--accent '#eeeeee'/);
      expect(r.run.join(' ')).not.toMatch(/#7c3aed/);
    },
    T,
  );
  it(
    'a theme mode with no color given gets how, never a stock color',
    async () => {
      const r = await refusal(() =>
        themeEditNew('h8', {
          cwd,
          like: 'neutral',
          settings: {mode: 'light-only', accent: 'dark #eeeeee'},
        }),
      );
      expect(r.run[0]).toBe('how accent');
      expect(r.run.join(' ')).not.toMatch(/#7c3aed/);
    },
    T,
  );
});

describe("a doubled entry for a one-mode theme's own mode", () => {
  it(
    'the keep command passes and unlocks the theme',
    async () => {
      await fresh('hl');
      await themeEditSet('hl', 'color', '#e11d48', {
        cwd,
        on: 'badge',
        mode: 'dark',
      });
      await themeEditSet('hl', 'mode', 'dark-only', {cwd});
      const f = path.join(cwd, 'themes/hl/hl.settings.json');
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      j.settings.push({
        ...j.settings.find((/** @type {any} */ x) => x.thing === 'color'),
      });
      fs.writeFileSync(f, JSON.stringify(j, null, 2));
      const r = await refusal(() =>
        themeEditSet('hl', 'corners', 'pill', {cwd}),
      );
      const keep = r.run.find(x => /^set hl color /.test(x));
      expect(keep).toBeTruthy();
      await follow(/** @type {string} */ (keep));
      await themeEditSet('hl', 'corners', 'pill', {cwd});
    },
    T,
  );
});
