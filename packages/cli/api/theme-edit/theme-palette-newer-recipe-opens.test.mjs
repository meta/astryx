// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme whose palette was made with a recipe this CLI does not know
 * (a newer CLI's) opens, and opening never changes how it looks: its saved
 * palette and the settings module the newer CLI wrote are kept exactly as
 * they are, show builds the same CSS `theme build` makes of them, and a
 * note names the recipe. Changes that leave the colors alone work (set,
 * undo); a change to what the palette is made from is refused, naming the
 * recipe and this CLI's version, with no update step and every file left as
 * it was. A build
 * a newer CLI version made of the same settings is current, so a change keeps
 * its shades. A palette made with an older recipe this CLI knows keeps its
 * colors.
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
import {PALETTE_RECIPES} from '../theme/palette/generate/generator.mjs';
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
const RECIPE = `astryx-oklch-v${PALETTE_RECIPES.length + 7}`;

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
      expect(notes(shown)).toContain(`colors use the ${RECIPE} recipe`);
      expect(notes(shown)).toContain(`Astryx CLI (${cliVersion()})`);
      expect(snapshot()).toEqual(files);
      expect(read('n.css').equals(css)).toBe(true);
    },
    T,
  );

  it(
    'a change that leaves the colors alone works, and its undo; a color change is refused, naming the recipe, with no update step',
    async () => {
      const palette = read('tokens/n.palette.ts');
      const config = read('palette.config.json');
      const refsBefore = read('tokens/n.palette-refs.ts');
      await themeEditSet('n', 'corners', 'round', {cwd});
      // (The change is saved, and the theme builds as `theme build` reads it.)
      expect(read('n.settings.json').toString()).toMatch(/"corners"/);
      const {themeBuild} = await import('../theme/build/build.mjs');
      await themeBuild('themes/n/n.theme.ts', {}, {cwd});
      await themeEditUndo('n', {cwd, thing: 'corners'});
      const e = await refusal(() =>
        themeEditSet('n', 'accent', '#e11d48', {cwd}),
      );
      // (True whether or not a CLI that makes that recipe is released:
      // no update step.)
      expect(e.message).toBe(
        `n's colors use the ${RECIPE} recipe, which this Astryx CLI (${cliVersion()}) does not make; its palette is kept as saved. Changes to what the palette is made from (the accent, neutral and status colors, the vibrancy) need a CLI that makes that recipe; other changes, including exact color tokens, a part's colors, the mode and the base, save as usual. Nothing was changed.`,
      );
      expect(e.suggestions ?? []).toEqual([]);
      expect(read('tokens/n.palette.ts').equals(palette)).toBe(true);
      expect(read('palette.config.json').equals(config)).toBe(true);
      // The mode, the base, a part's color token and a whole-theme accent
      // token beside the accent color (an exact value the palette never
      // reads) only map it, so they save, and the saved palette stays as
      // it is.
      for (const [thing, value, options] of [
        ['mode', 'light-only', {}],
        ['base', 'none', {}],
        ['--color-accent', '#e11d48', {}],
        // (A line show prints to fix a contrast runs as printed.)
        ['--color-text-secondary', '#5f5f5f', {on: 'card', mode: 'light'}],
      ]) {
        await themeEditSet('n', String(thing), String(value), {
          cwd,
          .../** @type {any} */ (options),
        });
        expect(read('tokens/n.palette.ts').equals(palette)).toBe(true);
        expect(read('palette.config.json').equals(config)).toBe(true);
        await themeEditUndo('n', {cwd});
      }
      expect(read('tokens/n.palette-refs.ts').equals(refsBefore)).toBe(true);
    },
    T,
  );

  it(
    'a build a newer CLI version made is current: show keeps it, a change keeps its shades, and a missing theme module is written back',
    async () => {
      const ts = at('n.settings.ts');
      const SEAL = /^\/\/ Module ([0-9a-f]{16})\.\n/m;
      const text = read('n.settings.ts')
        .toString()
        .replace(SEAL, '')
        .replace(/\(CLI [^)]+\)\./, '(CLI 99.0.0).');
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      fs.writeFileSync(
        ts,
        text.replace(
          /^(\/\/ Built from settings [^\n]*\n)/m,
          `$1// Module ${hash}.\n`,
        ),
      );
      // (Its outputs name that CLI too, as its build wrote them.)
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(css|js)$/.test(name)) continue;
        const out = read(name).toString();
        fs.writeFileSync(
          at(name),
          out.replace(/^( \* CLI: @astryxdesign\/cli@)\S+$/m, '$199.0.0'),
        );
      }
      const files = snapshot();
      const shown = await themeEditShow('n', {cwd});
      expect(notes(shown)).not.toMatch(/built by CLI|not current/);
      expect(snapshot()).toEqual(files);
      const refs = read('tokens/n.palette-refs.ts');
      await themeEditSet('n', 'corners', 'round', {cwd});
      expect(read('tokens/n.palette-refs.ts').equals(refs)).toBe(true);
      await themeEditUndo('n', {cwd, thing: 'corners'});
      // A theme module gone is written back, the saved module kept.
      const kept = read('n.settings.ts');
      fs.rmSync(at('n.theme.ts'));
      await themeEditShow('n', {cwd});
      expect(fs.existsSync(at('n.theme.ts'))).toBe(true);
      expect(read('n.settings.ts').equals(kept)).toBe(true);
    },
    T,
  );

  it(
    'a kept newer module stays current after an output is built again',
    async () => {
      const kept = read('n.settings.ts');
      fs.rmSync(at('n.css'));
      await themeEditShow('n', {cwd});
      expect(fs.existsSync(at('n.css'))).toBe(true);
      const again = await themeEditShow('n', {cwd});
      expect(notes(again)).not.toMatch(/not current|did not finish/);
      expect(read('n.settings.ts').equals(kept)).toBe(true);
    },
    T,
  );

  it(
    'a color changed in the settings file by hand is refused like a color change',
    async () => {
      const file = at('n.settings.json');
      const before = read('n.settings.json');
      const raw = JSON.parse(before.toString());
      for (const x of raw.settings)
        if (x.source === 'dial' && x.thing === 'accent') x.value = '#e11d48';
      fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      const files = snapshot();
      try {
        const words = `n's colors use the ${RECIPE} recipe, which this Astryx CLI (${cliVersion()}) does not make; its palette is kept as saved. themes/n/n.settings.json sets accent to #e11d48, but the saved palette was made from #2563eb. Put it back by hand, or with set n accent #2563eb`;
        const e = await refusal(() => themeEditShow('n', {cwd}));
        expect(e.message).toContain(words);
        expect(e.message).toMatch(/to open the theme\. Nothing was changed\.$/);
        expect(snapshot()).toEqual(files);
        // A change that leaves the colors alone is refused the same way.
        const c = await refusal(() =>
          themeEditSet('n', 'corners', 'round', {cwd}),
        );
        expect(c.message).toBe(e.message);
        expect(snapshot()).toEqual(files);
        // The way back is open: set the saved seed again, and the theme
        // opens with its palette as saved.
        const palette = read('tokens/n.palette.ts');
        await themeEditSet('n', 'accent', '#2563eb', {cwd});
        await themeEditShow('n', {cwd});
        expect(read('tokens/n.palette.ts').equals(palette)).toBe(true);
      } finally {
        fs.writeFileSync(file, before);
      }
      // So is undo: it steps back to settings the saved palette was made
      // from.
      const dir = path.join(cwd, 'themes/n');
      const copy = `${dir}.copy`;
      fs.cpSync(dir, copy, {recursive: true});
      try {
        await themeEditSet('n', 'corners', 'round', {cwd});
        const raw2 = JSON.parse(read('n.settings.json').toString());
        for (const x of raw2.settings)
          if (x.source === 'dial' && x.thing === 'accent') x.value = '#e11d48';
        fs.writeFileSync(file, `${JSON.stringify(raw2, null, 2)}\n`);
        await themeEditUndo('n', {cwd});
        await themeEditShow('n', {cwd});
        expect(
          JSON.parse(read('n.settings.json').toString()).settings.find(
            (/** @type {any} */ x) => x.thing === 'accent',
          )?.value,
        ).toBe('#2563eb');
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
        fs.renameSync(copy, dir);
      }
      // A whole-theme accent token added by hand beside the accent dial is
      // an exact value the palette never reads: show builds it, and undo
      // and a change that leaves the colors alone go on from it alike.
      fs.cpSync(dir, copy, {recursive: true});
      try {
        const withToken = JSON.parse(read('n.settings.json').toString());
        withToken.settings.push({
          source: 'token',
          thing: '--color-accent',
          value: '#e11d48',
        });
        fs.writeFileSync(file, `${JSON.stringify(withToken, null, 2)}\n`);
        const palette = read('tokens/n.palette.ts');
        await themeEditShow('n', {cwd});
        await themeEditSet('n', 'corners', 'round', {cwd});
        await themeEditUndo('n', {cwd});
        expect(read('tokens/n.palette.ts').equals(palette)).toBe(true);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
        fs.renameSync(copy, dir);
      }
      // A status color added by hand that differs from the one the saved
      // palette made its shades from, too.
      const savedDanger = JSON.parse(
        read('palette.config.json').toString(),
      ).families.find((/** @type {any} */ f) => f.id === 'danger')?.seed;
      expect(savedDanger).toMatch(/^#[0-9a-f]{6}$/i);
      const added = JSON.parse(before.toString());
      added.settings.push({source: 'dial', thing: 'danger', value: '#dc2626'});
      fs.writeFileSync(file, `${JSON.stringify(added, null, 2)}\n`);
      try {
        const e = await refusal(() => themeEditShow('n', {cwd}));
        expect(e.message).toContain(
          `n's colors use the ${RECIPE} recipe, which this Astryx CLI (${cliVersion()}) does not make; its palette is kept as saved. themes/n/n.settings.json sets danger to #dc2626, but the saved palette was made from ${savedDanger}. Put it back by hand, or with set n danger ${savedDanger}`,
        );
      } finally {
        fs.writeFileSync(file, before);
      }
    },
    T,
  );

  it(
    'a module an older CLI built is built again',
    async () => {
      const SEAL = /^\/\/ Module ([0-9a-f]{16})\.\n/m;
      const text = read('n.settings.ts')
        .toString()
        .replace(SEAL, '')
        .replace(/\(CLI [^)]+\)\./, '(CLI 0.0.1).');
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      fs.writeFileSync(
        at('n.settings.ts'),
        text.replace(
          /^(\/\/ Built from settings [^\n]*\n)/m,
          `$1// Module ${hash}.\n`,
        ),
      );
      const shown = await themeEditShow('n', {cwd});
      expect(notes(shown)).toMatch(/built by CLI 0\.0\.1/);
      expect(read('n.settings.ts').toString()).toContain(
        `(CLI ${cliVersion()}).`,
      );
    },
    T,
  );

  it(
    'a hand edit that leaves the colors alone (corners) is built with the shades the theme shows',
    async () => {
      const file = at('n.settings.json');
      const before = read('n.settings.json');
      const edit = (/** @type {(raw: any) => void} */ change) => {
        const raw = JSON.parse(before.toString());
        change(raw);
        fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      };
      try {
        // A change that leaves the colors alone (corners, by hand) is
        // built, with the shades the theme shows.
        edit(raw => {
          raw.settings.push({thing: 'corners', value: 'round', source: 'dial'});
        });
        const refs = read('tokens/n.palette-refs.ts');
        const ts = read('n.settings.ts').toString();
        const shades = (/** @type {string} */ t) =>
          (t.match(/accent\.(light|dark)\[\d+\]/g) ?? []).join(',');
        await themeEditShow('n', {cwd});
        expect(read('tokens/n.palette-refs.ts').equals(refs)).toBe(true);
        expect(shades(read('n.settings.ts').toString())).toBe(shades(ts));
      } finally {
        fs.writeFileSync(file, before);
      }
      await themeEditShow('n', {cwd});
    },
    T,
  );

  it(
    'a palette made with an older recipe this CLI knows keeps its colors when the theme opens',
    async () => {
      await themeEditNew('o', {cwd, like: 'neutral'});
      await themeEditSet('o', 'accent', '#2563eb', {cwd});
      const file = path.join(cwd, 'themes/o/palette.config.json');
      const config = JSON.parse(fs.readFileSync(file, 'utf8'));
      const [oldest] = PALETTE_RECIPES;
      config.recipe = oldest;
      fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
      const palette = fs.readFileSync(
        path.join(cwd, 'themes/o/tokens/o.palette.ts'),
      );
      const shown = await themeEditShow('o', {cwd});
      expect(notes(shown)).not.toMatch(/made again/);
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).recipe).toBe(oldest);
      expect(
        fs
          .readFileSync(path.join(cwd, 'themes/o/tokens/o.palette.ts'))
          .equals(palette),
      ).toBe(true);
    },
    T,
  );

  it(
    'a newer theme with a vibrancy and a one-mode accent token opens',
    async () => {
      await themeEditNew('v', {cwd, like: 'neutral'});
      await themeEditSet('v', 'accent', '#2563eb', {cwd});
      await themeEditSet('v', 'vibrancy', '70', {cwd});
      await themeEditSet('v', '--color-accent', '#e11d48', {
        cwd,
        mode: 'light',
      });
      const vat = (/** @type {string} */ p) => path.join(cwd, 'themes/v', p);
      const config = JSON.parse(
        fs.readFileSync(vat('palette.config.json'), 'utf8'),
      );
      config.recipe = RECIPE;
      fs.writeFileSync(
        vat('palette.config.json'),
        `${JSON.stringify(config, null, 2)}\n`,
      );
      const receipt = JSON.parse(
        fs.readFileSync(vat('tokens/v.palette.receipt.json'), 'utf8'),
      );
      receipt.recipe = RECIPE;
      if (receipt.request) receipt.request.recipe = RECIPE;
      fs.writeFileSync(
        vat('tokens/v.palette.receipt.json'),
        `${JSON.stringify(receipt, null, 2)}\n`,
      );
      const shown = await themeEditShow('v', {cwd});
      expect(notes(shown)).toContain(`colors use the ${RECIPE} recipe`);
      // (Both halves of every color token, dark included, stay as shown.)
      const colors = () =>
        [
          ...fs
            .readFileSync(vat('v.settings.ts'), 'utf8')
            .matchAll(/"--color-[\w-]+": \[[^\]]*\]/g),
        ]
          .map(m => m[0].replace(/\s+/g, ' '))
          .sort()
          .join('\n');
      const before = colors();
      await themeEditSet('v', 'corners', 'round', {cwd});
      expect(colors()).toBe(before);
    },
    T,
  );

  it(
    'a newer theme whose source sets a page-wide token opens beside its color dials',
    async () => {
      await themeEditNew('ws', {cwd, like: 'neutral'});
      await themeEditSet('ws', 'accent', '#2563eb', {cwd});
      await themeEditSet('ws', 'vibrancy', '70', {cwd});
      const wat = (/** @type {string} */ p) => path.join(cwd, 'themes/ws', p);
      const src = fs.readFileSync(wat('ws.theme.ts'), 'utf8');
      const own = src.replace(
        "name: 'ws',",
        "name: 'ws',\n  tokens: {'--color-background-body': '#fafafa'},",
      );
      expect(own).not.toBe(src);
      fs.writeFileSync(wat('ws.theme.ts'), own);
      for (const f of [
        'palette.config.json',
        'tokens/ws.palette.receipt.json',
      ]) {
        const j = JSON.parse(fs.readFileSync(wat(f), 'utf8'));
        j.recipe = RECIPE;
        if (j.request) j.request.recipe = RECIPE;
        fs.writeFileSync(wat(f), `${JSON.stringify(j, null, 2)}\n`);
      }
      const shown = await themeEditShow('ws', {cwd});
      expect(notes(shown)).toContain(`colors use the ${RECIPE} recipe`);
    },
    T,
  );
  it(
    'a newer theme whose accent is set for one mode keeps both halves through a change that leaves the colors alone, and its undo',
    async () => {
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', '--color-accent', '#e11d48', {
        cwd,
        mode: 'light',
      });
      const wat = (/** @type {string} */ p) => path.join(cwd, 'themes/w', p);
      for (const p of [
        'palette.config.json',
        'tokens/w.palette.receipt.json',
      ]) {
        const raw = JSON.parse(fs.readFileSync(wat(p), 'utf8'));
        raw.recipe = RECIPE;
        if (raw.request) raw.request.recipe = RECIPE;
        fs.writeFileSync(wat(p), `${JSON.stringify(raw, null, 2)}\n`);
      }
      await themeEditShow('w', {cwd});
      const module = () => fs.readFileSync(wat('w.settings.ts'), 'utf8');
      /** Each color token the module sets, as written. @param {string} t */
      const colors = t =>
        (t.match(/"--color-[\w-]+": \[[\s\S]*?\n {4}\]/g) ?? []).join('\n');
      const before = module();
      expect(colors(before)).toMatch(
        /"--color-text-accent": \[\s*palette\.accent\.light\[\d+\],\s*baseIn\(/,
      );
      await themeEditSet('w', 'corners', 'round', {cwd});
      expect(colors(module())).toBe(colors(before));
      await themeEditUndo('w', {cwd, thing: 'corners'});
      expect(module()).toBe(before);
    },
    T,
  );

  it(
    'a token the newer module does not map stays unset after a change that leaves the colors alone',
    async () => {
      await themeEditNew('x', {cwd, like: 'neutral'});
      await themeEditSet('x', 'accent', '#2563eb', {cwd});
      const xat = (/** @type {string} */ p) => path.join(cwd, 'themes/x', p);
      for (const p of [
        'palette.config.json',
        'tokens/x.palette.receipt.json',
      ]) {
        const raw = JSON.parse(fs.readFileSync(xat(p), 'utf8'));
        raw.recipe = RECIPE;
        if (raw.request) raw.request.recipe = RECIPE;
        fs.writeFileSync(xat(p), `${JSON.stringify(raw, null, 2)}\n`);
      }
      // As a newer CLI writes it: a module that maps no text accent.
      const SEAL = /^\/\/ Module ([0-9a-f]{16})\.\n/m;
      const text = fs
        .readFileSync(xat('x.settings.ts'), 'utf8')
        .replace(SEAL, '')
        .replace(/\n {4}"--color-text-accent": \[[\s\S]*?\n {4}\],/, '');
      expect(text).not.toContain('"--color-text-accent"');
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      fs.writeFileSync(
        xat('x.settings.ts'),
        text.replace(
          /^(\/\/ Built from settings [^\n]*\n)/m,
          `$1// Module ${hash}.\n`,
        ),
      );
      await themeEditSet('x', 'corners', 'round', {cwd});
      const after = fs.readFileSync(xat('x.settings.ts'), 'utf8');
      expect(after).toMatch(/"--radius-element"/);
      expect(after).not.toContain('"--color-text-accent"');
    },
    T,
  );

  it(
    'undo of a whole-theme color token puts back what a newer theme showed, both modes and one',
    async () => {
      await themeEditNew('u', {cwd, like: 'neutral'});
      await themeEditSet('u', 'accent', '#2563eb', {cwd});
      const uat = (/** @type {string} */ p) => path.join(cwd, 'themes/u', p);
      for (const f of [
        'palette.config.json',
        'tokens/u.palette.receipt.json',
      ]) {
        const j = JSON.parse(fs.readFileSync(uat(f), 'utf8'));
        j.recipe = RECIPE;
        if (j.request) j.request.recipe = RECIPE;
        fs.writeFileSync(uat(f), `${JSON.stringify(j, null, 2)}\n`);
      }
      await themeEditShow('u', {cwd});
      const files = () =>
        ['u.settings.ts', 'u.css'].map(f => fs.readFileSync(uat(f), 'utf8'));
      const before = files();
      for (const options of [{}, {mode: 'light'}]) {
        await themeEditSet('u', '--color-text-accent', '#7a1fa2', {
          cwd,
          .../** @type {any} */ (options),
        });
        expect(files()).not.toEqual(before);
        await themeEditUndo('u', {cwd});
        expect(files()).toEqual(before);
      }
    },
    T,
  );

  it(
    'a whole-theme color token set for one mode and undone leaves no trace in the module or the CSS',
    async () => {
      const uat = (/** @type {string} */ p) => path.join(cwd, 'themes/u', p);
      const before = ['u.settings.ts', 'u.css'].map(f =>
        fs.readFileSync(uat(f), 'utf8'),
      );
      await themeEditSet('u', '--color-background-body', '#0a0b0c', {
        cwd,
        mode: 'light',
      });
      // (A change between them that leaves the colors alone, so the step
      // back is built from a module that shows the token.)
      await themeEditSet('u', 'corners', 'round', {cwd});
      await themeEditUndo('u', {cwd});
      await themeEditUndo('u', {cwd});
      const after = ['u.settings.ts', 'u.css'].map(f =>
        fs.readFileSync(uat(f), 'utf8'),
      );
      expect(after.join('\n')).not.toMatch(/#0a0b0c/i);
      expect(after).toEqual(before);
    },
    T,
  );

  it(
    'a named undo of a whole-theme color token set for one mode puts every file back',
    async () => {
      const uat = (/** @type {string} */ p) => path.join(cwd, 'themes/u', p);
      const files = () =>
        ['u.settings.json', 'u.settings.ts', 'u.css'].map(f =>
          fs.readFileSync(uat(f), 'utf8'),
        );
      const before = files();
      await themeEditSet('u', '--color-background-body', '#0d0e0f', {
        cwd,
        mode: 'light',
      });
      await themeEditUndo('u', {
        cwd,
        thing: '--color-background-body',
        mode: 'light',
      });
      const after = files();
      expect(after.join('\n')).not.toMatch(/#0d0e0f/i);
      expect(after.slice(1)).toEqual(before.slice(1));
      expect(JSON.parse(after[0]).settings).toEqual(
        JSON.parse(before[0]).settings,
      );
    },
    T,
  );

  it(
    'a named undo of a page color the neutral color also writes puts every file back, with no refusal',
    async () => {
      await themeEditNew('nb', {cwd, like: 'neutral'});
      await themeEditSet('nb', 'accent', '#2563eb', {cwd});
      await themeEditSet('nb', 'neutral', '#808080', {cwd});
      const bat = (/** @type {string} */ p) => path.join(cwd, 'themes/nb', p);
      for (const f of [
        'palette.config.json',
        'tokens/nb.palette.receipt.json',
      ]) {
        const j = JSON.parse(fs.readFileSync(bat(f), 'utf8'));
        j.recipe = RECIPE;
        if (j.request) j.request.recipe = RECIPE;
        fs.writeFileSync(bat(f), `${JSON.stringify(j, null, 2)}\n`);
      }
      await themeEditShow('nb', {cwd});
      const files = () =>
        ['nb.settings.json', 'nb.settings.ts', 'nb.css'].map(f =>
          fs.readFileSync(bat(f), 'utf8'),
        );
      const before = files();
      await themeEditSet('nb', '--color-background-body', '#0d0e0f', {
        cwd,
        mode: 'light',
      });
      // (Which setting writes the page color now is said from the saved
      // mapping: the palette cannot be made again without the neutral.)
      await themeEditUndo('nb', {
        cwd,
        thing: '--color-background-body',
        mode: 'light',
      });
      const after = files();
      expect(after.join('\n')).not.toMatch(/#0d0e0f/i);
      expect(JSON.parse(after[0]).settings).toEqual(
        JSON.parse(before[0]).settings,
      );
      expect(after.slice(1)).toEqual(before.slice(1));
    },
    T,
  );

  it(
    'undo to a step that recorded no shades (a newer CLI wrote it) puts the colors back, and so does a token removed by hand',
    async () => {
      const bat = (/** @type {string} */ p) => path.join(cwd, 'themes/nb', p);
      const files = () =>
        ['nb.settings.ts', 'nb.css'].map(f => fs.readFileSync(bat(f), 'utf8'));
      const before = files();
      for (const options of [{}, {mode: 'light'}]) {
        await themeEditSet('nb', '--color-background-body', '#0d0e0f', {
          cwd,
          .../** @type {any} */ (options),
        });
        // (As a newer CLI writes its history: no shades in the step.)
        const history = JSON.parse(
          fs.readFileSync(bat('nb.history.json'), 'utf8'),
        );
        fs.writeFileSync(
          bat('nb.history.json'),
          JSON.stringify(
            history.map((/** @type {string} */ t) => {
              const step = JSON.parse(t);
              delete step.built;
              return `${JSON.stringify(step, null, 2)}\n`;
            }),
          ),
        );
        await themeEditUndo('nb', {cwd});
        expect(files().join('\n')).not.toMatch(/#0d0e0f/i);
        expect(files()).toEqual(before);
      }
      // A token removed from the settings file by hand.
      await themeEditSet('nb', '--color-background-body', '#0d0e0f', {
        cwd,
        mode: 'light',
      });
      const file = bat('nb.settings.json');
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      raw.settings = raw.settings.filter(
        (/** @type {any} */ x) => x.thing !== '--color-background-body',
      );
      fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      await themeEditShow('nb', {cwd});
      expect(files().join('\n')).not.toMatch(/#0d0e0f/i);
    },
    T,
  );
  it(
    'a named undo of a one-mode color setting leaves the module and the CSS as before it, for a token that follows another and for the focus outline',
    async () => {
      await themeEditNew('fo', {cwd, like: 'neutral'});
      await themeEditSet('fo', 'accent', '#2563eb', {cwd});
      await themeEditSet('fo', 'neutral', '#64748b', {cwd});
      const fat = (/** @type {string} */ p) => path.join(cwd, 'themes/fo', p);
      for (const p of [
        'palette.config.json',
        'tokens/fo.palette.receipt.json',
      ]) {
        const raw = JSON.parse(fs.readFileSync(fat(p), 'utf8'));
        raw.recipe = RECIPE;
        if (raw.request) raw.request.recipe = RECIPE;
        fs.writeFileSync(fat(p), `${JSON.stringify(raw, null, 2)}\n`);
      }
      await themeEditShow('fo', {cwd});
      const files = ['fo.settings.json', 'fo.settings.ts', 'fo.css'];
      const now = () =>
        Object.fromEntries(
          files.map(p => [p, fs.readFileSync(fat(p), 'utf8')]),
        );
      // (The emphasized border follows the border where the theme does not
      // set it.)
      await themeEditSet('fo', '--color-border', '#cccccc', {cwd});
      for (const [thing, mode] of [
        ['--color-border', 'light'],
        ['--focus-outline-color', 'dark'],
      ]) {
        const before = now();
        await themeEditSet('fo', thing, '#ff00ff', {cwd, mode});
        expect(now()['fo.settings.ts']).toContain('#ff00ff');
        await themeEditUndo('fo', {cwd, thing, mode});
        expect(now()).toEqual(before);
      }
    },
    T,
  );
  it(
    'a non-color setting changed in the settings file by hand keeps every color the module writes out, on a theme with no base',
    async () => {
      await themeEditNew('hb', {cwd});
      await themeEditSet('hb', 'accent', '#2563eb', {cwd});
      const hat = (/** @type {string} */ p) => path.join(cwd, 'themes/hb', p);
      for (const p of [
        'palette.config.json',
        'tokens/hb.palette.receipt.json',
      ]) {
        const raw = JSON.parse(fs.readFileSync(hat(p), 'utf8'));
        raw.recipe = RECIPE;
        if (raw.request) raw.request.recipe = RECIPE;
        fs.writeFileSync(hat(p), `${JSON.stringify(raw, null, 2)}\n`);
      }
      await themeEditShow('hb', {cwd});
      // As a newer CLI writes it: a dark half written out as a color.
      const SEAL = /^\/\/ Module ([0-9a-f]{16})\.\n/m;
      const text = fs
        .readFileSync(hat('hb.settings.ts'), 'utf8')
        .replace(SEAL, '')
        .replace(/("--color-on-info": \[\n\s*[^\n]+,\n\s*)[^\n]+/, '$1"#FFF"');
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      fs.writeFileSync(
        hat('hb.settings.ts'),
        text.replace(
          /^(\/\/ Built from settings [^\n]*\n)/m,
          `$1// Module ${hash}.\n`,
        ),
      );
      /** Each color token the module sets, as written. @param {string} t */
      const colors = t =>
        (t.match(/"--color-[\w-]+": \[[\s\S]*?\n {4}\]/g) ?? []).join('\n');
      const before = fs.readFileSync(hat('hb.settings.ts'), 'utf8');
      expect(before).toMatch(/"--color-on-info": \[[^\]]*"#FFF"/i);
      const raw = JSON.parse(fs.readFileSync(hat('hb.settings.json'), 'utf8'));
      raw.settings.push({thing: 'corners', value: 'round', source: 'dial'});
      fs.writeFileSync(
        hat('hb.settings.json'),
        `${JSON.stringify(raw, null, 2)}\n`,
      );
      await themeEditShow('hb', {cwd});
      const after = fs.readFileSync(hat('hb.settings.ts'), 'utf8');
      expect(after).toMatch(/"--radius-element"/);
      expect(colors(after)).toBe(colors(before));
    },
    T,
  );

  it(
    'a token the newer module does not map gains no value from a set and its named undo',
    async () => {
      const xat = (/** @type {string} */ p) => path.join(cwd, 'themes/x', p);
      expect(fs.readFileSync(xat('x.settings.ts'), 'utf8')).not.toContain(
        '"--color-text-accent"',
      );
      await themeEditSet('x', '--color-text-accent', '#0d0e0f', {cwd});
      await themeEditUndo('x', {cwd, thing: '--color-text-accent'});
      expect(fs.readFileSync(xat('x.settings.ts'), 'utf8')).not.toContain(
        '"--color-text-accent"',
      );
    },
    T,
  );

  it(
    'a whole-theme token the palette maps, set for both modes and removed by hand, shows the palette shade again',
    async () => {
      const bat = (/** @type {string} */ p) => path.join(cwd, 'themes/nb', p);
      const line = () =>
        /"--color-text-accent": \[[^\]]*\]/
          .exec(fs.readFileSync(bat('nb.settings.ts'), 'utf8'))?.[0]
          .replace(/\s+/g, ' ');
      const before = line();
      expect(before).toMatch(/palette/);
      await themeEditSet('nb', '--color-text-accent', '#0d0e0f', {cwd});
      const file = bat('nb.settings.json');
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      raw.settings = raw.settings.filter(
        (/** @type {any} */ x) => x.thing !== '--color-text-accent',
      );
      fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      await themeEditShow('nb', {cwd});
      expect(line()).toBe(before);
    },
    T,
  );

  it(
    "a part's color changed by hand keeps every color the module writes out, and the way back from a hand-changed accent compares nothing",
    async () => {
      const bat = (/** @type {string} */ p) => path.join(cwd, 'themes/nb', p);
      const colors = () =>
        [
          ...fs
            .readFileSync(bat('nb.settings.ts'), 'utf8')
            // (The whole-theme tokens: a part's own block comes after.)
            .split('"components"')[0]
            .matchAll(/"--color-[\w-]+": (\[[^\]]*\]|"[^"]*")/g),
        ]
          .map(m => m[0].replace(/\s+/g, ' '))
          .sort()
          .join('\n');
      const before = colors();
      const file = bat('nb.settings.json');
      const saved = fs.readFileSync(file);
      const raw = JSON.parse(saved.toString());
      raw.settings.push({
        source: 'token',
        thing: '--color-text-secondary',
        value: '#5f5f5f',
        on: 'card',
      });
      fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      await themeEditShow('nb', {cwd});
      expect(colors()).toBe(before);
      fs.writeFileSync(file, saved);
      await themeEditShow('nb', {cwd});
      // A hand-changed accent: undo to a step that drops the accent is no
      // way back (it would leave the accent to the base theme), and the
      // saved seed set again is, its result comparing nothing.
      const seed = JSON.parse(
        fs.readFileSync(bat('palette.config.json'), 'utf8'),
      ).families.find((/** @type {any} */ f) => f.id === 'accent')?.seed;
      const edited = JSON.parse(saved.toString());
      for (const x of edited.settings)
        if (x.source === 'dial' && x.thing === 'accent') x.value = '#e11d48';
      fs.writeFileSync(file, `${JSON.stringify(edited, null, 2)}\n`);
      const back = /** @type {any} */ (
        await themeEditSet('nb', 'accent', String(seed), {cwd})
      ).data;
      expect(back.styled ?? []).toEqual([]);
      expect(back.newProblems ?? []).toEqual([]);
      expect(JSON.stringify(back)).toMatch(/nothing is compared/);
      expect(colors()).toBe(before);
    },
    T,
  );

  it(
    "a whole-theme token a newer CLI set, undone with no recorded shades, takes the mapping's shade, never the base theme's",
    async () => {
      await themeEditNew('sv', {cwd, like: 'neutral'});
      await themeEditSet('sv', 'accent', '#2563eb', {cwd});
      await themeEditSet('sv', '--color-text-accent', '#0a0b0c', {cwd});
      const sat = (/** @type {string} */ p) => path.join(cwd, 'themes/sv', p);
      for (const f of [
        'palette.config.json',
        'tokens/sv.palette.receipt.json',
      ]) {
        const j = JSON.parse(fs.readFileSync(sat(f), 'utf8'));
        j.recipe = RECIPE;
        if (j.request) j.request.recipe = RECIPE;
        fs.writeFileSync(sat(f), `${JSON.stringify(j, null, 2)}\n`);
      }
      // As a newer CLI that makes the recipe writes them: a module whose
      // token is one value, and history steps with no shades.
      const SEAL = /^\/\/ Module ([0-9a-f]{16})\.\n/m;
      const text = fs
        .readFileSync(sat('sv.settings.ts'), 'utf8')
        .replace(SEAL, '');
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      fs.writeFileSync(
        sat('sv.settings.ts'),
        text.replace(
          /^(\/\/ Built from settings [^\n]*\n)/m,
          `$1// Module ${hash}.\n`,
        ),
      );
      const history = JSON.parse(
        fs.readFileSync(sat('sv.history.json'), 'utf8'),
      );
      fs.writeFileSync(
        sat('sv.history.json'),
        JSON.stringify(
          history.map((/** @type {string} */ t) => {
            const step = JSON.parse(t);
            delete step.built;
            return `${JSON.stringify(step, null, 2)}\n`;
          }),
        ),
      );
      await themeEditUndo('sv', {cwd, thing: '--color-text-accent'});
      const after = fs.readFileSync(sat('sv.settings.ts'), 'utf8');
      expect(after).not.toMatch(/#0a0b0c/i);
      expect(after).toMatch(/"--color-text-accent": \[\s*palette/);
    },
    T,
  );

  it(
    'the hand-edit refusal names the way back that opens the theme: a set when one setting is off, else each to put back by hand',
    async () => {
      await themeEditNew('ur', {cwd, like: 'neutral'});
      await themeEditSet('ur', 'accent', '#1d4ed8', {cwd});
      await themeEditSet('ur', 'accent', '#2563eb', {cwd});
      const uat = (/** @type {string} */ p) => path.join(cwd, 'themes/ur', p);
      for (const f of [
        'palette.config.json',
        'tokens/ur.palette.receipt.json',
      ]) {
        const j = JSON.parse(fs.readFileSync(uat(f), 'utf8'));
        j.recipe = RECIPE;
        if (j.request) j.request.recipe = RECIPE;
        fs.writeFileSync(uat(f), `${JSON.stringify(j, null, 2)}\n`);
      }
      const file = uat('ur.settings.json');
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const x of raw.settings)
        if (x.source === 'dial' && x.thing === 'accent') x.value = '#e11d48';
      fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      // (One setting off: setting its saved seed again is offered.)
      const e = await refusal(() => themeEditShow('ur', {cwd}));
      expect(e.message).toContain('or with set ur accent #2563eb, to open');
      expect(e.message).not.toMatch(/undo/);
      // Two colors off: no single set opens it, so each is named.
      const saved = JSON.parse(
        fs.readFileSync(uat('palette.config.json'), 'utf8'),
      ).families.find((/** @type {any} */ f) => f.id === 'danger')?.seed;
      raw.settings.push({source: 'dial', thing: 'danger', value: '#dc2626'});
      fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
      const two = await refusal(() => themeEditShow('ur', {cwd}));
      expect(two.message).toContain(
        `Put every one back by hand to open the theme: accent back to #2563eb, danger back to ${saved}.`,
      );
    },
    T,
  );

  it(
    "a hand-changed color the theme's own source sets is named in that file, with no set",
    async () => {
      await themeEditNew('os', {cwd, like: 'neutral'});
      await themeEditSet('os', 'accent', '#2563eb', {cwd});
      const oat = (/** @type {string} */ p) => path.join(cwd, 'themes/os', p);
      for (const f of [
        'palette.config.json',
        'tokens/os.palette.receipt.json',
      ]) {
        const j = JSON.parse(fs.readFileSync(oat(f), 'utf8'));
        j.recipe = RECIPE;
        if (j.request) j.request.recipe = RECIPE;
        fs.writeFileSync(oat(f), `${JSON.stringify(j, null, 2)}\n`);
      }
      const src = fs.readFileSync(oat('os.theme.ts'), 'utf8');
      const own = src.replace(
        "name: 'os',",
        "name: 'os',\n  tokens: {'--color-accent': '#e11d48'},",
      );
      expect(own).not.toBe(src);
      fs.writeFileSync(oat('os.theme.ts'), own);
      const e = await refusal(() => themeEditShow('os', {cwd}));
      expect(e.message).toContain('themes/os/os.theme.ts sets --color-accent');
      expect(e.message).toContain('Change it back in themes/os/os.theme.ts');
      expect(e.message).not.toMatch(/with set os/);
    },
    T,
  );
});
