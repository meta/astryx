// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$getRoot} from 'lexical';
import {parseInline, parseMarkdown} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

interface SerializedNode {
  readonly type: string;
  readonly text?: string;
  readonly children?: ReadonlyArray<SerializedNode>;
}

/** The text RichText imports for a one-paragraph document. */
function richTextText(markdown: string): string {
  const {root} = JSON.parse(markdownToEditorStateJSON(markdown)) as {
    root: SerializedNode;
  };
  const texts: Array<string> = [];
  const visit = (node: SerializedNode) => {
    if (node.text != null) {
      texts.push(node.text);
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return texts.join('');
}

/** The text core Markdown renders for the same paragraph. */
function markdownText(markdown: string): string {
  return parseInline(markdown)
    .map(node =>
      'content' in node
        ? String(node.content)
        : 'children' in node && Array.isArray(node.children)
          ? node.children
              .map(child => ('content' in child ? String(child.content) : ''))
              .join('')
          : '',
    )
    .join('');
}

// One table for both surfaces (spec:AST-061 DEC-5).
const CASES = [
  '&copy;',
  '&#169;',
  '&#xA9; and &#XA9;',
  'Fish &amp; chips',
  '&amp;copy;',
  '&NotEqualTilde;',
  '&unknown;',
  '&copy without a semicolon',
  '& copy;',
  '&#0; &#xD800; &#x110000;',
  '&#12345678;',
  'a&nbsp;b',
  '\\&copy; is escaped',
  // Backslashes inside a code span are literal and close nothing early.
  'Paths like `C:\\` &amp; `D:\\` work',
  'Path `C:\\` then &#12345678; and &copy;',
  // An escaped opener, and spans of one, two, and three backticks.
  '\\`&amp;` stays text',
  '``a ` &amp; b`` and &amp;',
  'Then ```a `` &amp; b``` and &copy;',
  // An unclosed run is literal.
  '`unclosed &amp; text',
  '\\&#169; is escaped too',
  '\\\\&copy; follows an escaped backslash',
  'code `&copy;` stays',
];

describe('character references (spec:AST-061 FR7, DEC-5)', () => {
  it('import exactly as core Markdown renders them', () => {
    for (const source of CASES) {
      expect(richTextText(`${source}\n`), source).toBe(markdownText(source));
    }
  });

  it('decode the same way in headings, lists, quotes, links, and table cells', () => {
    const {root} = JSON.parse(
      markdownToEditorStateJSON(
        [
          '# Caf&eacute; &#x2014; menu',
          '',
          '- Fish &amp; chips',
          '> &copy; 2026',
          '',
          '[Terms &amp; conditions](https://example.com/?a=1&amp;b=2 "T&amp;C")',
          '',
          '| Item &amp; size | Price |',
          '| --- | --- |',
          '| Tea \\| &frac12; `&copy;` **&#169;** | &#12345678; \\&copy; |',
          '',
        ].join('\n'),
      ),
    ) as {root: SerializedNode & {children: Array<SerializedNode>}};
    const texts: Array<string> = [];
    const links: Array<{url?: unknown; title?: unknown}> = [];
    const visit = (node: SerializedNode & {url?: unknown; title?: unknown}) => {
      if (node.text != null) {
        texts.push(node.text);
      }
      if (node.type === 'link') {
        links.push({url: node.url, title: node.title});
      }
      (node.children as Array<typeof node> | undefined)?.forEach(visit);
    };
    visit(root);
    const all = texts.join('|');
    expect(all).toContain('Café — menu');
    expect(all).toContain('Fish & chips');
    expect(all).toContain('© 2026');
    expect(all).toContain('Terms & conditions');
    expect(all).toContain('Item & size');
    expect(all).toContain('½');
    // Inline code keeps the reference; strong text decodes it.
    expect(texts).toContain('&copy;');
    expect(texts).toContain('©');
    // Not a reference, and an escaped one: literal.
    expect(all).toContain('&#12345678;');
    expect(all).toContain('&copy;');
    expect(links).toEqual([
      {url: 'https://example.com/?a=1&b=2', title: 'T&C'},
    ]);
  });

  it('decode thousands of references in one pass, without extra nodes', () => {
    for (const count of [2000, 6000, 10000]) {
      const unit = '&copy; &#169; &#12345678; \\&amp; &nope; ';
      const markdown = `${unit.repeat(count / 5)}\n`;
      const started = performance.now();
      const {root} = JSON.parse(markdownToEditorStateJSON(markdown)) as {
        root: SerializedNode;
      };
      const elapsed = performance.now() - started;
      const paragraph = root.children?.[0];
      // One paragraph, one text node: nothing split per reference.
      expect(paragraph?.children, String(count)).toHaveLength(1);
      const expected = '© © &#12345678; &amp; &nope; '.repeat(count / 5);
      // Compared as a flag, so a mismatch does not print the whole text.
      expect(paragraph?.children?.[0].text === expected, String(count)).toBe(
        true,
      );
      expect(elapsed, String(count)).toBeLessThan(5000);
    }
  });

  it('find code spans the CommonMark way: only a run of the same length closes one', () => {
    // A double run inside a single-backtick span neither closes it nor opens
    // one, so the whole is code and the reference stays as written.
    expect(richTextText('`one`` &amp; two`\n')).toBe('one`` &amp; two');
    // Fenced code and CRLF: the reference after the fence decodes.
    expect(richTextText('```\r\n&copy;\r\n```\r\n\r\n&copy;\r\n')).toBe(
      '&copy;©',
    );
  });

  it('stay literal in fenced code, as core Markdown keeps them', () => {
    const markdown = '```\n&copy; &#169;\n```\n';
    expect(richTextText(markdown)).toBe('&copy; &#169;');
    expect(parseMarkdown(markdown)[0]).toMatchObject({
      content: '&copy; &#169;',
    });
  });

  it('keep an untouched paragraph exact and write decoded text back so it reads the same (spec:AST-062)', () => {
    const markdown = 'A &copy; B &amp;copy; C &#169;\n';
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
    const editor = createHeadlessEditor({
      namespace: 'astryx-character-reference-test',
      nodes: [...DEFAULT_NODES],
      onError(error: Error) {
        throw error;
      },
    });
    editor.setEditorState(
      editor.parseEditorState(markdownToEditorStateJSON(markdown)),
    );
    editor.update(
      () => {
        const text = $getRoot().getAllTextNodes()[0];
        text?.setTextContent(`${text.getTextContent()}!`);
      },
      {discrete: true},
    );
    const exported = editorStateJSONToMarkdown(
      JSON.stringify(editor.getEditorState().toJSON()),
    );
    // The decoded `&copy;` text is escaped, so it does not decode again.
    expect(exported).toBe('A © B \\&copy; C ©!\n');
    expect(richTextText(exported)).toBe('A © B &copy; C ©!');
  });
});
