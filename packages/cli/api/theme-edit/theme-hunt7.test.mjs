// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The seventh pass over `astryx experimental theme editor`: settings of
 * the wrong shape recovered like damaged ones, a recovering `new` that
 * changes nothing until every check passed, old temp files from another
 * process space, a `themes` that is not a folder, `show` without React,
 * and names typed with spaces.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
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
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** A hash of every file under a folder. @param {string} dir */
function tree(dir) {
  const h = createHash('sha256');
  /** @param {string} d */
  const walk = d => {
    for (const e of fs
      .readdirSync(d, {withFileTypes: true})
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      h.update(p);
      if (e.isDirectory()) walk(p);
      else h.update(fs.readFileSync(p));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return h.digest('hex');
}

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt7-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('settings of the wrong shape', () => {
  for (const [label, text] of [
    ['a list', '[]'],
    ['an empty object', '{}'],
    ['settings: null', '{"name":"w","mode":"both","settings":null}'],
  ])
    it(`${label} is damage: show suggests new, and new keeps the file`, async () => {
      await themeEditNew('w', {cwd});
      const file = path.join(cwd, 'themes/w/w.settings.json');
      fs.writeFileSync(file, text);
      const r = await refusal(() => themeEditShow('w', {cwd}));
      expect(r.code).toBe('ERR_THEME_INVALID');
      expect(r.run[0]).toMatch(/ new w$/);
      // The step back never crashes on it.
      const u = await refusal(() => themeEditUndo('w', {cwd}));
      expect(u.code).not.toBe('ERR_UNKNOWN');
      const made = await themeEditNew('w', {cwd});
      expect(made.data.notes.join(' ')).toContain('w.settings.damaged.json');
      expect(
        fs.readFileSync(
          path.join(cwd, 'themes/w/w.settings.damaged.json'),
          'utf8',
        ),
      ).toBe(text);
      fs.rmSync(path.join(cwd, 'themes/w'), {recursive: true, force: true});
    }, 240_000);
});

describe('a recovering new changes nothing until every check passed', () => {
  it('a refused new (a source of the user that no longer extends the settings) leaves the folder exactly as it was', async () => {
    await themeEditNew('r', {cwd});
    fs.rmSync(path.join(cwd, 'themes/r/r.settings.json'));
    fs.writeFileSync(
      path.join(cwd, 'themes/r/r.theme.ts'),
      'export const x = 1;\n',
    );
    const before = tree(path.join(cwd, 'themes/r'));
    const r = await refusal(() => themeEditNew('r', {cwd}));
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(tree(path.join(cwd, 'themes/r'))).toBe(before);
    fs.rmSync(path.join(cwd, 'themes/r'), {recursive: true, force: true});
  }, 240_000);

  it('damaged settings and a bad argument: refused, and the damaged file stays where it is', async () => {
    await themeEditNew('d', {cwd});
    fs.writeFileSync(path.join(cwd, 'themes/d/d.settings.json'), '{"x":');
    const before = tree(path.join(cwd, 'themes/d'));
    const r = await refusal(() =>
      themeEditNew('d', {cwd, settings: {corners: 'banana'}}),
    );
    expect(r.code).toBe('ERR_THEME_BAD_VALUE');
    expect(tree(path.join(cwd, 'themes/d'))).toBe(before);
    fs.rmSync(path.join(cwd, 'themes/d'), {recursive: true, force: true});
  }, 240_000);
});

describe('temp files', () => {
  it('an old one from a process id that looks alive (another process space) is removed; a fresh one stays', async () => {
    await themeEditNew('tp', {cwd});
    const dir = path.join(cwd, 'themes/tp');
    const old = path.join(dir, '.tp.settings.json.astryx-1-aaaaaa.tmp');
    const fresh = path.join(
      dir,
      `.tp.settings.json.astryx-${process.ppid}-bbbbbb.tmp`,
    );
    fs.writeFileSync(old, '{');
    fs.writeFileSync(fresh, '{');
    const t = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(old, t, t);
    await themeEditSet('tp', 'corners', 'small', {cwd});
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    fs.rmSync(dir, {recursive: true, force: true});
  }, 240_000);
});

describe('names', () => {
  it('themes that is a file names the real problem', async () => {
    const other = makeLinkedFixture(
      'astryx-theme-hunt7-file-',
      FIXTURE_PACKAGES,
    );
    try {
      fs.writeFileSync(path.join(other, 'themes'), 'not a folder');
      const r = await refusal(() => themeEditNew('x', {cwd: other}));
      expect(r.message).toMatch(/not a folder/);
      expect(r.run.join(' ')).not.toMatch(/-copy/);
    } finally {
      removeLinkedFixture(other);
    }
  }, 120_000);

  it('a name typed with a space suggests the name meant', async () => {
    await themeEditNew('sp', {cwd});
    const r = await refusal(() => themeEditShow('sp ', {cwd}));
    expect(r.run[0]).toMatch(/ show sp$/);
    fs.rmSync(path.join(cwd, 'themes/sp'), {recursive: true, force: true});
  }, 240_000);
});

describe('show without React', () => {
  it('lists the settings and says the pages and checks were skipped', async () => {
    const bare = makeLinkedFixture(
      'astryx-theme-hunt7-noreact-',
      FIXTURE_PACKAGES.filter(p => !p.startsWith('react')),
    );
    try {
      await themeEditNew('nr', {cwd: bare});
      const r = await themeEditShow('nr', {cwd: bare});
      expect(r.data.settings).toEqual([]);
      expect(r.data.notes.join(' ')).toMatch(
        /react and react-dom cannot be found/,
      );
    } finally {
      removeLinkedFixture(bare);
    }
  }, 240_000);
});

describe('dials and part properties (final 3)', () => {
  /** @param {string} slug @param {string} token */
  const tokenPx = (slug, token) =>
    Number(
      new RegExp(`${token}:\\s*([\\d.]+)px`).exec(
        fs.readFileSync(path.join(cwd, `themes/${slug}/${slug}.css`), 'utf8'),
      )?.[1],
    );

  it('M1: pill never makes a container or page less round than a size before it', async () => {
    await themeEditNew('m1', {cwd, like: 'neutral'});
    await themeEditSet('m1', 'corners', '30px', {cwd});
    const c30 = tokenPx('m1', '--radius-container');
    const p30 = tokenPx('m1', '--radius-page');
    await themeEditSet('m1', 'corners', '999px', {cwd});
    const c999 = tokenPx('m1', '--radius-container');
    await themeEditSet('m1', 'corners', 'pill', {cwd});
    expect(tokenPx('m1', '--radius-container')).toBeGreaterThanOrEqual(c30);
    expect(tokenPx('m1', '--radius-page')).toBeGreaterThanOrEqual(p30);
    // No cliff between 999px and pill.
    expect(tokenPx('m1', '--radius-container')).toBe(c999);
    fs.rmSync(path.join(cwd, 'themes/m1'), {recursive: true, force: true});
  }, 240_000);

  it('M2: pill on containers gives every container the container radius, and show says the same', async () => {
    await themeEditNew('m2', {cwd, like: 'neutral'});
    await themeEditSet('m2', 'corners', 'pill', {cwd, on: 'containers'});
    const css = fs.readFileSync(path.join(cwd, 'themes/m2/m2.css'), 'utf8');
    expect(css).not.toMatch(/popover[^{]*\{[^}]*9999px/);
    const shown = await themeEditShow('m2', {cwd});
    const line = shown.data.partValues.find((/** @type {string} */ l) =>
      l.startsWith('corners = pill on containers'),
    );
    expect(line).not.toMatch(/fully round/);
    fs.rmSync(path.join(cwd, 'themes/m2'), {recursive: true, force: true});
  }, 240_000);

  it('M3: focus on a text input is refused, naming focus-within, which runs', async () => {
    await themeEditNew('m3', {cwd});
    const r = await refusal(() =>
      themeEditSet('m3', 'border-color', 'red', {
        cwd,
        on: 'text-input',
        state: 'focus',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(/--state focus-within$/);
    await themeEditSet('m3', 'border-color', 'red', {
      cwd,
      on: 'text-input',
      state: 'focus-within',
    });
    fs.rmSync(path.join(cwd, 'themes/m3'), {recursive: true, force: true});
  }, 240_000);

  it('M4: a step for a variant starts from the part’s plain setting, and a spread setting reaches its group', async () => {
    await themeEditNew('m4', {cwd});
    await themeEditSet('m4', 'corners', 'pill', {cwd, on: 'button'});
    const r = await themeEditSet('m4', 'corners', 'less', {
      cwd,
      on: 'button',
      when: 'size:sm',
    });
    expect(r.data.setting.value).toBe('round');
    await themeEditSet('m4', 'corners', 'pill', {cwd, on: 'text-input'});
    // text-area shows the group's pill: more has nowhere to go.
    const ta = await refusal(() =>
      themeEditSet('m4', 'corners', 'more', {cwd, on: 'text-area'}),
    );
    expect(ta.code).toBe('ERR_THEME_NO_EFFECT');
    fs.rmSync(path.join(cwd, 'themes/m4'), {recursive: true, force: true});
  }, 240_000);

  it('L5: a negative radius suggests square; a refusal keeps the flags', async () => {
    await themeEditNew('l5', {cwd});
    expect(
      (await refusal(() => themeEditSet('l5', 'corners', '-4px', {cwd})))
        .run[0],
    ).toMatch(/corners square$/);
    expect(
      (
        await refusal(() =>
          themeEditSet('l5', 'corners', 'banana', {
            cwd,
            on: 'button',
            when: 'size:sm',
          }),
        )
      ).run[0],
    ).toMatch(/--on button --when size:sm$/);
    fs.rmSync(path.join(cwd, 'themes/l5'), {recursive: true, force: true});
  }, 240_000);

  it('L6: after a change, the sheet says it shows the theme as it was', async () => {
    await themeEditNew('l6', {cwd});
    await themeEditShow('l6', {cwd});
    const r = await themeEditSet('l6', 'corners', 'small', {cwd});
    expect(/** @type {any} */ (r.data).sheetStale).toMatch(/show l6/);
    expect(
      fs.readFileSync(path.join(cwd, 'themes/l6/sheet.html'), 'utf8'),
    ).toContain('as it was before the last change');
    fs.rmSync(path.join(cwd, 'themes/l6'), {recursive: true, force: true});
  }, 240_000);

  it('var(): an unknown variable is refused; one with a fallback is taken', async () => {
    await themeEditNew('vr', {cwd});
    expect(
      (
        await refusal(() =>
          themeEditSet('vr', 'color', 'var(--nope)', {cwd, on: 'card'}),
        )
      ).code,
    ).toBe('ERR_THEME_UNKNOWN_TOKEN');
    await themeEditSet('vr', 'color', 'var(--color-accent, red)', {
      cwd,
      on: 'card',
    });
    fs.rmSync(path.join(cwd, 'themes/vr'), {recursive: true, force: true});
  }, 240_000);
});

describe('review on #11303', () => {
  it('a value that is only a var() is taken on a keyword-only property', async () => {
    await themeEditNew('kv', {cwd});
    await themeEditSet('kv', 'font-weight', 'var(--font-weight-semibold)', {
      cwd,
      on: 'button',
    });
    fs.rmSync(path.join(cwd, 'themes/kv'), {recursive: true, force: true});
  }, 240_000);

  it('a spacing step on a member covered by a later group setting starts from the group value', async () => {
    await themeEditNew('sg', {cwd});
    await themeEditSet('sg', 'spacing', 'tight', {cwd, on: 'card'});
    await themeEditSet('sg', 'spacing', 'spacious', {cwd, on: 'containers'});
    const r = await themeEditSet('sg', 'spacing', 'more', {cwd, on: 'card'});
    expect(r.data.setting.value).toBe('spacious');
    fs.rmSync(path.join(cwd, 'themes/sg'), {recursive: true, force: true});
  }, 240_000);

  it('a render folder under ten minutes old is kept, whatever its process id', async () => {
    await themeEditNew('rf', {cwd});
    const young = path.join(cwd, 'themes/.astryx-render-999999-young1');
    const old = path.join(cwd, 'themes/.astryx-render-999999-oldone');
    for (const d of [young, old]) fs.mkdirSync(d, {recursive: true});
    const t = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(old, t, t);
    const {withRealRenders} =
      await import('../../test-utils/theme-render-stub.mjs');
    await withRealRenders(() => themeEditSet('rf', 'corners', 'small', {cwd}));
    expect(fs.existsSync(young)).toBe(true);
    expect(fs.existsSync(old)).toBe(false);
    fs.rmSync(young, {recursive: true, force: true});
    fs.rmSync(path.join(cwd, 'themes/rf'), {recursive: true, force: true});
  }, 240_000);

  it('corners more from 30px never makes a container smaller', async () => {
    await themeEditNew('c30', {cwd, like: 'neutral'});
    await themeEditSet('c30', 'corners', '30px', {cwd});
    const r = await themeEditSet('c30', 'corners', 'more', {cwd});
    for (const c of r.data.changedTokens.filter((/** @type {string} */ x) =>
      /--radius-(container|page)/.test(x),
    )) {
      const [, from, to] = /: (\d+)px -> (\d+)px/.exec(c) ?? [];
      if (from) expect(Number(to), c).toBeGreaterThanOrEqual(Number(from));
    }
    fs.rmSync(path.join(cwd, 'themes/c30'), {recursive: true, force: true});
  }, 240_000);
});
