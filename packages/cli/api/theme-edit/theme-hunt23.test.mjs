// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The twenty-third pass over `astryx experimental theme editor`:
 * installed bases only, base/mode changed and back, a copied theme folder,
 * a shorthand that replaces its longhands, a hand-edited property value,
 * and outputs missing or edited by hand.
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

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-hunt23-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {string} slug @param {string} file */
const at = (slug, file) => path.join(cwd, 'themes', slug, file);

describe('hunt23', () => {
  it('P2: only an installed base is suggested', async () => {
    const like = await refusal(() => themeEditNew('u', {cwd, like: 'y2kk'}));
    expect(like.run[0]).not.toMatch(/--like y2k\b/);
    await themeEditNew('b2', {cwd});
    const base = await refusal(() => themeEditSet('t', 'base', 'b2', {cwd}));
    expect(base.run.length).toBeGreaterThan(0);
    expect(base.run[0]).toMatch(/ set t base none$/);
  }, 240_000);

  it('Q1: a mode changed and changed back has nothing to undo, and says so', async () => {
    await themeEditSet('t', 'mode', 'dark-only', {cwd});
    await themeEditSet('t', 'mode', 'both', {cwd});
    const r = await refusal(() => themeEditUndo('t', {cwd, thing: 'mode'}));
    expect(r.message).toMatch(/back at both.*changed and changed back/);
  }, 240_000);

  it('Q3: a copied editor folder names the files to rename', async () => {
    fs.cpSync(path.join(cwd, 'themes', 't'), path.join(cwd, 'themes', 't2'), {
      recursive: true,
    });
    const r = await refusal(() => themeEditShow('t2', {cwd}));
    expect(r.message).toMatch(/copy or rename of t\b/);
    expect(r.message).toMatch(/t\.settings\.json|t\.css to t2\.css/);
    expect(r.run).toContainEqual(expect.stringMatching(/ show t$/));
    expect(r.run.join(' ')).not.toMatch(/\b(mv|rm)\b/);
  }, 240_000);

  it('R12: a padding shorthand after its sides removes them, and undo brings them back', async () => {
    await themeEditNew('p', {cwd});
    await themeEditSet('p', 'padding-top', '12px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding', '4px', {cwd, on: 'card'});
    const css = () => fs.readFileSync(at('p', 'p.css'), 'utf8');
    expect(css()).not.toMatch(/card-padding-block-start: 12px/);
    await themeEditUndo('p', {cwd});
    expect(css()).toMatch(/12px/);
  }, 240_000);

  it('R12: a hand-edited property value the grammar refuses is named', async () => {
    await themeEditNew('h', {cwd});
    await themeEditSet('h', 'padding', '4px', {cwd, on: 'card'});
    const file = at('h', 'h.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.find((/** @type {any} */ s) => s.thing === 'padding').value =
      'banana';
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    const r = await refusal(() => themeEditSet('h', 'corners', 'pill', {cwd}));
    expect(r.message).toMatch(/padding = banana on card/);
  }, 240_000);

  it('F12-N1: show rebuilds an output that is missing or edited by hand', async () => {
    await themeEditNew('g', {cwd});
    fs.rmSync(at('g', 'g.d.ts'));
    const missing = await themeEditShow('g', {cwd});
    expect(JSON.stringify(missing.data)).toMatch(/g\.d\.ts was missing/);
    expect(fs.existsSync(at('g', 'g.d.ts'))).toBe(true);
    fs.appendFileSync(at('g', 'g.css'), '.injected{}\n');
    const edited = await themeEditShow('g', {cwd});
    expect(JSON.stringify(edited.data)).toMatch(/g\.css differs/);
    expect(fs.readFileSync(at('g', 'g.css'), 'utf8')).not.toMatch(/injected/);
  }, 240_000);
});

describe('hunt23, chaos14', () => {
  it('R14-C: an own source that does not parse is refused before anything is written', async () => {
    await themeEditNew('a', {cwd});
    await themeEditSet('a', 'corners', 'square', {cwd});
    await themeEditSet('a', 'danger', '#ffffff', {cwd});
    fs.appendFileSync(at('a', 'a.theme.ts'), '\noops(');
    /** @param {string} d @returns {Record<string, string>} */
    const tree = d =>
      Object.fromEntries(
        fs
          .readdirSync(d, {recursive: true, withFileTypes: true})
          .filter(e => e.isFile())
          .map(e => {
            const p = path.join(e.parentPath ?? e.path, e.name);
            return [path.relative(d, p), fs.readFileSync(p, 'utf8')];
          }),
      );
    const before = tree(path.join(cwd, 'themes', 'a'));
    for (const run of [
      () => themeEditUndo('a', {cwd}),
      () => themeEditShow('a', {cwd}),
    ]) {
      const r = await refusal(run);
      expect(r.code).toBe('ERR_THEME_INVALID');
      expect(r.message).toMatch(/a\.theme\.ts does not parse/);
      expect(r.run[0]).toBe('cat themes/a/a.theme.ts');
    }
    expect(tree(path.join(cwd, 'themes', 'a'))).toEqual(before);
  }, 240_000);

  it('R14-B: a build temp a stopped command left is swept once it is old', async () => {
    const left = at('t', '.t.css.tmp-1234abcd-5678');
    fs.writeFileSync(left, 'x');
    const old = (Date.now() - 11 * 60_000) / 1000;
    fs.utimesSync(left, old, old);
    await themeEditSet('t', 'corners', 'large', {cwd});
    expect(fs.existsSync(left)).toBe(false);
  }, 240_000);
});
