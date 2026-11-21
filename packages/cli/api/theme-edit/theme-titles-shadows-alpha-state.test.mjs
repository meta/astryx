// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * how and set for titles, shadows by alpha and state, hyphenated on-accent
 * text, corners of named and fully round parts, heavy borders and a
 * checkbox on its own. Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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
    'astryx-theme-titles-shadows-alpha-state-',
    FIXTURE_PACKAGES,
  );
  unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone', 'y2k']);
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

describe('titles', () => {
  it('colors a dialog title on its title block, never every heading', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('n', {cwd, like: 'neutral'});
    const dialog = await top('make the dialog title blue', 'n');
    expect(dialog.commands.join(' && ')).toMatch(
      /--color-text-primary '#2563eb' --on dialog-header-title-block/,
    );
    expect(dialog.commands.join(' ')).not.toMatch(/--on heading\b/);
    const card = await top('make card titles red', 'n');
    expect(card.commands).toEqual([]);
    expect(card.text).toMatch(/no card title part of its own/);
  }, 240_000);

  it('refuses a weight or color on a title block and answers with its tokens', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('w', {cwd, like: 'neutral'});
    const r = await refusal(() =>
      themeEditSet('w', 'font-weight', '700', {
        cwd,
        on: 'dialog-header-title-block',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(
      /--text-heading-\d-weight 700 --on dialog-header-title-block/,
    );
    const bold = await top('make dialog titles bold', 'w');
    expect(bold.commands.join(' ')).toMatch(
      /--text-heading-2-weight 700 --on dialog-header-title-block/,
    );
  }, 240_000);
});

describe('shadows', () => {
  it('reads an alpha said of the shadow as its colors, every layer kept', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('s', {cwd, like: 'neutral'});
    const card = await top('make card shadows with 30% alpha', 's');
    expect(card.commands).toHaveLength(1);
    expect(card.commands[0]).not.toMatch(/opacity/);
    expect(card.commands[0]).toMatch(/\/ 30%\).*\/ 30%\).*--on card$/);
    const dialog = await top('make dialog shadows 50% transparent', 's');
    expect(dialog.commands[0]).toMatch(/0 12px 24px .*\/ 50%\).*--on dialog$/);
  }, 240_000);

  it("steps an input's hover shadow from its own ring, never a status's", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('h', {cwd, like: 'neutral'});
    for (const q of [
      'softer shadow on inputs when hovered',
      'make the hover shadow on inputs darker',
    ]) {
      const r = await top(q, 'h');
      expect(r.commands[0], q).toMatch(/--color-border-emphasized/);
      expect(r.commands[0], q).not.toMatch(/#de4745/);
    }
  }, 240_000);

  it("keeps a file input's hover ring under a resting shadow (the part data records it)", async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('f', {cwd, like: 'neutral'});
    await themeEditSet('f', 'box-shadow', '0 2px 6px #0000004d', {
      cwd,
      on: 'file-input',
    });
    expect(fs.readFileSync(path.join(cwd, 'themes/f/f.css'), 'utf8')).toMatch(
      // (Per render it draws the ring for: its input and dropzone modes.)
      /\.astryx-file-input(\[[^\]]*\])*:hover[^{]*\{\s*box-shadow: 0 2px 6px #0000004d, inset 0 0 0 2px /,
    );
  }, 240_000);
});

describe('words', () => {
  it('reads on-accent text, heavy borders and a checkbox', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('o', {cwd, like: 'neutral'});
    expect((await top('make on-accent text black', 'o')).commands[0]).toMatch(
      /^set o --color-on-accent '#000000'/,
    );
    const heavy = await top('heavy borders on inputs', 'o');
    expect(heavy.commands[0]).toMatch(/border-width 2px --on inputs/);
    expect(heavy.text).not.toMatch(/bold text/);
    const box = await top('make checkboxes red', 'o');
    expect(box.commands[0]).toMatch(
      /background-color '#dc2626' --on checkbox-indicator --state checked --only$/,
    );
  }, 240_000);
});

describe('corners', () => {
  it('reads "pill" before a part as the part, and steps a pill from half its height', async ctx => {
    if (needBases(ctx)) return;
    await themeEditNew('st', {cwd, like: 'stone'});
    expect(
      (await top('make pill buttons less round', 'st')).commands[0],
    ).toMatch(/corners less --on button$/);
    await themeEditNew('y', {cwd, like: 'y2k'});
    const badge = await top('make badges 4px less round', 'y');
    expect(badge.text).toMatch(/half its height/);
    expect(badge.commands[0]).not.toMatch(/999\dpx/);
  }, 240_000);
});
