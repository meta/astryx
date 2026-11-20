// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditCreate`: traits become one complete theme file that the
 * app uses and that `theme check` finds clean. Thirteen looks (the seven
 * bundled themes and six others, each written as traits) become files
 * with every color token in light and dark; exact tokens and part styles
 * win; a one-look theme is pinned; the top bar paints itself and its text;
 * a written file is never written again; an unknown trait is refused.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {themeEditCreate} from '../theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../../test-utils/base-theme-fixture.mjs';
import {
  defineTheme,
  resolveThemeTokens,
  tokenDefaults,
} from '@astryxdesign/core/theme';

/** Each look, as a person would describe it in traits. */
const LOOKS = {
  neutral: {
    page: {light: '#f5f5f5', dark: '#1a1a1a'},
    accent: {light: '#1a1a1a', dark: '#f2f2f2'},
    font: {body: 'Figtree', size: 14},
    corners: 10,
  },
  stone: {
    page: {light: '#f3f1ee', dark: '#121110'},
    text: {light: '#2b2926', dark: '#efedea'},
    accent: {light: '#2b2926', dark: '#efedea'},
    font: {
      body: 'Figtree',
      heading: 'Montserrat',
      code: 'JetBrains Mono',
      size: 14,
    },
    corners: 8,
  },
  matcha: {
    page: {light: '#f3f5ee', dark: '#0f120d'},
    accent: {light: '#4a5d3a', dark: '#b5c99a'},
    font: {body: 'DM Sans', heading: 'Playwrite US Trad', size: 16},
    corners: 12,
    density: 'roomy',
  },
  y2k: {
    page: {light: '#cfe3ff', dark: '#0e0f14'},
    accent: {light: '#1f2433', dark: '#eef0f6'},
    font: {body: 'Poppins', size: 16},
    corners: 0,
    borders: {width: 2},
    shadows: 'strong',
  },
  gothic: {
    look: 'dark',
    page: '#1b1a1d',
    text: '#efedf2',
    accent: '#efedf2',
    font: {body: 'Fustat', code: 'JetBrains Mono', size: 16},
    corners: 8,
  },
  chocolate: {
    page: {light: '#fffcf7', dark: '#141010'},
    text: {light: '#4a3520', dark: '#ede4d4'},
    accent: {light: '#8c5927', dark: '#d4a06a'},
    font: {body: 'Albert Sans', heading: 'Fraunces', size: 14},
    corners: 10,
  },
  butter: {
    page: {light: '#f6f4ee', dark: '#1a1916'},
    accent: {light: '#d4a017', dark: '#fbe7a1'},
    font: {body: 'Outfit', size: 14},
    corners: 12,
    surfaces: 'raised',
  },
  'classic-blue-bar': {
    look: 'light',
    page: '#e9ebee',
    surface: '#ffffff',
    text: '#1d2129',
    accent: '#4267b2',
    bar: {background: '#3b5998', text: '#ffffff'},
    font: {body: 'Helvetica, Arial, sans-serif', size: 12},
    corners: 2,
    density: 'compact',
    borders: {color: '#dddfe2'},
    shadows: 'none',
    surfaces: 'outlined',
  },
  'plain-blue-buttons': {
    page: {light: '#ffffff', dark: '#212529'},
    text: {light: '#212529', dark: '#dee2e6'},
    accent: '#0d6efd',
    font: {body: 'system-ui', size: 16},
    corners: 6,
    borders: {color: {light: '#dee2e6', dark: '#495057'}},
  },
  'frosted-night': {
    look: 'dark',
    page: '#0b1020',
    surface: '#1a2238',
    accent: '#7dd3fc',
    font: {body: 'Inter'},
    corners: 16,
    shadows: 'soft',
    surfaces: 'raised',
  },
  'round-purple': {
    page: {light: '#faf7ff', dark: '#140f1f'},
    accent: '#8b5cf6',
    font: {body: 'Nunito', headingWeight: 800},
    corners: 'pill',
    density: 'roomy',
  },
  'green-terminal': {
    look: 'dark',
    page: '#000000',
    text: '#33ff66',
    accent: '#33ff66',
    font: {body: 'IBM Plex Mono', code: 'IBM Plex Mono', size: 14},
    corners: 0,
    borders: {color: '#1f7a3a'},
    shadows: 'none',
    surfaces: 'outlined',
  },
  'retro-desktop': {
    look: 'light',
    page: '#c0c0c0',
    surface: '#d4d0c8',
    text: '#000000',
    accent: '#000080',
    bar: {background: '#000080', text: '#ffffff'},
    font: {body: 'Tahoma, Verdana, sans-serif', size: 12},
    corners: 0,
    borders: {width: 2, color: '#808080'},
    shadows: 'none',
    surfaces: 'raised',
  },
};

/** Core's own value of each token, per mode. */
const CORE = ['light', 'dark'].map(mode =>
  resolveThemeTokens(defineTheme({name: 'core'}), {mode}),
);

const COLOR_TOKENS = Object.keys(tokenDefaults).filter(k =>
  k.startsWith('--color-'),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-create-traits-', FIXTURE_PACKAGES);
  fs.mkdirSync(path.join(cwd, 'src'));
  fs.writeFileSync(path.join(cwd, 'tsconfig.json'), '{}\n');
  // The app's entry, as a new app has it: it loads Core's stylesheet.
  fs.writeFileSync(
    path.join(cwd, 'src/main.tsx'),
    "import '@astryxdesign/core/astryx.css';\n",
  );
});

afterAll(() => removeLinkedFixture(cwd));

/** @param {string} file */
const read = file => fs.readFileSync(path.join(cwd, file), 'utf8');

/**
 * A color token's value in one mode (0 light, 1 dark).
 * @param {string} source
 * @param {string} token
 * @param {number} i
 */
function at(source, token, i) {
  const v = written(source, token);
  if (!v) throw new Error(`${token} is not written`);
  return v[Math.min(i, v.length - 1)];
}

/** @param {string} hex @returns {[number, number, number, number]} */
function rgba(hex) {
  const h = hex.replace('#', '');
  const n = h.length <= 4 ? [...h].map(c => c + c).join('') : h;
  const a = n.length === 8 ? Number.parseInt(n.slice(6, 8), 16) / 255 : 1;
  return [0, 2, 4].map(k => Number.parseInt(n.slice(k, k + 2), 16)).concat(a);
}

/** @param {string} hex */
const solid = hex => rgba(hex).slice(0, 3);

/**
 * A see-through color laid over a solid one, rounded to whole channels.
 * @param {string} hex
 * @param {number[]} under
 */
function over(hex, under) {
  const [r, g, b, a] = rgba(hex);
  return [r, g, b].map((c, k) => Math.round(c * a + under[k] * (1 - a)));
}

/**
 * The value the theme file gives a token: `[light, dark]`, or null.
 * @param {string} source
 * @param {string} token
 * @returns {[string, string] | null}
 */
function written(source, token) {
  const escaped = token.replace(/[-]/g, '\\-');
  const pair = source.match(
    new RegExp(`'${escaped}': \\['([^']*)', '([^']*)'\\]`),
  );
  if (pair) return [pair[1], pair[2]];
  const one = source.match(new RegExp(`'${escaped}': '([^']*)'`));
  return one ? [one[1], one[1]] : null;
}

/**
 * A part's base style in the theme file, as text.
 * @param {string} part
 * @param {string} body
 */
const partBase = (part, body) =>
  new RegExp(`'?${part}'?: \\{\\n\\s+base: \\{(\\n\\s+.*)*?\\n\\s+${body}`);

describe('thirteen looks become complete files that check clean', () => {
  for (const [look, traits] of Object.entries(LOOKS))
    it(
      look,
      async () => {
        // A bundled theme's name is refused, so each look gets its own.
        const name = `${look}-look`;
        const r = await themeEditCreate(name, JSON.stringify(traits), {cwd});
        expect(r.type).toBe('themeEdit.create');
        const source = read(r.data.file);
        // Every color token is written with a light and a dark value.
        for (const token of COLOR_TOKENS) {
          const v = written(source, token);
          expect(v, `${name}: ${token}`).not.toBeNull();
          expect(v?.[0], `${name}: ${token} light`).toBeTruthy();
          expect(v?.[1], `${name}: ${token} dark`).toBeTruthy();
        }
        // Shape, type and space are written as values too.
        for (const token of [
          '--radius-element',
          '--spacing-4',
          '--font-size-base',
          '--font-family-body',
        ])
          expect(written(source, token), `${name}: ${token}`).not.toBeNull();
        expect(source.split('\n')[0]).toMatch(/This theme file is yours/);
        expect(source).toMatch(/Edit any line, then run/);
        expect(r.data.check.problems, name).toEqual([]);
        // Clean only counts when the check measured the text.
        expect(r.data.check.unmeasured, name).toBeUndefined();
        expect(r.data.check.protectedFiles, name).toEqual([]);
        // The chart colors grow from the theme's own: no charts problem, and
        // next to none of them is Core's own value.
        expect(
          r.data.check.problems.some(p => p.kind === 'charts'),
          name,
        ).toBe(false);
        const data = COLOR_TOKENS.filter(t => t.startsWith('--color-data-'));
        const copied = data.filter(t =>
          [0, 1].every(
            i =>
              String(written(read(r.data.file), t)?.[i] ?? '').toLowerCase() ===
              String(CORE[i][t]).toLowerCase(),
          ),
        );
        expect(copied.length, `${name}: ${copied.join(', ')}`).toBeLessThan(
          data.length / 10,
        );
        // A secondary button's hover shows over its rest fill in each mode.
        const final = read(r.data.file);
        for (const [i, mode] of /** @type {const} */ ([
          'light',
          'dark',
        ]).entries()) {
          if (r.data.look !== 'both' && r.data.look !== mode) continue;
          const page = solid(at(final, '--color-background-body', i));
          const rest = over(at(final, '--color-neutral', i), page);
          const hover = over(at(final, '--color-overlay-hover', i), rest);
          expect(hover, `${name} ${mode}`).not.toEqual(rest);
        }
        expect(fs.existsSync(path.join(cwd, r.data.built ?? ''))).toBe(true);
        expect(read(r.data.module)).toContain(
          `defaultThemeSlug: keyof typeof themes = "${name}"`,
        );
      },
      120_000,
    );
});

describe('what the traits give lands in the file', () => {
  it('writes the page, text and accent the traits give, each in its mode', async () => {
    const r = await themeEditCreate(
      'given',
      {
        page: '#f7f5f0',
        accent: '#c2410c',
        text: {light: '#222222', dark: '#eeeeee'},
      },
      {cwd},
    );
    const source = read(r.data.file);
    expect(written(source, '--color-background-body')?.[0]).toBe('#f7f5f0');
    expect(written(source, '--color-text-primary')).toEqual([
      '#222222',
      '#eeeeee',
    ]);
    expect(written(source, '--color-accent')?.[0]).toBe('#c2410c');
  }, 120_000);

  it('puts Core radius steps from the corners, and a pill on buttons and fields', async () => {
    const sharp = read(
      (await themeEditCreate('sharp', {corners: 0}, {cwd})).data.file,
    );
    expect(written(sharp, '--radius-element')?.[0]).toBe('0px');
    expect(written(sharp, '--radius-container')?.[0]).toBe('0px');
    const six = read(
      (await themeEditCreate('six', {corners: 6}, {cwd})).data.file,
    );
    expect(written(six, '--radius-element')?.[0]).toBe('6px');
    expect(written(six, '--radius-container')?.[0]).toBe('9px');
    const pill = read(
      (await themeEditCreate('pill', {corners: 'pill'}, {cwd})).data.file,
    );
    expect(written(pill, '--radius-element')?.[0]).toBe('9999px');
  }, 120_000);

  it('accepts traits with only an accent', async () => {
    const r = await themeEditCreate('only-accent', {accent: '#7c3aed'}, {cwd});
    expect(written(read(r.data.file), '--color-accent')?.[0]).toBe('#7c3aed');
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);
});

describe('exact tokens and components win', () => {
  it('keeps an exact token and part style over the traits', async () => {
    const r = await themeEditCreate(
      'exact',
      {
        accent: '#c2410c',
        corners: 4,
        tokens: {
          '--color-accent': ['#123456', '#abcdef'],
          '--radius-element': '3px',
        },
        components: {button: {base: {letterSpacing: '0.04em'}}},
      },
      {cwd},
    );
    const source = read(r.data.file);
    expect(written(source, '--color-accent')).toEqual(['#123456', '#abcdef']);
    expect(written(source, '--radius-element')?.[0]).toBe('3px');
    expect(source).toMatch(partBase('button', "letterSpacing: '0\\.04em',"));
    expect(r.data.parts).toContain('button');
  }, 120_000);
});

describe('the surfaces trait', () => {
  it('writes one style for the groups it reaches, which every member names', async () => {
    const r = await themeEditCreate(
      'outlined',
      {page: '#ffffff', surfaces: 'outlined'},
      {cwd},
    );
    const source = read(r.data.file);
    expect(source.match(/^const surfaces = \{$/gm)).toHaveLength(1);
    // Parts the surfaces dial reaches.
    for (const part of ['card', 'dialog', 'dropdown-menu'])
      expect(source).toMatch(
        new RegExp(
          `'?${part}'?: \\{\\n\\s+base: \\{\\.\\.\\.(surfaces|floatingSurfaces)\\},`,
        ),
      );
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);
});

describe('flat surfaces', () => {
  it('reads clean with a flat look on a light page', async () => {
    for (const page of ['#ffffff', '#f7f5f0']) {
      const r = await themeEditCreate(
        `flat-${page.slice(1)}`,
        {page, surfaces: 'flat'},
        {cwd},
      );
      expect(r.data.check.problems, page).toEqual([]);
    }
  }, 240_000);
});

describe('a bar in the page color with its own text', () => {
  it('paints the bar with that text', async () => {
    const r = await themeEditCreate(
      'orangetext',
      {page: '#ffffff', bar: {background: '#ffffff', text: '#c2410c'}},
      {cwd},
    );
    const bar =
      /'app-shell-header': \{[\s\S]*?\n {4}\},/.exec(read(r.data.file))?.[0] ??
      '';
    expect(bar).toContain("'--color-text-primary': 'light-dark(#c2410c,");
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);
});

describe('a theme folder of the app by that name', () => {
  it('is refused whatever its files are called, and nothing is written', async () => {
    const dir = path.join(cwd, 'src/themes/jsbrand');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'jsbrandTheme.js'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nexport const jsbrandTheme = defineTheme({name: 'jsbrand'});\n",
    );
    fs.writeFileSync(
      path.join(dir, 'jsbrandTheme.doc.mjs'),
      "export const doc = {type: 'theme', name: 'jsbrand', displayName: 'JS brand', description: 'A theme.'};\n",
    );
    const before = fs.readdirSync(dir).sort();
    await expect(
      themeEditCreate('jsbrand', {accent: '#c2410c'}, {cwd}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(fs.readdirSync(dir).sort()).toEqual(before);
    // The app's other themes are discovered next to it: this one goes.
    fs.rmSync(dir, {recursive: true});
  });
});

describe('a light bar in a dark look', () => {
  it('takes its dark counterpart, and notes a bar text it had to move', async () => {
    const r = await themeEditCreate(
      'darkamber',
      {
        look: 'dark',
        page: '#101014',
        bar: {background: '#f59e0b', text: '#ffffff'},
      },
      {cwd},
    );
    const bar =
      /'app-shell-header': \{[\s\S]*?\n {4}\},/.exec(read(r.data.file))?.[0] ??
      '';
    expect(bar).not.toMatch(/backgroundColor: '#f59e0b'/);
    // White on the amber reads 2.15:1 in light: the hue kept, the
    // lightness moved, and said.
    expect(r.data.notes.join('\n')).toMatch(/The bar's text #ffffff reads/);
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);
});

describe('no shadows', () => {
  it('keeps the shadows none after the check, with an edge on every menu', async () => {
    const r = await themeEditCreate(
      'unshadowed',
      {page: '#ffffff', surface: '#ffffff', shadows: 'none'},
      {cwd},
    );
    const source = read(r.data.file);
    expect(written(source, '--shadow-low')?.[0]).toBe('none');
    expect(written(source, '--shadow-med')?.[0]).toBe('none');
    expect(source).toMatch(
      /'dropdown-menu': \{\n\s+base: \{\.\.\.floatingSurfaces\},/,
    );
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);

  it('keeps an edge on the panels that float, so menus stand off the page', async () => {
    const r = await themeEditCreate(
      'edged',
      {
        page: '#c0c0c0',
        surface: '#d4d0c8',
        shadows: 'none',
        surfaces: 'raised',
      },
      {cwd},
    );
    const source = read(r.data.file);
    const floating = /const floatingSurfaces = \{[^}]*\}/.exec(source)?.[0];
    expect(floating).toContain("borderStyle: 'solid'");
    expect(source).toMatch(
      /'dropdown-menu': \{\n\s+base: \{\.\.\.floatingSurfaces\},/,
    );
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);
});

describe('exact values', () => {
  it('writes an exact motion token, and a value with a line break stays one string', async () => {
    const r = await themeEditCreate(
      'motion',
      {
        accent: '#c2410c',
        tokens: {'--duration-fast': '50ms'},
        components: {button: {base: {fontFamily: 'Inter,\nsans-serif'}}},
      },
      {cwd},
    );
    const source = read(r.data.file);
    expect(written(source, '--duration-fast')?.[0]).toBe('50ms');
    expect(source).toContain("fontFamily: 'Inter,\\nsans-serif'");
    expect(r.data.built).not.toBeNull();
  }, 120_000);

  it('writes each font with the fallbacks of its kind, and says how to load it', async () => {
    const r = await themeEditCreate(
      'fonted',
      {
        accent: '#c2410c',
        font: {body: 'Figtree', heading: 'Lora Serif', code: 'JetBrains Mono'},
      },
      {cwd},
    );
    const source = read(r.data.file);
    expect(written(source, '--font-family-body')?.[0]).toBe(
      'Figtree, system-ui, sans-serif',
    );
    expect(written(source, '--font-family-heading')?.[0]).toMatch(
      /Georgia, serif$/,
    );
    expect(written(source, '--font-family-code')?.[0]).toMatch(
      /ui-monospace, monospace$/,
    );
    expect(r.data.notes.join('\n')).toMatch(
      /Figtree is not loaded yet: install @fontsource\/figtree/,
    );
  }, 120_000);
});

describe('one look', () => {
  it('pins the app to the look and keeps both halves of every color', async () => {
    const r = await themeEditCreate(
      'night',
      {look: 'dark', page: '#101014', accent: '#38bdf8'},
      {cwd},
    );
    const source = read(r.data.file);
    expect(source).toContain("export const colorModes = ['dark'];");
    expect(written(source, '--color-background-body')?.[1]).toBe('#101014');
    expect(read(r.data.module)).toMatch(/"night": "dark"/);
  }, 120_000);
});

describe('the top bar', () => {
  /**
   * The top bar's style in the theme file, as text.
   * @param {string} source
   */
  const barStyle = source => {
    const at = source.indexOf("'app-shell-header': {");
    return source.slice(at, source.indexOf('\n    },', at));
  };

  it('gives a bar in the page color the surface in the other mode, and the theme text', async () => {
    const r = await themeEditCreate(
      'groundbar',
      {
        look: 'light',
        page: '#ffffff',
        surface: '#ffffff',
        text: '#0a2540',
        accent: '#5b51f5',
        bar: {background: '#ffffff', text: '#0a2540'},
      },
      {cwd},
    );
    const bar = barStyle(read(r.data.file));
    expect(bar).toContain(
      "backgroundColor: 'light-dark(#ffffff, var(--color-background-surface))'",
    );
    expect(bar).not.toContain('--color-text-primary');
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);

  it('paints the bar and gives everything on it the bar text', async () => {
    const r = await themeEditCreate(
      'barred',
      {page: '#ffffff', bar: {background: '#1e3a8a', text: '#ffffff'}},
      {cwd},
    );
    const bar = barStyle(read(r.data.file));
    expect(bar).toContain("backgroundColor: '#1e3a8a'");
    expect(bar).toContain("color: '#ffffff'");
    for (const token of ['--color-text-primary', '--color-icon-primary'])
      expect(bar).toContain(`'${token}': '#ffffff'`);
    // The quieter text on the bar reads there, a step short of its own
    // text, so a nav item's hover (to the primary text) still shows; the
    // pointer tints and the nav item's track take the bar's white.
    const quiet = /'--color-text-secondary': '(#[0-9a-f]{6})'/i.exec(bar)?.[1];
    expect(quiet).toBeDefined();
    expect(quiet?.toLowerCase()).not.toBe('#ffffff');
    for (const token of [
      '--color-overlay-hover',
      '--color-overlay-pressed',
      '--color-neutral',
    ])
      expect(bar).toMatch(new RegExp(`'${token}': '#ffffff[0-9a-f]{2}'`));
    // The theme's own text tokens stay the theme's: menus, fields and
    // buttons with a fill of their own keep reading them.
    expect(written(read(r.data.file), '--color-text-primary')?.[0]).not.toBe(
      '#ffffff',
    );
    expect(r.data.check.problems).toEqual([]);
  }, 120_000);

  it('keeps a hand-edited file, and reaches the bar again from new traits in a fresh file', async () => {
    const first = await themeEditCreate(
      'rebar',
      {page: '#ffffff', bar: {background: '#1e3a8a', text: '#ffffff'}},
      {cwd},
    );
    // The file is the person's: a second run with the name writes nothing.
    const edited = `${read(first.data.file)}// my edit\n`;
    fs.writeFileSync(path.join(cwd, first.data.file), edited);
    await expect(
      themeEditCreate('rebar', {page: '#ffffff', corners: 12}, {cwd}),
    ).rejects.toMatchObject({
      code: 'ERR_FILE_EXISTS',
      message: expect.stringContaining('Edit the file, then run'),
    });
    expect(read(first.data.file)).toBe(edited);
    fs.rmSync(path.join(cwd, 'src/themes/rebar'), {recursive: true});
    const again = await themeEditCreate(
      'rebar',
      {
        page: '#ffffff',
        corners: 12,
        bar: {background: '#f59e0b', text: '#111111'},
      },
      {cwd},
    );
    const source = read(again.data.file);
    const bar = barStyle(source);
    // In dark, the amber takes its own darker counterpart, with text that
    // reads on it.
    expect(bar).toMatch(
      /backgroundColor: 'light-dark\(#f59e0b, #[0-9a-f]{6}\)'/i,
    );
    expect(bar).toMatch(
      /'--color-text-primary': 'light-dark\(#111111, #[0-9a-f]{6}\)'/i,
    );
    expect(bar).not.toContain('#1e3a8a');
    expect(written(source, '--radius-element')?.[0]).toBe('12px');
    expect(again.data.check.problems).toEqual([]);
  }, 120_000);
});

describe('refusals', () => {
  it('refuses an unknown trait with the list of fields, and writes nothing', async () => {
    await expect(
      themeEditCreate(
        'unknown-field',
        {accent: '#c2410c', glow: 'lots'},
        {cwd},
      ),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringMatching(
        /Unknown trait field: "glow"\. Traits take: look, page, surface, text, accent, bar, font, corners, density, borders, shadows, surfaces, tokens, components/,
      ),
    });
    expect(fs.existsSync(path.join(cwd, 'src/themes/unknown-field'))).toBe(
      false,
    );
  });

  it('refuses a value a field does not take', async () => {
    await expect(
      themeEditCreate('bad', {accent: 'orange'}, {cwd}),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringContaining('"accent" is "orange"'),
    });
    await expect(
      themeEditCreate('bad', {density: 'airy'}, {cwd}),
    ).rejects.toMatchObject({
      message: expect.stringContaining('"compact" | "normal" | "roomy"'),
    });
    await expect(
      themeEditCreate('bad', '{"accent": ', {cwd}),
    ).rejects.toMatchObject({
      message: expect.stringContaining('--traits is not valid JSON'),
    });
  });

  it('refuses a token or part this Core does not have, a bad name and a bundled name', async () => {
    for (const [name, traits, words] of /** @type {const} */ ([
      [
        'no-token',
        {tokens: {'--color-nope': '#000000'}},
        '"tokens.--color-nope" is no token',
      ],
      [
        'no-part',
        {components: {'nope-part': {base: {color: 'red'}}}},
        '"components.nope-part" is no part',
      ],
      ['Bad Name', {accent: '#c2410c'}, 'cannot name a theme'],
      ['neutral', {accent: '#c2410c'}, "bundled theme's name"],
    ]))
      await expect(themeEditCreate(name, traits, {cwd})).rejects.toMatchObject({
        code: 'ERR_INVALID_ARGUMENT',
        message: expect.stringContaining(words),
      });
    expect(fs.existsSync(path.join(cwd, 'src/themes/no-token'))).toBe(false);
  });

  it('refuses a light and a dark value on a token that is neither a color nor a shadow', async () => {
    await expect(
      themeEditCreate(
        'paired',
        {tokens: {'--radius-element': ['4px', '8px']}},
        {cwd},
      ),
    ).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
      message: expect.stringContaining('takes one value'),
    });
  });

  it('keeps a line separator in the traits inside the header comment', async () => {
    const r = await themeEditCreate(
      'separated',
      {accent: '#c2410c', font: {body: 'Inter\u2028Display'}},
      {cwd},
    );
    const header = read(r.data.file).split('\n')[1];
    expect(header).toContain('Inter\\u2028Display');
    expect(header).not.toContain('\u2028');
  }, 120_000);

  it('refuses the name of a theme the editor made', async () => {
    fs.mkdirSync(path.join(cwd, 'themes', 'edited'), {recursive: true});
    await expect(
      themeEditCreate('edited', {accent: '#c2410c'}, {cwd}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(fs.existsSync(path.join(cwd, 'src/themes/edited'))).toBe(false);
  });

  it('writes nothing through a theme folder that leads out of the app', async () => {
    const outside = fs.mkdtempSync(path.join(path.dirname(cwd), 'outside-'));
    fs.mkdirSync(path.join(cwd, 'src/themes'), {recursive: true});
    fs.symlinkSync(outside, path.join(cwd, 'src/themes/linked'), 'dir');
    await expect(
      themeEditCreate('linked', {accent: '#c2410c'}, {cwd}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('never replaces a theme file of its own', async () => {
    const dir = path.join(cwd, 'src/themes/mine');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'mineTheme.ts'), '// my own theme\n');
    await expect(
      themeEditCreate('mine', {accent: '#c2410c'}, {cwd}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(fs.readFileSync(path.join(dir, 'mineTheme.ts'), 'utf8')).toBe(
      '// my own theme\n',
    );
  });
});
