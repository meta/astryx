// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A table's row lines are its cells' borders, colored through the token
 * they read on the row; outlined buttons are the outline look (the dial,
 * or a variant's own color as its border and text), never a border over
 * the fill; a keep that needs two states at once says so. Against real
 * bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** Why a bundled theme could not be built here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-table-cells-borders-colored-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 300_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {import('vitest').TestContext} ctx */
const needBases = ctx => {
  if (!unbuilt) return false;
  console.warn(`skipped: ${unbuilt}`);
  ctx.skip();
  return true;
};

/** @param {string} slug */
const cssOf = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** The first answer's commands, bare. @param {string} q @param {string} theme */
const top = async (q, theme) => {
  const {data} = await themeEditHow(q, {cwd, theme});
  const r = (data.results ?? []).find(x =>
    x.commands.some(c => / editor (set|undo) /.test(c)),
  );
  return {
    text: (data.results ?? []).map(x => x.text).join('\n'),
    commands: (r?.commands ?? []).map(c => c.replace(/^.*? editor /, '')),
  };
};

describe("a table's row lines", () => {
  it('are colored through the token the cells draw them with, on the row', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('t', {cwd, like: 'neutral'});
    for (const q of [
      'make the table row dividers red',
      'make table borders red',
    ])
      expect((await top(q, 't')).commands, q).toEqual([
        "set t --color-border '#dc2626' --on table-row",
      ]);
  }, 240_000);
});

describe('outlined buttons', () => {
  it("are the buttons dial for all of them, and a variant's own color as its border and text for one", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('b', {cwd, like: 'neutral'});
    for (const q of ['make buttons outline', 'make buttons outlined'])
      expect((await top(q, 'b')).commands, q).toEqual([
        'set b buttons outline',
      ]);
    expect(
      (await top('make the danger buttons outline only', 'b')).commands,
    ).toEqual([
      'set b background-color transparent --on button --when variant:destructive',
      "set b border 'var(--border-width) solid var(--color-error)' --on button --when variant:destructive",
      "set b color 'var(--color-error)' --on button --when variant:destructive",
    ]);
  }, 240_000);
});

describe('a keep that needs two states at once', () => {
  it('names that reason, never a missing prop', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const {data} = await themeEditHow(
      'make the switch red when on except when disabled',
      {cwd, theme: 's'},
    );
    const text = (data.results ?? []).map(x => x.text).join('\n');
    expect(text).toMatch(/checked and disabled at once/);
    expect(text).not.toMatch(/has no prop/);
    expect(text).not.toMatch(/has nothing this change sets to keep/);
  }, 240_000);
});

describe("an input's focus ring, asked per mode, per status, as a question", () => {
  it('is one ring for a mode pair, a layer per mode for a width in one mode, and the status named', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    const pair = await top(
      'make the input focus ring blue in light mode and red in dark mode',
      'f',
    );
    expect(pair.commands[0]).toBe(
      "set f box-shadow 'inset 0 0 0 2px light-dark(#2563eb, #dc2626)' --on inputs --state focus-within",
    );
    expect(pair.commands.some(x => /border-color/.test(x))).toBe(false);
    expect(
      (await top('make the input focus ring thinner in dark mode', 'f'))
        .commands[0],
    ).toBe(
      "set f box-shadow 'inset 0 0 0 2px light-dark(var(--color-accent-muted), transparent), inset 0 0 0 1px light-dark(transparent, var(--color-accent-muted))' --on inputs --state focus-within",
    );
    expect(
      (await top("make error inputs' focus ring red", 'f')).commands,
    ).toEqual([
      "set f box-shadow 'inset 0 0 0 2px #dc2626' --on inputs --when status:error --state focus-within",
    ]);
    const none = await themeEditHow('remove the focus ring from error inputs', {
      cwd,
      theme: 'f',
    });
    expect(
      (none.data.results ?? []).flatMap(x =>
        x.commands.filter(c => / editor set /.test(c)),
      ),
    ).toEqual([]);
    expect(
      (await top('make the focus ring on inputs 50% more transparent', 'f'))
        .commands[0],
    ).toBe(
      "set f box-shadow 'inset 0 0 0 2px color-mix(in srgb, var(--color-accent-muted) 50%, transparent)' --on inputs --state focus-within",
    );
    const asked = await themeEditHow('how is the focus ring on inputs drawn', {
      cwd,
      theme: 'f',
    });
    expect(
      (asked.data.results ?? []).flatMap(x =>
        x.commands.filter(c => / editor set /.test(c)),
      ),
    ).toEqual([]);
  }, 240_000);
});

describe('a hover shadow on inputs', () => {
  it('keeps the focus ring while focused, written after the hover rule', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    await themeEditSet('h', 'box-shadow', 'none', {
      cwd,
      on: 'inputs',
      state: 'hover',
    });
    const css = fs.readFileSync(path.join(cwd, 'themes', 'h', 'h.css'), 'utf8');
    const hover = css.indexOf('.astryx-text-input:hover');
    const focus = css.indexOf('.astryx-text-input:focus-within');
    expect(hover).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(hover);
    expect(css.slice(focus, focus + 200)).toMatch(
      /box-shadow: inset 0 0 0 2px var\(--color-accent-muted\)/,
    );
    expect(css).toMatch(
      /\.astryx-text-input\[data-status="error"\]:focus-within \{\s*box-shadow: none;/,
    );
  }, 240_000);
});
