// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fourth pass over `astryx experimental theme editor`: derived
 * radii that keep the base's proportions, steps from a part's own radius
 * and between rungs, group settings that cover part settings, dial words,
 * installed bases, property grammar, per-mode replacements, the base
 * version in the build stamp, a folder where a file goes, and the editor's
 * own temp files left by a stopped command.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditHow,
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
import {projectFiles, refusal} from '../../test-utils/theme-edit-fixture.mjs';

/** @type {string} */
let cwd;
const {read} = projectFiles(() => cwd);

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt4-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditNew('z', {cwd});
}, 120_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('corners', () => {
  it('more never lowers a derived radius', async () => {
    for (const t of ['n', 'z']) {
      const r = await themeEditSet(t, 'corners', 'more', {cwd});
      for (const c of r.data.changedTokens.filter(x => /--radius-/.test(x))) {
        const [, from, to] = /: (\d+)px -> (\d+)px/.exec(c) ?? [];
        if (from)
          expect(Number(to), `${t} ${c}`).toBeGreaterThanOrEqual(Number(from));
      }
      await themeEditUndo(t, {cwd});
    }
  }, 240_000);

  it('a part steps from its own radius, and a size between rungs to the next rung', async () => {
    const card = await themeEditSet('z', 'corners', 'more', {cwd, on: 'card'});
    // The card reads the container radius (12px on no base): the next rung
    // that shows it rounder is medium (15px on a card).
    expect(card.data.setting.value).toBe('medium');
    await themeEditUndo('z', {cwd});
    await themeEditSet('z', 'corners', '6px', {cwd});
    expect(
      (await themeEditSet('z', 'corners', 'more', {cwd})).data.setting.value,
    ).toBe('small');
    await themeEditUndo('z', {cwd});
    await themeEditUndo('z', {cwd});
  }, 240_000);

  it('a group setting after a part setting says so, and show names the part as covered', async () => {
    await themeEditSet('z', 'corners', '6px', {cwd, on: 'card'});
    const g = await themeEditSet('z', 'corners', 'round', {
      cwd,
      on: 'containers',
    });
    expect(g.data.notes.join(' ')).toContain('card shows this value now');
    const show = await themeEditShow('z', {cwd});
    expect(show.data.partValues.join(' ')).toContain('not shown');
    await themeEditUndo('z', {cwd});
    await themeEditUndo('z', {cwd});
  }, 240_000);
});

describe('words and values', () => {
  it('a word for a value names that value, never the opposite one', async () => {
    for (const [thing, word, want] of [
      ['surfaces', 'elevated', 'raised'],
      ['surfaces', 'frosted', 'glass'],
      ['buttons', 'uppercase', 'caps'],
      ['mode', 'auto', 'both'],
      ['base', 'NEUTRAL', 'neutral'],
    ]) {
      const r = await refusal(() => themeEditSet('z', thing, word, {cwd}));
      expect(r.run[0], word).toMatch(new RegExp(`set z ${thing} ${want}$`));
    }
    // A word that means none of the values gets no guess at one.
    expect(
      (await refusal(() => themeEditSet('z', 'surfaces', 'zzzz', {cwd}))).run,
    ).toEqual([expect.stringMatching(/ how surfaces$/)]);
  });

  it('how base names only installed bases, with the line for the rest', async () => {
    const r = await themeEditHow('base', {cwd});
    const d = /** @type {any} */ (r.data);
    expect(d.values.split('|')).toContain('neutral');
    expect(d.values.split('|')).toContain('none');
  });

  it('refuses a value a property does not take', async () => {
    for (const [prop, value] of [
      ['display', 'flexx'],
      ['padding', 'auto'],
      ['font-weight', 'heavy'],
      ['opacity', 'banana'],
      ['border-radius', '-4px'],
      ['z-index', '1.5'],
    ])
      expect(
        (await refusal(() => themeEditSet('z', prop, value, {cwd, on: 'card'})))
          .code,
        `${prop} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    const ok = await themeEditSet('z', 'padding', '12px 20px', {
      cwd,
      on: 'card',
    });
    expect(ok.data.setting.value).toBe('12px 20px');
    await themeEditUndo('z', {cwd});
  }, 240_000);

  it('a plain value that replaces per-mode ones says which', async () => {
    await themeEditSet('z', 'color', '#111111', {
      cwd,
      on: 'banner',
      mode: 'light',
    });
    await themeEditSet('z', 'color', '#222222', {
      cwd,
      on: 'banner',
      mode: 'dark',
    });
    const r = await themeEditSet('z', 'color', '#333333', {cwd, on: 'banner'});
    expect(r.data.replaced).toMatchObject({mode: 'light'});
    expect(r.data.notes.join(' ')).toContain('replaces');
    for (let i = 0; i < 3; i++) await themeEditUndo('z', {cwd});
  }, 240_000);
});

describe('builds', () => {
  it('a base theme updated since the build is noticed and built again', async () => {
    const file = path.join(cwd, 'themes/n/n.settings.ts');
    const text = read('themes/n/n.settings.ts');
    expect(text).toMatch(/\/\/ Built on @astryxdesign\/theme-neutral /);
    fs.writeFileSync(
      file,
      text.replace(
        /(\/\/ Built on @astryxdesign\/theme-neutral) [^\n]*\./,
        '$1 0.0.0-old.',
      ),
    );
    const r = await themeEditShow('n', {cwd});
    expect(r.data.notes.join(' ')).toContain('the build was made on 0.0.0-old');
  }, 240_000);

  it('a folder where a file goes is refused with a code', async () => {
    const preview = path.join(cwd, 'themes/z/preview.html');
    fs.rmSync(preview, {force: true});
    fs.mkdirSync(preview);
    const r = await refusal(() => themeEditShow('z', {cwd}));
    expect(r.code).toBe('ERR_WRITE_FAILED');
    expect(r.message).toContain('is a folder');
    fs.rmdirSync(preview);
  }, 240_000);

  it('removes the editor temp files a stopped command left, and nothing else', async () => {
    // A folder this process has not written to yet (the sweep runs once per
    // folder).
    const dir = path.join(cwd, 'themes/sweep');
    fs.mkdirSync(dir, {recursive: true});
    const left = path.join(dir, '.z.settings.json.astryx-3999999-abc123.tmp');
    const mine = path.join(dir, '.z.notes.tmp');
    fs.writeFileSync(left, 'x');
    fs.writeFileSync(mine, 'x');
    const old = new Date(Date.now() - 60 * 60_000);
    fs.utimesSync(left, old, old);
    fs.utimesSync(mine, old, old);
    const {writeWhole} = await import('./_palette.mjs');
    writeWhole(path.join(dir, 'probe.txt'), 'x');
    expect(fs.existsSync(left)).toBe(false);
    expect(fs.existsSync(mine)).toBe(true);
    fs.rmSync(dir, {recursive: true, force: true});
  });
});
