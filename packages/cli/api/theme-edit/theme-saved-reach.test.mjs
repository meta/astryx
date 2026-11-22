// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A saved setting keeps saying how far it reaches: the build records
 * (`reached`) the parts each setting that reaches beyond its own part
 * writes, and the first change after that reach grows names the setting
 * once, at the top of its result, with the line that keeps it on its own part.
 * A setting with no record yet is recorded as it reaches, with no word.
 * `--only` on a setting the theme already holds replaces it, so the look
 * leaves the group, and a theme saved with both still builds as it did.
 * Against real bundled base themes.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-saved-reach-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) return;
  // (Two themes built once, which each case copies under its own name: a
  // new theme, and one with a border color set on a text input, which
  // reaches its family.)
  await themeEditNew(BLANK, {cwd, like: 'neutral'});
  copyTheme(BLANK, BORDERED);
  await themeEditSet(BORDERED, 'border-color', '#ff0000', {
    cwd,
    on: 'text-input',
  });
}, 300_000);

/** The built themes each case starts from. */
const BLANK = 'zqblank';
const BORDERED = 'zqbordered';

/**
 * A copy of a built theme under a new name, as building it again under that
 * name would leave it: every file, with the name in each.
 * @param {string} from @param {string} to
 */
const copyTheme = (from, to) => {
  const src = path.join(cwd, 'themes', from);
  const dst = path.join(cwd, 'themes', to);
  fs.mkdirSync(dst, {recursive: true});
  for (const name of fs.readdirSync(src))
    fs.writeFileSync(
      path.join(dst, name.replaceAll(from, to)),
      fs.readFileSync(path.join(src, name), 'utf8').replaceAll(from, to),
    );
};

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

/** The text a person reads for a command, run as they run it. @param {string[]} args */
const cliText = async args =>
  (await runCli(['experimental', 'theme', 'editor', ...args], {cwd})).stdout;

/**
 * Takes the text area out of the record of each saved setting whose key
 * starts with `prefix`, as an editor whose group did not hold it yet saved
 * it: the record still reaches past the part the setting is on.
 * @param {string} slug @param {string} prefix
 */
const narrowRecord = (slug, prefix) => {
  const data = saved(slug);
  for (const k of Object.keys(data.reached ?? {}))
    if (k.startsWith(prefix))
      data.reached[k] = data.reached[k].filter(
        (/** @type {string} */ t) => t !== 'text-area',
      );
  save(slug, data);
};

/** @param {string} slug */
const settingsFile = slug =>
  path.join(cwd, 'themes', slug, `${slug}.settings.json`);

/** @param {string} slug */
const saved = slug => JSON.parse(fs.readFileSync(settingsFile(slug), 'utf8'));

/** @param {string} slug @param {any} data */
const save = (slug, data) =>
  fs.writeFileSync(settingsFile(slug), JSON.stringify(data, null, 2));

/** @param {string} slug @param {string} prop */
const partsWith = (slug, prop) =>
  [
    ...fs
      .readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .filter(m => m[2].includes(`${prop}:`))
    .flatMap(m => [...m[1].matchAll(/\.astryx-([a-z][a-z0-9-]*)/g)])
    .map(m => m[1]);

describe('a saved setting and how far it reaches', () => {
  it('a setting that now reaches more parts than recorded is named once, first in the result, and its undo names it no second time', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BORDERED, 'grow');
    // The theme as an editor that reached only the field it named saved it.
    const data = saved('grow');
    const key = Object.keys(data.reached ?? {}).find(k =>
      k.startsWith('border-color|'),
    );
    expect(key).toBeTruthy();
    expect(data.reached[key]).toEqual(expect.arrayContaining(['text-area']));
    data.reached[/** @type {string} */ (key)] = data.reached[
      /** @type {string} */ (key)
    ].filter((/** @type {string} */ t) => t !== 'text-area');
    save('grow', data);

    const r = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '4px', {cwd})
    );
    const widened = /** @type {any[]} */ (r.data.widened ?? []);
    expect(widened).toHaveLength(1);
    expect(widened[0].setting).toMatch(/^border-color = #ff0000 on text-input/);
    expect(widened[0].parts).toEqual(expect.arrayContaining(['text-area']));
    expect(widened[0].keep).toContain('--on text-input --only');
    // Said once: the record now holds where it reaches.
    const again = /** @type {any} */ (
      await themeEditSet('grow', 'corners', '6px', {cwd})
    );
    expect(again.data.widened ?? []).toEqual([]);
    // (Undoing the change that named the growth names it no second time.)
    await themeEditUndo('grow', {cwd});
    const u = /** @type {any} */ (await themeEditUndo('grow', {cwd}));
    expect(u.data.widened ?? []).toEqual([]);
  }, 240_000);

  it('a setting saved with no record is recorded as it reaches, with no word', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BORDERED, 'old');
    const data = saved('old');
    delete data.reached;
    save('old', data);
    const r = /** @type {any} */ (
      await themeEditSet('old', 'corners', '4px', {cwd})
    );
    expect(r.data.widened ?? []).toEqual([]);
    expect(Object.keys(saved('old').reached ?? {})).toEqual(
      expect.arrayContaining([expect.stringMatching(/^border-color\|/)]),
    );
  }, 240_000);

  it('--only on the same setting replaces it, so the look leaves the group', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BORDERED, 'narrow');
    expect(partsWith('narrow', 'border-color')).toContain('text-area');
    const r = /** @type {any} */ (
      await themeEditSet('narrow', 'border-color', '#ff0000', {
        cwd,
        on: 'text-input',
        only: true,
      })
    );
    // (The group version is named as the setting it replaces, never as a
    // copy listed twice.)
    expect(r.data.replaced).toEqual(
      expect.objectContaining({thing: 'border-color', on: 'text-input'}),
    );
    expect(r.data.replaced.only).toBeFalsy();
    expect(r.data.notes.join('\n')).toMatch(/^replaces border-color/m);
    expect(r.data.notes.join('\n')).not.toMatch(/listed twice/);
    const entries = saved('narrow').settings.filter(
      (/** @type {any} */ x) => x.thing === 'border-color',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].only).toBe(true);
    expect(partsWith('narrow', 'border-color')).not.toContain('text-area');
  }, 240_000);

  it('a setting named on a group says it follows the group, with no line that set refuses', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BLANK, 'grp');
    await themeEditSet('grp', 'border-color', '#00ff00', {cwd, on: 'inputs'});
    const data = saved('grp');
    const key = /** @type {string} */ (
      Object.keys(data.reached).find(k => k.startsWith('border-color|'))
    );
    data.reached[key] = data.reached[key].filter(
      (/** @type {string} */ t) => t !== 'text-area',
    );
    save('grp', data);
    const r = /** @type {any} */ (
      await themeEditSet('grp', 'corners', '4px', {cwd})
    );
    expect(r.data.widened).toHaveLength(1);
    expect(r.data.widened[0].keep).toBeNull();
  }, 240_000);

  it('the text names each widened setting, and two keep lines print as one sequence', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BORDERED, 'txt');
    await themeEditSet('txt', 'background-color', '#ffffee', {
      cwd,
      on: 'text-input',
    });
    narrowRecord('txt', 'border-color|');
    narrowRecord('txt', 'background-color|');
    const out = await cliText(['set', 'txt', 'corners', '4px']);
    const lines = out.split('\n');
    expect(lines[0]).toMatch(
      /but it also made 2 saved settings reach more parts:$/,
    );
    expect(out).toMatch(
      /to keep it on text-input alone: .* --on text-input --only/,
    );
    const seq = lines.findIndex(l =>
      l.startsWith('- to keep each on its own part: '),
    );
    expect(seq).toBeGreaterThan(0);
    expect(lines[seq].split(' && ')).toHaveLength(2);
    expect(lines[seq + 1]).toBe('  sequence: run as one line, in this order');
    expect(out).not.toMatch(/in one step/);
  }, 240_000);

  it('a theme saved with a group setting and its --only twin opens and builds as it did', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BORDERED, 'twin');
    // What an earlier editor wrote for `set … --only`: a second entry.
    const data = saved('twin');
    const group = data.settings.find(
      (/** @type {any} */ x) => x.thing === 'border-color',
    );
    data.settings.push({...group, value: '#0000ff', only: true});
    save('twin', data);
    const r = /** @type {any} */ (
      await themeEditSet('twin', 'corners', '4px', {cwd})
    );
    expect(r.data.action).toBe('set');
    const css = fs.readFileSync(
      path.join(cwd, 'themes', 'twin', 'twin.css'),
      'utf8',
    );
    expect(css).toMatch(/astryx-text-area[^{]*\{[^}]*border-color:\s*#ff0000/i);
    expect(
      saved('twin').settings.filter(
        (/** @type {any} */ x) => x.thing === 'border-color',
      ),
    ).toHaveLength(2);
  }, 240_000);

  it('an undo names the growth its build finds, and undoing a narrowing names both entries', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BORDERED, 'back');
    await themeEditSet('back', 'border-color', '#ff0000', {
      cwd,
      on: 'text-input',
      only: true,
    });
    const u = /** @type {any} */ (await themeEditUndo('back', {cwd}));
    const undone = /** @type {string[]} */ (u.data.undone).join('\n');
    expect(undone).toMatch(/removed border-color = #ff0000 on text-input only/);
    expect(undone).toMatch(/put back border-color = #ff0000 on text-input/);
    expect(partsWith('back', 'border-color')).toContain('text-area');

    narrowRecord('back', 'border-color|');
    await themeEditSet('back', 'corners', '4px', {cwd});
    narrowRecord('back', 'border-color|');
    const u2 = /** @type {any} */ (await themeEditUndo('back', {cwd}));
    expect(u2.data.widened?.[0]?.parts).toEqual(
      expect.arrayContaining(['text-area']),
    );
  }, 240_000);

  it('an undo that puts a setting back names the parts it now reaches past its record', async ctx => {
    if (needBases(ctx)) return;
    copyTheme(BORDERED, 'putb');
    narrowRecord('putb', 'border-color|');
    await themeEditUndo('putb', {
      cwd,
      thing: 'border-color',
      on: 'text-input',
    });
    const u = /** @type {any} */ (await themeEditUndo('putb', {cwd}));
    expect(u.data.widened?.[0]?.parts).toEqual(
      expect.arrayContaining(['text-area']),
    );
  }, 240_000);
});
