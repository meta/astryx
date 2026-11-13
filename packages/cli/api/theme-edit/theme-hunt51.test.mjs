// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fifty-first pass over `astryx experimental theme editor`: one
 * entry normalizer reads every setting the same way, typed or saved. Each
 * value type is set in each mangled form and must land as the clean value;
 * a saved value with invisible spaces is named with the clean one.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {normalizeEntry} from './_check.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt51-', FIXTURE_PACKAGES);
  await themeEditNew('b', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const file = () => path.join(cwd, 'themes/b/b.settings.json');
const saved = (/** @type {string} */ thing) =>
  JSON.parse(fs.readFileSync(file(), 'utf8')).settings.find(
    (/** @type {any} */ x) => x.thing === thing && !x.on,
  )?.value;
const names = (/** @type {any} */ e) =>
  (e.suggestions ?? []).map((/** @type {any} */ x) => x.name);

const NBSP = '\u00A0';
const THIN = '\u2009';
const ZW = '\u200B';

/** Each value type: thing, a clean value, and how it lands. */
const TYPES = [
  ['--color-accent', 'rgb(225 29 72)', 'rgb(225 29 72)'],
  ['--font-family-body', 'Open Sans, serif', 'Open Sans, serif'],
  ['--radius-element', '6px', '6px'],
  ['accent', '#e11d48', '#e11d48'],
  ['corners', 'pill', 'pill'],
  ['text-size', '18', '18'],
];

/** Manglings of a (thing, value) into what set receives. */
const MANGLE = {
  nbsp: (/** @type {string} */ t, /** @type {string} */ v) => [
    t,
    v.replace(/ /g, NBSP),
  ],
  thin: (t, v) => [t, v.replace(/ /g, THIN)],
  zeroWidth: (t, v) => [t, `${v}${ZW}`],
  colonSplit: (t, v) => [`${t}:`, v],
  colonWhole: (t, v) => [`${t}: ${v}`, ''],
  colonTight: (t, v) => [`${t}:${v}`, ''],
  equals: (t, v) => [`${t}=${v}`, ''],
  pastedSemicolon: (t, v) => [`${t}: ${v};`, ''],
  pastedImportant: (t, v) => [`${t}:`, `${v} !important`],
};

describe('one entry normalizer: every value type × every mangling', () => {
  for (const [thing, value, want] of TYPES)
    for (const [how, mangle] of Object.entries(MANGLE))
      it(`${thing} ${how}`, async () => {
        const [t, v] = /** @type {(a: string, b: string) => string[]} */ (
          mangle
        )(thing, value);
        await themeEditSet('b', t, v, {cwd});
        expect(saved(thing)).toBe(want);
      }, 240_000);
});

describe('thing-name repair', () => {
  it.each([
    ['\u2014color-accent', '--color-accent'],
    ['\u2013color-accent', '--color-accent'],
    ['var(--color-accent)', '--color-accent'],
  ])(
    '%j is %s',
    async (typed, thing) => {
      expect(normalizeEntry(typed, 'red').thing).toBe(thing);
      await themeEditSet('b', typed, '#123456', {cwd});
      expect(saved(thing)).toBe('#123456');
    },
    240_000,
  );

  it('a token without its dashes is offered with them', async () => {
    const err = await refusal(() =>
      themeEditSet('b', 'color-accent', '#e11d48', {cwd}),
    );
    expect(names(err)[0]).toMatch(/ set b --color-accent '#e11d48'$/);
  });

  it('the CLI splits a declaration pasted as one argument, for a dial too', async () => {
    const r = await runCli(
      [
        '--json',
        'experimental',
        'theme',
        'editor',
        'set',
        'b',
        'accent: #2563eb',
      ],
      cwd,
    );
    expect(r.status, r.stdout).toBe(0);
    expect(saved('accent')).toBe('#2563eb');
  }, 240_000);
});

describe('suggestions from the setting’s own suggester', () => {
  it.each([
    ['text-size', '14pt', / set b text-size 18\.67$/],
    ['type', 'large', / set b text-size large$/],
    ['type', '18px', / set b text-size 18$/],
  ])('%s %s', async (thing, value, want) => {
    const err = await refusal(() => themeEditSet('b', thing, value, {cwd}));
    expect(names(err).join('\n')).toMatch(new RegExp(want.source, 'm'));
    expect(names(err).join('\n')).not.toMatch(/ corners /);
  });

  it('mode with a word it does not take lists the modes', async () => {
    const err = await refusal(() => themeEditSet('b', 'mode', 'large', {cwd}));
    expect(names(err)).toContainEqual(
      expect.stringMatching(/ set b mode both$/),
    );
  });
});

describe('saved values read the same way', () => {
  it.each([
    ['--color-accent', `rgb(225${NBSP}29${NBSP}72)`, 'rgb(225 29 72)'],
    ['--font-family-body', `Open${ZW} Sans`, 'Open Sans'],
  ])(
    '%s with invisible spaces is named, with the clean value',
    async (thing, raw, clean) => {
      await themeEditSet('b', thing, clean, {cwd});
      const kept = fs.readFileSync(file(), 'utf8');
      const data = JSON.parse(kept);
      for (const x of data.settings)
        if (x.thing === thing && !x.on) x.value = raw;
      fs.writeFileSync(file(), JSON.stringify(data));
      try {
        const err = await refusal(() => themeEditShow('b', {cwd}));
        expect(err.message).toContain('no-break, thin or zero-width space');
        expect(names(err)).toContainEqual(
          expect.stringMatching(
            new RegExp(` set b ${thing} '${clean.replace(/[()]/g, '\\$&')}'$`),
          ),
        );
      } finally {
        fs.writeFileSync(file(), kept);
      }
    },
    240_000,
  );

  it('a saved size token the editor refuses suggests from the value, not 6px', async () => {
    const kept = fs.readFileSync(file(), 'utf8');
    const data = JSON.parse(kept);
    data.settings.push({
      thing: '--text-body-size',
      value: '18',
      source: 'token',
    });
    fs.writeFileSync(file(), JSON.stringify(data));
    try {
      const err = await refusal(() => themeEditShow('b', {cwd}));
      expect(names(err)).toContainEqual(
        expect.stringMatching(/ set b --text-body-size 18px$/),
      );
    } finally {
      fs.writeFileSync(file(), kept);
    }
  }, 240_000);
});
