// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Unit tests for the font-loading warning helpers behind `astryx theme build`
 * (#5015). `collectUnloadedFonts()` reads a RESOLVED theme — `--font-family-*`
 * tokens plus component-override `fontFamily` values (typography configs are
 * already collapsed into tokens by the time the build sees the theme) — and
 * returns the families the theme names but nothing loads. CSS generics,
 * CSS-wide keywords, `var()` references, and known preinstalled system
 * families are treated as loaded; anything unrecognized is assumed to be a
 * webfont, because a missed warning is worse than a spurious one.
 * `formatFontLoadingHelp()` renders the human snippet (<link> pair +
 * @font-face) printed after the install instructions.
 */

import {describe, it, expect} from 'vitest';
import {collectUnloadedFonts, formatFontLoadingHelp} from './font-warning.mjs';
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';

describe('collectUnloadedFonts', () => {
  it('returns webfont families from font-family tokens, skipping known fallbacks', () => {
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-body': '"Fraunces", Georgia, serif'},
      }),
    ).toEqual(['Fraunces']);
  });

  it('returns nothing for the default system stacks', () => {
    expect(
      collectUnloadedFonts({
        tokens: {
          '--font-family-body':
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          '--font-family-code': '"SF Mono", Monaco, Consolas, monospace',
        },
      }),
    ).toEqual([]);
  });

  it('treats bare system keywords like ui-monospace as loaded', () => {
    expect(
      collectUnloadedFonts({tokens: {'--font-family-code': 'ui-monospace'}}),
    ).toEqual([]);
  });

  it('handles single-quoted and unquoted multi-word family names', () => {
    expect(
      collectUnloadedFonts({
        tokens: {
          '--font-family-body': "'JetBrains Mono', monospace",
          '--font-family-heading': 'Space Grotesk, sans-serif',
        },
      }),
    ).toEqual(['JetBrains Mono', 'Space Grotesk']);
  });

  it('dedupes case-insensitively across roles, keeping the first casing', () => {
    expect(
      collectUnloadedFonts({
        tokens: {
          '--font-family-body': '"Space Grotesk", sans-serif',
          '--font-family-heading': '"space grotesk", serif',
        },
      }),
    ).toEqual(['Space Grotesk']);
  });

  it('skips var() references and CSS-wide keywords', () => {
    expect(
      collectUnloadedFonts({
        tokens: {
          '--font-family-heading': 'var(--font-family-body)',
          '--font-family-code': 'inherit',
        },
      }),
    ).toEqual([]);
  });

  it("strips whole var() calls — fallback arguments are not this theme's declarations", () => {
    expect(
      collectUnloadedFonts({
        tokens: {
          '--font-family-body': 'var(--x, "Web Font")',
          '--font-family-heading': 'var(--x, "Web Font", serif)',
        },
      }),
    ).toEqual([]);
    // Families outside the var() call still count.
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-code': 'var(--x), Bungee'},
      }),
    ).toEqual(['Bungee']);
  });

  it('keeps a comma inside a quoted name whole, even mid-list', () => {
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-body': 'Georgia, "Foo, Bar", serif'},
      }),
    ).toEqual(['Foo, Bar']);
  });

  it('ignores an empty font-family token', () => {
    expect(collectUnloadedFonts({tokens: {'--font-family-body': ''}})).toEqual(
      [],
    );
  });

  it('collects component-override fontFamily values, any style key', () => {
    expect(
      collectUnloadedFonts({
        components: {
          Button: {base: {fontFamily: '"Orbitron", sans-serif'}},
          Card: {'variant:hero': {fontFamily: 'Bungee'}},
        },
      }),
    ).toEqual(['Orbitron', 'Bungee']);
  });

  it('collects families from serialized adaptation typography', () => {
    expect(
      collectUnloadedFonts({
        typography: {
          body: {family: 'Revision Webfont', fallbacks: 'sans-serif'},
          heading: {family: 'Display Face', fallbacks: 'Georgia, serif'},
        },
      }),
    ).toEqual(['Revision Webfont', 'Display Face']);
  });

  it('ignores serialized fallbacks that have no family', () => {
    expect(
      collectUnloadedFonts({
        typography: {
          body: {fallbacks: 'Phantom Serif'},
          heading: {family: 'Display Face', fallbacks: 'Georgia, serif'},
        },
      }),
    ).toEqual(['Display Face']);
  });

  it('matches known system families case-insensitively', () => {
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-body': 'arial, sans-serif'},
      }),
    ).toEqual([]);
  });

  it('returns nothing for a theme with no tokens or components', () => {
    expect(collectUnloadedFonts({})).toEqual([]);
  });

  it('returns nothing for a null or undefined resolved theme', () => {
    // Older build.mjs consumers guard with `resolvedTheme || themeDef` — if
    // a path ever hands the collector nothing, it must shrug, not throw.
    expect(collectUnloadedFonts(null)).toEqual([]);
    expect(collectUnloadedFonts(undefined)).toEqual([]);
  });

  it('ignores non-string values without throwing: numeric or object-valued', () => {
    // The generator only allows object values under ':pseudo' keys, so an
    // object-valued fontFamily is not a family declaration — skip, not crash.
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-body': 42},
        components: {
          button: {base: {fontFamily: 700}},
          card: {base: {fontFamily: {default: '"Sneaky"'}}},
        },
      }),
    ).toEqual([]);
  });

  it('collects fontFamily nested under a pseudo-class block', () => {
    // generateThemeRules accepts {':hover': {fontFamily}} inside a style
    // key — a family named only there must still warn.
    expect(
      collectUnloadedFonts({
        components: {
          button: {base: {':hover': {fontFamily: '"Rubik Doodle", cursive'}}},
        },
      }),
    ).toEqual(['Rubik Doodle']);
  });

  it('strips a var() whose fallback list contains another var()', () => {
    expect(
      collectUnloadedFonts({
        tokens: {
          '--font-family-body': 'var(--brand, var(--fallback), "Web Font")',
        },
      }),
    ).toEqual([]);
    // …and still keeps a family declared outside the nested call.
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-code': 'var(--a, var(--b, serif)), Bungee'},
      }),
    ).toEqual(['Bungee']);
  });

  it('matches generic keywords case-insensitively', () => {
    expect(
      collectUnloadedFonts({
        tokens: {
          '--font-family-body': 'Sans-Serif',
          '--font-family-heading': 'SERIF',
          '--font-family-code': 'Ui-Monospace',
        },
      }),
    ).toEqual([]);
  });

  it('collapses newlines and whitespace runs inside a family name', () => {
    // Template-literal theme sources wrap long stacks across lines.
    expect(
      collectUnloadedFonts({
        tokens: {'--font-family-body': '"Space\n      Grotesk",\n  serif'},
      }),
    ).toEqual(['Space Grotesk']);
  });
});

describe('formatFontLoadingHelp', () => {
  const help = formatFontLoadingHelp('ocean', ['Fraunces', 'JetBrains Mono']);

  it('names the theme and every family in the headline', () => {
    expect(help).toContain('[note] Theme "ocean"');
    expect(help).toContain('"Fraunces"');
    expect(help).toContain('"JetBrains Mono"');
  });

  it('is plain ASCII', () => {
    expect(help).not.toMatch(/[\u0080-\uffff]/);
  });

  it('includes the Google Fonts recipe: preconnect pair + the exact css2 URL', () => {
    expect(help).toContain(
      '<link rel="preconnect" href="https://fonts.googleapis.com"',
    );
    expect(help).toContain('https://fonts.gstatic.com');
    // The whole href, so a malformed URL cannot hide behind fragment checks.
    expect(help).toContain(
      'href="https://fonts.googleapis.com/css2?family=Fraunces&family=JetBrains+Mono&display=swap"',
    );
  });

  it('includes a self-hosted @font-face alternative with font-display: swap', () => {
    expect(help).toContain('@font-face');
    expect(help).toContain('font-family: "Fraunces"');
    expect(help).toContain('woff2');
    expect(help).toContain('font-display: swap');
  });

  it('points at the docs recipe', () => {
    expect(help).toContain(formatCliCommand('docs typography'));
  });

  it('percent-encodes family names in the css2 URL', () => {
    const spiced = formatFontLoadingHelp('spice', ['P&Co Sans', 'Sömething']);
    expect(spiced).toContain(
      'href="https://fonts.googleapis.com/css2?family=P%26Co+Sans&family=S%C3%B6mething&display=swap"',
    );
  });
});
