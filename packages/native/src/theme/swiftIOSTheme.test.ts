// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  CORE_DEFAULTS,
  SWIFT_THEME_DIR,
  SWIFT_TOKENS_FILE,
  defineTheme,
  localTokensLeftOut,
  publishedThemePackages,
  renderAll,
  renderSwiftTheme,
  swiftMember,
  swiftThemeName,
  toColor,
  toFamilies,
  toLeading,
  toPoints,
  renderTokenTypes,
  toShadow,
  toWeight,
  tokenSurface,
  valueForMode,
} from '../../scripts/swift-ios-theme.mjs';

// Imports a theme package's TypeScript source through Vitest.
const load = (file: string) => import(/* @vite-ignore */ file);
const REGENERATE = 'pnpm -F @astryxdesign/native generate:swift-ios';

describe('swift theme generator: names (G6)', () => {
  it('maps every token group to one Swift member', () => {
    const cases = {
      '--color-text-primary': 'color.textPrimary',
      '--color-data-blue-1': 'color.dataBlue1',
      '--spacing-4': 'space.s4',
      '--spacing-0-5': 'space.s0_5',
      '--radius-element': 'radius.element',
      '--size-element-md': 'size.elementMd',
      '--border-width': 'size.borderWidth',
      '--font-size-2xl': 'font.size.s2xl',
      '--font-size-base': 'font.size.base',
      '--font-weight-semibold': 'font.weight.semibold',
      '--font-family-body': 'font.family.body',
      '--text-body-size': 'font.body.size',
      '--text-heading-1-weight': 'font.heading1.weight',
      '--text-display-1-leading': 'font.display1.leading',
      '--text-code-leading': 'font.code.leading',
      '--shadow-low': 'shadow.low',
      '--shadow-high': 'shadow.high',
    };
    for (const [token, expected] of Object.entries(cases)) {
      const mapped = swiftMember(token);
      expect(mapped && `${mapped.group}.${mapped.member}`, token).toBe(
        expected,
      );
    }
  });

  it('fails when two tokens become one member, naming both', () => {
    expect(() =>
      tokenSurface({
        '--color-a-1': {group: 'color', member: 'a1'},
        '--color-a1': {group: 'color', member: 'a1'},
      }),
    ).toThrow(/--color-a-1 and --color-a1 both become color.a1/);
  });

  it('groups font tokens by type style and scale', () => {
    const swift = renderTokenTypes(
      tokenSurface({
        '--text-body-size': {group: 'font', member: 'body.size'},
        '--text-body-weight': {group: 'font', member: 'body.weight'},
        '--text-body-leading': {group: 'font', member: 'body.leading'},
        '--font-family-body': {group: 'font', member: 'family.body'},
        '--font-size-2xl': {group: 'font', member: 'size.s2xl'},
        '--font-weight-bold': {group: 'font', member: 'weight.bold'},
      }),
    );
    expect(swift).toContain('public var body: TypeStyleTokens');
    expect(swift).toContain('public var family: FontFamilyTokens');
    expect(swift).toContain('public struct TypeStyleTokens');
    expect(swift).toContain('public var s2xl: CGFloat');
    expect(swift).toContain('case "text-body-size": body.size');
    expect(swift).toContain('case "font-family-body": family.body');
  });

  it('fails a type style that is missing a part, naming the style', () => {
    expect(() =>
      renderTokenTypes(
        tokenSurface({
          '--text-body-size': {group: 'font', member: 'body.size'},
          '--text-body-weight': {group: 'font', member: 'body.weight'},
        }),
      ),
    ).toThrow(/type style body needs a size, weight and leading/);
  });

  it('names themes as the spec says', () => {
    expect(swiftThemeName('astryx')).toBe('default');
    expect(swiftThemeName('astryx-neutral')).toBe('neutral');
    expect(swiftThemeName('neutral')).toBe('neutral');
    expect(swiftThemeName('acme-brand')).toBe('acmeBrand');
    expect(() => swiftThemeName('2fast')).toThrow(/no valid Swift name/);
    expect(() => swiftThemeName('class')).toThrow(/no valid Swift name/);
  });
});

// Every row is exact to the 8-bit channel (tolerance 0 of 255). The lab(),
// lch(), oklab(), and oklch() rows are CSS Color 4's own examples of #7D2329
// and #C65D06; the rest agree with an independent CSS Color 4 implementation.
// Outside Display P3, each channel clips, as Chromium 154 draws it.
const P3_CLIPPED = 'outside Display P3; clipped to match the web';
const COLORS: [css: string, swift: string, note?: string][] = [
  ['#0064E0', '#0064E0FF'],
  ['#abc8', '#AABBCC88'],
  ['rebeccapurple', '#663399FF'],
  ['transparent', '#00000000'],
  ['rgba(5, 54, 89, 0.1)', '#0536591A'],
  ['rgb(10% 20% 30% / 50%)', '#1A334D80'],
  ['rgb(none 0 0)', '#000000FF'],
  ['rgb(calc(255 / 2) 0 0)', '#800000FF'],
  ['hsl(210 100% 50%)', '#0080FFFF'],
  ['hsla(120, 100%, 25%, 0.5)', '#00800080'],
  ['hsl(0.5turn 50% 50%)', '#40BFBFFF'],
  ['hsl(200grad 50% 50%)', '#40BFBFFF'],
  ['hsl(3.14159rad 50% 50%)', '#40BFBFFF'],
  ['hwb(194 0% 0% / .5)', '#00C4FF80'],
  ['hwb(0 60% 60%)', '#808080FF'],
  ['lab(29.2345% 39.3825 20.0664)', '#7D2329FF'],
  ['lch(52.2345% 72.2 56.2)', '#C65D06FF'],
  ['oklab(40.101% 0.1147 0.0453)', '#7D2329FF'],
  ['oklch(40.101% 0.12332 21.555)', '#7D2329FF'],
  ['oklch(0 0 0 / 5%)', '#0000000D'],
  ['oklch(50% 0 0)', '#636363FF'],
  ['color(srgb 0.5 0.2 0.1)', '#80331AFF'],
  ['color(srgb-linear 0.5 0.2 0.1)', '#BC7C59FF'],
  ['color(display-p3 0.4 0.6 0.2)', '#559B17FF'],
  ['color(a98-rgb 0.4 0.6 0.2)', '#439A22FF'],
  ['color(prophoto-rgb 0.4 0.6 0.2)', '#52B204FF'],
  // rec2020 decodes with the BT.2020 curve, as Chromium 154 draws it.
  ['color(rec2020 0.4 0.6 0.2)', '#4AA829FF'],
  ['color(rec2020 0.5 0.5 0.5)', '#8B8B8BFF'],
  ['color(xyz-d65 0.2 0.3 0.4)', 'display-p3 #44A4A3FF'],
  ['color(xyz-d50 0.2 0.3 0.4)', 'display-p3 #2CA5BAFF'],
  ['color(display-p3 1 0 0)', 'display-p3 #FF0000FF'],
  ['color-mix(in srgb, red, blue)', '#800080FF'],
  ['color-mix(in srgb, red 30%, blue)', '#4D00B3FF'],
  ['color-mix(in srgb, red 20%, blue 20%)', '#80008066'],
  ['color-mix(in srgb, rgb(255 0 0 / .5), blue)', '#5500AABF'],
  ['color-mix(in srgb, rgb(none 50 0), rgb(10 200 0))', '#0A7D00FF'],
  ['color-mix(in srgb-linear, red, blue)', '#BC00BCFF'],
  ['color-mix(in xyz, red, blue)', '#BC00BCFF'],
  ['color-mix(in display-p3, red, blue)', '#800A91FF'],
  ['color-mix(in oklab, red, blue)', '#8C53A2FF'],
  ['color-mix(red, blue)', '#8C53A2FF'],
  ['color-mix(in lab, red, blue)', 'display-p3 #B01185FF'],
  ['color-mix(in hsl, red, blue)', '#FF00FFFF'],
  ['color-mix(in oklch, red, blue)', 'display-p3 #AA00BBFF', P3_CLIPPED],
  [
    'color-mix(in oklch longer hue, red, blue)',
    'display-p3 #009000FF',
    P3_CLIPPED,
  ],
  ['rgb(from #123456 calc(r + 10) g b)', '#1C3456FF'],
  ['rgb(from red r g b / 50%)', '#FF000080'],
  ['hsl(from blue calc(h + 180) s l)', '#FFFF00FF'],
  ['oklch(0.7 0.4 150)', 'display-p3 #00D100FF', P3_CLIPPED],
  ['oklch(0.9 0.4 300)', 'display-p3 #FB7CFFFF', P3_CLIPPED],
  // A relative color keeps its origin's gamut instead of clamping to sRGB.
  ['rgb(from color(display-p3 1 0 0) r g b / 50%)', 'display-p3 #FF000080'],
  ['hwb(from color(display-p3 1 0 0) h w b)', 'display-p3 #FF0000FF'],
  // A missing alpha takes the other color's before premultiplying.
  ['color-mix(in srgb, rgb(255 0 0 / none), rgb(0 0 255 / 0.5))', '#80008080'],
  ['color-mix(in srgb, rgb(255 0 0 / none), rgb(0 0 255 / none))', '#80008000'],
  // A missing blue is not Lab's b: only analogous channels carry over.
  ['color-mix(in lab, rgb(0 0 none), lab(50 20 30))', '#4F3525FF'],
  // HSL lightness is analogous to Lab's, so a missing one carries over.
  ['color-mix(in lab, hsl(0 50% none), lab(50 20 30))', '#8E705EFF'],
  // hsl() saturation clamps at 100% in both syntaxes, as browsers read it.
  ['hsl(120, 200%, 40%)', '#00CC00FF'],
  ['hsl(120 200% 40%)', '#00CC00FF'],
  // Hues are taken modulo 360° before interpolating (400° is 40°).
  ['color-mix(in oklch, oklch(0.6 0.1 400), oklch(0.6 0.1 20))', '#B4685CFF'],
];

describe('swift theme generator: values (G7)', () => {
  it.each(COLORS)('reads the color %s as %s', (css, swift, note) => {
    const notes: string[] = [];
    expect(toColor(css, notes)).toBe(swift);
    expect(notes).toEqual(note ? [note] : []);
  });

  it('reads lengths, weights, and line heights', () => {
    const lengths: [string, number][] = [
      ['0.875rem', 14],
      ['32px', 32],
      ['12pt', 16],
      ['1in', 96],
      ['0', 0],
      ['calc(1rem + 2px)', 18],
      ['calc((1rem - 2px) * 2)', 28],
      ['max(4px, 0.5rem)', 8],
      ['clamp(2px, 1rem, 12px)', 12],
    ];
    for (const [css, points] of lengths) {
      expect(toPoints(css), css).toBe(points);
    }
    // thin, medium, and thick are lengths only for a border width.
    expect(toPoints('thin', [], {borderWidth: true})).toBe(1);
    expect(toPoints('medium', [], {borderWidth: true})).toBe(3);
    expect(() => toPoints('medium')).toThrow(/names a border width/);
    const notes: string[] = [];
    expect(toPoints('1.5em', notes)).toBe(24);
    expect(notes).toEqual(['em read against the 16px root font size']);
    expect(toWeight('bold')).toBe(700);
    expect(toWeight('normal')).toBe(400);
    expect(toWeight('650')).toBe(650);
    expect(toWeight('bolder', notes)).toBe(700);
    expect(toLeading('1.5', 14)).toBe(1.5);
    expect(toLeading('150%', 14)).toBe(1.5);
    expect(toLeading('21px', 14)).toBe(1.5);
    // An em counts against the style's own size, not the 16-point root.
    expect(toLeading('1.5em', 14)).toBe(1.5);
    expect(toLeading('calc(1em + 7px)', 14)).toBe(1.5);
    expect(toLeading('normal', 14, notes)).toBe(1.2);
    expect(notes.slice(1)).toEqual([
      "bolder read against normal (400), the root's inherited weight",
      'normal depends on the font; read as 1.2',
    ]);
    expect(toFamilies('"Figtree", -apple-system, sans-serif')).toEqual([
      'Figtree',
      '-apple-system',
      'sans-serif',
    ]);
    expect(toFamilies('var(--font-family-body)')).toBeNull();
  });

  it('fails on a value with no static form, saying why', () => {
    const cases: [() => unknown, RegExp][] = [
      [() => toColor('currentColor'), /currentColor depends on where/],
      [() => toColor('Canvas'), /system color/],
      [() => toColor('var(--brand)'), /var\(--brand\) is not a token/],
      [() => toColor('color(--custom 1 0 0)'), /not a color space/],
      [() => toPoints('50%'), /percentage depends on the box/],
      [() => toPoints('10vh'), /viewport units/],
      [() => toPoints('2ch'), /font-relative units/],
      [() => toPoints('calc(1px + 50%)'), /adds length and percent/],
      [() => toPoints('env(safe-area-inset-top)'), /env\(\) is known only/],
      [() => toWeight('1001'), /from 1 to 1000/],
      [
        () => toShadow('inset 0 1px 2px #000'),
        /SwiftUI draws only inset rings/,
      ],
    ];
    for (const [run, message] of cases) {
      expect(run).toThrow(message);
    }
  });

  it('reads box-shadow lists as drop layers and inset rings', () => {
    const neutralLow =
      '0 2px 4px light-dark(oklch(0 0 0 / 5%), oklch(0 0 0 / 25%)), 0 4px 8px light-dark(oklch(0 0 0 / 10%), oklch(0 0 0 / 40%)), inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 8%))';
    expect(toShadow(valueForMode(neutralLow, 'light'))).toEqual([
      {x: 0, y: 2, blur: 4, spread: 0, isInset: false, color: '#0000000D'},
      {x: 0, y: 4, blur: 8, spread: 0, isInset: false, color: '#0000001A'},
      {x: 0, y: 0, blur: 0, spread: 1, isInset: true, color: '#00000000'},
    ]);
    expect(toShadow(valueForMode(neutralLow, 'dark'))[2]?.color).toBe(
      '#FFFFFF14',
    );
    expect(toShadow('none')).toEqual([]);
    const notes: string[] = [];
    expect(toShadow('#000 0 calc(1px + 1px) 0.25rem 1px', notes)).toEqual([
      {x: 0, y: 2, blur: 4, spread: 0, isInset: false, color: '#000000FF'},
    ]);
    expect(notes).toEqual([
      'drop layer "#000 0 calc(1px + 1px) 0.25rem 1px" drawn without its spread',
    ]);
  });

  it('takes light-dark() per mode at any depth (G1)', () => {
    expect(valueForMode('light-dark(#000, #fff)', 'light')).toBe('#000');
    expect(valueForMode('light-dark(#000, #fff)', 'dark')).toBe('#fff');
    const mixed = 'color-mix(in srgb, light-dark(red, blue), white)';
    expect(toColor(valueForMode(mixed, 'light'))).toBe('#FF8080FF');
    expect(toColor(valueForMode(mixed, 'dark'))).toBe('#8080FFFF');
    expect(valueForMode('#123', 'dark')).toBe('#123');
  });

  it('generates a [light, dark] tuple and a light-dark() value per mode', async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {
        '--color-accent': 'light-dark(#000, #fff)',
        '--color-border': [
          'oklch(40.101% 0.12332 21.555)',
          'color-mix(in srgb, light-dark(red, blue) 50%, white)',
        ],
        '--spacing-4': ['4px', '0.75rem'],
      },
    });
    const swift = await renderSwiftTheme(theme);
    const [light, dark] = swift.split('dark: Tokens(');
    expect(light).toContain(
      'accent: Color(.sRGB, red: 0, green: 0, blue: 0, opacity: 1)',
    );
    expect(dark).toContain(
      'accent: Color(.sRGB, red: 1, green: 1, blue: 1, opacity: 1)',
    );
    expect(light).toContain(
      'border: Color(.sRGB, red: 0.49019607843137253, green: 0.13725490196078433, blue: 0.1607843137254902, opacity: 1)',
    );
    expect(dark).toContain(
      'border: Color(.sRGB, red: 0.5019607843137255, green: 0.5019607843137255, blue: 1, opacity: 1)',
    );
    expect(light).toContain('s4: 4,');
    expect(dark).toContain('s4: 12,');
  });

  it('fails on a value with no static form, naming theme, mode, token, value, and reason', async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {'--color-accent': 'currentColor'},
    });
    await expect(renderSwiftTheme(theme)).rejects.toThrow(
      'acme-brand light: --color-accent = currentColor: currentColor depends on where the token is used; Swift has no static value',
    );
  });

  // A value with no static form, and a form the reader does not read, each
  // fail with their own ending (G7).
  const NONE = 'Swift has no static value';
  const READ = 'the Swift theme generator does not read this form';
  it.each([
    ['--font-family-body', 'inherit', 'inherit depends on', NONE],
    ['--font-family-body', '"Figtree", env(x)', 'env() is known', NONE],
    ['--font-family-body', '"Figtree", inherit', 'cannot be one name', READ],
    ['--shadow-low', 'inherit', 'inherit depends on', NONE],
    ['--shadow-low', '0 1px 2px', 'draws in currentColor', NONE],
    ['--color-accent', 'color(display-p3-linear 1 0 0)', 'not a color', READ],
  ])('fails %s: %s, saying why', async (token, value, reason, ending) => {
    const theme = await defineTheme({name: 'acme', tokens: {[token]: value}});
    const {message} = await renderSwiftTheme(theme).catch(error => error);
    expect(message).toContain(reason);
    expect(message.endsWith(`; ${ending}`)).toBe(true);
  });

  it('reads + and - in calc() only with a space on each side, as CSS does', () => {
    expect(toPoints('calc(1rem - 2px)')).toBe(14);
    expect(() => toPoints('calc(4px+2px)')).toThrow(/space on each side of \+/);
    expect(() => toPoints('calc(1rem-2px)')).toThrow(/space on each side of -/);
  });

  it.each([
    ['hwb(0, 0%, 0%)', /no comma syntax/],
    ['rgb(255, none, 0)', /cannot hold none/],
    ['rgba(255, 0, 0, none)', /cannot hold none/],
    ['rgb(255, 50%, 0)', /all numbers or all percentages/],
    ['hsl(120, 50, 40)', /saturation and lightness as percentages/],
  ])('fails the comma syntax CSS does not allow: %s', (css, reason) => {
    expect(() => toColor(css)).toThrow(reason);
  });

  it('warns, naming theme, mode, token, and value, when it clips a color outside Display P3', async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {'--color-accent': 'oklch(0.9 0.4 300)'},
    });
    const warnings: string[] = [];
    const swift = await renderSwiftTheme(theme, {
      warn: message => warnings.push(message),
    });
    expect(swift).toContain('accent: Color(.displayP3,');
    expect(warnings).toEqual([
      'acme-brand light: --color-accent = oklch(0.9 0.4 300): outside Display P3; clipped to match the web',
      'acme-brand dark: --color-accent = oklch(0.9 0.4 300): outside Display P3; clipped to match the web',
    ]);
  });

  it("writes a color outside sRGB as SwiftUI's Display P3 color", async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {'--color-accent': 'color(display-p3 1 0 0 / 50%)'},
    });
    expect(await renderSwiftTheme(theme)).toContain(
      'accent: Color(.displayP3, red: 1, green: 0, blue: 0, opacity: 0.5019607843137255)',
    );
  });

  it("keeps a relative color in its origin's gamut through core's var()", async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {
        '--color-accent': 'color(display-p3 1 0 0)',
        '--color-border': 'rgb(from var(--color-accent) r g b / 50%)',
      },
    });
    expect(await renderSwiftTheme(theme)).toContain(
      'border: Color(.displayP3, red: 1, green: 0, blue: 0, opacity: 0.5019607843137255)',
    );
  });

  it('turns a length line height into a multiplier of its style size', async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {'--text-body-size': '16px', '--text-body-leading': '20px'},
    });
    expect(await renderSwiftTheme(theme)).toMatch(
      /body: TypeStyleTokens\(size: 16, weight: \d+, leading: 1\.25\)/,
    );
  });
});

describe('swift theme generator: local tokens (G8)', () => {
  it('generates no local token and reports each one it leaves out', async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {},
      localTokens: {'--acme-brand-fill': ['#111111', '#EEEEEE']},
    });
    expect(localTokensLeftOut(theme)).toEqual(['--acme-brand-fill']);
    expect(await renderSwiftTheme(theme)).not.toContain('acmeBrandFill');
    expect(localTokensLeftOut(CORE_DEFAULTS)).toEqual([]);
  });
});

describe('swift theme generator: themes (G3, G4, G12)', () => {
  it('generates core defaults from no theme as Theme.default', async () => {
    const swift = await renderSwiftTheme(CORE_DEFAULTS, {
      source: '@astryxdesign/core',
    });
    expect(swift).toContain('public static let `default` = Theme(');
  });

  it('generates a product theme through the same function', async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {'--color-accent': ['#C2410C', '#FB923C']},
    });
    const swift = await renderSwiftTheme(theme, {source: 'acme'});
    expect(swift).toContain('public static let acmeBrand = Theme(');
    expect(swift).toContain(
      'accent: Color(.sRGB, red: 0.7607843137254902, green: 0.2549019607843137, blue: 0.047058823529411764, opacity: 1)',
    );
    expect(swift).toContain(
      'accent: Color(.sRGB, red: 0.984313725490196, green: 0.5725490196078431, blue: 0.23529411764705882, opacity: 1)',
    );
    expect(swift).toContain('from acme, theme "acme-brand"');
    expect(swift).not.toMatch(/\d+\.\d+\.\d+/);
    expect(await renderSwiftTheme(theme, {source: 'acme'})).toBe(swift);
  });

  it('imports Astryx in a product theme, with its own regenerate command', async () => {
    const theme = await defineTheme({name: 'acme-brand', tokens: {}});
    const regenerate =
      'node packages/native/scripts/swift-ios-theme.mjs --theme ./src/acme.ts#acmeTheme --out ./Sources/Theme';
    const product = await renderSwiftTheme(theme, {source: 'acme', regenerate});
    expect(product).toContain('import Astryx\nimport SwiftUI\n');
    expect(product).toContain(`Run \`${regenerate}\``);
    const packaged = await renderSwiftTheme(theme, {source: 'acme'});
    expect(packaged).not.toContain('import Astryx');
  });

  it('orders members the same in every locale', async () => {
    const theme = await defineTheme({name: 'acme-brand', tokens: {}});
    const before = await renderSwiftTheme(theme);
    const compare = String.prototype.localeCompare;
    String.prototype.localeCompare = function (
      that: string,
      locales?: string | string[],
      options?: Intl.CollatorOptions,
    ) {
      return compare.call(this, that, locales ?? 'th-TH', options);
    };
    try {
      expect(await renderSwiftTheme(theme)).toBe(before);
    } finally {
      String.prototype.localeCompare = compare;
    }
  });

  it('generates core default and every published theme package', async () => {
    const files = await renderAll(load);
    const names = Object.keys(files).map(f => path.basename(f));
    expect(names).toContain('DefaultTheme.swift');
    for (const p of publishedThemePackages()) {
      const theme = (await load(p.sourceFile))[p.exportName] as {name: string};
      expect(names, p.packageName).toContain(
        `${swiftThemeName(theme.name)[0].toUpperCase()}${swiftThemeName(theme.name).slice(1)}Theme.swift`,
      );
    }
  });
});

describe('swift theme generator: drift (G13)', () => {
  it('keeps every committed Swift theme file in sync', async () => {
    const files = await renderAll(load);
    expect(Object.keys(files)).toContain(SWIFT_TOKENS_FILE);
    for (const [file, contents] of Object.entries(files)) {
      expect(
        fs.existsSync(file),
        `${path.basename(file)} is missing; run ${REGENERATE}`,
      ).toBe(true);
      expect(
        fs.readFileSync(file, 'utf8'),
        `${path.basename(file)} is stale; run ${REGENERATE}`,
      ).toBe(contents);
    }
    const committed = fs
      .readdirSync(SWIFT_THEME_DIR)
      .filter(f => f.endsWith('.swift'))
      .map(f => path.join(SWIFT_THEME_DIR, f));
    for (const file of committed) {
      expect(
        files,
        `${path.basename(file)} has no theme; run ${REGENERATE}`,
      ).toHaveProperty([file]);
    }
  });
});
