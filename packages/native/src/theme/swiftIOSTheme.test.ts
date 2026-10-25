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
  toFamilies,
  toHexColor,
  toPoints,
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
      '--font-size-2xl': 'font.size2xl',
      '--font-weight-semibold': 'font.weightSemibold',
      '--font-family-body': 'font.familyBody',
      '--text-body-size': 'font.bodySize',
      '--text-heading-1-weight': 'font.heading1Weight',
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

  it('names themes as the spec says', () => {
    expect(swiftThemeName('astryx')).toBe('default');
    expect(swiftThemeName('astryx-neutral')).toBe('neutral');
    expect(swiftThemeName('neutral')).toBe('neutral');
    expect(swiftThemeName('acme-brand')).toBe('acmeBrand');
    expect(() => swiftThemeName('2fast')).toThrow(/no valid Swift name/);
    expect(() => swiftThemeName('class')).toThrow(/no valid Swift name/);
  });
});

describe('swift theme generator: values (G7)', () => {
  it('reads CSS colors, lengths, and font stacks as Swift values', () => {
    expect(toHexColor('#0064E0')).toBe('#0064E0FF');
    expect(toHexColor('#fff')).toBe('#FFFFFFFF');
    expect(toHexColor('rgba(5, 54, 89, 0.1)')).toBe('#0536591A');
    expect(toHexColor('transparent')).toBe('#00000000');
    expect(toHexColor('oklch(0 0 0 / 5%)')).toBeNull();
    expect(toHexColor('light-dark(#000, #fff)')).toBeNull();
    expect(toHexColor('hsl(0 100% 50%)')).toBe('#FF0000FF');
    expect(toHexColor('hsl(210 100% 50%)')).toBe('#0080FFFF');
    expect(toHexColor('hsla(120, 100%, 25%, 0.5)')).toBe('#00800080');
    expect(toPoints('0.875rem')).toBe(14);
    expect(toPoints('32px')).toBe(32);
    expect(toPoints('600')).toBe(600);
    expect(toPoints('calc(1px + 1rem)')).toBeNull();
    expect(toFamilies('"Figtree", -apple-system, sans-serif')).toEqual([
      'Figtree',
      '-apple-system',
      'sans-serif',
    ]);
    expect(toFamilies('var(--font-family-body)')).toBeNull();
  });

  it('takes light-dark() per mode (G1)', async () => {
    expect(valueForMode('light-dark(#000, #fff)', 'light')).toBe('#000');
    expect(valueForMode('light-dark(#000, #fff)', 'dark')).toBe('#fff');
    expect(
      valueForMode('light-dark(rgb(0, 0, 0), rgb(255, 255, 255))', 'dark'),
    ).toBe('rgb(255, 255, 255)');
    expect(valueForMode('#123', 'dark')).toBe('#123');
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {'--color-accent': 'light-dark(#000, #fff)'},
    });
    const swift = await renderSwiftTheme(theme);
    expect(swift).toContain('accent: Color(astryxRGBA: 0x000000FF)');
    expect(swift).toContain('accent: Color(astryxRGBA: 0xFFFFFFFF)');
  });

  it('fails on a value Swift cannot read, naming theme, mode, token, and value', async () => {
    const theme = await defineTheme({
      name: 'acme-brand',
      tokens: {'--color-accent': 'oklch(0.6 0.2 250)'},
    });
    await expect(renderSwiftTheme(theme)).rejects.toThrow(
      'acme-brand light: --color-accent is not a color Swift can read: oklch(0.6 0.2 250)',
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
    expect(swift).toContain('accent: Color(astryxRGBA: 0xC2410CFF)');
    expect(swift).toContain('accent: Color(astryxRGBA: 0xFB923CFF)');
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
