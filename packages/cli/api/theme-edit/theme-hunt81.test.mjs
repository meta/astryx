// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Two rules every repair follows, over a corpus of pasted shapes:
 * a suggested set line carries the value typed (or saved), cleaned, never a
 * stock value the input did not hold; and a label the editor does not read
 * as the setting's own name is refused with what it means, never dropped.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {carriesTyped, offersTyped} from './_edit.mjs';
import {escapesMeant} from './_normal.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt81-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * Mappings the editor documents: a word that means another value (night is
 * dark, lighter is light), so the line need not repeat the word typed.
 */
const MAPPED = [/ --mode (light|dark)$/];

/** The value a suggested line sets for `thing`, or null. @param {string} line @param {string} thing */
const valueSet = (line, thing) => {
  const m = new RegExp(
    ` set b (?:'([^']+)'|(\\S+)) (?:'((?:[^']|'\\\\'')*)'|(\\S+))`,
  ).exec(line);
  if (!m) return null;
  const t = (m[1] ?? m[2]).replace(/^-+/, '');
  if (t !== thing.replace(/^-+/, '')) return null;
  return m[3] ?? m[4];
};

/** Every pasted shape a repair meets: typed with `set`. */
const TYPED = /** @type {Array<[string, string, Record<string, string>?]>} */ ([
  ['accent', 'dark: #2563eb'],
  ['accent', '\\#e11d48'],
  ['accent', 'notacolor'],
  ['accent', '"#e11d48",'],
  ['accent', 'textSize: 18'],
  ['--color-accent', 'dark=#2563eb'],
  ['--color-accent', '{"dark": "#2563eb"}'],
  ['--color-accent', 'light-dark(red / blue)'],
  ['--color-accent', 'light-dark(#e11d48,)'],
  ['--color-accent', '\\#e11d48'],
  ['--text-supporting-size', 'banana'],
  ['--text-supporting-size', '16 px'],
  ['corners', 'mobile: pill'],
  ['corners', 'banana'],
  ['corners', 'Pill,'],
  ['text-size', 'phone: 14'],
  ['text-size', 'huge'],
  ['text-size', '{"value": 18, "unit": "px"}'],
  ['font', 'Georgia serif'],
  ['font', 'Inter, sans serif'],
  ['font', 'Font: Georgia'],
  ['font', 'https://fonts.example/x.woff2'],
  ['headings', 'lighter'],
  ['headings', 'bold tight'],
  ['headings', 'h1: bold'],
  ['headings', 'nope'],
  ['surfaces', 'dark: raised'],
  ['vibrancy', '0.5'],
]);

describe('a repair carries the value typed, never a stock value', () => {
  it.each(TYPED)('set %s %j', async (thing, value, opts) => {
    /** @type {any} */
    let err = null;
    try {
      await themeEditSet('b', thing, value, {cwd, ...(opts ?? {})});
    } catch (e) {
      err = e;
    }
    for (const s of err?.suggestions ?? []) {
      const v = valueSet(s.name, thing);
      if (v == null || MAPPED.some(re => re.test(s.name))) continue;
      expect(offersTyped(v, value), `${s.name} for ${value}`).toBe(true);
    }
  });

  it.each([
    ['--color-accent', 'light: red; dark: blue', 'token'],
    ['--color-accent', '{"light":"red","dark":"blue"}', 'token'],
    ['text-size', 'phone: 14', 'dial'],
    ['corners', 'accent: pill', 'dial'],
    ['font', '\\"Inter\\", serif', 'dial'],
    ['accent', 'notacolor', 'dial'],
  ])(
    'a saved %s %j',
    async (thing, value, source) => {
      const slug = `s${Math.abs([...`${thing}${value}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))}`;
      await themeEditNew(slug, {cwd});
      const file = path.join(cwd, 'themes', slug, `${slug}.settings.json`);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      j.settings = [{thing, value, source}];
      fs.writeFileSync(file, JSON.stringify(j, null, 2));
      /** @type {any} */
      let err = null;
      try {
        await themeEditShow(slug, {cwd});
      } catch (e) {
        err = e;
      }
      for (const s of err?.suggestions ?? []) {
        const m = new RegExp(
          ` set ${slug} (?:'([^']+)'|(\\S+)) (?:'((?:[^']|'\\\\'')*)'|(\\S+))`,
        ).exec(s.name);
        if (
          !m ||
          (m[1] ?? m[2]).replace(/^-+/, '') !== thing.replace(/^-+/, '')
        )
          continue;
        expect(offersTyped(m[3] ?? m[4], value), s.name).toBe(true);
      }
    },
    240_000,
  );
});

describe('a label is read, or refused with what it means', () => {
  it.each([
    ['accent', 'hover: #16a34a', /is a state/],
    ['corners', 'mobile: pill', /kind of screen/],
    ['corners', 'button: pill', /is a part.*--on button/],
    ['--color-accent', 'dark: #2563eb', /--mode dark/],
    ['surfaces', 'dark: raised', /same in light and dark/],
    ['accent', 'textSize: 18', /labeled text-size/],
    ['accent', '"corners": "pill"', /labeled corners/],
    ['font', 'accent: red', /labeled accent/],
    ['corners', 'gizmo: pill', /not a name the editor reads/],
    ['headings', 'h1: bold', /one heading level/],
  ])('%s %j is refused', async (thing, value, why) => {
    /** @type {any} */
    let err = null;
    try {
      await themeEditSet('b', thing, value, {cwd});
    } catch (e) {
      err = e;
    }
    expect(err?.message, `${thing} ${value}`).toMatch(why);
  });

  it("reads the setting's own label as the value", async () => {
    const r = await themeEditSet('b', 'font', 'fontFamily: Inter, serif', {
      cwd,
    });
    expect(r.data.setting.value).toBe('Inter, serif');
  });
});

describe('the stock values a repair never puts in', () => {
  it.each([
    ['#7c3aed', 'notacolor', false],
    ['#1f2937', '{"dark": "#2563eb"}', false],
    ['inter', 'Open\\ Sans', false],
    ['#e11d48', '\\#e11d48', true],
    ['light-dark(red, blue)', 'red / blue', true],
    ['Georgia, serif', 'Georgia serif', true],
  ])('%j for %j: %s', (offered, typed, ok) => {
    expect(offersTyped(offered, typed)).toBe(ok);
    expect(carriesTyped(offered, typed)).toBe(ok);
  });
});

describe('values typed in other notations', () => {
  it.each([
    ['--color-accent', 'LIGHT-DARK(red, blue)', 'light-dark(red, blue)'],
    ['--color-accent', '{"$value": "#e11d48"}', '#e11d48'],
    ['--color-accent', '["#e11d48"]', '#e11d48'],
    ['font', '["Open Sans","serif"]', '"Open Sans", serif'],
    ['text-size', '{"value": 18, "unit": "px"}', '18px'],
    ['accent', '\\#e11d48', '#e11d48'],
    ['content', '"\\u2022"', '"\\2022 "'],
    ['content', '"Step\\t1"', '"Step\\9 1"'],
  ])('%s %j is %j', (thing, value, want) => {
    expect(escapesMeant(thing, value)).toBe(want);
  });

  it('takes a size multiplied by a variable with a number fallback', async () => {
    await themeEditSet(
      'b',
      '--text-supporting-size',
      'calc(0.75rem * var(--x, 1))',
      {cwd},
    );
  });

  it('offers a light-dark() written with another separator, with a comma', async () => {
    let err = /** @type {any} */ (null);
    try {
      await themeEditSet('b', '--color-accent', 'light-dark(red / blue)', {
        cwd,
      });
    } catch (e) {
      err = e;
    }
    expect(err.suggestions[0].name).toMatch(/'light-dark\(red, blue\)'$/);
  });

  it('offers the comma a font list is missing before its generic family', async () => {
    let err = /** @type {any} */ (null);
    try {
      await themeEditSet('b', 'font', 'Georgia serif', {cwd});
    } catch (e) {
      err = e;
    }
    expect(err.suggestions[0].name).toMatch(/font 'Georgia, serif'$/);
  });

  it('names a second pasted declaration it did not set', async () => {
    const r = await themeEditSet('b', 'accent', '#e11d48; corners: pill', {
      cwd,
    });
    expect(r.data.notes.join(' ')).toMatch(/corners: pill.*set b corners pill/);
  });
});
