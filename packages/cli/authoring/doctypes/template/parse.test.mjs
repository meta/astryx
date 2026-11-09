// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for `parseTemplate` — the load-boundary validator run
 * against a `.template.*` module's default export during template discovery.
 * Zod is sealed inside the parser; authors write a plain object stamped with a
 * `type` of `'page'` or `'block'`. Accept/reject set matches the old
 * `TemplateEnvelopeSchema`.
 */

import {describe, it, expect} from 'vitest';
import {parseTemplate} from './parse.mjs';

/** Run parseTemplate and return the thrown message (asserting it throws). */
function reason(value, label = 'template') {
  try {
    parseTemplate(value, label);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error('expected parseTemplate to throw');
}

describe('parseTemplate (load boundary)', () => {
  it('accepts replaces on page and block templates', () => {
    for (const type of ['page', 'block']) {
      const parsed = parseTemplate({
        type,
        name: 'Acme shell',
        description: 'Replaces a Core template.',
        replaces: 'shell-side-nav',
      });
      expect(parsed.replaces).toBe('shell-side-nav');
    }
  });

  it('accepts keywords on page and block templates', () => {
    for (const type of ['page', 'block']) {
      const parsed = parseTemplate({
        type,
        name: 'Acme health',
        description: 'Status tiles over time charts.',
        keywords: ['uptime', 'on-call'],
      });
      expect(parsed.keywords).toEqual(['uptime', 'on-call']);
    }
  });

  it('rejects keywords that are not a list of words', () => {
    expect(
      reason({type: 'page', name: 'Acme health', keywords: 'uptime'}),
    ).toMatch(/keywords/);
    expect(reason({type: 'page', name: 'Acme health', keywords: ['']})).toMatch(
      /keywords/,
    );
  });

  it('rejects an empty replaces', () => {
    expect(reason({type: 'page', name: 'Acme shell', replaces: ''})).toMatch(
      /replaces must name a Core template id/,
    );
  });

  it('accepts a stamped page template', () => {
    const parsed = parseTemplate({
      type: 'page',
      name: 'Landing',
      description: 'A landing page.',
    });
    expect(parsed.type).toBe('page');
  });

  it('accepts a block template with optional fields', () => {
    const parsed = parseTemplate({
      type: 'block',
      name: 'Hero',
      description: 'A hero block.',
      category: 'Marketing',
      componentsUsed: ['Button', 'Card'],
      preview: {image: './preview.png', aspectRatio: '16 / 9'},
    });
    expect(parsed.name).toBe('Hero');
    expect(parsed.preview).toEqual({
      image: './preview.png',
      aspectRatio: '16 / 9',
    });
  });

  it('accepts the shared readiness fields', () => {
    const parsed = parseTemplate({
      type: 'page',
      name: 'Draft',
      description: 'A draft page.',
      isReady: false,
      scaffold: true,
      isHiddenFromOverview: true,
    });
    expect(parsed).toMatchObject({
      isReady: false,
      scaffold: true,
      isHiddenFromOverview: true,
    });
  });

  it('accepts a standalone block without component ownership', () => {
    const parsed = parseTemplate({
      type: 'block',
      name: 'FilterToolbar',
      description: 'Filters a data view.',
      aspectRatio: 16 / 9,
    });
    expect(parsed.exampleFor).toBeUndefined();
  });

  it('requires component ownership for a showcase', () => {
    expect(() =>
      parseTemplate({
        type: 'block',
        name: 'HeroShowcase',
        description: 'A component hero.',
        isShowcase: true,
      }),
    ).toThrow(/exampleFor/);
  });

  it('accepts stable registry slug and alias metadata', () => {
    const parsed = parseTemplate({
      type: 'page',
      name: 'Landing',
      description: 'A landing page.',
      registry: {slug: 'landing', aliases: ['old-landing']},
    });
    expect(parsed.registry).toEqual({
      slug: 'landing',
      aliases: ['old-landing'],
    });
  });

  it('rejects invalid registry paths', () => {
    expect(() =>
      parseTemplate({
        type: 'page',
        name: 'Landing',
        description: 'A landing page.',
        registry: {slug: 'Landing Page'},
      }),
    ).toThrow(/registry/);
  });

  it('rejects a missing name', () => {
    expect(reason({type: 'page', description: 'x'})).toContain('name');
  });

  it('accepts an omitted description and rejects an empty one when present', () => {
    expect(parseTemplate({type: 'page', name: 'x'})).toEqual({
      type: 'page',
      name: 'x',
    });
    expect(reason({type: 'page', name: 'x', description: ''})).toContain(
      'description',
    );
  });

  it('rejects an empty-string name', () => {
    expect(reason({type: 'page', name: '', description: 'x'})).toContain(
      'name',
    );
  });

  it('rejects a missing/invalid type', () => {
    expect(() => parseTemplate({name: 'x', description: 'y'})).toThrow();
    expect(() =>
      parseTemplate({type: 'bogus', name: 'x', description: 'y'}),
    ).toThrow();
  });

  it('rejects unknown keys (strict)', () => {
    expect(() =>
      parseTemplate({
        type: 'page',
        name: 'x',
        description: 'y',
        source: './x.tsx',
      }),
    ).toThrow();
  });

  it('rejects inline sourceFile (not supported in v1)', () => {
    expect(() =>
      parseTemplate({
        type: 'page',
        name: 'x',
        description: 'y',
        sourceFile: './x.tsx',
      }),
    ).toThrow();
  });
});
