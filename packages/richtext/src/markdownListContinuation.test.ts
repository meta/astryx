// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; children?: Json[]};

/** The nesting of a document's lists: each list as the item texts' depth. */
function listShape(nodes: ReadonlyArray<Json>, type: string): string {
  return nodes
    .map(node =>
      node.type === type
        ? `[${listShape(node.children ?? [], type)}]`
        : node.children == null
          ? ''
          : listShape(node.children, type),
    )
    .join('');
}

describe('a nested list after a blank line, on both surfaces', () => {
  it.each([
    '1. a\n\n   - sub\n2. b',
    '1. a\n\n    26. b',
    '- a\n\n  - b\n\n- c',
  ])('nests %j the same way as core', markdown => {
    const rich = (
      JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}
    ).root.children;
    const core = parseMarkdownAst(markdown).children as unknown as Json[];
    expect(listShape(rich ?? [], 'list')).toBe(listShape(core, 'list'));
  });
});
