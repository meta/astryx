// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file parser.public.test.ts
 * @input Imports the documented Markdown parser-only package subpath
 * @output Runtime and type evidence for its canonical server-safe contract
 * @position Public package-contract test for @astryxdesign/core/Markdown/parser
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, expectTypeOf, it} from 'vitest';
import {
  createMarkdownFrontmatter,
  createMarkdownPlugin,
  getMarkdownPluginCapabilities,
} from '@astryxdesign/core/Markdown/plugins';
import {
  createIncrementalState,
  decodeMarkdownCharacterReferences,
  parseInline,
  parseInlineAst,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from '@astryxdesign/core/Markdown/parser';
import type {
  BlockNode,
  InlineNode,
  MarkdownAstPhrasingContent,
  MarkdownAstRoot,
} from '@astryxdesign/core/Markdown/parser';

describe('@astryxdesign/core/Markdown/parser', () => {
  it('exports the character reference decoder Markdown renders with (spec:AST-061 DEC-5)', () => {
    expectTypeOf(decodeMarkdownCharacterReferences).toEqualTypeOf<
      (text: string) => string
    >();
    expect(decodeMarkdownCharacterReferences('&copy; &unknown;')).toBe(
      '© &unknown;',
    );
  });

  it('is a generated public package subpath', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'packages/core/package.json'), 'utf8'),
    ) as {
      exports: Record<string, unknown>;
    };
    const entrySources = [
      'packages/core/src/Markdown/parser/index.ts',
      'packages/core/src/Markdown/parser.ts',
      'packages/core/src/Markdown/plugins/index.ts',
      'packages/core/src/Markdown/plugins/protocol.ts',
      'packages/core/src/Markdown/plugins/frontmatter.ts',
    ].map(path => readFileSync(join(process.cwd(), path), 'utf8'));

    expect(packageJson.exports['./Markdown/parser']).toEqual({
      source: './src/Markdown/parser/index.ts',
      types: './dist/Markdown/parser/index.d.ts',
      default: './dist/Markdown/parser/index.js',
    });
    for (const entrySource of entrySources) {
      expect(entrySource).not.toMatch(/^\s*['"]use client['"]/m);
    }
  });

  it('reports plugin capabilities from the server-safe plugin entry, and renders one node only from the client-only renderer entry (spec:AST-064 DEC-6)', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'packages/core/package.json'), 'utf8'),
    ) as {
      exports: Record<string, unknown>;
    };
    expect(packageJson.exports['./Markdown/plugin-renderer']).toEqual({
      source: './src/Markdown/plugin-renderer/index.ts',
      types: './dist/Markdown/plugin-renderer/index.d.ts',
      default: './dist/Markdown/plugin-renderer/index.js',
    });
    for (const path of [
      'packages/core/src/Markdown/plugin-renderer/index.ts',
      'packages/core/src/Markdown/plugin-renderer/MarkdownPluginNodeRenderer.tsx',
    ]) {
      expect(readFileSync(join(process.cwd(), path), 'utf8')).toMatch(
        /^(?:\/\/[^\n]*\n|\s)*['"]use client['"]/,
      );
    }
    const transformOnly = createMarkdownPlugin({
      name: 'server-capabilities',
      apiVersion: 1,
      transform: root => root,
    });
    expect(getMarkdownPluginCapabilities(transformOnly)).toEqual({
      syntax: false,
      transform: true,
    });
  });

  it('exposes legacy and canonical parser results from a server-only entry point', () => {
    const source = '# Heading\n\nParagraph';
    const blockAst = parseMarkdownAst(source);
    const inlineAst = parseInlineAst('**bold**');

    expect(blockAst).toMatchObject({
      type: 'root',
      children: [{type: 'heading', depth: 1}, {type: 'paragraph'}],
    });
    expect(inlineAst).toMatchObject([{type: 'strong'}]);
    expect(parseMarkdown(source)[0]).toMatchObject({type: 'heading', level: 1});
    expect(parseInline('**bold**')[0]).toMatchObject({type: 'bold'});
    expect(parseMarkdownIncremental(source, createIncrementalState())).toEqual(
      parseMarkdown(source),
    );

    const canonicalBlockAst: MarkdownAstRoot = blockAst;
    const canonicalInlineAst: ReadonlyArray<MarkdownAstPhrasingContent> =
      inlineAst;
    expect(canonicalBlockAst).toBe(blockAst);
    expect(canonicalInlineAst).toBe(inlineAst);
    expectTypeOf(parseMarkdown(source)).toEqualTypeOf<BlockNode[]>();
    expectTypeOf(parseInline('text')).toEqualTypeOf<InlineNode[]>();
  });

  it('runs typed plugins through the server-safe parser boundary', () => {
    const frontmatter = createMarkdownFrontmatter({
      name: 'server-document-metadata',
      parse: fields => ({title: fields.title ?? 'Untitled'}),
    });
    let title: string | undefined;
    const observer = createMarkdownPlugin({
      name: 'server-metadata-observer',
      apiVersion: 1,
      transform(root) {
        title = frontmatter.getMetadata(root)?.title;
        return root;
      },
    });
    const root = parseMarkdownAst('---\ntitle: Server proof\n---\n# Body', {
      plugins: [frontmatter.plugin, observer],
    });

    expect(title).toBe('Server proof');
    expect(root.children).toMatchObject([{type: 'heading', depth: 1}]);
  });
});
