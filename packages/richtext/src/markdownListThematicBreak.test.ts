// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; children?: Json[]};

const CORE_TO_RICH: Record<string, string> = {
  list: 'list',
  thematicBreak: 'horizontalrule',
  paragraph: 'paragraph',
};

describe('a thematic break after a list item, on both surfaces', () => {
  it.each([
    '- item\n* * *',
    '- item\n- - -',
    '* item\n* * *',
    '- item\n\n* * *',
  ])('reads %j as a list and then a break, as core does', markdown => {
    const rich = (
      JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}
    ).root.children?.map(node => node.type);
    const core = (parseMarkdownAst(markdown).children as unknown as Json[]).map(
      node => CORE_TO_RICH[node.type] ?? node.type,
    );
    expect(rich).toEqual(['list', 'horizontalrule']);
    expect(core).toEqual(rich);
  });
});
