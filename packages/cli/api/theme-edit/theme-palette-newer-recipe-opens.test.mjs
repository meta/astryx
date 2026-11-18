// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme whose palette was made with a recipe this CLI does not know
 * (a newer CLI's) opens, and opening never changes how it looks: its saved
 * palette and the settings module the newer CLI wrote are kept exactly as
 * they are, show builds the same CSS `theme build` makes of them, and a
 * note names the recipe. Changes that leave the colors alone work (set,
 * undo); a color change is refused, naming the recipe, this CLI's version
 * and the install of the newest CLI, with every file left as it was. A palette made with an
 * older recipe this CLI knows is made again with its newest on open, and
 * said.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {cliVersion} from '../../foundation/release/run-context.mjs';
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
    /** @type {any} */ (await importOriginal()),
  ),
);

const T = 240_000;
const RECIPE = 'made-up-recipe-v9';

/** @type {string} */
let cwd;
/** @type {string} */
let dir;

const at = (/** @type {string} */ p) => path.join(dir, p);
const read = (/** @type {string} */ p) => fs.readFileSync(at(p));
const PALETTE_FILES = [
  'palette.config.json',
  'tokens/n.palette.ts',
  'tokens/n.palette-refs.ts',
  'tokens/n.palette.receipt.json',
  'n.settings.ts',
];
/** Every palette file and the settings module, by name. */
const snapshot = () =>
  Object.fromEntries(PALETTE_FILES.map(p => [p, read(p).toString('hex')]));

/** @param {() => Promise<unknown>} run */
const refusal = async run => {
  try {
    await run();
  } catch (e) {
    return /** @type {any} */ (e);
  }
  throw new Error('expected a refusal');
};

/** @param {any} r */
const notes = r =>
  [...(r?.data?.notes ?? []), ...(r?.data?.colorNotes ?? [])].join('\n');

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-newer-recipe-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
  await themeEditNew('n', {cwd, like: 'neutral'});
  await themeEditSet('n', 'accent', '#2563eb', {cwd});
  dir = path.join(cwd, 'themes/n');
  // As a newer CLI saves it: its recipe named in the config and receipt,
  // and colors this CLI's recipes do not make (one shade moved, in the
  // palette and the shades the theme reads alike).
  const config = JSON.parse(read('palette.config.json').toString());
  config.recipe = RECIPE;
  fs.writeFileSync(
    at('palette.config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  const refs = read('tokens/n.palette-refs.ts').toString();
  const shade = /'(#[0-9a-f]{6})'/.exec(refs)?.[1];
  if (!shade) throw new Error('no shade in the refs');
  const moved = shade === '#123456' ? '#123457' : '#123456';
  for (const p of ['tokens/n.palette.ts', 'tokens/n.palette-refs.ts'])
    fs.writeFileSync(at(p), read(p).toString().split(shade).join(moved));
  const receipt = JSON.parse(read('tokens/n.palette.receipt.json').toString());
  receipt.recipe = RECIPE;
  if (receipt.request) receipt.request.recipe = RECIPE;
  receipt.candidateSha256 = createHash('sha256')
    .update(read('tokens/n.palette.ts'))
    .digest('hex');
  fs.writeFileSync(
    at('tokens/n.palette.receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  // Its build, as `theme build` makes it of the saved files.
  const {themeBuild} = await import('../theme/build/build.mjs');
  await themeBuild('themes/n/n.theme.ts', {}, {cwd});
}, T);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a palette made with a recipe this CLI does not know, or an older one', () => {
  it(
    'opens: show keeps every palette file and the settings module, builds the same CSS, and names the recipe',
    async () => {
      const files = snapshot();
      const css = read('n.css');
      // (An output built by another Core makes show build again.)
      fs.appendFileSync(at('n.css'), '\n');
      const shown = await themeEditShow('n', {cwd});
      expect(notes(shown)).toContain(`palette recipe ${RECIPE}`);
      expect(notes(shown)).toContain(`this CLI (${cliVersion()})`);
      expect(snapshot()).toEqual(files);
      expect(read('n.css').equals(css)).toBe(true);
    },
    T,
  );

  it(
    'a change that leaves the colors alone works, and its undo; a color change is refused, naming the recipe and the update',
    async () => {
      const palette = read('tokens/n.palette.ts');
      const config = read('palette.config.json');
      await themeEditSet('n', 'corners', 'round', {cwd});
      await themeEditUndo('n', {cwd, thing: 'corners'});
      const e = await refusal(() =>
        themeEditSet('n', 'accent', '#e11d48', {cwd}),
      );
      expect(e.message).toContain(`palette recipe ${RECIPE}`);
      expect(e.message).toContain(`this CLI (${cliVersion()})`);
      expect(e.message).toMatch(/install the newest CLI/);
      expect(JSON.stringify(e)).toContain('@astryxdesign/cli@latest');
      expect(JSON.stringify(e)).not.toContain('upgrade');
      expect(read('tokens/n.palette.ts').equals(palette)).toBe(true);
      expect(read('palette.config.json').equals(config)).toBe(true);
    },
    T,
  );

  it(
    'a palette made with an older recipe this CLI knows is made again with the newest when the theme opens, and said',
    async () => {
      await themeEditNew('o', {cwd, like: 'neutral'});
      await themeEditSet('o', 'accent', '#2563eb', {cwd});
      const file = path.join(cwd, 'themes/o/palette.config.json');
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      const {PALETTE_RECIPES} =
        await import('../theme/palette/generate/generator.mjs');
      const [oldest] = PALETTE_RECIPES;
      const newest = PALETTE_RECIPES[PALETTE_RECIPES.length - 1];
      config.recipe = oldest;
      fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
      const shown = await themeEditShow('o', {cwd});
      expect(notes(shown)).toContain(
        `made with the ${oldest} palette recipe, so they are made again with ${newest}`,
      );
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).recipe).toBe(newest);
      // Once made again, it opens as current.
      expect(notes(await themeEditShow('o', {cwd}))).not.toMatch(
        /palette recipe|not current/,
      );
    },
    T,
  );
});
