// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The eightieth pass over `astryx experimental theme editor`: a
 * setting listed twice keeps the value set names, a damaged mode or base is
 * cleaned rather than reset and fixed first, new cleans each flag value as
 * set does, parts and variants typed in words reach the command, an app
 * copy left without its theme folder is named as the editor's, names copied
 * from the app reach the theme, a stop after the save says what is saved,
 * and an undo of padding in the other form names the one that works.
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
import {stoppedAfterSave} from './_edit.mjs';
import {formatCliCommand} from '../../foundation/env/package-manager.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt80-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug */
const fileOf = slug => path.join(cwd, `themes/${slug}/${slug}.settings.json`);

/**
 * Edits a theme's settings file by hand, with no history to step back to.
 * @param {string} slug
 * @param {(j: any) => void} edit
 */
const damage = (slug, edit) => {
  const j = JSON.parse(fs.readFileSync(fileOf(slug), 'utf8'));
  edit(j);
  fs.writeFileSync(fileOf(slug), JSON.stringify(j, null, 2));
  fs.rmSync(path.join(cwd, `themes/${slug}/${slug}.history.json`), {
    force: true,
  });
};

/** @param {string} slug */
const saved = slug => JSON.parse(fs.readFileSync(fileOf(slug), 'utf8'));

describe('hunt80', () => {
  it('a setting listed twice: keeping the first value saves and builds that value', async () => {
    await themeEditNew('dup', {cwd, like: 'neutral'});
    await themeEditSet('dup', 'corners', 'pill', {cwd});
    damage('dup', j =>
      j.settings.push({thing: 'corners', value: 'square', source: 'dial'}),
    );
    const r = await refusal(() => themeEditShow('dup', {cwd}));
    const keep = r.run.find(x => / set dup corners pill$/.test(x));
    expect(keep).toBeTruthy();
    const done = await themeEditSet('dup', 'corners', 'pill', {cwd});
    expect(JSON.stringify(done.data)).toMatch(/square/);
    const corners = saved('dup').settings.filter(
      (/** @type {any} */ x) => x.thing === 'corners',
    );
    expect(corners).toEqual([
      expect.objectContaining({thing: 'corners', value: 'pill'}),
    ]);
    expect(
      fs.readFileSync(path.join(cwd, 'themes/dup/dup.css'), 'utf8'),
    ).toMatch(/--radius-element:\s*9999px/);
  }, 240_000);

  it('a damaged base with another bad value: the suggestions fix the base, and other fixes clean it, never drop it', async () => {
    await themeEditNew('db', {cwd, like: 'neutral'});
    await themeEditSet('db', 'corners', 'pill', {cwd});
    damage('db', j => {
      j.like = 'Neutral';
      j.settings[0].value = 'blob';
    });
    const r = await refusal(() => themeEditShow('db', {cwd}));
    expect(r.message).toMatch(/base "Neutral"/);
    // Setting the base is refused while the list holds a bad value: the
    // fix for that value leads, and saves the base too.
    expect(r.run[0]).toMatch(/ undo db corners$/);
    expect(r.message).toMatch(/saves the base as neutral/);
    const u = await themeEditUndo('db', {cwd, thing: 'corners'});
    expect(JSON.stringify(u.data)).toMatch(/saved as neutral/);
    expect(saved('db').like).toBe('neutral');
  }, 240_000);

  it('a damaged mode with another bad value: the suggestion fixes the mode, and other fixes clean it, never reset it', async () => {
    await themeEditNew('dm', {cwd, like: 'neutral'});
    await themeEditSet('dm', 'corners', 'pill', {cwd});
    await themeEditSet('dm', 'mode', 'dark-only', {cwd});
    damage('dm', j => {
      j.mode = 'Dark-Only';
      j.settings[0].value = 'blob';
    });
    const r = await refusal(() => themeEditShow('dm', {cwd}));
    expect(r.message).toMatch(/mode "Dark-Only"/);
    expect(r.run[0]).toMatch(/ undo dm corners$/);
    expect(r.message).toMatch(/saves the mode as dark-only/);
    await themeEditUndo('dm', {cwd, thing: 'corners'});
    expect(saved('dm').mode).toBe('dark-only');
  }, 240_000);

  it('a base stored as its package name is fixed to that base', async () => {
    await themeEditNew('pk', {cwd, like: 'neutral'});
    damage('pk', j => {
      j.like = '@astryxdesign/theme-neutral';
    });
    const r = await refusal(() => themeEditShow('pk', {cwd}));
    expect(r.run[0]).toMatch(/ set pk base neutral$/);
    expect(r.run.join(' ')).not.toMatch(/base none/);
  }, 240_000);

  it('a vibrancy stored as a share of one is offered as the number set takes', async () => {
    await themeEditNew('vb', {cwd, like: 'neutral'});
    await themeEditSet('vb', 'accent', '#e11d48', {cwd});
    damage('vb', j =>
      j.settings.push({thing: 'vibrancy', value: '0.5', source: 'dial'}),
    );
    const r = await refusal(() => themeEditShow('vb', {cwd}));
    expect(r.run.join(' ')).toMatch(/ set vb vibrancy 50/);
    expect(r.run.join(' ')).not.toMatch(/vibrancy more/);
    await themeEditSet('vb', 'vibrancy', '50', {cwd});
  }, 240_000);

  it('new cleans a quoted font family the way set does, and the theme loads after', async () => {
    for (const [i, font] of [
      '「Georgia」',
      '«Georgia»',
      '“Georgia”',
      '`Georgia`',
    ].entries()) {
      const slug = `nf${i}`;
      await themeEditNew(slug, {cwd, like: 'neutral', settings: {font}});
      const f = saved(slug).settings.find(
        (/** @type {any} */ x) => x.thing === 'font',
      );
      expect(f.value, font).not.toMatch(/[「」«»“”`]/);
      expect(f.value, font).toContain('Georgia');
      await themeEditShow(slug, {cwd});
    }
  }, 240_000);

  it('the stop note after undo and new says what that command saved, in the project CLI form', () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const other = () => {};
    process.on('SIGINT', other);
    /** @type {string[]} */
    const lines = [];
    try {
      for (const kind of /** @type {const} */ (['set', 'undo', 'new'])) {
        stoppedAfterSave('t', kind, cwd)('SIGINT');
        lines.push(String(write.mock.calls.at(-1)?.[0]));
      }
    } finally {
      process.removeListener('SIGINT', other);
      write.mockRestore();
    }
    expect(lines[0]).toMatch(/undo step kept/);
    expect(lines[1]).toMatch(/the undo is done/);
    expect(lines[1]).not.toMatch(/undo step kept/);
    expect(lines[2]).toMatch(/t is made and built/);
    expect(lines[2]).not.toMatch(/undo step/);
    const show = formatCliCommand(
      'astryx experimental theme editor show t',
      cwd,
    );
    for (const line of lines) expect(line).toContain(`${show} runs them`);
  });
  it('set reads a part named in words as that part, never the group one word names', async () => {
    await themeEditNew('pw', {cwd, like: 'neutral'});
    const inputs = await refusal(() =>
      themeEditSet('pw', 'padding-left', '12px', {cwd, on: 'text inputs'}),
    );
    expect(inputs.run[0]).toMatch(/ --on text-input\b/);
    expect(inputs.run[0]).not.toMatch(/ --on inputs\b/);
    const header = await refusal(() =>
      themeEditSet('pw', 'padding', '8px', {cwd, on: 'dialog header'}),
    );
    expect(header.run[0]).toMatch(/ set pw padding 8px --on dialog-header$/);
  }, 240_000);

  it('a variant typed in other letters or with = gets the corrected set command', async () => {
    await themeEditNew('vw', {cwd, like: 'neutral'});
    for (const when of [
      'variant:Primary',
      'Variant: primary',
      'variant=primary',
    ]) {
      const r = await refusal(() =>
        themeEditSet('vw', 'padding', '4px', {cwd, on: 'button', when}),
      );
      expect(r.run[0], when).toMatch(
        / set vw padding 4px --on button --when variant:primary$/,
      );
    }
    await themeEditSet('vw', 'padding', '4px', {
      cwd,
      on: 'button',
      when: 'variant:primary',
    });
  }, 240_000);

  it("the editor's own app copy left without its theme folder is named as the editor's, and new remakes it", async () => {
    await themeEditNew('oc', {cwd, like: 'neutral'});
    const copy = path.join(cwd, 'src/themes/oc');
    fs.mkdirSync(copy, {recursive: true});
    fs.writeFileSync(
      path.join(copy, 'ocTheme.ts'),
      '// Written by `astryx experimental theme editor` from themes/oc.\nexport const ocTheme = {};\n',
    );
    fs.rmSync(path.join(cwd, 'themes/oc'), {recursive: true, force: true});
    const r = await refusal(() => themeEditSet('oc', 'corners', 'pill', {cwd}));
    expect(r.message).toMatch(/themes\/oc\/.*is missing/);
    expect(r.message).not.toMatch(/did not make/);
    expect(r.run[0]).toMatch(/ new oc$/);
    expect(r.run.join(' ')).not.toMatch(/my-oc/);
  }, 240_000);

  it('names copied from the app reach the theme, and new says when the cleaned name is here', async () => {
    await themeEditNew('t', {cwd, like: 'neutral'});
    await themeEditNew('brand-dark', {cwd, like: 'neutral'});
    for (const name of ['tTheme', 'tTheme.ts', 'themes//t']) {
      const r = await refusal(() =>
        themeEditSet(name, 'corners', 'pill', {cwd}),
      );
      expect(r.run[0], name).toMatch(/ set t corners pill$/);
    }
    const file = await refusal(() =>
      themeEditSet('brandDark.theme.ts', 'corners', 'pill', {cwd}),
    );
    expect(file.run[0]).toMatch(/ set brand-dark corners pill$/);
    for (const name of ['tTheme.ts', 'BrandDark', 'Brand Dark']) {
      const r = await refusal(() => themeEditNew(name, {cwd, like: 'neutral'}));
      expect(r.message, name).toMatch(/is a theme here already/);
      expect(r.run[0], name).toMatch(/ show (t|brand-dark)$/);
    }
    const fresh = await refusal(() =>
      themeEditNew('brand.theme.ts', {cwd, like: 'neutral'}),
    );
    expect(fresh.run[0]).toMatch(/ new brand( |$)/);
    const doubled = await refusal(() =>
      themeEditNew('themes//brand', {cwd, like: 'neutral'}),
    );
    expect(doubled.run[0]).toMatch(/ new brand( |$)/);
    const camelNew = await refusal(() =>
      themeEditNew('OceanBlue', {cwd, like: 'neutral'}),
    );
    expect(camelNew.run[0]).toMatch(/ new ocean-blue( |$)/);
  }, 240_000);

  it('undo of padding in the other form names the undo that matches what is saved', async () => {
    await themeEditNew('pd', {cwd, like: 'neutral'});
    await themeEditSet('pd', 'padding-left', '12px', {
      cwd,
      on: 'text-input',
      only: true,
    });
    const side = await refusal(() =>
      themeEditUndo('pd', {cwd, thing: 'padding', on: 'text-input'}),
    );
    expect(side.run[0]).toMatch(
      / undo pd padding-left --on text-input --only$/,
    );
    await themeEditSet('pd', 'padding', '4px', {cwd, on: 'card'});
    const short = await refusal(() =>
      themeEditUndo('pd', {cwd, thing: 'padding-top', on: 'card'}),
    );
    expect(short.run[0]).toMatch(/ undo pd padding --on card$/);
    await themeEditUndo('pd', {cwd, thing: 'padding', on: 'card'});
  }, 240_000);
});
