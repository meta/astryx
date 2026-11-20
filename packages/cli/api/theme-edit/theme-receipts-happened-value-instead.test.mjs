// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Receipts that say what happened: a set of a value already set says
 * so instead of "x -> x", an undo names a setting that still applies where
 * the removed one did, a one-mode theme's note says `theme add` wires the
 * mode, and `theme use` says which theme is the default now.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const T = 240_000;
const ED = ['experimental', 'theme', 'editor'];

/** @type {string} */
let cwd;
/** @type {string} */
let fresh;

const file = () => path.join(cwd, 'themes/t/t.settings.json');

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-receipts-happened-value-instead-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('t', {cwd, like: 'neutral'});
  fresh = fs.readFileSync(file(), 'utf8');
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string[]} args */
const text = async args => (await runCli(args, cwd)).stdout;
/** @param {string[]} args */
const json = async args =>
  JSON.parse((await runCli([...args, '--json'], cwd)).stdout);

describe('a set of a value the theme already has', () => {
  it(
    'says it was already set, never "system -> system"',
    async () => {
      fs.writeFileSync(file(), fresh);
      await runCli([...ED, 'set', 't', 'font', 'system'], cwd);
      const out = await text([...ED, 'set', 't', 'font', 'system']);
      expect(out.split('\n')[0]).toMatch(
        /\[ok\] t: font = system \(whole theme\) was already set; nothing changed$/,
      );
      expect(out).not.toMatch(/system -> system/);
    },
    T,
  );
});

describe('a one-mode theme', () => {
  it(
    'says theme add wires the mode, not that the app must pass it by hand',
    async () => {
      fs.writeFileSync(file(), fresh);
      const r = await json([...ED, 'set', 't', 'mode', 'dark-only']);
      const notes = (r.data?.notes ?? []).join(' ');
      expect(notes).toMatch(/theme add t.*passes it/);
      expect(notes).toMatch(/themeModes\[defaultThemeSlug\]/);
    },
    T,
  );
});

describe('an undo of a whole-theme color', () => {
  it(
    'names the setting that still applies in a mode, not the base value',
    async () => {
      fs.writeFileSync(file(), fresh);
      await runCli(
        [...ED, 'set', 't', '--color-background-body', '#db2777'],
        cwd,
      );
      await runCli(
        [
          ...ED,
          'set',
          't',
          '--color-background-body',
          '#fef3c7',
          '--mode',
          'light',
        ],
        cwd,
      );
      const r = await json([...ED, 'undo', 't', '--color-background-body']);
      expect(r.error).toBeUndefined();
      expect(String(r.data.now)).toMatch(
        /#fef3c7.*in light mode and the base theme's value in dark mode/,
      );
    },
    T,
  );
});

describe('theme use', () => {
  it(
    'says which theme is the default now, and says nothing changed when it already was',
    async () => {
      fs.writeFileSync(file(), fresh);
      await runCli(['theme', 'add', 't'], cwd);
      // A second theme, so `use` has a default to move.
      await themeEditNew('u', {cwd, like: 'neutral'});
      await runCli(['theme', 'add', 'u'], cwd);
      const moved = await text(['theme', 'use', 'u']);
      expect(moved.split('\n')[0]).toBe(
        "[ok] u is now the app's default theme: themes[defaultThemeSlug] is u.",
      );
      const again = await text(['theme', 'use', 'u']);
      expect(again.split('\n')[0]).toBe(
        "[ok] u was already the app's default theme; nothing changed.",
      );
      // The receipt's own fields follow, as they always have.
      expect(again).toContain('App themes');
      expect(again).toMatch(/^default: +u$/m);
      // The JSON is unchanged: no line of its own.
      const envelope = await json(['theme', 'use', 'u']);
      expect(envelope.data.default).toBe('u');
      expect(JSON.stringify(envelope)).not.toContain("is now the app's");
    },
    T,
  );
});

describe('a dial at its last rung', () => {
  it(
    'names an exact size that goes past the rungs, and that line runs',
    async () => {
      fs.writeFileSync(file(), fresh);
      for (let i = 0; i < 6; i++)
        await runCli([...ED, 'set', 't', 'text-size', 'more'], cwd);
      const r = await json([...ED, 'set', 't', 'text-size', 'more']);
      expect(r.error).toMatch(/already at its largest step/);
      expect(r.error).toMatch(/An exact size goes past the rungs/);
      // The step the other way leads, as it always has; the exact size
      // follows it.
      expect(r.suggestions[0].name).toMatch(/ set t text-size less$/);
      const line = r.suggestions[1].name.replace(/^.*? editor /, '');
      expect(line).toMatch(/^set t text-size \d+$/);
      expect((await json([...ED, ...line.split(' ')])).error).toBeUndefined();
    },
    T,
  );
});

describe('an undo of a property set in another form of its family', () => {
  it(
    'names the setting the theme has, and that line removes it',
    async () => {
      fs.writeFileSync(file(), fresh);
      await runCli(
        [
          ...ED,
          'set',
          't',
          'background-color',
          '#111827',
          '--on',
          'app-shell-header',
        ],
        cwd,
      );
      const r = await json([
        ...ED,
        'undo',
        't',
        'background',
        '--on',
        'app-shell-header',
      ]);
      expect(r.error).toMatch(
        /settings for background: background-color = #111827 on app-shell-header/,
      );
      expect(r.suggestions[0].name).toMatch(
        / undo t background-color --on app-shell-header$/,
      );
      const line = r.suggestions[0].name.replace(/^.*? editor /, '');
      expect((await json([...ED, ...line.split(' ')])).error).toBeUndefined();
    },
    T,
  );
});

describe("a token's name typed where the theme's name goes", () => {
  for (const typed of ['Color-Accent', 'Radius-Element'])
    it(
      `new ${typed} offers a free name, never a theme named after the token`,
      async () => {
        const r = await json([...ED, 'new', typed]);
        expect(r.error).toMatch(/is not a theme name/);
        expect(r.suggestions[0].name).toMatch(/ new my-theme\b/);
        expect(
          r.suggestions.map((/** @type {any} */ x) => x.name).join(' '),
        ).not.toMatch(new RegExp(` new ${typed.toLowerCase()}\\b`));
      },
      T,
    );

  it(
    'a name of its own still reads as that name',
    async () => {
      const r = await json([...ED, 'new', 'Brand']);
      expect(r.suggestions[0].name).toMatch(/ new brand\b/);
    },
    T,
  );
});
