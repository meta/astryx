// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frontmatter.test.tsx
 * @input Native document-start frontmatter in complete and streaming documents
 * @output Typed metadata, non-rendering, ordering, and failure coverage
 * @position Acceptance tests for first-party Markdown frontmatter
 */

import {renderToString} from 'react-dom/server';
import {describe, expect, expectTypeOf, it} from 'vitest';
import {Markdown} from '../Markdown';
import {parseMarkdownAst, parseMarkdownAstInternal} from '../parser';
import {createMarkdownPlugin, type MarkdownTransform} from './protocol';
import {createMarkdownFrontmatter} from './frontmatter';

const documentMetadata = createMarkdownFrontmatter({
  name: 'document-metadata',
  parse(fields) {
    return {title: fields.title ?? '', draft: fields.draft === 'true'};
  },
});

const SOURCE = '---\ntitle: Release notes\ndraft: true\n---\n# Shipped\n\nBody';

describe('createMarkdownFrontmatter', () => {
  it('removes document-start syntax and exposes typed metadata to later plugins', () => {
    let seen: ReturnType<typeof documentMetadata.getMetadata>;
    const observer = createMarkdownPlugin({
      name: 'frontmatter-observer',
      apiVersion: 1,
      transform(root) {
        seen = documentMetadata.getMetadata(root);
        return root;
      },
    });
    const root = parseMarkdownAst(SOURCE, {
      plugins: [documentMetadata.plugin, observer],
    });

    expect(seen).toEqual({title: 'Release notes', draft: true});
    expect(documentMetadata.parse(SOURCE)).toEqual({
      status: 'match',
      contentStart: SOURCE.indexOf('# Shipped'),
      metadata: {title: 'Release notes', draft: true},
    });
    expect(documentMetadata.getMetadata(root)).toEqual(seen);
    expect(root.children).toHaveLength(2);
    expect(JSON.stringify(root)).not.toContain('title: Release notes');
    expectTypeOf(documentMetadata.plugin).toMatchTypeOf<{
      readonly name: string;
    }>();
  });

  it('hides unfinished streaming frontmatter and exposes it once closed', () => {
    const partial = parseMarkdownAstInternal(
      '---\ntitle: Pending',
      {plugins: [documentMetadata.plugin]},
      false,
    );
    expect(documentMetadata.getMetadata(partial)).toBeUndefined();
    expect(partial.children).toEqual([]);

    const settled = parseMarkdownAstInternal(
      SOURCE,
      {plugins: [documentMetadata.plugin]},
      false,
    );
    expect(documentMetadata.getMetadata(settled)).toEqual({
      title: 'Release notes',
      draft: true,
    });
    expect(settled.children[0]).toMatchObject({type: 'heading'});
    expect(
      documentMetadata.parse(
        '---\r\ntitle: Windows\r\ndraft: false\r\n---\r\nBody',
      ),
    ).toMatchObject({
      status: 'match',
      metadata: {title: 'Windows', draft: false},
    });
  });

  it('does not treat non-leading frontmatter syntax as metadata', () => {
    expect(
      documentMetadata.getMetadata(
        parseMarkdownAst(`# Intro\n\n${SOURCE}`, {
          plugins: [documentMetadata.plugin],
        }),
      ),
    ).toBeUndefined();
  });

  it('keeps renderer and server output free of metadata syntax', () => {
    const html = renderToString(
      <Markdown plugins={[documentMetadata.plugin]}>{SOURCE}</Markdown>,
    );
    expect(html).toContain('Shipped');
    expect(html).toContain('Body');
    expect(html).not.toContain('Release notes');
    expect(html).not.toContain('draft');
  });

  it('rejects duplicate fields and unrepresentable decoded metadata', () => {
    const duplicate = parseMarkdownAst(
      '---\ntitle: One\ntitle: Two\n---\nBody',
      {plugins: [documentMetadata.plugin]},
    );
    expect(documentMetadata.getMetadata(duplicate)).toBeUndefined();

    const invalid = createMarkdownFrontmatter({
      name: 'invalid',
      parse: () => new Date() as never,
    });
    expect(() =>
      parseMarkdownAst(SOURCE, {plugins: [invalid.plugin]}),
    ).not.toThrow();
  });

  it('accepts the decoded fields record as metadata (identity parse)', () => {
    const fields = createMarkdownFrontmatter({
      name: 'fields',
      parse: record => record,
    });
    const source = '---\ntitle: Release notes\n__proto__: kept\n---\n# Shipped';

    const parsed = fields.parse(source);
    expect(parsed).toEqual({
      status: 'match',
      contentStart: source.indexOf('# Shipped'),
      metadata: {title: 'Release notes', ['__proto__']: 'kept'},
    });
    if (parsed.status !== 'match') {
      throw new Error('expected a frontmatter match');
    }
    // A field named like a prototype key stays an ordinary own field.
    expect(Object.hasOwn(parsed.metadata, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(parsed.metadata)).toBe(Object.prototype);

    const root = parseMarkdownAst(source, {plugins: [fields.plugin]});
    expect(fields.getMetadata(root)).toEqual(parsed.metadata);
    expect(JSON.stringify(root)).not.toContain('title: Release notes');
  });

  it('returns a transform plugin that composes in the ordered pipeline', () => {
    expectTypeOf<MarkdownTransform>().toBeFunction();
    const root = parseMarkdownAst(SOURCE, {plugins: [documentMetadata.plugin]});
    expect(root.children[0]).toMatchObject({type: 'heading', depth: 1});
  });
});
