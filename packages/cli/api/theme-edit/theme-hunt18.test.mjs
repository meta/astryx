// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The eighteenth pass over `astryx experimental theme editor`: the
 * names, bases and values a refusal suggests are ones that run, and a result
 * never claims a comparison it did not make.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditUndo} from './theme-edit.mjs';
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
  cwd = makeLinkedFixture('astryx-theme-hunt18-', FIXTURE_PACKAGES);
  await themeEditNew('t', {cwd});
  await themeEditSet('t', 'corners', 'pill', {cwd});
  await themeEditSet('t', 'spacing', 'roomy', {cwd});
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/** @param {() => Promise<unknown>} run */
async function refusal(run) {
  try {
    await run();
  } catch (error) {
    return /** @type {any} */ (error);
  }
  throw new Error('expected a refusal');
}

const names = (/** @type {any} */ err) =>
  err.suggestions.map((/** @type {any} */ x) => x.name);

const settingsFile = () => path.join(cwd, 'themes/t/t.settings.json');

describe('L1: an invalid name suggests a name new takes', () => {
  it('turns a built-in name into my-<name>', async () => {
    const err = await refusal(() => themeEditNew('Neutral', {cwd}));
    expect(names(err)[0]).toMatch(/ new my-neutral$/);
  });

  it("skips a folder of the user's files", async () => {
    fs.mkdirSync(path.join(cwd, 'themes/con-theme'), {recursive: true});
    fs.writeFileSync(path.join(cwd, 'themes/con-theme/mine.txt'), 'hi\n');
    const err = await refusal(() => themeEditNew('Con', {cwd}));
    expect(names(err)[0]).toMatch(/ new con-theme-2$/);
  });

  it('says "a theme here already" only for the same name in another case', async () => {
    const err = await refusal(() => themeEditNew('T', {cwd}));
    expect(err.message).toContain('t is a theme here already');
    expect(names(err)[0]).toMatch(/ show t$/);
    await themeEditNew('my-theme', {cwd});
    const other = await refusal(() => themeEditNew('!!!', {cwd}));
    expect(other.message).not.toContain('a theme here already');
    expect(names(other)[0]).toMatch(/ new my-theme-2$/);
  }, 240_000);
});

describe('L2: new on an existing theme', () => {
  it('suggests the base asked for, and a free name', async () => {
    const err = await refusal(() => themeEditNew('t', {cwd, like: 'butter'}));
    expect(names(err)).toEqual([
      expect.stringMatching(/ show t$/),
      expect.stringMatching(/ set t base butter$/),
      expect.stringMatching(/ new t-2 --like butter$/),
    ]);
  });
});

describe('L3: a setting listed twice by hand', () => {
  it('names both values, and set or undo of it keeps one or none', async () => {
    const before = fs.readFileSync(settingsFile(), 'utf8');
    const data = JSON.parse(before);
    data.settings.push({thing: 'corners', value: 'square', source: 'dial'});
    fs.writeFileSync(settingsFile(), JSON.stringify(data));

    const err = await refusal(() =>
      themeEditSet('t', 'accent', '#7c3aed', {cwd}),
    );
    expect(err.message).toContain(
      'corners (whole theme) is listed twice ("pill", "square")',
    );
    expect(names(err).slice(0, 3)).toEqual([
      expect.stringMatching(/ set t corners pill$/),
      expect.stringMatching(/ set t corners square$/),
      expect.stringMatching(/ undo t corners$/),
    ]);

    await themeEditSet('t', 'corners', 'small', {cwd});
    const kept = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).settings;
    expect(
      kept.filter((/** @type {any} */ x) => x.thing === 'corners'),
    ).toEqual([expect.objectContaining({value: 'small'})]);
    expect(kept.some((/** @type {any} */ x) => x.thing === 'spacing')).toBe(
      true,
    );

    data.settings.push({thing: 'corners', value: 'large', source: 'dial'});
    fs.writeFileSync(
      settingsFile(),
      JSON.stringify({
        ...data,
        settings: [...kept, {thing: 'corners', value: 'large', source: 'dial'}],
      }),
    );
    await themeEditUndo('t', {cwd, thing: 'corners'});
    const after = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).settings;
    expect(after.some((/** @type {any} */ x) => x.thing === 'corners')).toBe(
      false,
    );
    expect(after.some((/** @type {any} */ x) => x.thing === 'spacing')).toBe(
      true,
    );
    await themeEditSet('t', 'corners', 'pill', {cwd});
  }, 240_000);
});

describe('L4: no last build', () => {
  it('says the token changes are not listed, never that nothing changed', async () => {
    fs.rmSync(path.join(cwd, 'themes/t/t.js'));
    const r = await themeEditSet('t', 'spacing', 'compact', {cwd});
    const text = JSON.stringify(r);
    expect(text).toContain('there was no last build (t.js is missing)');
    expect(text).not.toContain('this changes nothing you see');
    fs.rmSync(path.join(cwd, 'themes/t/t.js'));
    const u = await themeEditUndo('t', {cwd});
    expect(JSON.stringify(u)).toContain('there was no last build');
  }, 240_000);
});
