// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every line a refusal offers runs and does what its label says: a
 * swapped setting beside an option typo, a var() token typo (typed and
 * saved), an undo naming two settings of different scopes, the chain
 * after a plain part fill, `new --base`, a name typed as more of a value,
 * one mode given twice, the editor's change and printed lines pasted back
 * with their scope in any case or with a mode label, capitalized entry
 * keys, a spaced setting name swapped beside a part typo, and the line that
 * drops --only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
const T = 240_000;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

/** @param {string[]} args */
const cli = args => {
  const r = spawnSync(process.execPath, [BIN, '--json', ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 120_000,
  });
  return {status: r.status, env: JSON.parse(r.stdout || '{}')};
};
/** @param {string[]} args */
const editor = args => cli(['experimental', 'theme', 'editor', ...args]);
/** The commands a refusal offers, after `editor `. @param {any} env */
const lines = env =>
  (env.suggestions ?? []).map((/** @type {{name: string}} */ s) =>
    s.name.replace(/^.* editor /, ''),
  );
/**
 * Runs an offered line as typed (after `editor `), the shell's quotes read.
 * @param {string} line
 */
const follow = line => {
  /** @type {string[]} */
  const words = [];
  for (const m of line.matchAll(/'((?:[^']|'\\'')*)'|(\S+)/g))
    words.push(m[1] != null ? m[1].replace(/'\\''/g, "'") : m[2]);
  return editor(words);
};
/** The theme's saved settings. @param {string} slug */
const saved = slug =>
  JSON.parse(
    fs.readFileSync(
      path.join(cwd, `themes/${slug}/${slug}.settings.json`),
      'utf8',
    ),
  ).settings;
/** @param {string} slug @param {any[]} settings */
const saveSettings = (slug, settings) => {
  const file = path.join(cwd, `themes/${slug}/${slug}.settings.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({...data, settings}, null, 2));
};

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt183-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  editor(['new', 't', '--like', 'neutral']);
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a swapped setting and value', () => {
  it(
    'beside an option typo gets one line with both repairs, which runs',
    () => {
      const r = editor(['set', 't', 'red', '--color-accent', '--mdoe', 'dark']);
      expect(r.status).toBe(1);
      expect(lines(r.env)[0]).toBe('set t --color-accent red --mode dark');
      expect(follow(lines(r.env)[0]).status).toBe(0);
      saveSettings('t', []);
    },
    T,
  );

  it(
    'with a spaced name beside a part typo gets the line, never how for the value',
    () => {
      const r = editor(['set', 't', 'red', 'background color', '--on', 'crad']);
      expect(lines(r.env)[0]).toBe("set t 'background color' red --on card");
      expect(lines(r.env)).not.toContain('how red');
      expect(follow(lines(r.env)[0]).status).toBe(0);
      saveSettings('t', []);
    },
    T,
  );
});

describe('a var() naming a token one letter off', () => {
  it(
    'gets the line typed, and as the saved repair beside the undo',
    () => {
      const r = editor(['set', 't', '--color-accent', 'var(--color-eror)']);
      expect(lines(r.env)).toContain(
        "set t --color-accent 'var(--color-error)'",
      );
      saveSettings('t', [
        {thing: '--color-accent', value: 'var(--color-eror)', source: 'token'},
      ]);
      const s = editor(['show', 't']);
      expect(lines(s.env)[0]).toBe('undo t --color-accent');
      expect(lines(s.env)).toContain(
        "set t --color-accent 'var(--color-error)'",
      );
      expect(follow("set t --color-accent 'var(--color-error)'").status).toBe(
        0,
      );
      saveSettings('t', []);
    },
    T,
  );
});

describe('undo naming two settings of different scopes', () => {
  it(
    'offers one undo for each, each of which runs',
    () => {
      editor(['set', 't', 'spacing', 'roomy']);
      editor(['set', 't', 'background-color', 'blue', '--on', 'card']);
      const r = editor([
        'undo',
        't',
        'spacing',
        'background-color',
        '--on',
        'card',
      ]);
      expect(lines(r.env)).toEqual([
        'undo t spacing',
        'undo t background-color --on card',
      ]);
      for (const l of lines(r.env)) expect(follow(l).status, l).toBe(0);
      expect(saved('t')).toEqual([]);
    },
    T,
  );
});

describe('a plain part fill that covers its variants', () => {
  it(
    'leads each "fill only one of them" chain with the undo of the fill',
    () => {
      const r = editor([
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'button',
      ]);
      const note = (r.env.data?.notes ?? []).find((/** @type {string} */ n) =>
        /fill only one of them/.test(n),
      );
      expect(note).toMatch(
        /to fill only one of them: \S.* editor undo t background-color --on button, then /,
      );
      expect(follow('undo t background-color --on button').status).toBe(0);
      expect(
        follow('set t background-color red --on button --when variant:primary')
          .status,
      ).toBe(0);
      expect(saved('t')).toEqual([
        expect.objectContaining({on: 'button', when: 'variant:primary'}),
      ]);
      saveSettings('t', []);
    },
    T,
  );
});

describe('new', () => {
  it(
    '--base offers the --like line as new checks it, every other flag repaired',
    () => {
      const r = editor(['new', 'n1', '--base', 'neutral', '--accent', 'bleu']);
      expect(lines(r.env)[0]).toBe('new n1 --like neutral --accent blue');
      expect(follow(lines(r.env)[0]).status).toBe(0);
    },
    T,
  );

  it(
    'reads a word straight after a value, with no name given, as more of it',
    () => {
      const r = editor(['new', '--font', 'Open', 'Sans']);
      expect(r.env.error).toContain('"Sans" is more of --font\'s value');
      expect(lines(r.env)[0]).toMatch(
        /^new my-theme(-\d+)? --font 'Open Sans'$/,
      );
      expect(follow(lines(r.env)[0]).status).toBe(0);
    },
    T,
  );

  it(
    'reads a light and a dark mode given together as both modes',
    () => {
      const r = editor(['new', 'n3', '--mode', 'light', '--mode', 'dark']);
      expect(r.env.suggestions[0].reason).toContain(
        'a light and a dark mode together are both modes',
      );
      expect(follow(lines(r.env)[0]).status).toBe(0);
    },
    T,
  );
});

describe('pasted lines', () => {
  it(
    "carry their repairs in the editor's arrow form too",
    () => {
      const r = editor(['set', 't', 'accent tomato -> tomatoe']);
      expect(lines(r.env)).toContain('set t accent tomato');
      const z = editor(['set', 't', 'z-index 1 -> 1,000', '--on', 'card']);
      expect(lines(z.env)).toContain('set t z-index 1000 --on card');
    },
    T,
  );

  it(
    'read a mode label in any case, and refuse a mode typo with its line',
    () => {
      expect(
        editor(['set', 't', '--color-accent (Dark): red -> blue']).status,
      ).toBe(0);
      expect(saved('t')).toEqual([
        expect.objectContaining({thing: '--color-accent', mode: 'dark'}),
      ]);
      saveSettings('t', []);
      expect(
        editor(['set', 't', '--color-accent [dark only]: red -> blue']).status,
      ).toBe(0);
      expect(saved('t')[0].mode).toBe('dark');
      saveSettings('t', []);
      const typo = editor(['set', 't', '--color-accent (drak): red -> blue']);
      expect(typo.status).toBe(1);
      expect(lines(typo.env)).toContain(
        'set t --color-accent blue --mode dark',
      );
      expect(saved('t')).toEqual([]);
    },
    T,
  );

  it(
    'keep a printed scope in another case or with a mode typo',
    () => {
      const card = editor(['set', 't', 'background-color = red on Card']);
      expect(lines(card.env)).toContain('set t background-color red --on card');
      expect(
        editor(['set', 't', 'background-color = red on card :Hover']).status,
      ).toBe(0);
      expect(saved('t')[0].state).toBe('hover');
      saveSettings('t', []);
      const mode = editor([
        'set',
        't',
        '--color-accent = red (whole theme) [drak only]',
      ]);
      expect(lines(mode.env)).toContain('set t --color-accent red --mode dark');
    },
    T,
  );

  it(
    'read an entry with its field keys in other letters as that entry',
    () => {
      expect(
        lines(editor(['set', 't', '{"Thing":"corners","Value":"pill"}']).env),
      ).toEqual(['set t corners pill']);
      expect(
        lines(editor(['set', 't', '{"padding":"8px","On":"card"}']).env),
      ).toEqual(['set t padding 8px --on card']);
    },
    T,
  );
});

describe('dropping --only', () => {
  it(
    'keeps every other scope flag',
    () => {
      const r = editor([
        'set',
        't',
        'background-color',
        'red',
        '--on',
        'card',
        '--when',
        'variant:muted',
        '--mode',
        'dark',
        '--only',
      ]);
      expect(lines(r.env)[0]).toBe(
        'set t background-color red --on card --when variant:muted --mode dark',
      );
    },
    T,
  );
});
