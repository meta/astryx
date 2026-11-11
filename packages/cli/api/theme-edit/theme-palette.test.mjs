// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the color dials of `astryx experimental theme`: each one
 * writes a palette config in the generator's shape, the generator writes the
 * palette and its receipt, the tokens point at palette stops in both modes,
 * contrast picks a stop that passes, an exact token wins, and undo removes
 * the family. Integration cases run against the Core this repository builds.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  themeEditHow,
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
} from './theme-edit.mjs';
import {paletteConfig, paletteMapping} from './_palette.mjs';
import {parseColor, ratio} from './_color.mjs';
import {
  generateTonalPalette,
  normalizeGenerationRequest,
} from '../theme/palette/generate/generator.mjs';
import {themePaletteGenerate} from '../theme/palette/generate/generate.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

/** @type {string} */
let cwd;

/** @param {() => Promise<unknown>} fn */
async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/** @param {string} rel */
const file = rel => path.join(cwd, 'themes', 'p', rel);
/** @param {string} rel */
const read = rel => fs.readFileSync(file(rel), 'utf8');
/** @param {string} a @param {string} b */
const contrast = (a, b) =>
  ratio(
    /** @type {number[]} */ (parseColor(a)),
    /** @type {number[]} */ (parseColor(b)),
  );

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-palette-', [
    '@astryxdesign',
    'react',
    'react-dom',
  ]);
  // No base theme, so the tests need only the built Core.
  await themeEditNew('p', {cwd});
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

describe('color dials through the palette generator', () => {
  it('writes a palette config in the generator shape, then the palette and receipt', async () => {
    await themeEditSet('p', 'accent', '#7c3aed', {cwd});
    const config = JSON.parse(read('palette.config.json'));
    expect(config).toEqual({
      modeStrategy: 'light-and-dark',
      families: [
        {
          id: 'accent',
          name: 'Accent',
          seed: '#7c3aed',
          anchors: [
            {
              mode: 'light',
              stop: expect.any(Number),
              color: '#7c3aed',
              policy: 'exact',
            },
          ],
        },
      ],
    });
    expect(() => normalizeGenerationRequest(config)).not.toThrow();
    expect(fs.existsSync(file('tokens/p.palette.ts'))).toBe(true);
    const receipt = JSON.parse(read('tokens/p.palette.receipt.json'));
    expect(receipt.request.families[0]).toMatchObject({
      id: 'accent',
      seed: '#7c3aed',
    });
  });

  it('points the accent tokens at palette stops in light and dark', async () => {
    const source = read('p.settings.ts');
    expect(source).toContain("import {palette} from './tokens/p.palette';");
    expect(source).toMatch(
      /"--color-accent": \[\s*palette\.accent\.light\[\d+\],\s*palette\.accent\.dark\[\d+\]\s*\]/,
    );
    const show = await themeEditShow('p', {cwd});
    expect(show.data.colors[0]).toMatchObject({
      color: 'accent',
      seed: '#7c3aed',
    });
    const tokens = show.data.colors[0].tokens;
    const candidate = generateTonalPalette(
      JSON.parse(read('palette.config.json')),
    );
    const shades =
      /^light (\d+) (#[0-9a-f]{6}), dark (\d+) (#[0-9a-f]{6})$/.exec(
        tokens['--color-accent'],
      );
    for (const [i, mode] of /** @type {const} */ ([
      [1, 'light'],
      [3, 'dark'],
    ])) {
      const [stop, color] = [shades?.[i], shades?.[i + 1]];
      expect(/** @type {any} */ (candidate.palette.accent)[mode][stop]).toBe(
        color,
      );
      expect(show.data.resolved['--color-accent'][mode]).toBe(color);
    }
    expect(Object.keys(tokens)).toEqual(
      expect.arrayContaining([
        '--color-accent',
        '--color-on-accent',
        '--color-text-accent',
        '--color-icon-accent',
        '--color-accent-muted',
        '--focus-outline-color',
      ]),
    );
    expect(show.data.vibrancy).toBe(50);
    expect(show.data.colorFiles).toEqual({
      config: 'themes/p/palette.config.json',
      module: 'themes/p/tokens/p.palette.ts',
      receipt: 'themes/p/tokens/p.palette.receipt.json',
    });
    expect(Object.keys(show.data).at(-1)).toBe('colorFiles');
  });

  it('round-trips: the receipt regenerates the same palette bytes', async () => {
    const receipt = JSON.parse(read('tokens/p.palette.receipt.json'));
    const palette = read('tokens/p.palette.ts');
    expect(createHash('sha256').update(palette).digest('hex')).toBe(
      receipt.candidateSha256,
    );
    const dir = path.join(cwd, 'regen');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'request.json'),
      JSON.stringify(receipt.request),
    );
    themePaletteGenerate(
      'regen/request.json',
      {out: 'regen/again.palette.ts'},
      {cwd},
    );
    expect(fs.readFileSync(path.join(dir, 'again.palette.ts'), 'utf8')).toBe(
      palette,
    );
  });

  it('lets an exact token win over the palette, whatever the order', async () => {
    await themeEditSet('p', '--color-accent', '#ff0000', {cwd});
    await themeEditSet('p', 'accent', '#2563eb', {cwd});
    const show = await themeEditShow('p', {cwd});
    expect(show.data.resolved['--color-accent']).toEqual({
      light: '#ff0000',
      dark: '#ff0000',
    });
    expect(show.data.colors[0].tokens['--color-accent']).toContain(
      '(your exact setting wins)',
    );
    const source = read('p.settings.ts');
    expect(source).toContain('"--color-accent": "#ff0000"');
    expect(source).toMatch(/"--color-text-accent": \[\s*palette\.accent/);
    await themeEditUndo('p', {cwd, thing: '--color-accent'});
  });

  it('keeps config fields and families the editor does not own', async () => {
    const config = JSON.parse(read('palette.config.json'));
    config.stops = [0, 10, 25, 45, 60, 70, 80, 90, 95, 100];
    config.families.push({id: 'brand-pink', seed: '#db2777'});
    fs.writeFileSync(file('palette.config.json'), JSON.stringify(config));
    await themeEditSet('p', 'accent', '#0d9488', {cwd});
    const next = JSON.parse(read('palette.config.json'));
    expect(next.stops).toEqual(config.stops);
    expect(next.families.map((/** @type {any} */ f) => f.id)).toEqual([
      'accent',
      'brand-pink',
    ]);
    expect(next.families[0].seed).toBe('#0d9488');
    expect(read('tokens/p.palette.ts')).toContain('"brand-pink"');
    next.families.pop();
    delete next.stops;
    fs.writeFileSync(file('palette.config.json'), JSON.stringify(next));
  });

  it('grows neutral and status families with their token words', async () => {
    await themeEditSet('p', 'neutral', '#64748b', {cwd});
    const r = await themeEditSet('p', 'danger', 'crimson', {cwd});
    expect(r.data.notes.join(' ')).toContain('--color-error uses danger shade');
    const config = JSON.parse(read('palette.config.json'));
    expect(config.neutralProfile).toBe('custom');
    expect(config.families).toEqual(
      expect.arrayContaining([
        {id: 'neutral', name: 'Neutral', seed: '#64748b', kind: 'neutral'},
        expect.objectContaining({
          id: 'danger',
          name: 'Danger',
          seed: '#dc143c',
        }),
      ]),
    );
    const source = read('p.settings.ts');
    expect(source).toMatch(
      /"--color-background-surface": \[\s*palette\.neutral/,
    );
    expect(source).toMatch(
      /"--color-border": \[\s*palette\.neutral\.light\[0\] \+ '14'/,
    );
    expect(source).toMatch(/"--color-error": \[\s*palette\.danger/);
    await themeEditUndo('p', {cwd, thing: 'danger'});
    await themeEditUndo('p', {cwd, thing: 'neutral'});
  });

  it('undo removes the family, its tokens and, with no family left, the palette files', async () => {
    const r = await themeEditUndo('p', {cwd, thing: 'accent'});
    expect(r.data.notes.join(' ')).toContain(
      'the accent color is no longer generated',
    );
    expect(fs.existsSync(file('palette.config.json'))).toBe(false);
    expect(fs.existsSync(file('tokens/p.palette.ts'))).toBe(false);
    expect(fs.existsSync(file('tokens/p.palette.receipt.json'))).toBe(false);
    expect(read('p.settings.ts')).not.toContain('palette');
    const show = await themeEditShow('p', {cwd});
    expect(show.data.colors).toEqual([]);
    expect(show.data.vibrancy).toBe(null);
    expect(show.data.colorFiles).toBe(null);
  });

  it('a step back with plain undo brings the family and its files back', async () => {
    await themeEditSet('p', 'accent', '#7c3aed', {cwd});
    await themeEditUndo('p', {cwd, thing: 'accent'});
    await themeEditUndo('p', {cwd});
    expect(JSON.parse(read('palette.config.json')).families[0].seed).toBe(
      '#7c3aed',
    );
    expect(fs.existsSync(file('tokens/p.palette.ts'))).toBe(true);
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('refuses a color the palette cannot grow from, and a per-part or per-mode dial', async () => {
    const before = read('p.settings.json');
    for (const v of ['banana', 'var(--brand)', 'currentcolor', 'more'])
      expect(
        (await refusal(() => themeEditSet('p', 'accent', v, {cwd}))).code,
        v,
      ).toBe('ERR_THEME_BAD_VALUE');
    const mode = await refusal(() =>
      themeEditSet('p', 'accent', '#7c3aed', {cwd, mode: 'dark'}),
    );
    expect(mode.run[0]).toBe(
      'astryx experimental theme editor set p --color-accent "#7c3aed" --mode dark',
    );
    const on = await refusal(() =>
      themeEditSet('p', 'info', '#0284c7', {cwd, on: 'button'}),
    );
    expect(on.run[0]).toBe(
      'astryx experimental theme editor set p --color-info "#0284c7" --on button',
    );
    expect(read('p.settings.json')).toBe(before);
    expect(fs.existsSync(file('palette.config.json'))).toBe(false);
  });

  it('how explains the colors and a color dial', async () => {
    for (const subject of ['palette', 'colors']) {
      const r = await themeEditHow(subject, {cwd});
      const first = r.data.results[0];
      expect(first.text).toContain('one seed');
      expect(first.text).toContain('light and dark');
      expect(first.text).toContain('theme palette generate');
    }
    const accent = await themeEditHow('accent', {cwd});
    expect(accent.data.shades.join(' ')).toContain('--color-text-accent');
  });

  it('vibrancy regenerates the colors, steps by 10, and is checked', async () => {
    const none = await refusal(() =>
      themeEditSet('p', 'vibrancy', '60', {cwd}),
    );
    expect(none.code).toBe('ERR_THEME_NO_EFFECT');
    expect(none.run[0]).toContain('set p accent');
    await themeEditSet('p', 'accent', '#7c3aed', {cwd});
    const before = read('tokens/p.palette.ts');
    const r = await themeEditSet('p', 'vibrancy', '80', {cwd});
    expect(r.data.notes.join(' ')).toContain('vibrancy 80');
    expect(JSON.parse(read('palette.config.json')).vibrancy).toBe(80);
    expect(read('tokens/p.palette.ts')).not.toBe(before);
    const less = await themeEditSet('p', 'vibrancy', 'less', {cwd});
    expect(less.data.setting.value).toBe('70');
    for (const v of ['101', '-1', '4.5', 'loud'])
      expect(
        (await refusal(() => themeEditSet('p', 'vibrancy', v, {cwd}))).code,
        v,
      ).toBe('ERR_THEME_BAD_VALUE');
    expect(
      (
        await refusal(() =>
          themeEditSet('p', 'vibrancy', '60', {cwd, on: 'card'}),
        )
      ).code,
    ).toBe('ERR_THEME_BAD_VALUE');
    expect((await themeEditShow('p', {cwd})).data.vibrancy).toBe(70);
    await themeEditUndo('p', {cwd, thing: 'vibrancy'});
    expect(JSON.parse(read('palette.config.json')).vibrancy).toBeUndefined();
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('new takes any dial as a setting, checked, in one build', async () => {
    const r = await themeEditNew('n', {
      cwd,
      settings: {
        vibrancy: '60',
        accent: '#7c3aed',
        corners: 'round',
        mode: 'light-only',
      },
    });
    expect(r.data.settings).toEqual([
      'corners = round (whole theme)',
      'accent = #7c3aed (whole theme)',
      'vibrancy = 60 (whole theme)',
    ]);
    const data = JSON.parse(
      fs.readFileSync(path.join(cwd, 'themes/n/n.settings.json'), 'utf8'),
    );
    expect(data.mode).toBe('light-only');
    expect(
      JSON.parse(
        fs.readFileSync(path.join(cwd, 'themes/n/palette.config.json'), 'utf8'),
      ).vibrancy,
    ).toBe(60);
    expect(fs.existsSync(path.join(cwd, 'themes/n/n.history.json'))).toBe(
      false,
    );
    for (const [settings, code] of /** @type {const} */ ([
      [{vibrancy: '60'}, 'ERR_THEME_NO_EFFECT'],
      [{corners: 'wobbly'}, 'ERR_THEME_BAD_VALUE'],
      [{base: 'neutral'}, 'ERR_INVALID_ARGUMENT'],
      [{sparkle: 'yes'}, 'ERR_INVALID_ARGUMENT'],
    ])) {
      expect(
        (await refusal(() => themeEditNew('m', {cwd, settings}))).code,
        JSON.stringify(settings),
      ).toBe(code);
      expect(fs.existsSync(path.join(cwd, 'themes/m'))).toBe(false);
    }
    fs.rmSync(path.join(cwd, 'themes/n'), {recursive: true, force: true});
  });

  it('answers color questions with exact commands and plain words', async () => {
    /** @param {string} q */
    const ask = async q => {
      const r = await themeEditHow(q, {cwd});
      const out = JSON.stringify(r.data.results);
      expect(out, q).not.toMatch(/palette|famil/i);
      return {
        text: r.data.results.map(x => x.text).join(' '),
        commands: r.data.results.flatMap(x => x.commands).join('\n'),
      };
    };
    expect((await ask('brand color')).commands).toContain('set <theme> accent');
    const more = await ask('make it more colorful');
    expect(more.commands).toContain('set <theme> vibrancy more');
    expect((await ask('less saturated')).commands).toContain(
      'set <theme> vibrancy less',
    );
    expect((await ask('dark mode colors')).commands).toContain('--mode dark');
    const status = await ask('status colors');
    for (const d of ['danger', 'success', 'warning', 'info'])
      expect(status.commands).toContain(`set <theme> ${d}`);
    expect((await ask('error red')).commands.split('\n')[0]).toContain(
      'set <theme> danger',
    );
    expect((await ask('see all shades')).commands).toContain('preview add');
    const exact = await ask('exact color for one token');
    expect(exact.commands).toContain('set <theme> --color-accent');
    expect(exact.text).toContain('wins over the generated colors');
    const parts = await themeEditHow('white text in the banner', {cwd});
    expect(/** @type {any} */ (parts.data).understood.parts).toContain(
      'banner',
    );
  });
});

describe('contrast picks a stop that passes', () => {
  /** @type {string} */
  let dir;
  const base = {
    light: {
      '--color-background-surface': '#ffffff',
      '--color-background-body': '#f1f1f1',
      '--color-background-card': '#ffffff',
    },
    dark: {
      '--color-background-surface': '#262626',
      '--color-background-body': '#1b1b1b',
      '--color-background-card': '#1b1b1b',
    },
  };
  const tokenDefaults = Object.fromEntries(
    [
      '--color-accent',
      '--color-on-accent',
      '--color-text-accent',
      '--color-icon-accent',
      '--color-accent-muted',
      '--focus-outline-color',
    ].map(t => [t, '']),
  );
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-map-'));
  });
  afterAll(() => fs.rmSync(dir, {recursive: true, force: true}));

  /** @param {string} value */
  const map = value => {
    const data = {
      name: 'x',
      mode: /** @type {const} */ ('both'),
      settings: [
        {thing: 'accent', value, source: /** @type {const} */ ('dial')},
      ],
    };
    return /** @type {import('./_palette.mjs').PaletteMapping} */ (
      paletteMapping(dir, 'x', data, base, tokenDefaults)
    );
  };

  it('puts dark text on a light fill and moves accent text until it reads', () => {
    const pal = map('#facc15');
    const t = pal.tokens;
    expect(t['--color-accent'].light.color).toBe('#facc15');
    expect(t['--color-on-accent'].light.stop).toBe(5);
    expect(
      contrast(
        t['--color-on-accent'].light.color,
        t['--color-accent'].light.color,
      ),
    ).toBeGreaterThanOrEqual(4.5);
    for (const mode of /** @type {const} */ (['light', 'dark'])) {
      const text = t['--color-text-accent'][mode].color;
      for (const bg of Object.values(base[mode]))
        expect(contrast(text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(
          t['--focus-outline-color'][mode].color,
          base[mode]['--color-background-surface'],
        ),
      ).toBeGreaterThanOrEqual(3);
    }
    const moved = pal.contrast.find(
      c => c.token === '--color-text-accent' && c.mode === 'light',
    );
    expect(moved?.pass).toBe(true);
    expect(moved?.stop).toBeLessThan(/** @type {number} */ (moved?.preferred));
  });

  it('every stop a token uses is a stop of the generated palette', () => {
    const pal = map('rgb(124 58 237)');
    const candidate = generateTonalPalette(
      paletteConfig(dir, 'x', {
        name: 'x',
        mode: 'both',
        settings: [{thing: 'accent', value: 'rgb(124 58 237)', source: 'dial'}],
      }),
    );
    for (const v of Object.values(pal.tokens))
      for (const mode of /** @type {const} */ (['light', 'dark']))
        expect(
          /** @type {any} */ (candidate.palette.accent)[mode][v[mode].stop],
        ).toBe(v[mode].color);
    expect(pal.contrast.every(c => c.pass)).toBe(true);
  });
});
