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

// The page renders cost seconds and these tests read settings, builds and
// files: a stand-in renders unless a test asks for the real thing.
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

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

  it('writes one mode for a one-mode theme and keeps the author fields the dials do not own', () => {
    const light = plan([{thing: 'accent', value: '#60a5fa'}], {
      mode: 'light-only',
    });
    expect(light.config.modeStrategy).toBe('light-only');
    expect(
      Object.keys(/** @type {any} */ (light.candidate.palette.accent)),
    ).not.toContain('dark');
    expect(light.pal.tokens['--color-accent'].dark).toEqual(
      light.pal.tokens['--color-accent'].light,
    );
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
          darkChromaTaper: {edgeMultiplier: 0.5},
          neutralProfile: 'warm-v1',
          families: [],
        },
      },
    );
    const notes = pal.notes.join(' ');
    expect(notes).toContain('does not read darkChromaTaper');
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
      expect(r.run[0], thing).toBe(
        `astryx experimental theme editor set p ${rest}`,
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
    for (const v of ['system-ui', 'Arial', '"Segoe UI"', 'serif, sans-serif']) {
      const r = await themeEditSet('p', 'font', v, {cwd});
      expect(r.data.notes.join(' '), v).not.toContain('is not a system font');
    }
    const source = read('p.settings.ts');
    expect(source).not.toMatch(/system-ui, system-ui/);
    await themeEditUndo('p', {cwd, thing: 'font'});
  });
});
