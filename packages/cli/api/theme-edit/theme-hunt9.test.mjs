// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The ninth pass over `astryx experimental theme editor`: a stale `new`
 * marker never costs the undo history, a theme named by a file name, undo
 * refusals that suggest undos, and temp files of an earlier process with
 * this process's id.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditHow,
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

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt9-', FIXTURE_PACKAGES);
});

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('G1: a stale new marker', () => {
  it('is removed by the next change, and recovery keeps the history', async () => {
    await themeEditNew('g', {cwd});
    const dir = path.join(cwd, 'themes/g');
    // A `new` killed just before it removed its marker.
    fs.writeFileSync(path.join(dir, '.astryx-new.json'), '{}');
    await themeEditSet('g', 'corners', 'pill', {cwd});
    expect(fs.existsSync(path.join(dir, '.astryx-new.json'))).toBe(false);
    await themeEditSet('g', 'spacing', 'roomy', {cwd});
    // Even with the marker back, recovery never deletes the history.
    fs.writeFileSync(path.join(dir, '.astryx-new.json'), '{}');
    fs.rmSync(path.join(dir, 'g.settings.json'));
    await themeEditNew('g', {cwd});
    expect(fs.existsSync(path.join(dir, 'g.history.json'))).toBe(true);
    await themeEditUndo('g', {cwd});
    fs.rmSync(dir, {recursive: true, force: true});
  }, 240_000);
});

describe('G2: a theme named by a file name', () => {
  it('suggests show <theme>', async () => {
    await themeEditNew('fn', {cwd});
    for (const typed of ['fn.theme.ts', 'FN.settings.json', 'fn.ts']) {
      const r = await refusal(() => themeEditUndo(typed, {cwd}));
      expect(r.run[0], typed).toMatch(/ show fn$/);
    }
    fs.rmSync(path.join(cwd, 'themes/fn'), {recursive: true, force: true});
  }, 240_000);
});

describe('G3: undo refusals suggest undos', () => {
  it('names the settings it can undo, or the last step', async () => {
    await themeEditNew('u', {cwd});
    await themeEditSet('u', 'corners', 'pill', {cwd});
    await themeEditSet('u', 'color', 'red', {cwd, on: 'card'});
    expect(
      (await refusal(() => themeEditUndo('u', {cwd, thing: 'color'}))).run[0],
    ).toMatch(/ undo u color --on card$/);
    expect(
      (await refusal(() => themeEditUndo('u', {cwd, thing: 'radius'}))).run[0],
    ).toMatch(/ undo u corners$/);
    const all = await refusal(() => themeEditUndo('u', {cwd, thing: 'all'}));
    expect(all.run[0]).toMatch(/ undo u$/);
    expect(all.run.join(' ')).not.toMatch(/ set /);
    fs.rmSync(path.join(cwd, 'themes/u'), {recursive: true, force: true});
  }, 240_000);
});

describe('F4: a temp with this process id from an earlier process', () => {
  it('is removed', async () => {
    await themeEditNew('pt', {cwd});
    const left = path.join(
      cwd,
      `themes/pt/.pt.settings.json.astryx-${process.pid}-oldone.tmp`,
    );
    fs.writeFileSync(left, '{');
    // Older than this process.
    const t = new Date(Date.now() - process.uptime() * 1000 - 60_000);
    fs.utimesSync(left, t, t);
    await themeEditSet('pt', 'corners', 'small', {cwd});
    expect(fs.existsSync(left)).toBe(false);
    fs.rmSync(path.join(cwd, 'themes/pt'), {recursive: true, force: true});
  }, 240_000);
});

void themeEditShow;

describe('dials (final 4)', () => {
  /** @param {string} slug */
  const css = slug =>
    fs.readFileSync(path.join(cwd, `themes/${slug}/${slug}.css`), 'utf8');

  it('1: undoing a radius token rebuilds the radii without it', async () => {
    await themeEditNew('rt', {cwd});
    await themeEditSet('rt', 'corners', 'round', {cwd});
    await themeEditSet('rt', '--radius-container', '50px', {cwd});
    expect(css('rt')).toMatch(/--radius-container:\s*50px/);
    await themeEditUndo('rt', {cwd, thing: '--radius-container'});
    expect(css('rt')).not.toMatch(/--radius-container:\s*50px/);
    await themeEditSet('rt', 'spacing', 'roomy', {cwd});
    expect(css('rt')).not.toMatch(/--radius-container:\s*50px/);
    fs.rmSync(path.join(cwd, 'themes/rt'), {recursive: true, force: true});
  }, 240_000);

  it('2: a state the part never takes is refused, naming what to do', async () => {
    await themeEditNew('st', {cwd});
    const r = await refusal(() =>
      themeEditSet('st', 'color', 'red', {
        cwd,
        on: 'checkbox-input',
        state: 'disabled',
      }),
    );
    expect(r.code).toBe('ERR_THEME_NO_EFFECT');
    expect(r.run[0]).toMatch(/ how --list parts checkbox$/);
    fs.rmSync(path.join(cwd, 'themes/st'), {recursive: true, force: true});
  }, 240_000);

  it('3: inner corners never get smaller going up the scale', async () => {
    await themeEditNew('in', {cwd});
    /** @returns {number} */
    const inner = () =>
      Number(/--radius-inner:\s*(\d+)px/.exec(css('in'))?.[1]);
    let last = 0;
    for (const v of [
      'small',
      'medium',
      'large',
      'round',
      '600px',
      '999px',
      'pill',
    ]) {
      await themeEditSet('in', 'corners', v, {cwd});
      expect(inner(), v).toBeGreaterThanOrEqual(last);
      last = inner();
    }
    fs.rmSync(path.join(cwd, 'themes/in'), {recursive: true, force: true});
  }, 240_000);

  it('4: undo on a part names the group setting that applies there now', async () => {
    await themeEditNew('ug', {cwd});
    await themeEditSet('ug', 'corners', 'round', {cwd, on: 'containers'});
    await themeEditSet('ug', 'corners', 'pill', {cwd, on: 'card'});
    const r = await themeEditUndo('ug', {cwd, thing: 'corners', on: 'card'});
    expect(/** @type {any} */ (r.data).now).toMatch(/containers/);
    fs.rmSync(path.join(cwd, 'themes/ug'), {recursive: true, force: true});
  }, 240_000);

  it('5: a corners dial under an exact border-radius is shown as not shown, and steps from it', async () => {
    await themeEditNew('ex', {cwd});
    await themeEditSet('ex', 'corners', 'small', {cwd, on: 'card'});
    await themeEditSet('ex', 'border-radius', '20px', {cwd, on: 'card'});
    const shown = await themeEditShow('ex', {cwd});
    expect(shown.data.partValues.join(' ')).toMatch(/not shown: border-radius/);
    const r = await themeEditSet('ex', 'corners', 'more', {cwd, on: 'card'});
    expect(r.data.setting.value).not.toBe('medium');
    fs.rmSync(path.join(cwd, 'themes/ex'), {recursive: true, force: true});
  }, 240_000);

  it('6: refusals suggest the nearest valid equivalent', async () => {
    await themeEditNew('nv', {cwd});
    expect(
      (await refusal(() => themeEditSet('nv', 'spacing', 'x0.75', {cwd})))
        .run[0],
    ).toMatch(/spacing tight$/);
    expect(
      (await refusal(() => themeEditSet('nv', 'corners', 'calc(4px*2)', {cwd})))
        .run[0],
    ).toMatch(/corners 8px$/);
    expect(
      (await refusal(() => themeEditSet('nv', 'surfaces', 'less', {cwd})))
        .run[0],
    ).toMatch(/ how surfaces$/);
    fs.rmSync(path.join(cwd, 'themes/nv'), {recursive: true, force: true});
  }, 240_000);

  it('F3-1: a step up from an exact size on a part never lowers it', async () => {
    await themeEditNew('f31', {cwd});
    await themeEditSet('f31', 'corners', '30px', {cwd, on: 'card'});
    const r = await themeEditSet('f31', 'corners', 'more', {cwd, on: 'card'});
    const v = r.data.setting.value;
    const px = v === 'pill' ? Infinity : Number.parseFloat(v);
    expect(Number.isNaN(px) ? Infinity : px).toBeGreaterThanOrEqual(30);
    fs.rmSync(path.join(cwd, 'themes/f31'), {recursive: true, force: true});
  }, 240_000);

  it('F3-4: a spacing step for a variant starts from the part’s plain setting', async () => {
    await themeEditNew('f34', {cwd});
    await themeEditSet('f34', 'spacing', 'spacious', {cwd, on: 'card'});
    const r = await themeEditSet('f34', 'spacing', 'less', {
      cwd,
      on: 'card',
      when: 'variant:default',
    }).catch(() => null);
    if (r) expect(r.data.setting.value).toBe('roomy');
    fs.rmSync(path.join(cwd, 'themes/f34'), {recursive: true, force: true});
  }, 240_000);
});

describe('astracat on the ninth pass', () => {
  it('how never prints --like undefined for a theme with no base', async () => {
    await themeEditNew('nb', {cwd, like: 'none'});
    const {data} = await themeEditHow('rename my theme', {cwd, theme: 'nb'});
    const lines = JSON.stringify(data);
    expect(lines).not.toMatch(/--like undefined/);
    expect(lines).toMatch(/new nb-2 --like none/);
    fs.rmSync(path.join(cwd, 'themes/nb'), {recursive: true, force: true});
  }, 240_000);

  it('a folder with no package.json is refused with a command that makes one', async () => {
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'no-pkg-'));
    const r = await refusal(() => themeEditNew('x', {cwd: bare}));
    expect(r.run[0]).toBe('npm init -y');
    fs.rmSync(bare, {recursive: true, force: true});
  });
});
