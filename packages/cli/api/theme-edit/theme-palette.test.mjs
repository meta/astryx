// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the color dials of `astryx experimental theme`: each one
 * writes a palette config in the generator's shape (exact anchors, author
 * fields kept), the generator writes the palette and its receipt, the theme
 * imports only the stops it reads, the tokens point at stops of their own
 * mode, contrast picks a stop that passes, an exact token wins, a bad color
 * is refused with a command that works, and undo removes the family.
 * Integration cases run against the Core this repository builds.
 */

import {createHash} from 'node:crypto';
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
import {
  PALETTE_TOKENS,
  paletteConfig,
  paletteMapping,
  paletteNotes,
} from './_palette.mjs';
import {compositeOver, hex as hexOf, parseColor, ratio} from './_color.mjs';
import {
  generateTonalPalette,
  normalizeGenerationRequest,
} from '../theme/palette/generate/generator.mjs';
import {themePaletteGenerate} from '../theme/palette/generate/generate.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';

// The page renders cost seconds and these tests read settings, builds and
// files: a stand-in renders unless a test asks for the real thing.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @type {string} */
let cwd;

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
    // The theme ships only the shades it reads, never the whole palette.
    expect(source).toContain(
      "import {pPaletteRefs as palette} from './tokens/p.palette-refs';",
    );
    expect(source).not.toContain("from './tokens/p.palette'");
    expect(source).toMatch(
      /"--color-text-accent": \[\s*palette\.accent\.light\[\d+\],\s*palette\.accent\.dark\[\d+\]\s*\]/,
    );
    const refs = read('tokens/p.palette-refs.ts');
    const full = generateTonalPalette(JSON.parse(read('palette.config.json')));
    const used = [
      ...source.matchAll(/palette\.accent\.(light|dark)\[(\d+)\]/g),
    ].map(m => `${m[1]}:${m[2]}`);
    for (const m of refs.matchAll(/(light|dark): \{([^}]*)\}/g))
      for (const [, stop, color] of m[2].matchAll(/(\d+): '(#[0-9a-f]{6})'/g)) {
        expect(used).toContain(`${m[1]}:${stop}`);
        expect(
          /** @type {any} */ (full.palette.accent)[m[1]][Number(stop)],
        ).toBe(color);
      }
    expect(refs).toContain('export const pPaletteRefs = {');
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
        tokens['--color-text-accent'],
      );
    for (const [i, mode] of /** @type {const} */ ([
      [1, 'light'],
      [3, 'dark'],
    ])) {
      const [stop, color] = [shades?.[i], shades?.[i + 1]];
      expect(/** @type {any} */ (candidate.palette.accent)[mode][stop]).toBe(
        color,
      );
      expect(show.data.resolved['--color-text-accent'][mode]).toBe(color);
    }
    // White text reads on #7c3aed, but it stands out from the dark page at
    // under 3:1, so the dark fill moves to a lighter shade and says why.
    const accent = /** @type {any} */ (show.data.resolved['--color-accent']);
    expect(accent.light).toBe('#7c3aed');
    expect(accent.dark).not.toBe('#7c3aed');
    expect(show.data.colorNotes.join(' ')).toContain(
      'stands out from the dark page at only',
    );
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
    expect(show.data.colors[0].tokens['--color-accent']).toMatch(
      /^light #ff0000 \(your exact setting wins over the generated \d+/,
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
    expect(r.data.notes.join(' ')).toContain(
      '--color-error uses your exact color (#dc143c',
    );
    const config = JSON.parse(read('palette.config.json'));
    // The neutral seed is an exact anchor in both modes, so no profile is
    // substituted for it.
    expect(config.neutralProfile).toBeUndefined();
    const neutral = config.families.find(
      (/** @type {any} */ f) => f.id === 'neutral',
    );
    expect(neutral).toEqual({
      id: 'neutral',
      name: 'Neutral',
      seed: '#64748b',
      kind: 'neutral',
      anchors: [
        {
          mode: 'light',
          stop: expect.any(Number),
          color: '#64748b',
          policy: 'exact',
        },
        {
          mode: 'dark',
          stop: neutral.anchors[0].stop,
          color: '#64748b',
          policy: 'exact',
        },
      ],
    });
    expect(
      config.families.find((/** @type {any} */ f) => f.id === 'danger'),
    ).toMatchObject({id: 'danger', name: 'Danger', seed: '#dc143c'});
    const source = read('p.settings.ts');
    expect(source).toMatch(
      /"--color-background-surface": \[\s*palette\.neutral/,
    );
    expect(source).toMatch(
      /"--color-border": \[\s*palette\.neutral\.light\[0\] \+ '14'/,
    );
    expect(source).toMatch(/"--color-error": \[\s*palette\.danger/);
    // Text on a fill comes from the neutral color, as the official themes
    // take it.
    expect(source).toMatch(
      /"--color-on-error": \[\s*palette\.neutral\.light\[/,
    );
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
      "astryx experimental theme editor set p --color-accent '#7c3aed' --mode dark",
    );
    const on = await refusal(() =>
      themeEditSet('p', 'info', '#0284c7', {cwd, on: 'button'}),
    );
    // The button reads no --color-info, so the part's own route leads.
    expect(on.run[0]).toBe(
      "astryx experimental theme editor set p background-color '#0284c7' --on button",
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
      'mode = light-only (whole theme)',
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
    // Commands name the theme in the app, never a placeholder.
    const theme = /** @type {any} */ (
      (await themeEditHow('brand color', {cwd})).data
    ).theme;
    // No color given: how says how, and picks none.
    const brand = await ask('brand color');
    expect(brand.commands).toContain('how accent');
    expect(brand.commands).not.toMatch(/ set |<theme>|set my /);
    expect((await ask('brand color #7c3aed')).commands).toContain(
      `set ${theme} accent '#7c3aed'`,
    );
    const more = await ask('make it more colorful');
    expect(more.commands).toContain(`set ${theme} vibrancy more`);
    // A theme whose colors are all grays has no color to take out, and
    // says so instead of suggesting a change that does nothing.
    const less = await ask('less saturated');
    expect(`${less.commands}\n${less.text}`).toMatch(
      new RegExp(`set ${theme} vibrancy less|is a gray`),
    );
    // Explanations name the commands in words and pick no color.
    expect((await ask('dark mode colors')).text).toContain('--mode dark');
    const status = await ask('status colors');
    for (const d of ['danger', 'success', 'warning', 'info'])
      expect(status.text).toContain(d);
    expect(status.commands).not.toMatch(/ set /);
    expect((await ask('error red')).commands.split('\n')[0]).toContain(
      `set ${theme} danger`,
    );
    expect((await ask('see all shades')).commands).toContain('preview add');
    const exact = await ask('exact color for one token');
    expect(exact.commands).toContain(`set ${theme} --color-accent`);
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
    // Without a neutral color, text on a fill is the palette's black or white.
    expect(t['--color-on-accent'].light).toEqual({
      stop: 0,
      color: '#000000',
      family: 'black',
    });
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
      paletteConfig(
        dir,
        'x',
        {
          name: 'x',
          mode: 'both',
          settings: [
            {thing: 'accent', value: 'rgb(124 58 237)', source: 'dial'},
          ],
        },
        base,
      ),
    );
    // Every token reads its own mode's ramp: never a light shade in dark.
    for (const v of Object.values(pal.tokens))
      for (const mode of /** @type {const} */ (['light', 'dark'])) {
        const r = v[mode];
        if (r.family === 'black' || r.family === 'white') continue;
        expect(
          /** @type {any} */ (candidate.palette[r.family ?? 'accent'])[mode][
            r.stop
          ],
        ).toBe(r.color);
      }
    expect(pal.contrast.every(c => c.pass)).toBe(true);
  });
});

describe('every color decision is generator config', () => {
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
    [...PALETTE_TOKENS].map(t => [t, '']),
  );
  /** @type {string[]} */
  const dirs = [];
  afterAll(() => {
    for (const d of dirs) fs.rmSync(d, {recursive: true, force: true});
  });

  /**
   * The config and mapping for settings, in a fresh theme folder that may
   * hold a config (and saved settings) written before.
   * @param {Array<Record<string, string>>} settings
   * @param {{mode?: 'both' | 'light-only' | 'dark-only', config?: any, saved?: any[]}} [opts]
   */
  const plan = (settings, opts = {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-plan-'));
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, 'themes', 'x'), {recursive: true});
    if (opts.config)
      fs.writeFileSync(
        path.join(dir, 'themes/x/palette.config.json'),
        JSON.stringify(opts.config),
      );
    if (opts.saved)
      fs.writeFileSync(
        path.join(dir, 'themes/x/x.settings.json'),
        JSON.stringify({mode: 'both', settings: opts.saved}),
      );
    const data = /** @type {import('./_settings.mjs').ThemeData} */ ({
      name: 'x',
      mode: opts.mode ?? 'both',
      settings: settings.map(s => ({source: 'dial', ...s})),
    });
    const config = paletteConfig(dir, 'x', data, base);
    const pal = /** @type {import('./_palette.mjs').PaletteMapping} */ (
      paletteMapping(dir, 'x', data, base, tokenDefaults)
    );
    return {dir, config, pal, candidate: generateTonalPalette(config)};
  };
  /** @param {any} config @param {string} id */
  const fam = (config, id) =>
    config.families.find((/** @type {any} */ f) => f.id === id);

  it('anchors the exact color in dark when it reads there, and the dark fill is that dark shade', () => {
    const {config, pal, candidate} = plan([
      {thing: 'accent', value: '#60a5fa'},
    ]);
    const anchors = fam(config, 'accent').anchors;
    expect(anchors).toEqual([
      {mode: 'light', stop: anchors[0].stop, color: '#60a5fa', policy: 'exact'},
      {mode: 'dark', stop: anchors[0].stop, color: '#60a5fa', policy: 'exact'},
    ]);
    const fill = pal.tokens['--color-accent'];
    expect(fill.dark).toEqual({
      stop: anchors[0].stop,
      color: '#60a5fa',
      exact: true,
    });
    expect(
      /** @type {any} */ (candidate.palette.accent).dark[fill.dark.stop],
    ).toBe('#60a5fa');
    expect(paletteNotes(pal, 'accent', 'x').join(' ')).toContain(
      'the same exact color in dark',
    );
  });

  it('starts the dark fill at shade 70 when the exact color does not read in dark, and never serves a light shade there', () => {
    const {config, pal, candidate} = plan([
      {thing: 'accent', value: '#1e3a8a'},
    ]);
    expect(
      fam(config, 'accent').anchors.map((/** @type {any} */ a) => a.mode),
    ).toEqual(['light']);
    const fill = pal.tokens['--color-accent'];
    expect(fill.dark.stop).toBe(70);
    expect(fill.dark.exact).toBeUndefined();
    expect(/** @type {any} */ (candidate.palette.accent).dark[70]).toBe(
      fill.dark.color,
    );
    for (const bg of Object.values(base.dark))
      expect(contrast(fill.dark.color, bg)).toBeGreaterThanOrEqual(3);
    expect(
      contrast(pal.tokens['--color-on-accent'].dark.color, fill.dark.color),
    ).toBeGreaterThanOrEqual(4.5);
    expect(paletteNotes(pal, 'accent', 'x').join(' ')).toContain(
      'in dark, --color-accent is shade 70, not your exact color',
    );
  });

  it('never moves the exact light fill: the text on it changes, and a pale fill that does not stand out is reported', () => {
    for (const seed of ['#ffffff', '#facc15', '#7c3aed', '#16a34a']) {
      const {pal} = plan([{thing: 'accent', value: seed}]);
      expect(pal.tokens['--color-accent'].light.color, seed).toBe(seed);
    }
    const {pal} = plan([{thing: 'warning', value: '#fef08a'}]);
    expect(pal.tokens['--color-on-warning'].light.family).toBe('black');
    expect(paletteNotes(pal, 'warning', 'x').join(' ')).toMatch(
      /in light, your exact warning stands out from the page at only [\d.]+:1, and a fill needs 3:1/,
    );
  });

  it('gives the neutral seed an exact anchor at its shade in both modes, never at white or black', () => {
    const {config, candidate} = plan([{thing: 'neutral', value: '#f5f0e8'}]);
    const n = fam(config, 'neutral');
    expect(n.anchors).toHaveLength(2);
    for (const a of n.anchors)
      expect(
        /** @type {any} */ (candidate.palette.neutral)[a.mode][a.stop],
      ).toBe('#f5f0e8');
    expect(config.neutralProfile).toBeUndefined();
    for (const end of ['#ffffff', '#000000'])
      expect(
        fam(plan([{thing: 'neutral', value: end}]).config, 'neutral').anchors,
        end,
      ).toBeUndefined();
  });

  it('takes text on a fill from the neutral color: white first in light, near-black first in dark, near-black on warning', () => {
    const {pal} = plan([
      {thing: 'neutral', value: '#78716c'},
      {thing: 'accent', value: '#1d4ed8'},
      {thing: 'warning', value: '#f59e0b'},
    ]);
    const on = pal.tokens['--color-on-accent'];
    expect(on.light).toMatchObject({family: 'neutral', stop: 100});
    expect(on.dark).toMatchObject({family: 'neutral', stop: 5});
    expect(pal.tokens['--color-on-warning'].light).toMatchObject({
      family: 'neutral',
      stop: 5,
    });
  });

  it('maps tints as the official themes do: accent dark 30, status dark 75 see-through, never the fill itself', () => {
    const {pal} = plan([
      {thing: 'accent', value: '#7c3aed'},
      {thing: 'danger', value: '#dc2626'},
    ]);
    expect(pal.tokens['--color-accent-muted'].dark.stop).toBe(30);
    expect(pal.tokens['--color-error-muted'].dark).toMatchObject({
      stop: 75,
      alpha: '3d',
    });
    // Text on the see-through tint is measured over the surface.
    const check = pal.contrast.find(
      c => c.token === '--color-on-error-muted' && c.mode === 'dark',
    );
    expect(check?.against).toContain('over --color-background-surface');
    const light = plan([{thing: 'accent', value: '#ffcc00'}], {
      mode: 'light-only',
    });
    const t = light.pal.tokens;
    expect(t['--color-accent'].light.stop).toBe(85);
    expect(t['--color-accent-muted'].light.stop).not.toBe(85);
    expect(t['--color-accent-muted'].light.color).not.toBe(
      t['--color-accent'].light.color,
    );
  });

  it('writes both modes for a one-mode theme too and keeps the author fields the dials do not own', () => {
    // A one-mode theme keeps both halves: its mode is the one the app's
    // <Theme> is given, and a region Core draws in the other mode (a toast,
    // a lightbox) reads the other half.
    const light = plan([{thing: 'accent', value: '#60a5fa'}], {
      mode: 'light-only',
    });
    expect(light.config.modeStrategy).toBe('light-and-dark');
    expect(
      Object.keys(/** @type {any} */ (light.candidate.palette.accent)),
    ).toContain('dark');
    expect(light.pal.tokens['--color-accent'].dark.color).toBeTruthy();
    const authored = {
      modeStrategy: 'light-only',
      neutralProfile: 'warm-v1',
      vibrancy: 40,
      families: [
        {
          id: 'accent',
          name: 'Brand',
          seed: '#2563eb',
          kind: 'chromatic',
          anchors: [
            {mode: 'light', stop: 50, color: '#2563eb', policy: 'exact'},
            {
              mode: 'light',
              stop: 90,
              color: '#dbeafe',
              policy: 'bounded',
              maxDeltaE: 4,
            },
          ],
        },
        {id: 'brand-pink', seed: '#db2777'},
      ],
    };
    const {config, pal} = plan([{thing: 'accent', value: '#0d9488'}], {
      config: authored,
    });
    expect(config.modeStrategy).toBe('light-and-dark');
    expect(config.neutralProfile).toBe('warm-v1');
    expect(config.vibrancy).toBe(40);
    const accent = fam(config, 'accent');
    expect(accent).toMatchObject({
      name: 'Brand',
      seed: '#0d9488',
      kind: 'chromatic',
    });
    expect(accent.anchors).toContainEqual(authored.families[0].anchors[1]);
    expect(
      accent.anchors.some((/** @type {any} */ a) => a.color === '#2563eb'),
    ).toBe(false);
    expect(fam(config, 'brand-pink')).toEqual({
      id: 'brand-pink',
      seed: '#db2777',
    });
    expect(pal.notes.join(' ')).toContain(
      'modeStrategy light-only is now light-and-dark',
    );
    expect(pal.notes.join(' ')).toContain(
      'keeps the vibrancy 40 written there by hand',
    );
    // A vibrancy the dial wrote goes with the dial.
    const gone = plan([{thing: 'accent', value: '#0d9488'}], {
      config: {...authored, vibrancy: 70},
      saved: [
        {thing: 'accent', value: '#0d9488', source: 'dial'},
        {thing: 'vibrancy', value: '70', source: 'dial'},
      ],
    });
    expect(gone.config.vibrancy).toBeUndefined();
  });

  it('maps a compact stop layout by its own stops and refuses one too small to map', () => {
    const {pal, candidate} = plan([{thing: 'accent', value: '#7c3aed'}], {
      config: {
        stops: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        families: [],
      },
    });
    for (const v of Object.values(pal.tokens))
      for (const m of /** @type {const} */ (['light', 'dark'])) {
        expect(candidate.stops).toContain(v[m].stop);
        expect(v[m].color).toMatch(/^#[0-9a-f]{6}/);
      }
    // 85 is not in this layout: the light tint takes the lighter of 80
    // and 90, as the tint walks lighter first in light.
    expect(pal.tokens['--color-accent-muted'].light.stop).toBe(90);
    // A stop with many digits is shown rounded.
    const thirds = plan([{thing: 'accent', value: '#1e3a8a'}], {
      config: {
        stops: [0, 100 / 6, 100 / 3, 50, 200 / 3, 250 / 3, 100].map(x =>
          Number(x.toFixed(12)),
        ),
        families: [],
      },
    });
    expect(paletteNotes(thirds.pal, 'accent', 'x').join(' ')).not.toMatch(
      /\d\.\d{3,}/,
    );
    expect(() =>
      plan([{thing: 'accent', value: '#16a34a'}], {
        config: {stops: [0, 50, 100], families: []},
      }),
    ).toThrow(/stops \(0, 50, 100\) leave 1 shades between black and white/);
  });

  it('lets an exact main token win: text on it is picked for it, the ring keeps following it, and the notes say so', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-exact-'));
    dirs.push(dir);
    const data = /** @type {import('./_settings.mjs').ThemeData} */ ({
      name: 'x',
      mode: 'both',
      settings: [
        {thing: '--color-accent', value: '#ff00aa', source: 'token'},
        {thing: 'accent', value: '#2563eb', source: 'dial'},
      ],
    });
    const pal = /** @type {import('./_palette.mjs').PaletteMapping} */ (
      paletteMapping(dir, 'x', data, base, tokenDefaults)
    );
    expect(pal.exact['--color-accent']).toEqual({
      light: '#ff00aa',
      dark: '#ff00aa',
    });
    for (const m of /** @type {const} */ (['light', 'dark']))
      expect(
        contrast(pal.tokens['--color-on-accent'][m].color, '#ff00aa'),
      ).toBeGreaterThanOrEqual(4.5);
    expect(pal.tokens['--focus-outline-color']).toBeUndefined();
    const notes = paletteNotes(pal, 'accent', 'x').join(' ');
    expect(notes).toContain(
      '--color-accent uses your exact setting (#ff00aa in light and #ff00aa in dark)',
    );
    expect(notes).not.toContain('shade 50 (');
  });

  it('finds the passing shade on either side, keeps the tint at its official stop, and lifts secondary text on it', () => {
    const dark = {
      '--color-background-surface': '#101314',
      '--color-background-body': '#101314',
      '--color-background-card': '#191d20',
    };
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-palette-gothic-'),
    );
    dirs.push(dir);
    const gothic = {
      light: {...dark, '--color-text-secondary': '#a3a3a3'},
      dark: {...dark, '--color-text-secondary': '#a3a3a3'},
    };
    const data = /** @type {import('./_settings.mjs').ThemeData} */ ({
      name: 'x',
      mode: 'both',
      settings: [{thing: 'accent', value: '#1877f2', source: 'dial'}],
    });
    const pal = /** @type {import('./_palette.mjs').PaletteMapping} */ (
      paletteMapping(dir, 'x', data, gothic, tokenDefaults)
    );
    // On a dark light-mode page the light side takes the dark-page shades
    // (the tint at 30, not 85), so accent text reads on the page and the
    // tint; it is found on either side of its start.
    const ramp = /** @type {any} */ (
      generateTonalPalette(paletteConfig(dir, 'x', data, gothic)).palette.accent
    ).light;
    const onAll = (/** @type {string} */ c) =>
      Math.min(
        ...[
          ...Object.values(dark),
          pal.tokens['--color-accent-muted'].light.color,
        ].map(bg => contrast(c, bg)),
      );
    const best = Math.max(...Object.values(ramp).map(c => onAll(String(c))));
    const chosen = onAll(pal.tokens['--color-text-accent'].light.color);
    expect(pal.tokens['--color-accent-muted'].light.stop).toBe(30);
    expect(best).toBeGreaterThanOrEqual(4.5);
    expect(chosen).toBeGreaterThanOrEqual(4.5);
    expect(paletteNotes(pal, 'accent', 'x').join(' ')).not.toContain(
      'the most contrasting one',
    );
    // The tint stays at the official stop for every accent.
    const withText = {
      light: {...base.light, '--color-text-secondary': '#474747'},
      dark: {...base.dark, '--color-text-secondary': '#9e9e9e'},
    };
    /** @param {Array<Record<string, string>>} settings */
    const map = settings => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-cite-'));
      dirs.push(d);
      return /** @type {import('./_palette.mjs').PaletteMapping} */ (
        paletteMapping(
          d,
          'x',
          {...data, settings: settings.map(x => ({source: 'dial', ...x}))},
          withText,
          tokenDefaults,
        )
      );
    };
    for (const seed of ['#7c3aed', '#2563eb', '#00704a', '#1db954']) {
      const t = map([{thing: 'accent', value: seed}]).tokens;
      expect(t['--color-accent-muted'].dark.stop, seed).toBe(30);
      expect(t['--color-accent-muted'].light.stop, seed).toBe(85);
    }
    // A fill at 85 moves the light tint off it, to the lighter neighbor.
    const lime = map([{thing: 'accent', value: '#ccff00'}]).tokens;
    expect(lime['--color-accent'].light.stop).toBe(85);
    expect(lime['--color-accent-muted'].light.stop).toBe(90);
    // Without a neutral color the lift comes from grays grown from the
    // base theme's own secondary text, so every accent gets one.
    for (const seed of ['#00704a', '#7c3aed']) {
      const pal = map([{thing: 'accent', value: seed}]);
      const tint = /** @type {any} */ (pal.lift)['--color-accent-muted'];
      for (const mode of /** @type {const} */ (['light', 'dark'])) {
        expect(tint[mode].family, seed).toBe('literal');
        expect(
          contrast(
            tint[mode].color,
            pal.tokens['--color-accent-muted'][mode].color,
          ),
          `${seed} ${mode}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    // With one, secondary text on the tinted parts is lifted until it reads
    // at 4.5:1 on the tint and under a hover, as the official theme lifts
    // it: Neutral's own gray lands on its dark 80.
    for (const seed of ['#2563eb', '#00704a', '#1db954', '#aec6cf']) {
      const pal = map([
        {thing: 'neutral', value: '#808080'},
        {thing: 'accent', value: seed},
      ]);
      const lift = /** @type {any} */ (pal.lift)['--color-accent-muted'];
      for (const mode of /** @type {const} */ (['light', 'dark']))
        expect(
          contrast(
            lift[mode].color,
            pal.tokens['--color-accent-muted'][mode].color,
          ),
          `${seed} ${mode}`,
        ).toBeGreaterThanOrEqual(4.5);
      expect(lift.light.stop, seed).toBe(
        pal.tokens['--color-text-secondary'].light.stop,
      );
    }
    const gray = /** @type {any} */ (
      map([
        {thing: 'neutral', value: '#808080'},
        {thing: 'accent', value: '#808080'},
      ]).lift
    );
    expect(gray['--color-accent-muted'].dark.stop).toBe(80);
    // Segmented-control labels sit on the neutral track, not the tint:
    // their lift is picked against the track (here the base has no track
    // color, so only the tint is lifted).
    expect(Object.keys(gray)).toEqual(['--color-accent-muted']);
    const track = {
      light: {...withText.light, '--color-neutral': '#0000000f'},
      dark: {...withText.dark, '--color-neutral': '#ffffff1a'},
    };
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-track-'));
    dirs.push(d2);
    const onTrack = /** @type {any} */ (
      paletteMapping(
        d2,
        'x',
        {
          ...data,
          settings: [
            {thing: 'neutral', value: '#64748b', source: 'dial'},
            {thing: 'accent', value: '#2563eb', source: 'dial'},
          ],
        },
        track,
        tokenDefaults,
      )
    );
    for (const mode of /** @type {const} */ (['light', 'dark'])) {
      const seen = hexOf(
        compositeOver(
          /** @type {[number, number, number]} */ (
            parseColor(track[mode]['--color-neutral'].slice(0, 7))
          ),
          mode === 'light' ? 0x0f / 255 : 0x1a / 255,
          /** @type {[number, number, number]} */ (
            parseColor(onTrack.tokens['--color-background-surface'][mode].color)
          ),
        ),
      );
      expect(
        contrast(onTrack.lift['--color-neutral'][mode].color, seen),
        mode,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('refuses a layout without black and white, with non-numbers, or with a wide gap', () => {
    for (const [stops, why] of /** @type {const} */ ([
      [[10, 20, 30, 40, 50, 60, 70], 'need 0 (black) and 100 (white)'],
      [['0', '10', '20', '30', '40', '50', '100'], 'which are not numbers'],
      [[0, 1, 2, 3, 4, 5, 100], 'leave a gap of 95'],
    ]))
      expect(
        () =>
          plan([{thing: 'accent', value: '#16a34a'}], {
            config: {stops, families: []},
          }),
        why,
      ).toThrow(why);
  });

  it('names what a config holds that changes nothing, and the colors it could not keep exact', () => {
    const {pal} = plan(
      [
        {thing: 'neutral', value: '#78716c'},
        {thing: 'accent', value: 'oklch(0.7 0.5 30)'},
      ],
      {
        config: {
          notes: 'brand colors from the style guide',
          neutralProfile: 'warm-v1',
          families: [],
        },
      },
    );
    const notes = pal.notes.join(' ');
    expect(notes).toContain('does not read notes');
    expect(notes).toContain('neutralProfile warm-v1 changes nothing here');
    expect(paletteNotes(pal, 'accent', 'x').join(' ')).toContain(
      'is outside the colors every screen shows (sRGB)',
    );
  });

  it('checks an exact main token against the light page too', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-palette-pale-'));
    dirs.push(dir);
    const pal = /** @type {import('./_palette.mjs').PaletteMapping} */ (
      paletteMapping(
        dir,
        'x',
        {
          name: 'x',
          mode: 'both',
          settings: [
            {thing: 'accent', value: '#2563eb', source: 'dial'},
            {thing: '--color-accent', value: '#ffff00', source: 'token'},
          ],
        },
        base,
        tokenDefaults,
      )
    );
    const notes = paletteNotes(pal, 'accent', 'x').join(' ');
    expect(notes).toContain(
      'your exact --color-accent (#ffff00) stands out from the page at only',
    );
    expect(notes).not.toContain('set --color-accent exactly');
  });

  it('never makes a see-through tint the fill itself, and keeps author anchors the editor did not write', () => {
    const amber = plan([{thing: 'warning', value: '#f59e0b'}]);
    const t = amber.pal.tokens;
    expect(t['--color-warning'].dark.stop).toBe(75);
    expect(t['--color-warning-muted'].dark.stop).not.toBe(75);
    // The seed's color at another stop is the author's own anchor.
    const own = {mode: 'light', stop: 55, color: '#2563eb', policy: 'exact'};
    const kept = plan([{thing: 'accent', value: '#2563eb'}], {
      config: {
        families: [
          {
            id: 'accent',
            seed: '#2563eb',
            anchors: [
              {mode: 'light', stop: 50, color: '#2563eb', policy: 'exact'},
              own,
            ],
          },
        ],
      },
      saved: [{thing: 'accent', value: '#2563eb', source: 'dial'}],
    });
    expect(fam(kept.config, 'accent').anchors).toContainEqual(own);
    // An anchor kept across a new seed is named.
    const moved = plan([{thing: 'accent', value: '#16a34a'}], {
      config: {
        families: [
          {
            id: 'accent',
            seed: '#2563eb',
            anchors: [
              {mode: 'light', stop: 50, color: '#2563eb', policy: 'exact'},
              {
                mode: 'light',
                stop: 90,
                color: '#dde8ff',
                policy: 'bounded',
                maxDeltaE: 4,
              },
            ],
          },
        ],
      },
      saved: [{thing: 'accent', value: '#2563eb', source: 'dial'}],
    });
    expect(moved.pal.notes.join(' ')).toContain(
      'keeps your own accent anchors (light 90 #dde8ff)',
    );
    // A kind the editor wrote for a gray is dropped without blaming you.
    const gray = plan([{thing: 'accent', value: '#2563eb'}], {
      config: {families: [{id: 'accent', seed: '#808080', kind: 'neutral'}]},
      saved: [{thing: 'accent', value: '#808080', source: 'dial'}],
    });
    expect(gray.pal.notes.join(' ')).not.toContain('kind');
  });
});

describe('color settings, refused well', () => {
  it('reads valid CSS as the browser does and refuses the rest with a command that works', async () => {
    const before = read('p.settings.json');
    /** @param {string} v */
    const why = v => refusal(() => themeEditSet('p', 'accent', v, {cwd}));
    expect((await why('7c3aed')).run[0]).toBe(
      "astryx experimental theme editor set p accent '#7c3aed'",
    );
    expect((await why('"#16a34a"')).run[0]).toBe(
      "astryx experimental theme editor set p accent '#16a34a'",
    );
    expect((await why('#16a34a;')).run[0]).toBe(
      "astryx experimental theme editor set p accent '#16a34a'",
    );
    expect((await why('purpel')).run[0]).toBe(
      'astryx experimental theme editor set p accent purple',
    );
    expect((await why('Canvas')).message).toContain('is a system color');
    expect((await why('rgb(1,2,3,4,5)')).message).toContain(
      'is not a valid CSS color',
    );
    expect((await why('rgb(255,0 0)')).message).toContain(
      'is not a valid CSS color',
    );
    const clear = await why('rgba(255, 0, 0, 0.5)');
    expect(clear.message).toContain('see-through');
    expect(clear.run[0]).toBe(
      "astryx experimental theme editor set p accent '#ff0000'",
    );
    expect((await why('#0000')).message).toContain('see-through');
    expect(read('p.settings.json')).toBe(before);
  });

  it('suggests the dial for another name, a part route for a part, and the nearest vibrancy', async () => {
    // The value carries over only to a dial that takes it.
    for (const [thing, rest] of [
      ['Accent', "accent '#64748b'"],
      ['gray', "neutral '#64748b'"],
      ['saturation', 'vibrancy 60'],
      ['destructive', "danger '#64748b'"],
      ['brand', "accent '#64748b'"],
    ]) {
      const r = await refusal(() => themeEditSet('p', thing, '#64748b', {cwd}));
      expect(r.code, thing).toBe('ERR_THEME_UNKNOWN_THING');
      // p sets no color, so `vibrancy 60` would be refused: it is left
      // out, and the dial is named.
      expect(r.run[0], thing).toBe(
        rest === 'vibrancy 60'
          ? 'vibrancy'
          : `astryx experimental theme editor set p ${rest}`,
      );
    }
    expect(
      (await refusal(() => themeEditSet('p', 'accent', '#ff000', {cwd})))
        .run[0],
    ).toBe("astryx experimental theme editor set p accent '#ff0000'");
    const inputs = await refusal(() =>
      themeEditSet('p', 'info', 'blue', {cwd, on: 'inputs'}),
    );
    expect(inputs.run.join(' ')).not.toContain('--color-info');
    await themeEditSet('p', 'accent', '#7c3aed', {cwd});
    const high = await refusal(() =>
      themeEditSet('p', 'vibrancy', '101', {cwd}),
    );
    expect(high.run[0]).toBe(
      'astryx experimental theme editor set p vibrancy 100',
    );
    await themeEditSet('p', 'vibrancy', '100', {cwd});
    const top = await refusal(() =>
      themeEditSet('p', 'vibrancy', 'more', {cwd}),
    );
    expect(top.code).toBe('ERR_THEME_NO_EFFECT');
    expect(top.message).toContain('already 100');
    // Undoing the last color takes vibrancy along, and says so.
    const r = await themeEditUndo('p', {cwd, thing: 'accent'});
    expect(r.data.notes.join(' ')).toContain('vibrancy 100 is removed too');
    const show = await themeEditShow('p', {cwd});
    expect(show.data.settings.some(s => s.thing === 'vibrancy')).toBe(false);
  });

  it('names the value a color replaced, and saves the value trimmed', async () => {
    await themeEditSet('p', 'accent', '#dc2626', {cwd});
    const r = await themeEditSet('p', 'accent', ' #16a34a\n', {cwd});
    expect(r.data.was).toBe('#dc2626');
    expect(r.data.setting.value).toBe('#16a34a');
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('never overwrites a hand-edited palette, lets other changes through, and regenerates one from another generator version', async () => {
    await themeEditSet('p', 'accent', '#7c3aed', {cwd});
    const original = read('tokens/p.palette.ts');
    // Formatting is not an edit: line endings, a trailing newline, quotes.
    fs.writeFileSync(
      file('tokens/p.palette.ts'),
      `${original.replace(/\n/g, '\r\n').replace(/"/g, "'")}\n`,
    );
    await themeEditSet('p', 'accent', '#6d28d9', {cwd});
    expect(read('tokens/p.palette.ts')).toContain('#6d28d9');
    const edited = read('tokens/p.palette.ts').replace('#6d28d9', '#6d28da');
    fs.writeFileSync(file('tokens/p.palette.ts'), edited);
    // A change that leaves the colors alone goes ahead, and show names the edit.
    await themeEditSet('p', 'corners', 'round', {cwd});
    expect(
      (await themeEditShow('p', {cwd})).data.colorNotes.join(' '),
    ).toContain('p.palette.ts was edited by hand');
    const r = await refusal(() =>
      themeEditSet('p', 'accent', '#2563eb', {cwd}),
    );
    expect(r.code).toBe('ERR_THEME_INVALID');
    expect(r.message).toContain('was edited by hand');
    // The way out is told in words, with an editor command to run next:
    // no command that moves or deletes files.
    expect(r.run).toEqual(['astryx experimental theme editor show p']);
    expect(r.message).toContain('move the file out of tokens/');
    expect(read('tokens/p.palette.ts')).toBe(edited);
    // A missing receipt is no way around it.
    fs.rmSync(file('tokens/p.palette.receipt.json'));
    expect(
      (await refusal(() => themeEditSet('p', 'accent', '#2563eb', {cwd}))).code,
    ).toBe('ERR_THEME_INVALID');
    // Moving the file out keeps the edit, in one step.
    fs.renameSync(file('tokens/p.palette.ts'), file('p.my-colors.ts'));
    await themeEditSet('p', 'accent', '#2563eb', {cwd});
    expect(read('tokens/p.palette.ts')).toContain('#2563eb');
    expect(read('p.my-colors.ts')).toBe(edited);
    fs.rmSync(file('p.my-colors.ts'));
    const receipt = JSON.parse(read('tokens/p.palette.receipt.json'));
    fs.writeFileSync(
      file('tokens/p.palette.receipt.json'),
      JSON.stringify({...receipt, generatorVersion: 'an-older-generator'}),
    );
    await themeEditSet('p', 'corners', 'small', {cwd});
    expect(
      JSON.parse(read('tokens/p.palette.receipt.json')).generatorVersion,
    ).toBe(receipt.generatorVersion);
    await themeEditUndo('p', {cwd, thing: 'corners'});
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('builds any numeric stop layout and never ships an unresolved color', async () => {
    await themeEditSet('p', 'accent', '#2563eb', {cwd});
    const config = JSON.parse(read('palette.config.json'));
    fs.writeFileSync(
      file('palette.config.json'),
      JSON.stringify({
        ...config,
        stops: [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100],
      }),
    );
    await themeEditSet('p', 'accent', '#16a34a', {cwd});
    for (const out of ['p.css', 'p.js', 'p.settings.ts'])
      expect(read(out), out).not.toContain('@@palette:');
    expect(read('p.settings.ts')).toMatch(/palette\.accent\.light\[\d+\.5\]/);
    expect(read('tokens/p.palette-refs.ts')).toMatch(/\d+\.5: '#[0-9a-f]{6}'/);
    const back = JSON.parse(read('palette.config.json'));
    delete back.stops;
    fs.writeFileSync(file('palette.config.json'), JSON.stringify(back));
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('fixes a vibrancy edited by hand with the commands it names, keeping the colors', async () => {
    await themeEditSet('p', 'accent', '#2563eb', {cwd});
    const settings = JSON.parse(read('p.settings.json'));
    fs.writeFileSync(
      file('p.settings.json'),
      JSON.stringify({
        ...settings,
        settings: [
          ...settings.settings,
          {thing: 'vibrancy', value: 'high', source: 'dial'},
        ],
      }),
    );
    const refused = await refusal(() =>
      themeEditSet('p', 'corners', 'small', {cwd}),
    );
    expect(refused.run[0]).toBe(
      'astryx experimental theme editor undo p vibrancy',
    );
    await themeEditUndo('p', {cwd, thing: 'vibrancy'});
    expect(JSON.parse(read('p.settings.json')).settings).toEqual([
      {thing: 'accent', value: '#2563eb', source: 'dial'},
    ]);
    fs.writeFileSync(
      file('p.settings.json'),
      JSON.stringify({
        ...settings,
        settings: [
          ...settings.settings,
          {thing: 'vibrancy', value: '150', source: 'dial'},
        ],
      }),
    );
    await themeEditSet('p', 'vibrancy', '60', {cwd});
    expect(JSON.parse(read('palette.config.json')).vibrancy).toBe(60);
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it("replays an official theme's per-mode focus color, and the theme stays usable", async () => {
    // The official Neutral theme's focus color, read from its source (no
    // built package needed): Core's --focus-outline-color is
    // var(--color-accent), which neutralTheme.ts maps to a neutral stop per
    // mode; the stops' colors are in neutralPaletteRefs.generated.ts.
    const src = path.resolve(
      import.meta.dirname,
      '../../../themes/neutral/src',
    );
    const theme = fs.readFileSync(path.join(src, 'neutralTheme.ts'), 'utf8');
    const refs = fs.readFileSync(
      path.join(src, 'neutralPaletteRefs.generated.ts'),
      'utf8',
    );
    const stops =
      /'--color-accent':\s*\[\s*neutral\.light\[(\d+)\],\s*neutral\.dark\[(\d+)\]/.exec(
        theme,
      );
    const ramp = refs.slice(refs.search(/\bneutral:\s*\{/));
    /** @param {'light' | 'dark'} mode @param {string | undefined} stop */
    const colorAt = (mode, stop) =>
      String(
        new RegExp(`\\b${stop}:\\s*'(#[0-9a-f]{6})'`).exec(
          /** @type {string} */ (
            new RegExp(`\\b${mode}:\\s*\\{([^}]*)\\}`).exec(ramp)?.[1]
          ),
        )?.[1],
      );
    /** @type {Record<'light' | 'dark', string>} */
    const focus = {
      light: colorAt('light', stops?.[1]),
      dark: colorAt('dark', stops?.[2]),
    };
    for (const mode of /** @type {const} */ (['light', 'dark']))
      expect(focus[mode], mode).toMatch(/^#[0-9a-f]{6}$/);
    expect(focus.light).not.toBe(focus.dark);
    for (const mode of /** @type {const} */ (['light', 'dark']))
      await themeEditSet('p', '--focus-outline-color', focus[mode], {
        cwd,
        mode,
      });
    // A later command on the theme still works: the load check reads the
    // token's type, and a focus color is a color.
    await themeEditSet('p', 'corners', 'small', {cwd});
    for (const thing of ['corners', '--focus-outline-color'])
      for (const mode of thing === 'corners' ? [undefined] : ['light', 'dark'])
        await themeEditUndo('p', {cwd, thing, ...(mode ? {mode} : {})});
  });

  it('undo never deletes a color file edited by hand, and names it', async () => {
    await themeEditSet('p', 'accent', '#2563eb', {cwd});
    const edited = read('tokens/p.palette.ts').replace(
      /"45": "#[0-9a-f]{6}"/,
      '"45": "#ff0000"',
    );
    fs.writeFileSync(file('tokens/p.palette.ts'), edited);
    const refused = await refusal(() =>
      themeEditSet('p', 'accent', '#16a34a', {cwd}),
    );
    // The way out is told in words, with an editor command to run next.
    expect(refused.message).toContain('move the file out of tokens/');
    expect(refused.run).toEqual(['astryx experimental theme editor show p']);
    const r = await themeEditUndo('p', {cwd, thing: 'accent'});
    expect(read('tokens/p.palette.ts')).toBe(edited);
    expect(r.data.notes.join(' ')).toContain(
      'tokens/p.palette.ts was edited by hand, so it stays',
    );
    expect(fs.existsSync(file('palette.config.json'))).toBe(false);
    // The selected-stops file is generated, so it always goes, even when
    // the palette was edited at a shade the theme ships.
    expect(fs.existsSync(file('tokens/p.palette-refs.ts'))).toBe(false);
    expect(r.data.notes.join(' ')).not.toContain('palette-refs');
    // The next color change asks again, until the file is moved out.
    expect(
      (await refusal(() => themeEditSet('p', 'accent', '#16a34a', {cwd}))).code,
    ).toBe('ERR_THEME_INVALID');
    fs.renameSync(file('tokens/p.palette.ts'), file('p.my-colors.ts'));
    // A plain step back over the first color keeps an edited file too.
    await themeEditSet('p', 'accent', '#16a34a', {cwd});
    fs.writeFileSync(
      file('tokens/p.palette.ts'),
      read('tokens/p.palette.ts').replace(
        /"50": "#[0-9a-f]{6}"/,
        '"50": "#00ff00"',
      ),
    );
    const step = await themeEditUndo('p', {cwd});
    expect(/** @type {any} */ (step.data).undone.join(' ')).toContain(
      'was edited by hand, so it stays',
    );
    expect(read('tokens/p.palette.ts')).toContain('#00ff00');
    fs.rmSync(file('tokens'), {recursive: true, force: true});
    fs.rmSync(file('p.my-colors.ts'), {force: true});
  });

  it('never counts formatting, a BOM, or a config edit without a receipt as a hand edit', async () => {
    await themeEditSet('p', 'accent', '#2563eb', {cwd});
    // As `prettier --no-semi` and a Windows editor write it.
    fs.writeFileSync(
      file('tokens/p.palette.ts'),
      `\uFEFF${read('tokens/p.palette.ts').replace(/;$/gm, '')}`,
    );
    await themeEditSet('p', 'accent', '#16a34a', {cwd});
    expect(read('tokens/p.palette.ts')).toContain('#16a34a');
    // No receipt, and the documented hand edit to the config.
    fs.rmSync(file('tokens/p.palette.receipt.json'));
    const config = JSON.parse(read('palette.config.json'));
    fs.writeFileSync(
      file('palette.config.json'),
      JSON.stringify({...config, vibrancy: 70}),
    );
    await themeEditSet('p', 'accent', '#0d9488', {cwd});
    expect(read('tokens/p.palette.ts')).toContain('#0d9488');
    const back = JSON.parse(read('palette.config.json'));
    delete back.vibrancy;
    fs.writeFileSync(file('palette.config.json'), JSON.stringify(back));
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('reports what an exact color changes around it, the page check included', async () => {
    await themeEditSet('p', 'accent', '#2563eb', {cwd});
    const r = await themeEditSet('p', '--color-accent', '#ffff00', {cwd});
    const notes = r.data.notes.join(' ');
    expect(notes).toContain('--color-accent uses your exact setting');
    expect(notes).toContain(
      'your exact --color-accent (#ffff00) stands out from the page at only',
    );
    await themeEditUndo('p', {cwd, thing: '--color-accent'});
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });
});

describe('lifted text and see-through colors', () => {
  it('lifts every accent, lets an exact secondary text win per mode and on a part, and measures see-through colors as they show', async () => {
    await themeEditSet('p', 'accent', '#7c3aed', {cwd});
    // Without a neutral color the five parts still get a lift, written as
    // colors into the blocks the base lifts them in.
    expect(read('p.settings.ts')).toMatch(
      /"variant:number": \{\s*"--color-text-secondary": "light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)"/,
    );
    await themeEditSet('p', 'neutral', '#64748b', {cwd});
    // An exact secondary text for light only replaces the lift in light,
    // and keeps it in dark.
    await themeEditSet('p', '--color-text-secondary', '#5a5a5a', {
      cwd,
      mode: 'light',
    });
    expect(read('p.settings.ts')).toMatch(
      /"variant:number": \{\s*"--color-text-secondary": `light-dark\(#5a5a5a, \$\{palette\.neutral\.dark\[\d+\]\}\)`/,
    );
    // On the part, it covers numbered citations too.
    await themeEditSet('p', '--color-text-secondary', '#123456', {
      cwd,
      on: 'citation',
    });
    expect(read('p.settings.ts')).toMatch(
      /"variant:number": \{\s*"--color-text-secondary": "light-dark\(#123456, #123456\)"/,
    );
    // A see-through hover is measured as it shows.
    const r = await themeEditSet('p', '--color-overlay-hover', '#ffffff33', {
      cwd,
    });
    expect(r.data.notes.join(' ')).toMatch(/under a hover/);
    // A see-through exact fill is described as it is, and measured as it
    // shows over the surface.
    const fill = await themeEditSet('p', '--color-accent', '#2563eb80', {cwd});
    expect(fill.data.notes.join(' ')).toContain(
      'your exact setting (#2563eb80',
    );
    expect(fill.data.notes.join(' ')).toContain('as it shows: #');
    for (const [thing, opts] of /** @type {const} */ ([
      ['--color-accent', {}],
      ['--color-overlay-hover', {}],
      ['--color-text-secondary', {on: 'citation'}],
      ['--color-text-secondary', {mode: 'light'}],
      ['neutral', {}],
      ['accent', {}],
    ]))
      await themeEditUndo('p', {cwd, thing, ...opts});
  });

  it('quotes a family that is not a plain CSS name, and reads a font package as its preset', async () => {
    await themeEditSet('p', 'font', '3Dumb', {cwd});
    expect(read('p.settings.ts')).toContain('"family": "\\"3Dumb\\""');
    const pkg = await themeEditSet('p', 'font', '@fontsource/inter', {cwd});
    expect(pkg.data.setting.value).toBe('inter');
    await themeEditUndo('p', {cwd, thing: 'font'});
  });
});

describe('font words', () => {
  it('refuses CSS keywords and long names, and knows system families', async () => {
    for (const v of ['inherit', 'initial', 'Inter, unset']) {
      const r = await refusal(() => themeEditSet('p', 'font', v, {cwd}));
      expect(r.code, v).toBe('ERR_THEME_BAD_VALUE');
      expect(r.message, v).toContain('is a CSS keyword, not a font');
    }
    expect(
      (await refusal(() => themeEditSet('p', 'font', 'x'.repeat(300), {cwd})))
        .code,
    ).toBe('ERR_THEME_BAD_VALUE');
    for (const v of ['system-ui', 'Arial', 'Tahoma', 'serif, sans-serif']) {
      const r = await themeEditSet('p', 'font', v, {cwd});
      expect(r.data.notes.join(' '), v).not.toContain('is not a system font');
    }
    const source = read('p.settings.ts');
    expect(source).not.toMatch(/system-ui, system-ui/);
    await themeEditUndo('p', {cwd, thing: 'font'});
  });
});

describe('fonts some systems ship, and part properties by their grammar', () => {
  it('warns or offers a package for a font not every desktop has, and loads an installed @fontsource package of any family', async () => {
    const roboto = await themeEditSet('p', 'font', 'roboto', {cwd});
    expect(roboto.data.notes.join(' ')).toContain(
      'Roboto is not installed, so it does not load',
    );
    expect(roboto.data.notes.join(' ')).toContain('@fontsource/roboto');
    const gill = await themeEditSet('p', 'font', 'Gill Sans', {cwd});
    expect(gill.data.notes.join(' ')).toContain(
      '"Gill Sans" ships only on macOS',
    );
    const pkgDir = path.join(cwd, 'node_modules', '@fontsource', 'gill-sans');
    fs.mkdirSync(pkgDir, {recursive: true});
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({name: '@fontsource/gill-sans', version: '1.0.0'}),
    );
    try {
      const own = await themeEditSet('p', 'font', 'Gill Sans, serif', {cwd});
      expect(own.data.notes.join(' ')).toContain(
        'Gill Sans is installed (@fontsource/gill-sans)',
      );
      expect(own.data.notes.join(' ')).not.toContain('is not a system font');
    } finally {
      fs.rmSync(path.join(cwd, 'node_modules', '@fontsource'), {
        recursive: true,
        force: true,
      });
    }
    // The theme build still counts both as preinstalled inside a stack.
    const {collectUnloadedFonts} =
      await import('../theme/build/font-warning.mjs');
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-body': 'Roboto, "Gill Sans", sans-serif'},
      }),
    ).toEqual([]);
    await themeEditUndo('p', {cwd, thing: 'font'});
  });

  it('checks every part property against its CSS grammar, and keeps CSS-wide keywords out of color tokens', async () => {
    for (const [prop, value] of [
      ['background', 'banana'],
      ['box-shadow', 'banana'],
      ['border', '1px solid banana'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', prop, value, {cwd, on: 'card'}),
      );
      expect(r.code, `${prop} ${value}`).toBe('ERR_THEME_BAD_VALUE');
      expect(r.message, `${prop} ${value}`).toContain('its CSS grammar');
    }
    for (const [prop, value] of [
      ['border', '1px solid var(--color-border)'],
      ['background', 'linear-gradient(red, blue)'],
      ['color', 'revert-layer'],
    ]) {
      await themeEditSet('p', prop, value, {cwd, on: 'card'});
      await themeEditUndo('p', {cwd, thing: prop, on: 'card'});
    }
    expect(
      (
        await refusal(() =>
          themeEditSet('p', '--color-text-primary', 'revert-layer', {cwd}),
        )
      ).code,
    ).toBe('ERR_THEME_BAD_VALUE');
  });
});

describe('colors and type, final checks', () => {
  it('takes one time or easing per token, sound math only, and a leading of 0', async () => {
    for (const [token, value] of [
      ['--duration-slow-min', '200ms, 300ms'],
      ['--ease-standard', 'ease-in, ease-out'],
      ['--radius-element', 'calc(1px banana)'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', token, value, {cwd}))).code,
        `${token} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    for (const [token, value] of [
      ['--duration-slow-min', '300ms'],
      ['--ease-standard', 'ease-in'],
      ['--radius-element', 'calc(2px + 1px)'],
      ['--text-body-leading', '0'],
    ]) {
      await themeEditSet('p', token, value, {cwd});
      await themeEditUndo('p', {cwd, thing: token});
    }
  });

  it('gives an exact secondary text to the lifted parts with no color dial', async () => {
    await themeEditSet('p', '--color-text-secondary', '#5a5a5a', {
      cwd,
      mode: 'light',
    });
    expect(read('p.settings.ts')).toMatch(
      /"variant:number": \{\s*"--color-text-secondary": "light-dark\(#5a5a5a, [^"]+\)"/,
    );
    await themeEditUndo('p', {
      cwd,
      thing: '--color-text-secondary',
      mode: 'light',
    });
  });

  it('keeps headings for a body font, steps no further than the last rung, and names an exact token a dial cannot change', async () => {
    await themeEditSet('p', 'font', 'serif', {cwd, on: 'body'});
    const settings = read('p.settings.ts');
    expect(settings).toMatch(/"body": \{[^}]*Georgia/);
    expect(settings).not.toMatch(/"heading": \{[^}]*Georgia/);
    // A later command still loads the theme with the body font saved.
    await themeEditSet('p', 'text-size', '20', {cwd});
    const more = await refusal(() =>
      themeEditSet('p', 'text-size', 'more', {cwd}),
    );
    expect(more.code).toBe('ERR_THEME_BAD_VALUE');
    expect(more.message).toContain('nowhere to go');
    await themeEditSet('p', '--font-family-heading', 'Georgia, serif', {cwd});
    const mono = await themeEditSet('p', 'font', 'mono', {cwd});
    expect(mono.data.notes.join(' ')).toContain(
      'keeps your exact --font-family-heading = Georgia, serif',
    );
    for (const [thing, on] of [
      ['font', undefined],
      ['--font-family-heading', undefined],
      ['text-size', undefined],
      ['font', 'body'],
    ])
      await themeEditUndo('p', {cwd, thing, ...(on ? {on} : {})});
  });
});

describe('chaos round 4', () => {
  it('refuses a font the loader would refuse, so a saved font never blocks the theme', async () => {
    for (const v of ['serif !important', 'Foo /* x */']) {
      const r = await refusal(() => themeEditSet('p', 'font', v, {cwd}));
      expect(r.code, v).toBe('ERR_THEME_BAD_VALUE');
    }
    // The theme still takes commands.
    await themeEditSet('p', 'corners', 'small', {cwd});
    await themeEditUndo('p', {cwd, thing: 'corners'});
  });

  it('refuses part values the browser drops: a bad word, a negative width or duration, a broken url', async () => {
    for (const [prop, value] of [
      ['line-height', 'banana'],
      ['border-width', '-1px'],
      ['transition-duration', '-1s'],
      ['background', 'url(photo(1).png)'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', prop, value, {cwd, on: 'card'})))
          .code,
        `${prop} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
  });

  it('keeps both halves when a theme becomes one-mode, and says where its mode goes', async () => {
    // The theme's colors stay as they were; its mode is the one the app's
    // <Theme> is given.
    await themeEditNew('m', {cwd});
    await themeEditSet('m', 'accent', '#0d9488', {cwd});
    const dark = await themeEditSet('m', 'mode', 'dark-only', {cwd});
    expect(dark.data.changedTokens).toEqual([]);
    expect(dark.data.notes.join(' ')).toContain('mode="dark"');
    await themeEditUndo('m', {cwd, thing: 'mode'});
    const light = await themeEditSet('m', 'mode', 'light-only', {cwd});
    expect(light.data.notes.join(' ')).toContain('mode="light"');
    fs.rmSync(path.join(cwd, 'themes', 'm'), {recursive: true, force: true});
  });

  it('keeps the shades a theme shows until a color changes', async () => {
    await themeEditNew('o', {cwd});
    await themeEditSet('o', 'accent', '#7c3aed', {cwd});
    const ts = path.join(cwd, 'themes', 'o', 'o.settings.ts');
    // As an earlier editor mapped the tint: dark 25, not 30.
    const older = fs
      .readFileSync(ts, 'utf8')
      .replace(
        /("--color-accent-muted": \[\s*palette\.accent\.light\[85\],\s*palette\.accent\.dark\[)30(\])/,
        '$125$2',
      );
    expect(older).toContain('palette.accent.dark[25]');
    fs.writeFileSync(ts, older.replace(/^\/\/ Module [0-9a-f]{16}\.\n/m, ''));
    await themeEditSet('o', 'corners', 'pill', {cwd});
    expect(fs.readFileSync(ts, 'utf8')).toContain('palette.accent.dark[25]');
    // The next change reports no color change either.
    const corners = await themeEditSet('o', 'corners', 'small', {cwd});
    expect(
      corners.data.changedTokens.some(x =>
        x.startsWith('--color-accent-muted'),
      ),
    ).toBe(false);
    await themeEditUndo('o', {cwd, thing: 'corners'});
    expect(fs.readFileSync(ts, 'utf8')).toContain('palette.accent.dark[25]');
    // A color change maps the colors with this editor's rules.
    await themeEditSet('o', 'accent', '#6d28d9', {cwd});
    expect(fs.readFileSync(ts, 'utf8')).toMatch(
      /"--color-accent-muted": \[\s*palette\.accent\.light\[85\],\s*palette\.accent\.dark\[30\]/,
    );
    fs.rmSync(path.join(cwd, 'themes', 'o'), {recursive: true, force: true});
  });
});

describe('a palette an earlier editor wrote', () => {
  it('is brought up to date before the build reads it, so a font change keeps the accent and the next change does too', async () => {
    await themeEditNew('w', {cwd});
    await themeEditSet('w', 'mode', 'dark-only', {cwd});
    await themeEditSet('w', 'accent', '#5e6ad2', {cwd});
    await themeEditSet('w', 'neutral', '#26272e', {cwd});
    await themeEditSet('w', 'vibrancy', '40', {cwd});
    const dir = path.join(cwd, 'themes', 'w');
    const accent = () =>
      /--color-accent:\s*([^;]+);/.exec(
        fs.readFileSync(path.join(dir, 'w.css'), 'utf8'),
      )?.[1];
    const settled = accent();
    // The config, palette and receipt as an earlier editor wrote them for
    // this dark-only theme: both modes, and only a light accent anchor.
    const config = {
      vibrancy: 40,
      modeStrategy: 'light-and-dark',
      neutralProfile: 'custom',
      families: [
        {
          id: 'accent',
          name: 'Accent',
          seed: '#5e6ad2',
          anchors: [
            {mode: 'light', stop: 50, color: '#5e6ad2', policy: 'exact'},
          ],
        },
        {id: 'neutral', name: 'Neutral', seed: '#26272e', kind: 'neutral'},
      ],
    };
    fs.writeFileSync(
      path.join(dir, 'palette.config.json'),
      `${JSON.stringify(config, null, 2)}\n`,
    );
    themePaletteGenerate(
      'themes/w/palette.config.json',
      {out: 'themes/w/tokens/w.palette.ts', overwrite: true},
      {cwd},
    );
    // An earlier editor wrote both modes' stops for a one-mode theme.
    const ts = path.join(dir, 'w.settings.ts');
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(
          /"--color-accent": \[\s*palette\.accent\.light\[[\d.]+\],\s*palette\.accent\.dark\[[\d.]+\],?\s*\],/,
          '"--color-accent": [palette.accent.light[50], palette.accent.dark[70]],',
        )
        .replace(/^\/\/ Module [0-9a-f]{16}\.\n/m, ''),
    );
    expect(fs.readFileSync(ts, 'utf8')).toContain('palette.accent.dark[70]');
    // An earlier editor kept no palette hash in the settings.
    const settingsFile = path.join(dir, 'w.settings.json');
    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    delete saved.palette;
    fs.writeFileSync(settingsFile, `${JSON.stringify(saved, null, 2)}\n`);
    await themeEditSet('w', 'font', 'system', {cwd});
    expect(accent()).toBe(settled);
    await themeEditSet('w', 'corners', 'large', {cwd});
    expect(accent()).toBe(settled);
    fs.rmSync(dir, {recursive: true, force: true});
  });
});

describe('legacy grammar and code fonts', () => {
  it('refuses a filter word the browser drops, and gives a code font monospace fallbacks', async () => {
    for (const prop of ['filter', 'backdrop-filter'])
      expect(
        (
          await refusal(() =>
            themeEditSet('p', prop, 'banana', {cwd, on: 'card'}),
          )
        ).code,
        prop,
      ).toBe('ERR_THEME_BAD_VALUE');
    await themeEditSet('p', 'filter', 'blur(4px)', {cwd, on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'filter', on: 'card'});
    await themeEditSet('p', 'font', 'Fira Code', {cwd, on: 'code'});
    expect(read('p.settings.ts')).toMatch(
      /"code": \{\s*"family": "Fira Code",\s*"fallbacks": "ui-monospace, monospace"/,
    );
    await themeEditUndo('p', {cwd, thing: 'font', on: 'code'});
  });
});

describe('colors final-3', () => {
  it('types the math in calc(), and refuses CSS-wide keywords on tokens', async () => {
    for (const [thing, value, on] of [
      ['--radius-element', 'calc(4px + 2)'],
      ['--text-body-size', 'calc(10px / 2px)'],
      ['--duration-fast', 'calc(100ms + 1px)'],
      ['padding', 'calc(1s)', 'button'],
      ['font-size', 'calc(1rem * 1rem)', 'heading'],
      ['--font-family-body', 'inherit'],
      ['--font-family-heading', 'initial'],
    ])
      expect(
        (
          await refusal(() =>
            themeEditSet('p', thing, value, {cwd, ...(on ? {on} : {})}),
          )
        ).code,
        `${thing} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    for (const [thing, value] of [
      ['--radius-element', 'calc(4px + 2px)'],
      ['--duration-fast', 'calc(var(--duration-medium) / 2)'],
      ['--text-body-leading', 'calc(1.2 * 1)'],
    ]) {
      await themeEditSet('p', thing, value, {cwd});
      await themeEditUndo('p', {cwd, thing});
    }
  });

  it('warns for a font one system ships, refuses var() in the font dial, and reads a preset by its package name', async () => {
    for (const [family, note] of [
      ['Ubuntu', 'is not a system font'],
      ['Segoe UI', 'ships only on Windows'],
      ['Menlo', 'ships only on macOS'],
    ]) {
      const r = await themeEditSet('p', 'font', family, {cwd});
      expect(r.data.notes.join(' '), family).toContain(note);
    }
    const preset = await themeEditSet('p', 'font', 'segoe', {cwd});
    expect(preset.data.notes.join(' ')).not.toContain('is not a system font');
    const v = await refusal(() =>
      themeEditSet('p', 'font', 'var(--font-family-code)', {cwd, on: 'body'}),
    );
    expect(v.code).toBe('ERR_THEME_BAD_VALUE');
    expect(v.run?.[0] ?? JSON.stringify(v)).toContain('--font-family-body');
    const geist = await themeEditSet('p', 'font', 'geist-sans', {cwd});
    expect(geist.data.setting.value).toBe('geist');
    const medium = await refusal(() =>
      themeEditSet('p', 'text-size', 'Medium', {cwd}),
    );
    expect(JSON.stringify(medium)).toContain('text-size medium');
    await themeEditUndo('p', {cwd, thing: 'font'});
  });

  it('does not say a body font moves the headings, since it does not', async () => {
    await themeEditNew('g1', {cwd, like: 'neutral'}).catch(() =>
      themeEditNew('g1', {cwd}),
    );
    const r = await themeEditHow('font', {cwd, theme: 'g1'});
    expect(JSON.stringify(r.data)).not.toContain('also sets the heading font');
    fs.rmSync(path.join(cwd, 'themes', 'g1'), {recursive: true, force: true});
  });

  it('builds a hand edit of the generated module over from the settings', async () => {
    await themeEditNew('g4', {cwd});
    await themeEditSet('g4', 'accent', '#7c3aed', {cwd});
    const dir = path.join(cwd, 'themes', 'g4');
    const ts = path.join(dir, 'g4.settings.ts');
    const css = () => fs.readFileSync(path.join(dir, 'g4.css'), 'utf8');
    const muted = /--color-accent-muted:\s*([^;]+);/.exec(css())?.[1];
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace('palette.accent.light[85]', 'palette.accent.light[5]'),
    );
    await themeEditSet('g4', 'corners', 'pill', {cwd});
    expect(/--color-accent-muted:\s*([^;]+);/.exec(css())?.[1]).toBe(muted);
    fs.rmSync(dir, {recursive: true, force: true});
  });
});

describe('colors10', () => {
  it('reads CSS math functions by their types', async () => {
    for (const [prop, value] of [
      ['opacity', 'pow(0.5, 2)'],
      ['width', 'hypot(3px, 4px)'],
      ['transform', 'rotate(atan2(1, 1))'],
      ['width', 'calc(10px * cos(0deg))'],
      ['width', 'mod(10px, 3px)'],
      ['width', 'round(up, 10.5px, 2px)'],
      ['opacity', 'log(8, 2)'],
    ]) {
      await themeEditSet('p', prop, value, {cwd, on: 'card'});
      await themeEditUndo('p', {cwd, thing: prop, on: 'card'});
    }
    for (const [prop, value] of [
      ['width', 'sqrt(4px)'],
      ['width', 'pow(2px, 2)'],
      ['width', 'mod(10px, 3s)'],
      ['opacity', 'sin(1px)'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', prop, value, {cwd, on: 'card'})))
          .code,
        `${prop} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
  });

  it('leaves the theme build its own font list, and names commands for a font step', async () => {
    const {collectUnloadedFonts} =
      await import('../theme/build/font-warning.mjs');
    // As the build has always read it: Ubuntu warns, Roboto does not.
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-body': 'Ubuntu, Roboto, sans-serif'},
      }),
    ).toEqual(['Ubuntu']);
    const step = await refusal(() => themeEditSet('p', 'font', 'more', {cwd}));
    expect(step.code).toBe('ERR_THEME_BAD_VALUE');
    expect(step.run.length).toBeGreaterThan(0);
  });
});

describe('colors10, final-4', () => {
  it('types the math inside colors, and refuses a mix of nothing', async () => {
    for (const [thing, value, on] of [
      ['--color-accent', 'rgb(calc(1px banana) 0 0)'],
      ['--color-accent', 'rgb(calc(1px) 0 0)'],
      ['--color-accent', 'color-mix(in oklch, red 0%, white 0%)'],
      ['color', 'hsl(calc(1px) 50% 50%)', 'button'],
    ])
      expect(
        (
          await refusal(() =>
            themeEditSet('p', thing, value, {cwd, ...(on ? {on} : {})}),
          )
        ).code,
        `${thing} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    for (const value of [
      'rgb(calc(100) 0 0)',
      'rgb(var(--r, 0) 0 0)',
      'oklch(from var(--color-accent) l c h / 0.5)',
    ]) {
      await themeEditSet('p', '--color-text-primary', value, {cwd});
      await themeEditUndo('p', {cwd, thing: '--color-text-primary'});
    }
  });

  it('refuses a percentage on a token only widths and offsets read, and takes the math CSS takes', async () => {
    for (const [thing, value] of [
      ['--border-width', '10%'],
      ['--focus-outline-width', '10%'],
      ['--focus-outline-offset', 'calc(2px + 5%)'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', thing, value, {cwd}))).code,
        `${thing} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    for (const [thing, value] of [
      ['--radius-element', '10%'],
      ['--radius-element', 'abs(-4px)'],
      ['--radius-element', 'clamp(none, 4px, 8px)'],
      ['--radius-element', 'calc(sin(30deg) * 10px)'],
      ['--radius-element', 'round(up, 5.4px, 2px)'],
      ['--text-body-weight', 'calc(400 + 100)'],
    ]) {
      await themeEditSet('p', thing, value, {cwd});
      await themeEditUndo('p', {cwd, thing});
    }
    expect(
      (
        await refusal(() =>
          themeEditSet('p', 'grid-template-columns', 'repeat(2, calc(1fr))', {
            cwd,
            on: 'card',
          }),
        )
      ).code,
    ).toBe('ERR_THEME_BAD_VALUE');
  });

  it('says on which system a one-system font ships', async () => {
    const segoe = await themeEditSet('p', 'font', 'Segoe UI', {cwd});
    expect(segoe.data.notes.join(' ')).toContain('ships only on Windows');
    expect(segoe.data.notes.join(' ')).not.toContain('must load');
    const apple = await themeEditSet('p', 'font', '-apple-system', {cwd});
    expect(apple.data.notes.join(' ')).toContain('font system');
    await themeEditUndo('p', {cwd, thing: 'font'});
  });

  it('reads the hand-edit seal through CRLF line endings', async () => {
    await themeEditNew('crlf', {cwd});
    await themeEditSet('crlf', 'accent', '#7c3aed', {cwd});
    const dir = path.join(cwd, 'themes', 'crlf');
    const ts = path.join(dir, 'crlf.settings.ts');
    const css = () => fs.readFileSync(path.join(dir, 'crlf.css'), 'utf8');
    const muted = /--color-accent-muted:\s*([^;]+);/.exec(css())?.[1];
    fs.writeFileSync(
      ts,
      fs
        .readFileSync(ts, 'utf8')
        .replace(/\n/g, '\r\n')
        .replace('palette.accent.light[85]', 'palette.accent.light[5]'),
    );
    await themeEditSet('crlf', 'corners', 'pill', {cwd});
    expect(/--color-accent-muted:\s*([^;]+);/.exec(css())?.[1]).toBe(muted);
    fs.rmSync(dir, {recursive: true, force: true});
  });
});

describe('colors11: refusals name a command that works', () => {
  it('reads a dial typed in other letters as the dial', async () => {
    const r = await refusal(() => themeEditSet('p', 'Font', 'inter', {cwd}));
    expect(r.message).toContain('The dial for that is font');
    expect(r.run).toContain(
      r.run.find(x => / set p font inter$/.test(x)) ?? 'missing',
    );
  });

  it('splits a font shorthand on a part into commands that work', async () => {
    const r = await refusal(() =>
      themeEditSet('p', 'font', 'bold 16px/1.5 Georgia, serif', {
        cwd,
        on: 'card',
      }),
    );
    expect(
      r.run.some(x => /font-family 'Georgia, serif' --on card$/.test(x)),
    ).toBe(true);
    expect(r.run.some(x => /font-size 16px --on card$/.test(x))).toBe(true);
    for (const [prop, value] of [
      ['font-family', 'Georgia, serif'],
      ['font-size', '16px'],
    ]) {
      await themeEditSet('p', prop, value, {cwd, on: 'card'});
      await themeEditUndo('p', {cwd, thing: prop, on: 'card'});
    }
  });

  it('never suggests an MDN note as a value, and names a color that works', async () => {
    const family = await refusal(() =>
      themeEditSet('p', 'font-family', '16px inter', {cwd, on: 'card'}),
    );
    expect(family.run.join(' ')).not.toContain('dependsOnUserAgent');
    expect(family.run.join(' ')).toContain('font-family');
    for (const prop of ['color', 'background-color', 'border-color']) {
      const r = await refusal(() =>
        themeEditSet('p', prop, 'banana', {cwd, on: 'card'}),
      );
      expect(r.run.length, prop).toBeGreaterThan(0);
      expect(r.run[0], prop).toMatch(
        new RegExp(` set p ${prop} \\S+ --on card$`),
      );
    }
  });
});

describe('colors12', () => {
  it('splits a per-mode part color at its own comma, in either order', async () => {
    for (const [first, second] of [
      [
        ['dark', 'rgb(0, 0, 255)'],
        ['light', 'red'],
      ],
      [
        ['light', 'hsl(0, 100%, 50%)'],
        ['dark', 'color-mix(in oklch, red 20%, white)'],
      ],
    ]) {
      await themeEditSet('p', 'background-color', first[1], {
        cwd,
        on: 'card',
        when: 'variant:default',
        mode: first[0],
      });
      await themeEditSet('p', 'background-color', second[1], {
        cwd,
        on: 'card',
        when: 'variant:default',
        mode: second[0],
      });
      const [light, dark] =
        first[0] === 'light' ? [first[1], second[1]] : [second[1], first[1]];
      expect(read('p.settings.ts')).toContain(
        JSON.stringify(`light-dark(${light}, ${dark})`),
      );
      for (const m of ['light', 'dark'])
        await themeEditUndo('p', {
          cwd,
          thing: 'background-color',
          on: 'card',
          when: 'variant:default',
          mode: m,
        });
    }
  });

  it('refuses --mode on a value that gives both modes, and reads every color() space', async () => {
    for (const [thing, on] of [
      ['--color-accent'],
      ['background-color', 'card'],
    ])
      expect(
        (
          await refusal(() =>
            themeEditSet('p', thing, 'light-dark(#fff, #000)', {
              cwd,
              mode: 'light',
              ...(on ? {on} : {}),
            }),
          )
        ).code,
        thing,
      ).toBe('ERR_THEME_NO_MODE');
    for (const space of [
      'rec2020',
      'a98-rgb',
      'prophoto-rgb',
      'xyz',
      'xyz-d50',
      'xyz-d65',
    ]) {
      await themeEditSet('p', 'accent', `color(${space} 0.3 0.4 0.8)`, {cwd});
      await themeEditUndo('p', {cwd, thing: 'accent'});
    }
  });
});

describe('colors13', () => {
  it('maps every part of a font shorthand on a part to its longhand, and never a keyword to a family', async () => {
    /** @param {string} v */
    const runs = async v =>
      (await refusal(() => themeEditSet('p', 'font', v, {cwd, on: 'card'})))
        .run;
    const caps = await runs('italic small-caps 700 1rem/1 Arial');
    for (const want of [
      /font-style italic --on card$/,
      /font-variant-caps small-caps --on card$/,
      /font-weight 700 --on card$/,
      /font-size 1rem --on card$/,
      /line-height 1 --on card$/,
      /font-family Arial --on card$/,
    ])
      expect(
        caps.some(x => want.test(x)),
        String(want),
      ).toBe(true);
    expect(
      (await runs('oblique 10deg 200 condensed 2em sans-serif')).some(x =>
        /font-stretch condensed --on card$/.test(x),
      ),
    ).toBe(true);
    const bold = await runs('bold');
    expect(bold.some(x => /font-weight bold --on card$/.test(x))).toBe(true);
    expect(bold.join(' ')).not.toMatch(/font-family bold/);
    expect((await runs('caption')).join(' ')).not.toMatch(
      /font-family caption/,
    );
    for (const run of caps) {
      const [, prop, value] = / set p (\S+) (.+) --on card$/.exec(run) ?? [];
      await themeEditSet('p', prop, value.replace(/^'(.*)'$/, '$1'), {
        cwd,
        on: 'card',
      });
      await themeEditUndo('p', {cwd, thing: prop, on: 'card'});
    }
  });

  it('works out a color-mix() of two fixed colors', async () => {
    const {parseColor, hex} = await import('./_color.mjs');
    expect(
      hex(/** @type {any} */ (parseColor('color-mix(in srgb, red, blue)'))),
    ).toBe('#800080');
    await themeEditSet('p', 'accent', 'color-mix(in srgb, red, blue)', {cwd});
    await themeEditSet(
      'p',
      'accent',
      'color-mix(in oklch, #e11d48 60%, white)',
      {
        cwd,
      },
    );
    await themeEditUndo('p', {cwd, thing: 'accent'});
    const odd = await refusal(() =>
      themeEditSet('p', 'accent', 'color-mix(in hsl, red, blue)', {cwd}),
    );
    expect(odd.message).toContain('give the mixed color itself');
  });
});

describe('colors14', () => {
  it('suggests longhands set takes, and refuses negatives the current grammar does', async () => {
    const r = await refusal(() =>
      themeEditSet('p', 'font', 'condensed', {cwd, on: 'card'}),
    );
    const run = r.run.find(x => /font-stretch condensed --on card$/.test(x));
    expect(run).toBeTruthy();
    await themeEditSet('p', 'font-stretch', 'condensed', {cwd, on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'font-stretch', on: 'card'});
    for (const [prop, value] of [
      ['line-height', '-1'],
      ['line-height', '-10px'],
      ['gap', '-2px'],
    ]) {
      const bad = await refusal(() =>
        themeEditSet('p', prop, value, {cwd, on: 'card'}),
      );
      expect(bad.code, `${prop} ${value}`).toBe('ERR_THEME_BAD_VALUE');
      expect(bad.run[0], prop).toMatch(new RegExp(` set p ${prop} \\d`));
    }
    await themeEditSet('p', 'margin', '-4px', {cwd, on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'margin', on: 'card'});
    for (const [value, prop] of [
      ['small', 'font-size'],
      ['x-large', 'font-size'],
      ['larger', 'font-size'],
      ['1rem', 'font-size'],
      ['700', 'font-weight'],
    ]) {
      const runs = (
        await refusal(() => themeEditSet('p', 'font', value, {cwd, on: 'card'}))
      ).run;
      expect(
        runs.some(x => x.includes(` ${prop} ${value} --on card`)),
        value,
      ).toBe(true);
      expect(runs.join(' '), value).not.toContain(`font-family ${value}`);
    }
  });

  it('refuses a color-mix() share past 100%, and reads mixes, relative colors and equal halves', async () => {
    for (const [thing, on] of [
      ['--color-accent'],
      ['background-color', 'card'],
    ])
      expect(
        (
          await refusal(() =>
            themeEditSet('p', thing, 'color-mix(in srgb, red 150%, blue)', {
              cwd,
              ...(on ? {on} : {}),
            }),
          )
        ).code,
        thing,
      ).toBe('ERR_THEME_BAD_VALUE');
    const dial = await refusal(() =>
      themeEditSet('p', 'accent', 'color-mix(in srgb, red 150%, blue)', {cwd}),
    );
    expect(dial.run[0]).toContain('#ff0000');
    for (const value of ['rgb(from red r g b)', 'light-dark(red, red)']) {
      await themeEditSet('p', 'accent', value, {cwd});
      await themeEditUndo('p', {cwd, thing: 'accent'});
    }
    const lab = await refusal(() =>
      themeEditSet('p', 'accent', 'color-mix(in lab, red, blue)', {cwd}),
    );
    expect(lab.run[0]).not.toContain('#7c3aed');
    expect(lab.message).toContain('give the mixed color itself');
  });
});

describe('colors15', () => {
  it('refuses negative percentages, and reads any CSS percentage as a mix share', async () => {
    for (const [prop, value] of [
      ['line-height', '-50%'],
      ['gap', '-10%'],
      ['font-stretch', '-10%'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', prop, value, {cwd, on: 'card'})))
          .code,
        `${prop} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    for (const share of ['5e1%', '+50%', 'calc(50%)']) {
      await themeEditSet(
        'p',
        '--color-accent',
        `color-mix(in srgb, red ${share}, blue)`,
        {cwd},
      );
      await themeEditUndo('p', {cwd, thing: '--color-accent'});
    }
    await themeEditSet('p', 'accent', 'color-mix(in srgb, red 1e2%, blue)', {
      cwd,
    });
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('takes a line height token as a number only, as Core multiplies it', async () => {
    for (const [value, unitless] of [
      ['1.5em', '1.5'],
      ['150%', '1.5'],
      ['normal', null],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', '--text-body-leading', value, {cwd}),
      );
      expect(r.code, value).toBe('ERR_THEME_BAD_VALUE');
      if (unitless)
        expect(r.run[0], value).toMatch(
          new RegExp(`--text-body-leading ${unitless}$`),
        );
    }
    await themeEditSet('p', '--text-body-leading', '1.5', {cwd});
    await themeEditUndo('p', {cwd, thing: '--text-body-leading'});
  });

  it('suggests the headings word meant, the font a role keeps, and text sizes the dial takes', async () => {
    for (const [value, word] of [
      ['BOLD', 'bold'],
      ['Tight', 'tight'],
      ['700', 'bold'],
      ['800', 'heavy'],
      ['900', 'heavy'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', 'headings', value, {cwd}),
      );
      expect(r.run[0], value).toMatch(new RegExp(` headings ${word}$`));
    }
    await themeEditSet('p', 'font', 'georgia', {cwd, on: 'body'});
    await themeEditSet('p', 'font', 'georgia', {cwd, on: 'heading'});
    const masked = await themeEditSet('p', 'font', 'verdana', {cwd});
    const said = masked.data.notes.join(' ');
    expect(said).not.toContain('already shows');
    expect(said).toContain('undo p font --on body');
    for (const thing of ['font', 'font', 'font'])
      await themeEditUndo('p', {cwd, thing}).catch(() => {});
    const comic = await themeEditSet('p', 'font', 'Comic Sans MS', {cwd});
    expect(comic.data.notes.join(' ')).not.toContain('not a system font');
    await themeEditSet('p', 'text-size', '32', {cwd});
    const more = await refusal(() =>
      themeEditSet('p', 'text-size', 'more', {cwd}),
    );
    expect(more.run[0]).toContain('--font-size-base');
    await themeEditSet('p', 'text-size', '31', {cwd});
    const more31 = await refusal(() =>
      themeEditSet('p', 'text-size', 'more', {cwd}),
    );
    expect(more31.run[0]).toMatch(/ text-size 32$/);
  });

  it('maps every keyword of a font value on a part to its longhand', async () => {
    const r = await refusal(() =>
      themeEditSet('p', 'font', 'italic bold', {cwd, on: 'card'}),
    );
    expect(r.run.some(x => /font-style italic --on card$/.test(x))).toBe(true);
    expect(r.run.some(x => /font-weight bold --on card$/.test(x))).toBe(true);
    expect(r.run.join(' ')).not.toContain('font-family');
    const sized = await refusal(() =>
      themeEditSet('p', 'font', '1rem bold', {cwd, on: 'card'}),
    );
    expect(sized.run.some(x => /font-size 1rem --on card$/.test(x))).toBe(true);
    // A keyword after the size is the family, as CSS reads it.
    expect(sized.run.some(x => /font-family bold --on card$/.test(x))).toBe(
      true,
    );
    expect(sized.run.join(' ')).not.toContain('font-weight bold');
  });
});

describe('colors16', () => {
  it('keeps weight keywords on weight tokens, and a theme saved with one editable', async () => {
    await themeEditSet('p', '--font-weight-bold', 'bold', {cwd});
    await themeEditSet('p', 'corners', 'pill', {cwd});
    await themeEditUndo('p', {cwd, thing: 'corners'});
    for (const v of ['normal', 'bolder', 'lighter', '7e2', '+700'])
      await themeEditSet('p', '--font-weight-bold', v, {cwd});
    await themeEditUndo('p', {cwd, thing: '--font-weight-bold'});
  });

  it('reads CSS numbers as the browser does, and only multiplied tokens refuse units', async () => {
    for (const v of ['1.5e0', '+1.5', '15E-1']) {
      await themeEditSet('p', '--text-body-leading', v, {cwd});
      await themeEditUndo('p', {cwd, thing: '--text-body-leading'});
    }
    const em = await refusal(() =>
      themeEditSet('p', '--text-body-leading', '1.5EM', {cwd}),
    );
    expect(em.run[0]).toMatch(/--text-body-leading 1\.5$/);
    for (const share of ['50.%', '5.e1%'])
      expect(
        (
          await refusal(() =>
            themeEditSet(
              'p',
              '--color-accent',
              `color-mix(in srgb, red ${share}, blue)`,
              {cwd},
            ),
          )
        ).code,
        share,
      ).toBe('ERR_THEME_BAD_VALUE');
  });

  it('splits size with line height and math, and refuses a part named twice', async () => {
    for (const [value, want] of [
      [
        '1rem/1.5',
        [/font-size 1rem --on card$/, /line-height 1\.5 --on card$/],
      ],
      [
        'italic 1rem/1.5',
        [/font-style italic --on card$/, /line-height 1\.5 --on card$/],
      ],
      ['calc(1rem + 2px)', [/font-size 'calc\(1rem \+ 2px\)' --on card$/]],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', 'font', value, {cwd, on: 'card'}),
      );
      for (const w of want)
        expect(
          r.run.some(x => w.test(x)),
          `${value} ${w}`,
        ).toBe(true);
      expect(r.run.join(' '), value).not.toContain('font-family');
    }
    const twice = await refusal(() =>
      themeEditSet('p', 'font', 'bold bold', {cwd, on: 'card'}),
    );
    expect(twice.message).toContain('twice');
    // After the size, the rest is the family; more normals than parts that
    // take it are named as such.
    const familyAfter = await refusal(() =>
      themeEditSet('p', 'font', '16px bold', {cwd, on: 'card'}),
    );
    expect(familyAfter.run.join('\n')).toMatch(/ font-family bold --on card/);
    const five = await refusal(() =>
      themeEditSet('p', 'font', 'normal normal normal normal normal', {
        cwd,
        on: 'card',
      }),
    );
    expect(five.message).toContain(
      'gives normal more times than the parts that take it (font-weight, font-style, font-variant-caps, font-stretch)',
    );
    // Another word for a part already given is the same part twice.
    for (const value of ['bold lighter', 'italic oblique']) {
      const again = await refusal(() =>
        themeEditSet('p', 'font', value, {cwd, on: 'card'}),
      );
      expect(again.message, value).toContain('twice');
      expect(again.run.join(' '), value).not.toContain(
        `font-family '${value}'`,
      );
    }
    expect(twice.run.join(' ')).not.toContain("font-family 'bold bold'");
    // normal is a keyword of several parts: each is the next of them, never
    // the same part twice.
    const normal = await refusal(() =>
      themeEditSet('p', 'font', 'normal normal 16px serif', {cwd, on: 'card'}),
    );
    expect(normal.message).not.toContain('twice');
    // Every other word is placed first: normal takes what is left.
    const normalBold = await refusal(() =>
      themeEditSet('p', 'font', 'normal bold', {cwd, on: 'card'}),
    );
    expect(normalBold.run.join(' ')).not.toContain('font-family');
    expect(
      normalBold.run.some((/** @type {string} */ x) =>
        / font-weight bold --on card$/.test(x),
      ),
    ).toBe(true);
    expect(
      normal.run.some((/** @type {string} */ x) =>
        / font-size 16px --on card$/.test(x),
      ),
    ).toBe(true);
    expect(
      normal.run.some((/** @type {string} */ x) =>
        / font-family serif --on card$/.test(x),
      ),
    ).toBe(true);
  });
});

describe('colors17', () => {
  it('checks a var() fallback against the token, and reads sizes and channels as CSS does', async () => {
    for (const [thing, value] of [
      ['--text-body-leading', 'var(--nope, 1.5em)'],
      ['--text-body-leading', 'var(--nope, red)'],
      ['--font-weight-bold', 'var(--nope, 1.5em)'],
      ['--color-accent', 'var(--nope, 12px)'],
      ['--radius-element', '1.px'],
      ['--radius-element', '50.%'],
      ['--color-accent', 'rgb(255. 0 0)'],
      ['--color-accent', 'hsl(120. 50% 20%)'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', thing, value, {cwd}))).code,
        `${thing} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    const dot = await refusal(() =>
      themeEditSet('p', '--radius-element', '16.px', {cwd}),
    );
    expect(dot.run[0]).toMatch(/--radius-element 16px$/);
    for (const value of ['+4px', '4e+1px', 'var(--nope, 4px)']) {
      await themeEditSet('p', '--radius-element', value, {cwd});
      await themeEditUndo('p', {cwd, thing: '--radius-element'});
    }
  });

  it('suggests the vibrancy meant, and none with no color to saturate', async () => {
    const none = await refusal(() =>
      themeEditSet('p', 'vibrancy', '70%', {cwd}),
    );
    expect(none.code).toBe('ERR_THEME_NO_EFFECT');
    await themeEditSet('p', 'accent', '#7c3aed', {cwd});
    for (const [value, want] of [
      ['MORE', 'more'],
      ['70%', '70'],
      ['7e1', '70'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', 'vibrancy', value, {cwd}),
      );
      expect(r.run[0], value).toMatch(new RegExp(` vibrancy ${want}$`));
    }
    await themeEditUndo('p', {cwd, thing: 'accent'});
  });

  it('carries weights to phones, formats heading weights, and keeps sizes and weights out of the font dial', async () => {
    const r = await themeEditSet('p', 'headings', 'heavy', {cwd});
    expect(JSON.stringify(r.data)).not.toContain('[object Object]');
    await themeEditSet('p', '--text-body-weight', '600', {cwd});
    const css = read('p.css');
    const phone = css.slice(css.indexOf('pointer: coarse'));
    expect(phone).toMatch(/--text-heading-1-weight:\s*800/);
    expect(phone).toMatch(/--text-body-weight:\s*600/);
    await themeEditUndo('p', {cwd, thing: '--text-body-weight'});
    await themeEditUndo('p', {cwd, thing: 'headings'});
    for (const [value, on, want] of [
      ['16px', undefined, /--font-size-base 16px$/],
      ['bold', 'heading', / headings bold$/],
      [
        'italic 700 16px/1.4 Georgia, serif',
        undefined,
        / font 'Georgia, serif'$/,
      ],
    ]) {
      const f = await refusal(() =>
        themeEditSet('p', 'font', value, {cwd, ...(on ? {on} : {})}),
      );
      expect(f.code, value).toBe('ERR_THEME_BAD_VALUE');
      expect(
        f.run.some(x => want.test(x)),
        `${value} ${f.run}`,
      ).toBe(true);
    }
    await themeEditSet('p', 'font', 'georgia', {cwd});
    await themeEditUndo('p', {cwd, thing: 'font'});
  });
});

describe('hunt22', () => {
  it('reads undo values in either quote style and spacing, names the headings half set, and tells a new theme from a lost history', async () => {
    await themeEditNew('h22', {cwd, mode: 'dark-only'});
    const fresh = await refusal(() =>
      themeEditUndo('h22', {cwd, thing: 'mode'}),
    );
    expect(fresh.message).toContain('no saved change');
    expect(fresh.message).not.toContain('does not reach back');
    await themeEditSet('h22', 'corners', 'pill', {cwd});
    await themeEditUndo('h22', {cwd});
    const undone = await refusal(() =>
      themeEditUndo('h22', {cwd, thing: 'mode'}),
    );
    expect(undone.message).toContain('was never changed');
    await themeEditSet('h22', 'headings', 'tight', {cwd});
    const half = await refusal(() =>
      themeEditUndo('h22', {cwd, thing: 'headings', value: 'bold'}),
    );
    expect(half.message).toContain('only the headings tracking half');
    await themeEditUndo('h22', {cwd, thing: 'headings'});
    await themeEditSet(
      'h22',
      '--font-family-body',
      `'Inter Tight', sans-serif`,
      {cwd},
    );
    await themeEditUndo('h22', {
      cwd,
      thing: '--font-family-body',
      value: `"Inter Tight",sans-serif`,
    });
    const mistyped = await refusal(() =>
      themeEditSet('h22', 'base', 'p', {cwd}),
    );
    expect(mistyped.message).toContain('p is a theme made here');
    fs.rmSync(path.join(cwd, 'themes', 'h22'), {recursive: true, force: true});
  });
});

describe('colors19', () => {
  it('checks each var() fallback in a part value against the property', async () => {
    for (const [prop, value, on] of [
      ['padding', 'var(--nope, red)', 'card'],
      ['font-weight', 'calc(var(--nope, 1px))', 'text'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', prop, value, {cwd, on}))).code,
        `${prop} ${value}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    await themeEditSet('p', 'padding', 'var(--nope, 4px)', {cwd, on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'card'});
  });

  it('suggests the size meant, and the nearest text size', async () => {
    for (const [value, want] of [
      ['16 px', '16px'],
      ['1,5rem', '1.5rem'],
      ['16pxx', '16px'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', '--font-size-base', value, {cwd}),
      );
      expect(r.run[0], value).toMatch(
        new RegExp(`--font-size-base ${want.replace('.', '\\.')}$`),
      );
    }
    for (const [value, want] of [
      ['20 px', '20'],
      ['125%', '20'],
      ['40', '32'],
      ['3px', '10'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', 'text-size', value, {cwd}),
      );
      expect(r.run[0], value).toMatch(new RegExp(` text-size ${want}$`));
    }
  });

  it('reports a hand-edited font dial set would refuse, and never builds it', async () => {
    await themeEditNew('f19', {cwd});
    await themeEditSet('f19', 'font', 'georgia', {cwd});
    const file = path.join(cwd, 'themes', 'f19', 'f19.settings.json');
    const saved = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, saved.replace('"georgia"', '"inherit"'));
    const r = await refusal(() =>
      themeEditSet('f19', 'corners', 'pill', {cwd}),
    );
    expect(r.message).toContain('inherit');
    fs.rmSync(path.join(cwd, 'themes', 'f19'), {recursive: true, force: true});
  });
});

describe('parts24', () => {
  it('replaces only the longhands a shorthand really sets', async () => {
    for (const [long, longValue, short, shortValue] of [
      ['overflow-wrap', 'anywhere', 'overflow', 'hidden'],
      ['transform-origin', 'top left', 'transform', 'scale(1.1)'],
      ['outline-offset', '2px', 'outline', '1px solid red'],
      ['flex-direction', 'column', 'flex', '1'],
      ['background-blend-mode', 'multiply', 'background', 'red'],
      ['text-decoration-skip-ink', 'none', 'text-decoration', 'underline'],
    ]) {
      await themeEditSet('p', long, longValue, {cwd, on: 'button'});
      await themeEditSet('p', short, shortValue, {cwd, on: 'button'});
      const shown = await themeEditShow('p', {cwd});
      expect(
        JSON.stringify(shown.data).includes(long),
        `${short} kept ${long}`,
      ).toBe(true);
      await themeEditUndo('p', {cwd, thing: short, on: 'button'});
      await themeEditUndo('p', {cwd, thing: long, on: 'button'});
    }
    await themeEditSet('p', 'padding-top', '12px', {cwd, on: 'button'});
    await themeEditSet('p', 'padding', '4px', {cwd, on: 'button'});
    expect(
      JSON.stringify((await themeEditShow('p', {cwd})).data),
    ).not.toContain('padding-top');
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'button'});
  });

  it('keeps a background on variants when a blend mode comes later', async () => {
    const {findOverrides} = await import('./_settings.mjs');
    const lifted = findOverrides(
      '.astryx-button[data-variant="destructive"] { background: var(--color-error-muted); }',
      {
        components: {
          button: {
            base: {background: 'red', backgroundBlendMode: 'multiply'},
          },
        },
      },
    );
    expect(lifted.map(x => x.prop)).toContain('background');
  });

  it('reads plural parts, and keeps a hint value', async () => {
    for (const [plural, part] of [
      ['cards', 'card'],
      ['dialogs', 'dialog'],
      ['tabs', 'tab'],
    ]) {
      const r = await refusal(() =>
        themeEditSet('p', 'opacity', '0.9', {cwd, on: plural}),
      );
      expect(r.run[0], plural).toMatch(new RegExp(`--on ${part}$`));
    }
    const shadow = await refusal(() =>
      themeEditSet('p', 'shadow', 'none', {cwd, on: 'card'}),
    );
    expect(shadow.run[0]).toMatch(/box-shadow none --on card$/);
    const rounded = await refusal(() =>
      themeEditSet('p', 'rounded', '8px', {cwd, on: 'card'}),
    );
    expect(rounded.run[0]).toMatch(/corners 8px --on card$/);
    const bold = await refusal(() =>
      themeEditSet('p', 'bold', 'false', {cwd, on: 'button'}),
    );
    expect(bold.run[0]).toMatch(/font-weight normal --on button$/);
  });
});

describe('parts28', () => {
  /** The card's padding variables in the built CSS, by side. */
  const cardSides = (/** @type {string} */ selector = '.astryx-card') => {
    const css = read('p.css');
    /** @type {Record<string, string>} */
    const out = {};
    const at =
      css.indexOf(`${selector} {`) >= 0
        ? css.indexOf(`${selector} {`)
        : css.indexOf(`${selector}{`);
    const body = css.slice(at, css.indexOf('}', at));
    for (const m of body.matchAll(
      /--astryx-card-padding(-[a-z-]+)?:\s*([^;]+);/g,
    ))
      out[m[1] ?? 'all'] = m[2].trim();
    return out;
  };

  it('writes each side of a card padding exactly, whatever Core splits', async () => {
    for (const [value, want] of [
      ['clamp(12px, 2vw, 24px)', {all: 'clamp(12px, 2vw, 24px)'}],
      [
        'calc(4px + 2px) 8px',
        {
          '-block-start': 'calc(4px + 2px)',
          '-block-end': 'calc(4px + 2px)',
          '-inline-start': '8px',
          '-inline-end': '8px',
        },
      ],
      [
        // The shorthand is physical: its left and right are per direction.
        '4px 8px 12px 16px',
        {
          '-block-start': '4px',
          '-block-end': '12px',
        },
      ],
    ]) {
      await themeEditSet('p', 'padding', value, {cwd, on: 'card'});
      const sides = cardSides();
      for (const [k, v] of Object.entries(want))
        expect(sides[k], `${value} ${k}`).toBe(v);
      expect(JSON.stringify(sides), value).not.toMatch(/: \+|"\+"/);
      if (value === '4px 8px 12px 16px') {
        const ltr = cardSides('.astryx-card:dir(ltr)');
        const rtl = cardSides('.astryx-card:dir(rtl)');
        expect([ltr['-inline-start'], ltr['-inline-end']]).toEqual([
          '16px',
          '8px',
        ]);
        expect([rtl['-inline-start'], rtl['-inline-end']]).toEqual([
          '8px',
          '16px',
        ]);
      }
      await themeEditUndo('p', {cwd, thing: 'padding', on: 'card'});
    }
  });

  it('reaches a variant after a side set for every variant', async () => {
    await themeEditSet('p', 'padding-top', '12px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding', '4px', {
      cwd,
      on: 'card',
      when: 'variant:muted',
    });
    const sides = cardSides('.astryx-card[data-variant="muted"]');
    for (const k of [
      '-block-start',
      '-block-end',
      '-inline-start',
      '-inline-end',
    ])
      expect(sides[k], k).toBe('4px');
    await themeEditUndo('p', {
      cwd,
      thing: 'padding',
      on: 'card',
      when: 'variant:muted',
    });
    await themeEditUndo('p', {cwd, thing: 'padding-top', on: 'card'});
  });

  it('gives each card corner its own radius, and the content inside one radius', async () => {
    for (const [value, corners, inner] of [
      ['12px 12px 0 0', ['12px', '12px', '0', '0'], '12px'],
      [
        '10px / 20px',
        ['10px 20px', '10px 20px', '10px 20px', '10px 20px'],
        '10px',
      ],
    ]) {
      await themeEditSet('p', 'border-radius', value, {cwd, on: 'card'});
      const css = read('p.css');
      const at = css.indexOf('.astryx-card {');
      const body = css.slice(at, css.indexOf('}', at));
      ['top-left', 'top-right', 'bottom-right', 'bottom-left'].forEach((c, i) =>
        expect(body, `${value} ${c}`).toContain(
          `border-${c}-radius: ${corners[i]};`,
        ),
      );
      expect(body, value).toContain(`--_card-radius: ${inner};`);
      expect(body, value).not.toContain(`--_card-radius: ${value};`);
      await themeEditUndo('p', {cwd, thing: 'border-radius', on: 'card'});
    }
  });
});

describe('parts30', () => {
  it('lets a variant longhand or shorthand win over a lifted base value', async () => {
    const {findOverrides} = await import('./_settings.mjs');
    // The lift itself is unchanged: the base value reaches the variant.
    expect(
      findOverrides(
        '.astryx-button[data-variant="destructive"] { border-color: var(--x); }',
        {components: {button: {base: {border: '2px solid red'}}}},
      ).map(x => x.prop),
    ).toEqual(['border']);
    for (const [base, when, prop, value, want] of [
      [
        'border',
        'variant:destructive',
        'border-color',
        'blue',
        /border-color:\s*blue/,
      ],
    ]) {
      await themeEditSet('p', base, '2px solid red', {cwd, on: 'button'});
      await themeEditSet('p', prop, value, {cwd, on: 'button', when});
      const css = read('p.css');
      const at = css.indexOf('.astryx-button[data-variant="destructive"]');
      if (at >= 0) {
        const body = css.slice(at, css.indexOf('}', at));
        const lifted = body.search(/border:/);
        const own = body.search(want);
        if (lifted >= 0) expect(lifted, body).toBeLessThan(own);
      }
      await themeEditUndo('p', {cwd, thing: prop, on: 'button', when});
      await themeEditUndo('p', {cwd, thing: base, on: 'button'});
    }
  });

  it('maps card physical sides to Core side variables, and resolves keywords', async () => {
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding', '8px', {cwd, on: 'card'});
    const css = read('p.css');
    const at = css.indexOf('.astryx-card {');
    const body = css.slice(at, css.indexOf('}', at));
    expect(body).not.toMatch(/padding-left:/);
    // The later padding replaced the side, as for any longhand.
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'card'});
    await themeEditSet('p', 'padding', 'initial', {cwd, on: 'card'});
    const css2 = read('p.css');
    const at2 = css2.indexOf('.astryx-card {');
    // initial leaves the variable without a value: Core's own default.
    expect(css2.slice(at2, css2.indexOf('}', at2))).toMatch(
      /--astryx-card-padding[a-z-]*:\s*initial/,
    );
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'card'});
    expect(
      (
        await refusal(() =>
          themeEditSet('p', 'padding', 'inherit', {cwd, on: 'card'}),
        )
      ).code,
    ).toBe('ERR_THEME_BAD_VALUE');
  });

  it('keeps a variant margin side and a variant radius over the lifted base values', async () => {
    for (const [part, base, baseValue, when, prop, value, own] of [
      [
        'button',
        'margin',
        '3px',
        'size:sm',
        'margin-top',
        '9px',
        /margin-top:\s*9px/,
      ],
      [
        'card',
        'border-radius',
        '8px',
        'variant:muted',
        'border-radius',
        '1px 20px',
        /border-top-left-radius:\s*1px|border-radius:\s*1px 20px/,
      ],
    ]) {
      await themeEditSet('p', base, baseValue, {cwd, on: part});
      await themeEditSet('p', prop, value, {cwd, on: part, when});
      const css = read('p.css');
      const [k, wv] = when.split(':');
      const at = css.indexOf(`.astryx-${part}[data-${k}="${wv}"]`);
      expect(at, `${part} ${when}`).toBeGreaterThanOrEqual(0);
      const body = css.slice(at, css.indexOf('}', at));
      const mine = body.search(own);
      expect(mine, body).toBeGreaterThanOrEqual(0);
      const lifted = body.search(
        new RegExp(`(^|[;{\\s])${base}:\\s*${baseValue}`),
      );
      if (lifted >= 0) expect(lifted, body).toBeLessThan(mine);
      await themeEditUndo('p', {cwd, thing: prop, on: part, when});
      await themeEditUndo('p', {cwd, thing: base, on: part});
    }
  });
});

describe('colors32', () => {
  it('suggests the token value meant, not a stock one', async () => {
    for (const [thing, value, want] of [
      ['--font-size-base', '18px;', /--font-size-base 18px$/],
      ['--color-accent', '＃7c3aed', /--color-accent '#7c3aed'$/],
      ['--font-weight-bold', '"700"', /--font-weight-bold 700$/],
      [
        '--font-family-body',
        'Font Awesome 6 Free',
        /--font-family-body '"Font Awesome 6 Free"'$/,
      ],
    ]) {
      const r = await refusal(() => themeEditSet('p', thing, value, {cwd}));
      expect(r.run[0], `${thing} ${value}`).toMatch(want);
    }
    const part = await refusal(() =>
      themeEditSet('p', 'font-family', 'Font Awesome 6 Free', {
        cwd,
        on: 'card',
      }),
    );
    expect(part.run[0]).toContain('"Font Awesome 6 Free"');
  });

  it('saves a fractional text size as the whole pixel it builds, and says so', async () => {
    const r = await themeEditSet('p', 'text-size', '15.5', {cwd});
    expect(r.data.notes.join(' ')).toContain('saved as 16');
    await themeEditUndo('p', {cwd, thing: 'text-size'});
  });
});

describe('parts33', () => {
  /** @param {string} selector */
  const blockOf = selector => {
    const css = read('p.css');
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it('replaces a physical side by a later logical shorthand, and a group side by a later part padding', async () => {
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding-inline', '8px', {cwd, on: 'card'});
    const shown = JSON.stringify((await themeEditShow('p', {cwd})).data);
    expect(shown).not.toContain('padding-left');
    await themeEditUndo('p', {cwd, thing: 'padding-inline', on: 'card'});
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'containers'});
    await themeEditSet('p', 'padding', '8px', {cwd, on: 'card'});
    const card = blockOf('.astryx-card');
    expect(card).toMatch(
      /--astryx-card-padding-inline-start:\s*8px|--astryx-card-padding:\s*8px/,
    );
    expect(card).not.toMatch(/padding-inline-start:\s*20px/);
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'containers'});
  });

  it("keeps the part's own inner radius over a group radius in the same block", async () => {
    await themeEditSet('p', 'border-radius', '8px', {cwd, on: 'containers'});
    await themeEditSet('p', 'border-radius', '1px 20px', {cwd, on: 'card'});
    const card = blockOf('.astryx-card');
    expect(card).toContain('--_card-radius: 1px;');
    expect(card).not.toContain('--_card-radius: 8px;');
    await themeEditUndo('p', {cwd, thing: 'border-radius', on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'border-radius', on: 'containers'});
  });

  it('keeps one logical side logical, off the whole-box variable, where Core copies the whole padding', async () => {
    await themeEditSet('p', 'padding-inline-start', '5px', {
      cwd,
      on: 'dropdown-menu',
    });
    const box = blockOf('.astryx-dropdown-menu');
    expect(box).not.toMatch(/--_dropdown-menu-padding:\s*5px/);
    // Each direction gets its own side, off the whole-box variable.
    expect(blockOf('.astryx-dropdown-menu:dir(ltr)')).toMatch(
      /padding-left:\s*5px/,
    );
    expect(blockOf('.astryx-dropdown-menu:dir(rtl)')).toMatch(
      /padding-right:\s*5px/,
    );
    await themeEditUndo('p', {
      cwd,
      thing: 'padding-inline-start',
      on: 'dropdown-menu',
    });
  });

  it('resolves a keyword on each logical side of a card', async () => {
    await themeEditSet('p', 'padding-block-start', 'initial', {
      cwd,
      on: 'card',
    });
    // initial leaves the side without a value: Core's own default for it.
    const card = blockOf('.astryx-card');
    expect(card).toMatch(/--astryx-card-padding-block-start:\s*initial/);
    await themeEditUndo('p', {cwd, thing: 'padding-block-start', on: 'card'});
  });
});

describe('parts34', () => {
  /** @param {string} selector */
  const blockOf = selector => {
    const css = read('p.css');
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it("refuses a composer padding (parts39: only Core's private variable reaches the box), and what paints its wrapper", async () => {
    const pad = await refusal(() =>
      themeEditSet('p', 'padding', '5px', {cwd, on: 'chat-composer'}),
    );
    expect(pad.code).toBe('ERR_THEME_NO_EFFECT');
    expect(pad.run[0]).toMatch(/how chat-composer$/);
    for (const [prop, value, when] of [
      ['background', '#f3f4f6'],
      ['box-shadow', 'none'],
      ['padding-left', '5px'],
      ['padding', '5px', 'density:compact'],
    ])
      expect(
        (
          await refusal(() =>
            themeEditSet('p', prop, value, {
              cwd,
              on: 'chat-composer',
              ...(when ? {when} : {}),
            }),
          )
        ).code,
        `${prop} ${when ?? ''}`,
      ).toBe('ERR_THEME_BAD_VALUE');
  });
});

describe('r19 (1) / parts35: a card physical side is its side in each direction', () => {
  it('writes a card padding-left as the inline-start variable left-to-right and the inline-end right-to-left', async () => {
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'card'});
    const css = read('p.css');
    const rule = (/** @type {string} */ sel) => {
      const at = css.indexOf(`${sel} {`);
      return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    };
    expect(rule('.astryx-card:dir(ltr)')).toMatch(
      /--astryx-card-padding-inline-start:\s*20px/,
    );
    expect(rule('.astryx-card:dir(rtl)')).toMatch(
      /--astryx-card-padding-inline-end:\s*20px/,
    );
    expect(rule('.astryx-card')).not.toMatch(/(^|[;{\s])padding-left:/);
    await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'card'});
  });
});

describe('r19b (1): a card physical side beside other sides', () => {
  it('writes padding-left as its side after another side, with a keyword, and with math', async () => {
    for (const [first, value, want] of [
      [['padding-top', '12px'], '20px', '20px'],
      [null, 'initial', 'initial'],
      [null, '0', '0px'],
      [null, 'calc(4px + 2px)', 'calc(4px + 2px)'],
    ]) {
      if (first) await themeEditSet('p', first[0], first[1], {cwd, on: 'card'});
      await themeEditSet('p', 'padding-left', value, {cwd, on: 'card'});
      const css = read('p.css');
      const at = css.indexOf('.astryx-card:dir(ltr) {');
      const body = css.slice(at, css.indexOf('}', at));
      expect(body, value).toContain(
        `--astryx-card-padding-inline-start: ${want};`,
      );
      expect(css, value).not.toContain('padding-left-start');
      await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'card'});
      if (first) await themeEditUndo('p', {cwd, thing: first[0], on: 'card'});
    }
  });
});

describe('r19d: per-direction sides under a state, and later paddings that cover them', () => {
  /** @param {string} selector */
  const blockOf = selector => {
    const css = read('p.css');
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it('writes a logical side under a state as one rule per direction', async () => {
    const r = await themeEditSet('p', 'padding-inline-start', '5px', {
      cwd,
      on: 'dropdown-menu',
      state: 'hover',
    });
    expect(JSON.stringify(r.data)).not.toContain('[object Object]');
    const css = read('p.css');
    expect(css).toMatch(
      /\.astryx-dropdown-menu:hover:dir\(ltr\)[^{]*\{[^}]*padding-left:\s*5px/,
    );
    expect(css).toMatch(
      /\.astryx-dropdown-menu:hover:dir\(rtl\)[^{]*\{[^}]*padding-right:\s*5px/,
    );
    await themeEditUndo('p', {
      cwd,
      thing: 'padding-inline-start',
      on: 'dropdown-menu',
      state: 'hover',
    });
  });

  it('lets a later padding or physical side replace an earlier per-direction side', async () => {
    for (const [later, value] of [
      ['padding', '8px'],
      ['padding-left', '9px'],
    ]) {
      await themeEditSet('p', 'padding-inline-start', '5px', {
        cwd,
        on: 'dropdown-menu',
      });
      await themeEditSet('p', later, value, {cwd, on: 'dropdown-menu'});
      expect(blockOf('.astryx-dropdown-menu:dir(ltr)'), later).not.toMatch(
        /padding-left:\s*5px/,
      );
      await themeEditUndo('p', {cwd, thing: later, on: 'dropdown-menu'});
      await themeEditUndo('p', {
        cwd,
        thing: 'padding-inline-start',
        on: 'dropdown-menu',
      }).catch(() => {});
    }
  });

  it('on a card, the later of a physical and a logical side wins in each direction, in either order', async () => {
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding-inline-start', '6px', {cwd, on: 'card'});
    // Left-to-right the later inline-start wins; right-to-left the left is
    // the inline-end, which stays.
    expect(blockOf('.astryx-card')).toMatch(
      /--astryx-card-padding-inline-start:\s*6px/,
    );
    expect(blockOf('.astryx-card:dir(rtl)')).toMatch(
      /--astryx-card-padding-inline-end:\s*20px/,
    );
    await themeEditUndo('p', {cwd, thing: 'padding-inline-start', on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'card'}).catch(
      () => {},
    );
    await themeEditSet('p', 'padding-inline-start', '6px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'card'});
    expect(blockOf('.astryx-card:dir(ltr)')).toMatch(
      /--astryx-card-padding-inline-start:\s*20px/,
    );
    expect(blockOf('.astryx-card:dir(rtl)')).toMatch(
      /--astryx-card-padding-inline-start:\s*6px/,
    );
    expect(blockOf('.astryx-card:dir(rtl)')).toMatch(
      /--astryx-card-padding-inline-end:\s*20px/,
    );
    await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'card'});
    await themeEditUndo('p', {cwd, thing: 'padding-inline-start', on: 'card'});
  });

  it('keeps an earlier physical side on a menu under a later per-direction side', async () => {
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'context-menu'});
    await themeEditSet('p', 'padding-inline-start', '6px', {
      cwd,
      on: 'context-menu',
    });
    expect(blockOf('.astryx-context-menu')).toMatch(
      /(^|[;{\s])padding-left:\s*20px/,
    );
    expect(blockOf('.astryx-context-menu:dir(ltr)')).toMatch(
      /padding-left:\s*6px/,
    );
    await themeEditUndo('p', {
      cwd,
      thing: 'padding-inline-start',
      on: 'context-menu',
    });
    await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'context-menu'});
  });
});

describe('parts35: one padding model', () => {
  /** @param {string} selector */
  const at = selector => read('p.css').indexOf(`${selector} {`);
  /** @param {string} selector */
  const ruleOf = selector => {
    const css = read('p.css');
    const i = css.indexOf(`${selector} {`);
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  };

  it('lets a variant padding out-rank a base physical side in both directions', async () => {
    await themeEditSet('p', 'padding-left', '20px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding', '8px', {
      cwd,
      on: 'card',
      when: 'variant:muted',
    });
    const muted = '.astryx-card[data-variant="muted"]';
    const variant = ruleOf(muted);
    for (const k of ['inline-start', 'inline-end', 'block-start', 'block-end'])
      expect(variant, k).toMatch(
        new RegExp(`--astryx-card-padding-${k}:\\s*8px`),
      );
    // Same weight as the base's direction rules, and after them.
    expect(at(muted)).toBeGreaterThan(at('.astryx-card:dir(rtl)'));
    await themeEditUndo('p', {
      cwd,
      thing: 'padding',
      on: 'card',
      when: 'variant:muted',
    });
    await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'card'});
  });

  it('puts the base before a variant set earlier, and its direction rules before a state', async () => {
    await themeEditSet('p', 'padding', '3px', {
      cwd,
      on: 'dropdown-menu',
      state: 'hover',
    });
    await themeEditSet('p', 'padding-inline-start', '9px', {
      cwd,
      on: 'dropdown-menu',
    });
    const css0 = read('p.css');
    expect(css0.indexOf('.astryx-dropdown-menu:dir(ltr) {')).toBeLessThan(
      css0.indexOf('.astryx-dropdown-menu:hover'),
    );
    await themeEditUndo('p', {
      cwd,
      thing: 'padding-inline-start',
      on: 'dropdown-menu',
    });
    await themeEditUndo('p', {
      cwd,
      thing: 'padding',
      on: 'dropdown-menu',
      state: 'hover',
    });
    await themeEditSet('p', 'padding', '8px', {
      cwd,
      on: 'card',
      when: 'variant:muted',
    });
    await themeEditSet('p', 'padding-inline-start', '9px', {cwd, on: 'card'});
    expect(at('.astryx-card[data-variant="muted"]')).toBeGreaterThan(
      at('.astryx-card'),
    );
    await themeEditUndo('p', {cwd, thing: 'padding-inline-start', on: 'card'});
    await themeEditUndo('p', {
      cwd,
      thing: 'padding',
      on: 'card',
      when: 'variant:muted',
    });
  });

  it('pads a clickable card as a card', async () => {
    await themeEditSet('p', 'padding', '7px', {cwd, on: 'clickable-card'});
    const rule = ruleOf('.astryx-clickable-card');
    expect(rule).toMatch(/--astryx-card-padding-inline-start:\s*7px/);
    expect(rule).not.toMatch(/(^|[;{\s])padding:\s*7px/);
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'clickable-card'});
  });

  it('refuses every chat composer padding (parts39), whatever its value', async () => {
    // The box reads its padding only from a variable of Core's own, which a
    // theme cannot set; a padding property would pad the wrapper.
    for (const value of ['4px', '4px 8px', 'var(--spacing-3)', 'max(4px, 1vw)'])
      expect(
        (
          await refusal(() =>
            themeEditSet('p', 'padding', value, {cwd, on: 'chat-composer'}),
          )
        ).code,
        value,
      ).toBe('ERR_THEME_NO_EFFECT');
  });
});

describe('parts36', () => {
  /** @param {string} selector */
  const ruleOf = selector => {
    const css = read('p.css');
    const i = css.indexOf(`${selector} {`);
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  };
  const SIDES = ['block-start', 'block-end', 'inline-start', 'inline-end'];

  it('resets a plain card inside a clickable card or a variant that sets its sides, never copying a value', async () => {
    // Custom properties inherit: a plain card nested in a padded clickable
    // card (or a default card in a muted one) gets each side reset on its
    // own class, so Core's own fallback holds; the card's base copies no
    // theme's value.
    for (const [on, when, narrow] of [
      ['clickable-card', undefined, '.astryx-clickable-card'],
      ['card', 'variant:muted', '.astryx-card[data-variant="muted"]'],
    ]) {
      await themeEditSet('p', 'padding', '7px', {
        cwd,
        on,
        ...(when ? {when} : {}),
      });
      const css = read('p.css');
      const reset = ruleOf(`.astryx-card:where(${narrow} *)`);
      for (const k of SIDES)
        expect(reset, `${on} ${k}`).toMatch(
          new RegExp(`--astryx-card-padding-${k}:\\s*initial`),
        );
      expect(ruleOf('.astryx-card')).not.toMatch(
        /--astryx-card-padding-block-start:/,
      );
      expect(ruleOf(narrow)).not.toMatch(/--astryx-card-padding:\s*7px/);
      expect(css.indexOf(`.astryx-card:where(${narrow} *)`)).toBeGreaterThan(
        -1,
      );
      await themeEditUndo('p', {
        cwd,
        thing: 'padding',
        on,
        ...(when ? {when} : {}),
      });
    }
  });

  it('takes one length where Core reads the padding inside calc(), on every such part', async () => {
    for (const [prop, on] of [
      ['padding', 'segmented-control'],
      ['padding', 'dropdown-menu'],
      ['padding-inline', 'item'],
    ])
      expect(
        (await refusal(() => themeEditSet('p', prop, '4px 8px', {cwd, on})))
          .code,
        `${prop} ${on}`,
      ).toBe('ERR_THEME_BAD_VALUE');
    const group = await refusal(() =>
      themeEditSet('p', 'padding', '0', {cwd, on: 'menus'}),
    );
    expect(group.code).toBe('ERR_THEME_BAD_VALUE');
    expect(group.run[0]).toMatch(/padding 0px --on menus$/);
    for (const value of [
      'var(--spacing-2)',
      'calc(var(--spacing-2) + 2px)',
      'max(4px, 1vw)',
    ]) {
      await themeEditSet('p', 'padding', value, {
        cwd,
        on: 'segmented-control',
      });
      await themeEditUndo('p', {
        cwd,
        thing: 'padding',
        on: 'segmented-control',
      });
    }
    const keeps = await refusal(() =>
      themeEditSet('p', 'padding', 'var(--spacing-2) var(--spacing-3)', {
        cwd,
        on: 'segmented-control',
      }),
    );
    expect(keeps.run[0]).toMatch(
      /padding 'var\(--spacing-2\)' --on segmented-control$/,
    );
  });

  it('takes a state padding on a card through the padding model', async () => {
    await themeEditSet('p', 'padding', '5px', {
      cwd,
      on: 'card',
      state: 'hover',
    });
    const css = read('p.css');
    expect(css).toMatch(
      /\.astryx-card:hover[^{]*\{[^}]*--astryx-card-padding-inline-start:\s*5px/,
    );
    await themeEditUndo('p', {
      cwd,
      thing: 'padding',
      on: 'card',
      state: 'hover',
    });
  });
});

describe('parts37', () => {
  /** @param {string} selector */
  const ruleOf = selector => {
    const css = read('p.css');
    const i = css.indexOf(`${selector} {`);
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  };

  it("writes a section padding as its whole padding, so a nested section keeps its parent's", async () => {
    await themeEditSet('p', 'padding', '20px', {cwd, on: 'section'});
    const rule = ruleOf('.astryx-section');
    expect(rule).toMatch(/--astryx-section-padding:\s*20px/);
    expect(rule).not.toMatch(/--astryx-section-padding-(block|inline)-/);
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'section'});
    // A hover-only padding writes the hover sides and resets nested
    // sections; the plain section's base gets nothing.
    await themeEditSet('p', 'padding', '20px', {
      cwd,
      on: 'section',
      state: 'hover',
    });
    expect(ruleOf('.astryx-section')).not.toMatch(/--astryx-section-padding/);
    await themeEditUndo('p', {
      cwd,
      thing: 'padding',
      on: 'section',
      state: 'hover',
    });
  });

  it('writes padding 0 as a length on every part Core reads it inside calc()', async () => {
    for (const on of ['card', 'section', 'dialog', 'drawer', 'bottom-sheet']) {
      await themeEditSet('p', 'padding', '0', {cwd, on});
      const rule = ruleOf(`.astryx-${on}`);
      expect(rule, on).toMatch(new RegExp(`--astryx-${on}-padding:\\s*0px`));
      expect(rule, on).not.toMatch(/:\s*0;/);
      await themeEditUndo('p', {cwd, thing: 'padding', on});
    }
  });

  it('refuses at the next set a hand edit that set would refuse', async () => {
    await themeEditNew('h37', {cwd});
    const file = path.join(cwd, 'themes', 'h37', 'h37.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings.push({
      thing: 'padding',
      value: '4px 8px',
      source: 'property',
      on: 'chat-composer',
    });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    const r = await refusal(() =>
      themeEditSet('h37', 'corners', 'pill', {cwd}),
    );
    expect(r.message).toContain('4px 8px');
    expect(r.run.join(' ')).toMatch(/undo h37 padding --on chat-composer/);
    fs.rmSync(path.join(cwd, 'themes', 'h37'), {recursive: true, force: true});
  });

  it('copies no padding onto the plain card for a clickable card hover padding', async () => {
    // A card padding from the user's own theme source (or a variant they
    // wrote) is not overridden: the plain card's base gets no padding
    // variable, only the reset for cards nested in a clickable card.
    await themeEditSet('p', 'padding', '5px', {
      cwd,
      on: 'clickable-card',
      state: 'hover',
    });
    expect(ruleOf('.astryx-card')).not.toMatch(/--astryx-card-padding/);
    expect(read('p.css')).toMatch(
      /\.astryx-card:where\(\.astryx-clickable-card:hover \*\)/,
    );
    await themeEditUndo('p', {
      cwd,
      thing: 'padding',
      on: 'clickable-card',
      state: 'hover',
    });
  });
});

describe('parts38', () => {
  /** @param {string} selector */
  const ruleOf = selector => {
    const css = read('p.css');
    const i = css.indexOf(`${selector} {`);
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
  };

  it("writes a card padding so Core lowers it with the base theme's: the later wins", async () => {
    // The base theme (neutral here, as every bundled theme) gives the card
    // padding var(--spacing-3); the editor's padding must replace it.
    await themeEditSet('p', 'padding', '20px', {cwd, on: 'card'});
    const rule = ruleOf('.astryx-card');
    expect(rule).toMatch(/--astryx-card-padding:\s*20px/);
    expect(rule).not.toMatch(/--astryx-card-padding:\s*var\(--spacing-3\)/);
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'card'});
  });

  it('lets a clickable card win over a card physical side in each direction', async () => {
    await themeEditSet('p', 'padding-left', '30px', {cwd, on: 'card'});
    await themeEditSet('p', 'padding', '7px', {cwd, on: 'clickable-card'});
    const css = read('p.css');
    for (const dir of ['ltr', 'rtl']) {
      const card = css.indexOf(`.astryx-card:dir(${dir}) {`);
      const clickable = css.indexOf(`.astryx-clickable-card:dir(${dir}) {`);
      expect(clickable, dir).toBeGreaterThan(card);
      expect(ruleOf(`.astryx-clickable-card:dir(${dir})`), dir).toMatch(
        /--astryx-card-padding-inline-start:\s*7px/,
      );
    }
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'clickable-card'});
    await themeEditUndo('p', {cwd, thing: 'padding-left', on: 'card'});
  });

  it('writes a zero with an exponent as 0px, and names the default initial means', async () => {
    await themeEditSet('p', 'padding', '0e0', {cwd, on: 'drawer'});
    expect(ruleOf('.astryx-drawer')).toMatch(/--astryx-drawer-padding:\s*0px/);
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'drawer'});
    const r = await themeEditSet('p', 'padding', 'initial', {cwd, on: 'card'});
    expect(r.data.notes.join(' ')).toMatch(
      /initial means card's own default padding from Core/,
    );
    await themeEditUndo('p', {cwd, thing: 'padding', on: 'card'});
  });

  it('refuses a hand-edited padding on another part when this command sets padding too', async () => {
    await themeEditNew('h38', {cwd});
    await themeEditSet('h38', 'padding', '3px', {cwd, on: 'segmented-control'});
    const file = path.join(cwd, 'themes', 'h38', 'h38.settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    data.settings[data.settings.length - 1].value = '2px 6px';
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    const r = await refusal(() =>
      themeEditSet('h38', 'padding', '4px', {cwd, on: 'card'}),
    );
    expect(r.message).toContain('2px 6px');
    fs.rmSync(path.join(cwd, 'themes', 'h38'), {recursive: true, force: true});
  });
});
