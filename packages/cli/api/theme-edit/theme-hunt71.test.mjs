// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The seventy-first pass over `astryx experimental theme editor`:
 * names typed as paths or in camelCase reach the theme meant, the nearest
 * theme by edit distance comes first, a refusal never points at a command
 * that fails the same way, OS files leave a folder empty, a mode change by
 * undo names the app's <Theme mode>, and a stop after the save says so.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {stoppedAfterSave} from './_edit.mjs';
import {doc as undoDoc} from '../../clients/cli/commands/experimental-theme-editor-undo.doc.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt71-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('hunt71', () => {
  it('a path typed for a new name names the theme it ends in', async () => {
    const fresh = await refusal(() => themeEditNew('themes/brand', {cwd}));
    expect(fresh.run[0]).toMatch(/ new brand$/);
    await themeEditNew('t', {cwd});
    for (const name of ['./t', 't/', 'themes/t']) {
      const r = await refusal(() => themeEditNew(name, {cwd}));
      expect(r.message, name).toContain('t is a theme here already');
      expect(r.run[0], name).toMatch(/ show t$/);
    }
  }, 240_000);

  it('undo with unreadable settings and no history names a command that works', async () => {
    await themeEditNew('d4', {cwd});
    fs.writeFileSync(path.join(cwd, 'themes/d4/d4.settings.json'), '');
    fs.rmSync(path.join(cwd, 'themes/d4/d4.history.json'), {force: true});
    const r = await refusal(() => themeEditUndo('d4', {cwd}));
    expect(r.run.join(' ')).not.toMatch(/ show d4/);
    expect(r.run.join(' ')).toMatch(/ new d4/);
  }, 240_000);

  it('a folder holding only desktop.ini is empty', async () => {
    fs.mkdirSync(path.join(cwd, 'themes/e5'), {recursive: true});
    fs.writeFileSync(
      path.join(cwd, 'themes/e5/desktop.ini'),
      '[.ShellClassInfo]\n',
    );
    await themeEditNew('e5', {cwd});
    expect(fs.existsSync(path.join(cwd, 'themes/e5/e5.settings.json'))).toBe(
      true,
    );
  }, 240_000);

  it('a typo or camelCase of a theme name offers the theme meant', async () => {
    await themeEditNew('brand', {cwd});
    await themeEditNew('brand-dark', {cwd});
    const typo = await refusal(() =>
      themeEditSet('brand-drak', 'corners', 'pill', {cwd}),
    );
    expect(typo.run[0]).toMatch(/ set brand-dark corners pill$/);
    const undo = await refusal(() =>
      themeEditUndo('brand-drk', {cwd, thing: 'corners'}),
    );
    expect(undo.run[0]).toMatch(/ undo brand-dark corners$/);
    const camel = await refusal(() =>
      themeEditSet('brandDark', 'corners', 'pill', {cwd}),
    );
    expect(camel.run[0]).toMatch(/ set brand-dark corners pill$/);
    // themePark is theme-park, never a new themepark.
    await themeEditNew('theme-park', {cwd});
    const park = await refusal(() =>
      themeEditSet('themePark', 'corners', 'pill', {cwd}),
    );
    expect(park.run.join(' ')).not.toMatch(/ new themepark/);
    expect(park.run[0]).toMatch(/ set theme-park corners pill$/);
  }, 240_000);

  it("an undo that changes the mode names the app's <Theme mode>", async () => {
    await themeEditNew('u', {cwd});
    await themeEditSet('u', 'mode', 'dark-only', {cwd});
    const back = await themeEditUndo('u', {cwd});
    const said = (/** @type {any} */ r) =>
      [...(r.data.undone ?? []), ...(r.data.notes ?? [])].join('\n');
    expect(said(back)).toMatch(/mode="dark" for u, take it out/);
    await themeEditSet('u', 'mode', 'light-only', {cwd});
    await themeEditSet('u', 'mode', 'both', {cwd});
    const again = await themeEditUndo('u', {cwd});
    expect(said(again)).toMatch(/given mode="light"/);
  }, 240_000);

  it('undo --help says --mode removes a setting saved for one mode', () => {
    const mode = /** @type {any} */ (undoDoc).options.find(
      (/** @type {any} */ o) => o.flag === '--mode <mode>',
    );
    expect(mode.description).not.toContain('takes no --mode');
    expect(mode.description).toContain('removes a setting saved for one mode');
  });

  it('a stop after the save says the change is saved and how to run the rest', () => {
    const write = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    // Another handler (the render's) is there to end the process.
    const other = () => {};
    process.on('SIGINT', other);
    /** @type {string} */
    let line;
    try {
      stoppedAfterSave('t')('SIGINT');
      line = String(write.mock.calls[0]?.[0]);
    } finally {
      process.removeListener('SIGINT', other);
      write.mockRestore();
    }
    expect(line).toMatch(/change to t is saved and built.*show t runs them/);
  });

  it('a damaged mode and a bad value: the fix for either one works', async () => {
    await themeEditNew('c26', {cwd});
    await themeEditSet('c26', 'corners', 'pill', {cwd});
    const file = path.join(cwd, 'themes/c26/c26.settings.json');
    const damage = () => {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      j.mode = '';
      j.settings[0].value = 12;
      fs.writeFileSync(file, JSON.stringify(j, null, 2));
      fs.rmSync(path.join(cwd, 'themes/c26/c26.history.json'), {force: true});
    };
    damage();
    // Removing the bad setting repairs the mode on the way, and says so.
    const r = await themeEditUndo('c26', {cwd, thing: 'corners'});
    expect(JSON.stringify(r.data)).toContain('mode was missing or damaged');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).mode).toBe('both');
    // Fixing the mode first names the undo, which then works.
    await themeEditSet('c26', 'corners', 'pill', {cwd});
    damage();
    const first = await refusal(() =>
      themeEditSet('c26', 'mode', 'both', {cwd}),
    );
    expect(first.run[0]).toMatch(/ undo c26 corners$/);
    await themeEditUndo('c26', {cwd, thing: 'corners'});
  }, 240_000);

  it('an entry with no source is read from its thing, and the next change saves it', async () => {
    await themeEditNew('l26', {cwd});
    const file = path.join(cwd, 'themes/l26/l26.settings.json');
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    j.settings = [{thing: 'corners', value: 'x'}];
    fs.writeFileSync(file, JSON.stringify(j, null, 2));
    fs.rmSync(path.join(cwd, 'themes/l26/l26.history.json'), {force: true});
    const r = await themeEditSet('l26', 'corners', 'pill', {cwd});
    expect(r.data.notes).toContain(
      'corners was saved with no source, read as dial',
    );
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).settings).toEqual([
      expect.objectContaining({
        thing: 'corners',
        value: 'pill',
        source: 'dial',
      }),
    ]);
  }, 240_000);
});
