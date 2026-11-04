// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$createLinkNode} from '@lexical/link';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
} from 'lexical';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {
  $exportMarkdownKeepingSource,
  importMarkdownKeepingSource,
} from './markdownSource';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

type Json = Record<string, unknown>;

/** Inline content as one line: text, `code`, and <url|text> for links. */
function coreLine(markdown: string): Array<string> {
  const flat = (node: Json): string => {
    switch (node.type) {
      case 'text':
        return node.value as string;
      case 'inlineCode':
        return `\`${node.value as string}\``;
      case 'link':
        return `<${node.url as string}|${((node.children as Array<Json>) ?? []).map(flat).join('')}>`;
      default:
        return ((node.children as Array<Json>) ?? []).map(flat).join('');
    }
  };
  return (parseMarkdownAst(markdown).children as unknown as Array<Json>).map(
    flat,
  );
}

function richTextLine(markdown: string): Array<string> {
  const flat = (node: Json): string => {
    if (node.type === 'text') {
      const text = node.text as string;
      // Format bit 16 is inline code.
      return ((node.format as number) & 16) !== 0 ? `\`${text}\`` : text;
    }
    if (node.type === 'link' || node.type === 'autolink') {
      return `<${node.url as string}|${((node.children as Array<Json>) ?? []).map(flat).join('')}>`;
    }
    return ((node.children as Array<Json>) ?? []).map(flat).join('');
  };
  const root = (JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json})
    .root;
  return (root.children as Array<Json>).map(flat);
}

const ESCAPED = [
  // Escaped link syntax is text, not a link.
  '\\[x](y) text\n',
  '[x]\\(y) text\n',
  '\\[x\\](y) text\n',
  'See \\[docs](https://example.com) here\n',
  // Escaped emphasis, heading, image, and code markers stay literal.
  'a \\* b \\_ c \\# d \\! e \\` f \\~ g\n',
  '\\# not a heading\n',
  '1\\. not a list\n',
  // An escaped backslash before a real link: a backslash, then the link.
  '\\\\[x](https://example.com)\n',
  // Code keeps its backslashes.
  '`\\[x\\]` and \\[y\\]\n',
];

describe('backslash escapes (spec:AST-061 FR7)', () => {
  it.each(ESCAPED)('read as core reads them in %j', markdown => {
    expect(richTextLine(markdown)).toEqual(coreLine(markdown));
  });

  it.each(ESCAPED)('round-trip %j byte for byte', markdown => {
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
  });

  it('keep code fences as written', () => {
    const markdown = '```\n\\[x\\](y) \\*\n```\n';
    expect(richTextLine(markdown)).toEqual(['\\[x\\](y) \\*']);
  });

  it('keep a table cell pipe escaped', () => {
    const json = markdownToEditorStateJSON('| a \\| b | c |\n| --- | --- |\n');
    expect(JSON.stringify(JSON.parse(json))).toContain('"text":"a | b"');
  });
});

describe('an edited block with escaped syntax (spec:AST-062 FR3)', () => {
  it.each([
    ['\\[x](y) text\n', 'text', 'text!', '\\[x\\](y) text!\n'],
    ['See \\[docs](https://example.com) here\n', 'here', 'there', null],
    ['\\[x\\](y) text\n', 'text', 'text!', '\\[x\\](y) text!\n'],
  ] as const)(
    'exports %j edited so it reads back as the same text',
    (markdown, find, replace, expected) => {
      const editor = createHeadlessEditor({
        nodes: [...DEFAULT_NODES],
        onError(error) {
          throw error;
        },
      });
      importMarkdownKeepingSource(editor, markdown, [...DEFAULT_TRANSFORMERS]);
      editor.update(
        () => {
          const target = $getRoot()
            .getAllTextNodes()
            .find(node => node.getTextContent().includes(find));
          if (!$isTextNode(target)) {
            throw new Error(`No text holds ${find}`);
          }
          target.setTextContent(target.getTextContent().replace(find, replace));
        },
        {discrete: true},
      );
      const exported = editor
        .getEditorState()
        .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
      if (expected != null) {
        expect(exported).toBe(expected);
      }
      // No link appears, and the text is the edited text.
      expect(richTextLine(exported)).toEqual(
        richTextLine(markdown).map(line => line.replace(find, replace)),
      );
    },
  );
});

/** Each link's destination and text, in order. */
function linksOf(markdown: string): Array<[string, string]> {
  const found: Array<[string, string]> = [];
  const visit = (node: Json) => {
    if (node.type === 'link') {
      found.push([
        node.url as string,
        ((node.children as Array<Json>) ?? [])
          .map(child => child.text as string)
          .join(''),
      ]);
    }
    ((node.children as Array<Json>) ?? []).forEach(visit);
  };
  visit((JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root);
  return found;
}

/** Imports `markdown`, appends `!` to its last text, and exports it. */
function editedExport(markdown: string): string {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  importMarkdownKeepingSource(editor, markdown, [...DEFAULT_TRANSFORMERS]);
  editor.update(
    () => {
      const last = $getRoot().getAllTextNodes().at(-1);
      if (!$isTextNode(last)) {
        throw new Error('No text');
      }
      last.setTextContent(`${last.getTextContent()}!`);
    },
    {discrete: true},
  );
  return editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
}

describe('parentheses in link destinations (spec:AST-062 FR3)', () => {
  it.each([
    ['[x](https://e.com/\\(bar\\)) text\n', 'https://e.com/(bar)'],
    ['[x](a\\)b) text\n', 'a)b'],
    ['[x](a\\(b) text\n', 'a(b'],
    ['[x](https://e.com/foo(bar)) text\n', 'https://e.com/foo(bar)'],
    ['[x](https://e.com/foo(bar) "Title") text\n', 'https://e.com/foo(bar)'],
  ] as const)(
    'reads %j as one link, round-trips it, and keeps it through an edit',
    (markdown, url) => {
      expect(linksOf(markdown)).toEqual([[url, 'x']]);
      expect(
        editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown)),
      ).toBe(markdown);
      const edited = editedExport(markdown);
      expect(linksOf(edited)).toEqual([[url, 'x']]);
      expect(edited).toContain('text!');
    },
  );

  it('reads balanced parentheses in a destination as core does', () => {
    const markdown = '[x](https://e.com/foo(bar)) text\n';
    expect(richTextLine(markdown)).toEqual(coreLine(markdown));
  });

  it('writes a link made in the editor so it reads back as the same link', () => {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    for (const url of [
      'https://e.com/a(b',
      'https://e.com/a)b',
      'https://e.com/(ok)',
    ]) {
      editor.update(
        () => {
          const link = $createLinkNode(url);
          link.append($createTextNode('x'));
          $getRoot().clear().append($createParagraphNode().append(link));
        },
        {discrete: true},
      );
      const exported = editor
        .getEditorState()
        .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
      expect(linksOf(exported)).toEqual([[url, 'x']]);
    }
  });
});
