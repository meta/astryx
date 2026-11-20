// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for `parseIntegration` — the load-boundary validator for
 * `astryx.integration.*`. Zod is sealed inside the parser; these exercise the
 * public contract (validated value out / readable error thrown) with the same
 * accept/reject set the old `AstryxIntegrationSchema` had.
 */

import {describe, it, expect} from 'vitest';
import {parseIntegration} from './parse.mjs';
import {
  ignoredIntegrationFields,
  integrationSchema,
  unknownIntegrationKeys,
} from './schema.mjs';

/** Run parseIntegration and return the thrown message (asserting it throws). */
function reason(value, label = 'integration') {
  try {
    parseIntegration(value, label);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error('expected parseIntegration to throw');
}

describe('parseIntegration (load boundary)', () => {
  it('accepts an empty manifest and a valid one', () => {
    expect(parseIntegration({})).toEqual({});
    expect(parseIntegration({components: './src'})).toEqual({
      components: './src',
    });
    expect(parseIntegration({docs: './docs'})).toEqual({docs: './docs'});
    expect(parseIntegration({providerId: '@acme/legacy-widgets'})).toEqual({
      providerId: '@acme/legacy-widgets',
    });
    expect(parseIntegration({themes: './themes'})).toEqual({
      themes: './themes',
    });
    expect(() =>
      parseIntegration({components: './c', issuesUrl: 'https://example.com/i'}),
    ).not.toThrow();
  });

  it('ignores a key it does not know, and keeps the rest of the manifest', () => {
    // A key from a NEWER CLI is the common case, not an authoring mistake: the
    // integration is published once and installed against many CLI versions.
    // Rejecting the manifest took the whole package's contributions down with
    // it, silently, on every older consumer (#5119).
    expect(
      parseIntegration({components: './src', futureRoot: './future'}),
    ).toEqual({
      components: './src',
    });
    expect(
      unknownIntegrationKeys({components: './src', futureRoot: './future'}),
    ).toEqual(['futureRoot']);
    expect(unknownIntegrationKeys({components: './src'})).toEqual([]);
    // Not a manifest at all — nothing to report, and the parser owns the error.
    expect(unknownIntegrationKeys(null)).toEqual([]);
    expect(unknownIntegrationKeys([1, 2])).toEqual([]);
  });

  it('reports no known key as unknown, whatever the schema grows', () => {
    // The census is read off the schema, so this holds for keys that do not
    // exist yet. A hand-maintained list would pass today and start warning
    // falsely about a supported field the day someone forgot to update it.
    const everyKnownKey = Object.fromEntries(
      Object.keys(integrationSchema.shape).map(key => [
        key,
        key === 'issuesUrl'
          ? 'https://example.com/issues'
          : key === 'agentDocs'
            ? {}
            : key === 'providerId'
              ? '@acme/widgets'
              : './x',
      ]),
    );
    expect(unknownIntegrationKeys(everyKnownKey)).toEqual([]);
  });

  it('ignores a key it does not know inside a known object, and names it', () => {
    // A later CLI may give themeProvider another field: this CLI keeps the
    // fields it knows and the rest of the manifest.
    const manifest = {
      themes: './themes',
      themeProvider: {
        export: 'AcmeThemeProvider',
        from: '@acme/ui/theme',
        stylesheet: '@acme/ui/theme.css',
      },
    };
    expect(parseIntegration(manifest)).toEqual({
      themes: './themes',
      themeProvider: {export: 'AcmeThemeProvider', from: '@acme/ui/theme'},
    });
    expect(unknownIntegrationKeys(manifest)).toEqual([
      'themeProvider.stylesheet',
    ]);
    // Only themeProvider's inner keys are reported: a key inside logo is
    // stripped as it always was, with no new warning.
    expect(
      unknownIntegrationKeys({logo: {light: './l.svg', size: 32}}),
    ).toEqual([]);
  });

  it("reads themeProvider's themeProp and modeProp", () => {
    expect(
      parseIntegration({
        themes: './themes',
        themeProvider: {
          export: 'AcmeThemeProvider',
          from: '@acme/ui/theme',
          themeProp: 'theme',
          modeProp: 'themeMode',
        },
      }).themeProvider,
    ).toEqual({
      export: 'AcmeThemeProvider',
      from: '@acme/ui/theme',
      themeProp: 'theme',
      modeProp: 'themeMode',
    });
  });

  it('drops a themeProvider prop it cannot use, says why, and loads the rest', () => {
    const PROVIDER = {export: 'AcmeThemeProvider', from: '@acme/ui/theme'};
    // A themeProp that names no prop.
    const badProp = {
      themes: './themes',
      themeProvider: {...PROVIDER, themeProp: 'the theme'},
    };
    expect(parseIntegration(badProp)).toEqual({
      themes: './themes',
      themeProvider: PROVIDER,
    });
    expect(ignoredIntegrationFields(badProp)).toEqual([
      {field: 'themeProvider.themeProp', why: 'it names no prop'},
    ]);
    // A modeProp with no themeProp beside it.
    const aloneMode = {
      themes: './themes',
      themeProvider: {...PROVIDER, modeProp: 'themeMode'},
    };
    expect(parseIntegration(aloneMode).themeProvider).toEqual(PROVIDER);
    expect(ignoredIntegrationFields(aloneMode)).toEqual([
      {field: 'themeProvider.modeProp', why: 'it needs themeProp beside it'},
    ]);
    // A provider it cannot name: the whole block goes, the themes stay.
    const badExport = {
      themes: './themes',
      themeProvider: {export: 'acme provider', from: '@acme/ui/theme'},
    };
    expect(parseIntegration(badExport)).toEqual({themes: './themes'});
    expect(ignoredIntegrationFields(badExport)).toEqual([
      {field: 'themeProvider', why: 'its export does not name a component'},
    ]);
    // A clean manifest drops nothing.
    expect(
      ignoredIntegrationFields({themes: './themes', themeProvider: PROVIDER}),
    ).toEqual([]);
  });

  it('still rejects a known key of the wrong type', () => {
    // The relaxation is about keys this CLI has never heard of. A key it DOES
    // know, holding the wrong type, is a real authoring mistake.
    expect(reason({components: 42})).toContain('components');
  });

  it('rejects a non-URL issuesUrl', () => {
    expect(reason({issuesUrl: 'nope'})).toContain('issuesUrl');
  });

  it('accepts a docsiteUrl as a known key', () => {
    const manifest = {docsiteUrl: 'https://widgets.example.com'};
    expect(parseIntegration(manifest)).toEqual(manifest);
    expect(unknownIntegrationKeys(manifest)).toEqual([]);
  });

  it('rejects a non-URL docsiteUrl', () => {
    expect(reason({docsiteUrl: 'nope'})).toContain('docsiteUrl');
  });

  it('accepts a logo with a light path and an optional dark one', () => {
    const light = {logo: {light: './logo.svg'}};
    const both = {logo: {light: './logo.svg', dark: './logo-dark.svg'}};
    expect(parseIntegration(light)).toEqual(light);
    expect(parseIntegration(both)).toEqual(both);
    expect(unknownIntegrationKeys(both)).toEqual([]);
  });

  it('rejects a logo that is a bare path or has no light path', () => {
    expect(reason({logo: './logo.svg'})).toContain('logo');
    expect(reason({logo: {dark: './logo-dark.svg'}})).toContain('logo');
  });

  it('accepts a cliCommand and rejects one that is not a single clean line', () => {
    expect(parseIntegration({cliCommand: 'acme astryx'})).toEqual({
      cliCommand: 'acme astryx',
    });
    expect(reason({cliCommand: ''})).toContain('cliCommand');
    expect(reason({cliCommand: ' acme astryx'})).toContain('cliCommand');
    expect(reason({cliCommand: 'acme\nastryx'})).toContain('cliCommand');
    expect(reason({cliCommand: 'a'.repeat(121)})).toContain('120');
    expect(reason({cliCommand: 42})).toContain('cliCommand');
  });

  it('accepts an installGuidance and rejects one that is not a single clean line', () => {
    expect(
      parseIntegration({installGuidance: 'Add {packages}, then relock'}),
    ).toEqual({
      installGuidance: 'Add {packages}, then relock',
    });
    expect(reason({installGuidance: ''})).toContain('installGuidance');
    expect(reason({installGuidance: 'add\nrelock'})).toContain(
      'installGuidance',
    );
    expect(reason({installGuidance: 'a'.repeat(241)})).toContain('240');
    expect(reason({installGuidance: 7})).toContain('installGuidance');
  });

  it('rejects a noncanonical providerId', () => {
    expect(reason({providerId: 'Acme Widgets'})).toContain('providerId');
  });

  it('accepts an optional append array as manifest data', () => {
    expect(
      parseIntegration({
        agentDocs: {
          append: ['Run acme verify before finishing.'],
        },
      }),
    ).toEqual({
      agentDocs: {
        append: ['Run acme verify before finishing.'],
      },
    });
  });

  it('strips future nested agentDocs keys without rejecting append', () => {
    expect(
      parseIntegration({
        agentDocs: {
          append: ['Run acme verify before finishing.'],
          futureField: true,
        },
      }),
    ).toEqual({
      agentDocs: {
        append: ['Run acme verify before finishing.'],
      },
    });
  });

  it('caps append at eight lines', () => {
    expect(
      reason({
        agentDocs: {
          append: Array.from({length: 9}, (_, index) => `after ${index}`),
        },
      }),
    ).toMatch(/at most 8 lines/);
  });

  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(() =>
      parseIntegration({agentDocs: {append: ['😀'.repeat(240)]}}),
    ).not.toThrow();
    expect(reason({agentDocs: {append: ['😀'.repeat(241)]}})).toMatch(
      /240 Unicode code points/,
    );
  });

  it.each([
    ['', /blank/],
    ['   ', /blank/],
    [' leading', /surrounding whitespace/],
    ['trailing ', /surrounding whitespace/],
    ['two\nlines', /single line|line separators/],
    ['two\rlines', /control characters|line separators/],
    ['unicode\u2028separator', /single line/],
    ['nul\u0000byte', /NUL/],
    ['control\u0001byte', /control characters/],
    ['control\u0085byte', /control characters/],
    ['<!-- ASTRYX:START -->', /managed marker text/],
    ['XDS:END', /managed marker text/],
  ])('rejects forbidden agentDocs line %#', (line, message) => {
    expect(reason({agentDocs: {append: [line]}})).toMatch(message);
  });

  it('rejects functions and other non-data shapes', () => {
    expect(reason({agentDocs: () => ({append: ['x']})})).toContain('agentDocs');
    expect(reason({agentDocs: {append: ['ok', 42]}})).toContain('append');
  });
});
