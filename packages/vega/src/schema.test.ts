// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file schema.test.ts
 * @input Uses vitest, parseSchema
 * @output Functional tests for the $schema URL parser
 * @position Colocated test for schema.ts (issue #4295 vega coverage)
 */

import {describe, it, expect} from 'vitest';
import {parseSchema} from './schema';

describe('parseSchema', () => {
  it('parses a vega-lite schema URL into library and version', () => {
    expect(
      parseSchema('https://vega.github.io/schema/vega-lite/v5.json'),
    ).toEqual({ok: true, library: 'vega-lite', version: 'v5'});
  });

  it('parses a plain vega schema URL into library and version', () => {
    expect(parseSchema('https://vega.github.io/schema/vega/v6.json')).toEqual({
      ok: true,
      library: 'vega',
      version: 'v6',
    });
  });

  it('extracts multi-part versions from fully versioned URLs', () => {
    expect(
      parseSchema('https://vega.github.io/schema/vega-lite/v5.2.0.json'),
    ).toEqual({ok: true, library: 'vega-lite', version: 'v5.2.0'});
  });

  it('tolerates proxy prefixes before the schema path', () => {
    expect(
      parseSchema(
        'https://internal-proxy.example.com/assets/vega.github.io/schema/vega/v5.json',
      ),
    ).toEqual({ok: true, library: 'vega', version: 'v5'});
  });

  it('rejects a missing $schema with a fix-it message', () => {
    const expected = {
      ok: false,
      error:
        'Spec is missing a $schema field. Add "$schema": "https://vega.github.io/schema/vega/v5.json" or the vega-lite equivalent.',
    };
    expect(parseSchema(undefined)).toEqual(expected);
    expect(parseSchema(null)).toEqual(expected);
  });

  it('rejects a non-string $schema and reports the received type', () => {
    expect(parseSchema(5)).toEqual({
      ok: false,
      error: '$schema must be a string, got number.',
    });
    expect(parseSchema({url: 'x'})).toEqual({
      ok: false,
      error: '$schema must be a string, got object.',
    });
  });

  it('rejects URLs that do not match the official schema format', () => {
    expect(parseSchema('https://example.com/other.json')).toEqual({
      ok: false,
      error:
        'Unrecognized $schema URL: "https://example.com/other.json". Expected format: https://vega.github.io/schema/{vega|vega-lite}/{version}.json',
    });
    expect(parseSchema('')).toEqual({
      ok: false,
      error:
        'Unrecognized $schema URL: "". Expected format: https://vega.github.io/schema/{vega|vega-lite}/{version}.json',
    });
  });

  it('rejects unknown libraries inside the schema URL namespace', () => {
    expect(
      parseSchema('https://vega.github.io/schema/vega-embed/v2.json'),
    ).toEqual({
      ok: false,
      error:
        'Unknown schema library "vega-embed". Must be "vega" or "vega-lite".',
    });
  });
});
