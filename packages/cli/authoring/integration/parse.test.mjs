// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for `parseIntegration` — the load-boundary validator for
 * `astryx.integration.*`. Zod is sealed inside the parser; these exercise the
 * public contract (validated value out / readable error thrown) with the same
 * accept/reject set the old `AstryxIntegrationSchema` had.
 */

import {describe, it, expect} from 'vitest';
import {parseIntegration} from './parse.mjs';
import {integrationSchema, unknownIntegrationKeys} from './schema.mjs';

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
