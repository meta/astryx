// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for `parseConfig` — the load-boundary validator for
 * `astryx.config.*`. Zod is sealed inside the parser, so these exercise the
 * public contract only: a validated value comes back on success, a readable
 * `<label> is invalid: …` error is thrown on failure. The accept/reject set
 * matches the old `AstryxConfigSchema` cases verbatim.
 */

import {describe, it, expect} from 'vitest';
import {parseConfig} from './parse.mjs';

/** Run parseConfig and return the thrown message (asserting it throws). */
function reason(value, label = 'config') {
  try {
    parseConfig(value, label);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error('expected parseConfig to throw');
}

describe('parseConfig (load boundary)', () => {
  it('accepts an empty config (every field optional)', () => {
    expect(parseConfig({})).toEqual({});
  });

  it('accepts a fully-populated valid config', () => {
    const cfg = {
      integrations: ['@astryxdesign/core'],
      issuesUrl: 'https://github.com/org/repo/issues',
      hooks: {postCodemod: [{name: 'build', buildCommand: () => {}}]},
      experimental: {xle: {components: {Foo: {from: 'pkg', default: true}}}},
    };
    expect(() => parseConfig(cfg)).not.toThrow();
  });

  it('accepts hooks.postCodemod with a buildCommand function', () => {
    expect(() =>
      parseConfig({
        hooks: {postCodemod: [{name: 'format', buildCommand: () => null}]},
      }),
    ).not.toThrow();
  });

  it('rejects non-objects with a readable message', () => {
    expect(reason(null)).toContain('expected object');
    expect(reason(42)).toContain('expected object');
    expect(reason([])).toContain('expected object');
  });

  it('rejects unknown top-level keys (strict)', () => {
    const msg = reason({packages: ['./libs']});
    expect(msg).toContain('Unrecognized key');
    expect(msg).toContain('packages');
  });

  it('accepts the project gap-report handler shape', () => {
    const handle = () => ({status: 'filed', message: 'ok'});
    expect(
      parseConfig({gapReport: {audience: 'internal', handle}}).gapReport,
    ).toEqual({audience: 'internal', handle});
  });

  it('accepts a discover source function and refuses anything else', () => {
    const discover = async () => ({});
    expect(parseConfig({discover}).discover).toBe(discover);
    expect(reason({discover: 'https://example.com/catalog.json'})).toContain(
      'discover',
    );
  });

  it('rejects obsolete or extended gap-report handler shapes', () => {
    expect(reason({gapReport: {command: './report.mjs'}})).toContain(
      'gapReport',
    );
    expect(
      reason({
        gapReport: {
          audience: 'internal',
          handle: () => ({status: 'skipped'}),
          extra: true,
        },
      }),
    ).toContain('gapReport');
  });

  it('rejects a non-array integrations field', () => {
    expect(reason({integrations: '@acme/widgets'})).toContain('expected array');
    expect(reason({integrations: [1]})).toContain('integrations.0');
  });

  it('rejects a non-URL issuesUrl', () => {
    expect(reason({issuesUrl: 'not-a-url'})).toContain('issuesUrl');
  });

  it('rejects a postCodemod hook without buildCommand', () => {
    expect(() =>
      parseConfig({hooks: {postCodemod: [{name: 'empty'}]}}),
    ).toThrow();
  });

  it('rejects a non-function postCodemod.buildCommand', () => {
    expect(
      reason({hooks: {postCodemod: [{buildCommand: 'notAFn'}]}}),
    ).toContain('buildCommand');
  });

  it('rejects unknown nested keys inside experimental.xle.components', () => {
    expect(
      reason({experimental: {xle: {components: {Foo: {from: 'pkg', bad: 1}}}}}),
    ).toContain('Unrecognized key');
  });

  it('rejects an xle component missing `from`', () => {
    expect(() =>
      parseConfig({experimental: {xle: {components: {Foo: {}}}}}),
    ).toThrow();
  });
});
