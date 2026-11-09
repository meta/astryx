// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {createHeadlessEditor} from '@lexical/headless';
import {
  $convertFromMarkdownString,
  BOLD_STAR,
  ITALIC_STAR,
  UNORDERED_LIST,
  type Transformer,
} from '@lexical/markdown';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $parseSerializedNode,
  INSERT_LINE_BREAK_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type SerializedLexicalNode,
} from 'lexical';
import {DEFAULT_NODES} from './editorNodes';
import {normalizeListIndentation} from './markdownListIndentation';
import {
  $restoreCharacterReferences,
  $restoreCodeSpans,
  protectCharacterReferences,
  protectCodeSpans,
} from './markdownCharacterReferences';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';
import {
  $joinSoftLineBreaks,
  $nestFollowingLists,
  absentToken,
  splitMarkdownChunks,
} from './markdownSource';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {RichTextEditorAutoLinkPlugin} from './RichTextEditorAutoLinkPlugin';

/**
 * The conformance corpus for spec:AST-062. Each document must come back byte
 * for byte from a no-op round trip, whatever RichText makes of it.
 */
interface SerializedShapeNode {
  readonly type: string;
  readonly text?: string;
  readonly children?: ReadonlyArray<SerializedShapeNode>;
}

const CORPUS: Record<string, string> = {
  empty: '',
  whitespaceOnly: '   \n\n\t\n',
  singleParagraphNoNewline: 'Plain paragraph',
  singleParagraphNewline: 'Plain paragraph\n',
  extraTrailingNewlines: 'Paragraph\n\n\n',
  leadingBlankLines: '\n\n# Title\n\nBody\n',
  trailingSpacesOnLines: 'Line with trailing spaces   \n\nNext   \n',
  crlf: '# Title\r\n\r\nFirst paragraph\r\nsoft break\r\n',
  byteOrderMark: '\uFEFF# Title\n\nBody\n',
  atxClosingHashes: '# Title #\n\n## Section ##\n',
  setextHeadings: 'Title\n=====\n\nSection\n-------\n',
  emphasisVariants:
    '*em* and _em_, **strong** and __strong__, ***both*** and ~~struck~~\n',
  inlineCodeBackticks: 'Use `code` and `` a`b `` here\n',
  links:
    '[inline](https://example.com) and [titled](https://example.com "Title") and <https://example.com/auto>\n',
  referenceLinks:
    'See [the docs][docs] and [docs].\n\n[docs]: https://example.com/docs "Docs"\n',
  bareUrl: 'Visit https://example.com/status today\n',
  hardBreaks: 'Two spaces  \nand a backslash\\\nend\n',
  softBreaks: 'One line\nsame paragraph\nstill same\n',
  blockquote: '> Quote line one\nlazy continuation\n>\n> > nested quote\n',
  nestedListsTwoSpace: '- Parent\n  - Child\n    - Grandchild\n- Sibling\n',
  nestedListsThreeSpace: '1. First\n   1. Nested\n2. Second\n',
  nestedListsFourSpace: '- Parent\n    - Child\n',
  listMarkers: '* star\n+ plus\n- dash\n',
  orderedStartAndParen: '3. three\n4. four\n\n1) paren\n2) paren\n',
  looseList: '- loose one\n\n- loose two\n',
  taskList: '- [ ] open\n- [x] done\n',
  fenceInfoAndMeta:
    '```ts title="retry.ts" {2}\nconst x = 1;\n\nconst y = 2;\n```\n',
  tildeFence: '~~~python\nprint("hi")\n~~~\n',
  longerFence: '````md\n```js\nnested();\n```\n````\n',
  unclosedFence: '```\nnever closed\n\nstill code',
  indentedCode: 'Paragraph\n\n    indented code\n    more\n',
  thematicBreaks: 'Above\n\n***\n\n___\n\n- - -\n\nBelow\n',
  escapes:
    '\\# not a heading\n\n\\*not italic\\* and \\_not\\_ and \\\\ backslash\n',
  characterReferences: 'Entities: &amp; &copy; &#169; &#x1F600; &nbsp;\n',
  htmlBlock: '<div align="center">\n  <b>HTML</b>\n</div>\n\nAfter\n',
  htmlInlineAndComment: 'Inline <kbd>Ctrl</kbd> and <!-- comment -->\n',
  footnote: 'Claim.[^1]\n\n[^1]: The footnote.\n',
  frontMatterLike: '---\ntitle: Notes\n---\n\nBody\n',
  unicodeAndRtl: 'Emoji 🎉 and עברית mixed with English\n',
  malformedEmphasis: '**unclosed strong and *unclosed em\n',
  malformedLink: '[no destination] and [broken](\n',
  tabsAndMixedIndent: '\t- tab list\n  \t- mixed\n',
  tableCanonical: '| Name | Role |\n| --- | --- |\n| Ada | Engineer |\n',
  tableNonCanonical:
    'Area|Owner |Status\n:-|:-:|-:\n`a \\| b`|**Ada**|  done  \n\nAfter\n',
  tableRaggedAndEscaped:
    '| A | B \\| C |\n|---|---|\n| only one |\n| 1 | 2 | 3 |\n',
  mixedDocument:
    '# Release notes\n\nIntro with **bold** and a [link](https://example.com).\n\n- One\n  - Two\n\n```ts\nconst a = 1;\n```\n\n> Quote\n\nEnd\n',
};

function roundTrip(
  markdown: string,
  transformers?: Array<Transformer>,
): string {
  return editorStateJSONToMarkdown(
    markdownToEditorStateJSON(markdown, {transformers}),
    {transformers},
  );
}

/** Applies an edit to the imported state and exports it again. */
function editAndExport(
  markdown: string,
  edit: () => void,
  transformers?: Array<Transformer>,
): string {
  const editor = createHeadlessEditor({
    namespace: 'astryx-markdown-source-test',
    nodes: [...DEFAULT_NODES],
    onError(error: Error) {
      throw error;
    },
  });
  editor.setEditorState(
    editor.parseEditorState(
      markdownToEditorStateJSON(markdown, {transformers}),
    ),
  );
  editor.update(edit, {discrete: true});
  return editorStateJSONToMarkdown(
    JSON.stringify(editor.getEditorState().toJSON()),
    {transformers},
  );
}

function $appendToBlock(index: number, text: string): void {
  const block = $getRoot().getChildren()[index];
  if (!$isElementNode(block)) {
    throw new Error(`block ${index} is not an element`);
  }
  const textNode = block.getAllTextNodes()[0];
  textNode.setTextContent(textNode.getTextContent() + text);
}

function $appendToTextContaining(needle: string, text: string): void {
  const node = $getRoot()
    .getAllTextNodes()
    .find(candidate => candidate.getTextContent().includes(needle));
  node?.setTextContent(node.getTextContent() + text);
}

function $appendToBlockContaining(needle: string, text: string): void {
  const index = $getRoot()
    .getChildren()
    .findIndex(block => block.getTextContent().includes(needle));
  $appendToBlock(index, text);
}

describe('Markdown source preservation (spec:AST-062)', () => {
  it('has at least 30 corpus documents', () => {
    expect(Object.keys(CORPUS).length).toBeGreaterThanOrEqual(30);
  });

  it.each(Object.entries(CORPUS))(
    'splits %s into chunks that join back to the input',
    (_name, markdown) => {
      const chunks = splitMarkdownChunks(markdown);
      const joined = chunks
        .map(chunk => chunk.leading + chunk.content + chunk.trailing)
        .join('');
      expect(chunks.length === 0 ? markdown.trim() : joined).toBe(
        chunks.length === 0 ? '' : markdown,
      );
    },
  );

  it.each(Object.entries(CORPUS))(
    'returns %s byte for byte from a no-op round trip (FR1)',
    (_name, markdown) => {
      expect(roundTrip(markdown)).toBe(markdown);
    },
  );

  it('keeps every untouched block when the first, a middle, or the last block changes (FR2)', () => {
    const source =
      '# Title\n\nFirst  paragraph\n\n- One\n  - Two\n\n\\# escaped\n\nLast &#169;\n';
    expect(editAndExport(source, () => $appendToBlock(0, ' edited'))).toBe(
      '# Title edited\n\nFirst  paragraph\n\n- One\n  - Two\n\n\\# escaped\n\nLast &#169;\n',
    );
    const middle = editAndExport(source, () => $appendToBlock(1, ' edited'));
    expect(middle.startsWith('# Title\n\n')).toBe(true);
    expect(
      middle.endsWith('\n\n- One\n  - Two\n\n\\# escaped\n\nLast &#169;\n'),
    ).toBe(true);
    expect(middle).toContain('edited');
    const last = editAndExport(source, () => {
      const block = $getRoot().getLastChild();
      if ($isElementNode(block)) {
        block.clear();
        block.append($createTextNode('Changed last'));
      }
    });
    expect(last).toBe(
      '# Title\n\nFirst  paragraph\n\n- One\n  - Two\n\n\\# escaped\n\nChanged last\n',
    );
  });

  it('keeps every untouched block when a block is inserted or deleted (FR2)', () => {
    const source = 'Alpha  \n\n\\# Beta\n\nGamma &copy;\n';
    expect(
      editAndExport(source, () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Inserted'));
        $getRoot().getChildren()[0].insertAfter(paragraph);
      }),
    ).toBe('Alpha  \n\nInserted\n\n\\# Beta\n\nGamma &copy;\n');
    expect(
      editAndExport(source, () => {
        $getRoot().getChildren()[1].remove();
      }),
    ).toBe('Alpha  \n\nGamma &copy;\n');
    expect(
      editAndExport(source, () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Appended'));
        $getRoot().append(paragraph);
      }),
    ).toBe('Alpha  \n\n\\# Beta\n\nGamma &copy;\n\nAppended\n');
  });

  it('keeps unsupported source when other blocks change, and keeps its characters when it changes (FR5)', () => {
    const source =
      '<div align="center">\n  <b>HTML</b>\n</div>\n\n[docs]: https://example.com/docs\n\nEdit me\n';
    expect(
      editAndExport(source, () => $appendToBlockContaining('Edit me', ' now')),
    ).toBe(
      '<div align="center">\n  <b>HTML</b>\n</div>\n\n[docs]: https://example.com/docs\n\nEdit me now\n',
    );
    const editedHtml = editAndExport(source, () =>
      $appendToBlockContaining('HTML', ' x'),
    );
    for (const fragment of ['<div align="center">', '<b>HTML</b>', '</div>']) {
      expect(editedHtml).toContain(fragment);
    }
    expect(
      editedHtml.endsWith('\n\n[docs]: https://example.com/docs\n\nEdit me\n'),
    ).toBe(true);
  });

  it('writes a regenerated block so it imports again as what the editor showed (FR3)', () => {
    const source = '\\# not a heading\n\nKeep\n';
    const edited = editAndExport(source, () =>
      $appendToBlockContaining('not a heading', ' [x] 1. *y* &copy;'),
    );
    expect(edited).toBe(
      '\\# not a heading \\[x\\] 1. \\*y\\* \\&copy;\n\nKeep\n',
    );
    // Importing the regenerated Markdown shows the same literal text again.
    const reloaded = JSON.parse(markdownToEditorStateJSON(edited)) as {
      root: {children: Array<{type: string}>};
    };
    expect(reloaded.root.children.map(node => node.type)).toEqual([
      'paragraph',
      'paragraph',
    ]);
    expect(
      editAndExport('Lead\n', () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('1. not a list'));
        $getRoot().append(paragraph);
      }),
    ).toBe('Lead\n\n1\\. not a list\n');
  });

  it('keeps the byte order mark, leading bytes, and line endings (FR4)', () => {
    const crlf =
      '\uFEFF\r\n# Title\r\n\r\nFirst\r\nsecond line\r\n\r\nLast\r\n';
    expect(roundTrip(crlf)).toBe(crlf);
    expect(
      editAndExport(crlf, () => $appendToBlockContaining('Title', '!')),
    ).toBe('\uFEFF\r\n# Title!\r\n\r\nFirst\r\nsecond line\r\n\r\nLast\r\n');
    // The editor shows the two lines as two paragraphs, so the regenerated
    // group writes two paragraphs, in the group's CRLF style.
    expect(
      editAndExport(crlf, () => $appendToBlockContaining('First', ' one')),
    ).toBe('\uFEFF\r\n# Title\r\n\r\nFirst second line one\r\n\r\nLast\r\n');
    expect(
      editAndExport(crlf, () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Added'));
        $getRoot().append(paragraph);
      }),
    ).toBe(
      '\uFEFF\r\n# Title\r\n\r\nFirst\r\nsecond line\r\n\r\nLast\r\n\r\nAdded\r\n',
    );
    expect(
      editAndExport(crlf, () => {
        $getRoot().getChildren()[0].remove();
      }).startsWith('\uFEFF'),
    ).toBe(true);
  });

  it('keeps a bare URL as written when the autolink plugin links it on load (FR1, FR6)', async () => {
    const markdown = 'Status at https://example.com/status today.\n\n- item\n';
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(markdown)}
        plugins={<RichTextEditorAutoLinkPlugin />}
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector('a[href="https://example.com/status"]'),
      ).not.toBeNull(),
    );
    expect(ref.current?.getMarkdown()).toBe(markdown);
  });

  it('regenerates only an edited table, in canonical form, and keeps the rest (FR2, FR6)', () => {
    const source = 'Intro  \n\nArea|Owner\n:-|-:\nSearch|Ada\n\n\\# Outro\n';
    expect(
      editAndExport(source, () => $appendToTextContaining('Search', ' 2')),
    ).toBe(
      'Intro  \n\n| Area | Owner |\n| :--- | ---: |\n| Search 2 | Ada |\n\n\\# Outro\n',
    );
  });

  it('keeps a rule beside an edited block as written (FR2)', () => {
    const contents = (markdown: string) =>
      splitMarkdownChunks(markdown).map(chunk => chunk.content);
    // A thematic break is a chunk of its own.
    expect(contents('- item\n---\n')).toEqual(['- item', '---']);
    expect(contents('> quote\n***\nAfter\n')).toEqual([
      '> quote',
      '***',
      'After',
    ]);
    expect(contents('- a\n- - -\n- b\n')).toEqual(['- a', '- - -', '- b']);
    expect(contents('Para\n___\n')).toEqual(['Para', '___']);
    // A dash-only line under paragraph lines underlines them instead, and a
    // rule inside fenced code is code.
    expect(contents('Title\nmore\n---\n')).toEqual(['Title\nmore\n---']);
    expect(contents('```\n---\n```\n')).toEqual(['```\n---\n```']);
    // Chunks still join back to the input exactly.
    const crlf = '- item\r\n---\r\nAfter\r\n';
    expect(
      splitMarkdownChunks(crlf)
        .map(chunk => chunk.leading + chunk.content + chunk.trailing)
        .join(''),
    ).toBe(crlf);
    // A rule as written keeps the line break after it, whatever follows;
    // the block above a `***` or `___` rule keeps its line break even when it
    // changes, but above `---`, which could underline a paragraph as a
    // heading, a changed block is set apart by a blank line.
    const edit = (markdown: string, needles: ReadonlyArray<string>) =>
      editAndExport(markdown, () => {
        for (const needle of needles) {
          $appendToTextContaining(needle, '!');
        }
      });
    expect(edit('- item\n* * *\nAfter\n', ['After'])).toBe(
      '- item\n* * *\nAfter!\n',
    );
    expect(edit('- item\n* * *\nAfter\n', ['item'])).toBe(
      '- item!\n* * *\nAfter\n',
    );
    expect(edit('- item\n* * *\nAfter\n', ['item', 'After'])).toBe(
      '- item!\n* * *\nAfter!\n',
    );
    expect(edit('Para\n___\nAfter\n', ['Para'])).toBe('Para!\n___\nAfter\n');
    expect(edit('- item\n---\nAfter\n', ['item', 'After'])).toBe(
      '- item!\n\n---\nAfter!\n',
    );
    // Blank lines stay blank lines.
    expect(edit('- item\n\n* * *\n\nAfter\n', ['item'])).toBe(
      '- item!\n\n* * *\n\nAfter\n',
    );
    // CRLF is kept as written.
    expect(edit('- item\r\n* * *\r\nAfter\r\n', ['After'])).toBe(
      '- item\r\n* * *\r\nAfter!\r\n',
    );
    // Consecutive rules, untouched, are byte for byte.
    expect(edit('---\n***\n___\nText\n', ['Text'])).toBe(
      '---\n***\n___\nText!\n',
    );
    // A block inserted after a rule follows its line break; a rule moved to
    // the end is set apart from what now comes before it.
    expect(
      editAndExport('- item\n* * *\nAfter\n', () => {
        const rule = $getRoot()
          .getChildren()
          .find(node => node.getType() === 'horizontalrule');
        const inserted = $createParagraphNode().append($createTextNode('New'));
        rule?.insertAfter(inserted);
      }),
    ).toBe('- item\n* * *\nNew\n\nAfter\n');
    expect(
      editAndExport('- item\n* * *\nAfter\n', () => {
        const rule = $getRoot()
          .getChildren()
          .find(node => node.getType() === 'horizontalrule');
        if (rule != null) {
          $getRoot().append(rule);
        }
      }),
    ).toBe('- item\n\nAfter\n\n* * *\n');
    // A paragraph added after a rule that ended the document is set apart.
    expect(
      editAndExport('Para\n\n* * *\n', () => {
        $getRoot().append(
          $createParagraphNode().append($createTextNode('More')),
        );
      }),
    ).toBe('Para\n\n* * *\n\nMore\n');
    // Deleting the rule never joins the blocks it separated.
    expect(
      editAndExport('- item\n---\nAfter\n', () => {
        $getRoot()
          .getChildren()
          .find(node => node.getType() === 'horizontalrule')
          ?.remove();
      }),
    ).toBe('- item\n\nAfter\n');
  });

  it('imports the same structure as importing the whole document at once', () => {
    // Node state aside, chunked import must build exactly the tree Lexical's
    // own import builds from the list-normalized document, soft breaks
    // joined: lazy continuation lines, loose lists, and line breaks all land
    // in the same blocks.
    const structureOf = (json: string): unknown =>
      JSON.parse(json, (key, value: unknown) =>
        key === '$' ? undefined : value,
      );
    const wholeDocument = (markdown: string): string => {
      const editor = createHeadlessEditor({
        namespace: 'astryx-markdown-source-whole',
        nodes: [...DEFAULT_NODES],
        onError(error: Error) {
          throw error;
        },
      });
      editor.update(
        () => {
          // The import reads code spans and character references through
          // stand-ins; the reference does too.
          const code = protectCodeSpans(
            normalizeListIndentation(
              markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'),
            ),
          );
          const {markdown: protectedMarkdown, standIns} =
            protectCharacterReferences(code.markdown);
          $convertFromMarkdownString(protectedMarkdown, [
            ...DEFAULT_TRANSFORMERS,
          ]);
          $restoreCharacterReferences($getRoot(), standIns);
          $restoreCodeSpans($getRoot(), code.spans);
          $nestFollowingLists($getRoot());
          $joinSoftLineBreaks($getRoot());
        },
        {discrete: true},
      );
      return JSON.stringify(editor.getEditorState().toJSON());
    };
    for (const [name, markdown] of Object.entries(CORPUS)) {
      expect(structureOf(markdownToEditorStateJSON(markdown)), name).toEqual(
        structureOf(wholeDocument(markdown)),
      );
    }
  });

  it('continues a block across soft line breaks and keeps hard breaks', () => {
    const shape = (markdown: string): string => {
      const {root} = JSON.parse(markdownToEditorStateJSON(markdown)) as {
        root: SerializedShapeNode;
      };
      const describe = (node: SerializedShapeNode): string =>
        node.children != null
          ? `${node.type}[${node.children.map(describe).join(',')}]`
          : node.type === 'text'
            ? JSON.stringify(node.text)
            : node.type;
      return root.children?.map(describe).join(' ') ?? '';
    };
    expect(shape('One line\nsame paragraph\nstill same\n')).toBe(
      'paragraph["One line same paragraph still same"]',
    );
    expect(shape('Two spaces  \nand a backslash\\\nend\n')).toBe(
      'paragraph["Two spaces",linebreak,"and a backslash",linebreak,"end"]',
    );
    expect(shape('- An item\n  that continues\n')).toBe(
      'list[listitem["An item that continues"]]',
    );
    expect(shape('> A quote\n> on two lines\n')).toBe(
      'quote["A quote on two lines"]',
    );
    expect(shape('**Bold**\nthen plain\n')).toBe(
      'paragraph["Bold"," then plain"]',
    );
    // Code keeps its line endings.
    expect(shape('```\nline one\nline two\n```\n')).toBe(
      'code["line one\\nline two"]',
    );
    // An edited paragraph is written again on one line.
    expect(
      editAndExport('One line\nsame paragraph\n\nNext\n', () =>
        $appendToTextContaining('One line', ' edited'),
      ),
    ).toBe('One line same paragraph edited\n\nNext\n');
  });

  it('writes a line break typed in the editor as a hard break that survives a reload (FR3)', async () => {
    const markdown =
      'Ada Lovelace\n\n- item one\n\n> quoted text\n\nTwo spaces  \nkept\n\n```\ncode line\n```\n';
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(markdown)}
      />,
    );
    // Edit only once the document has loaded.
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    const editor = ref.current?.getEditor();
    // Shift+Enter after the first word of the paragraph, the list item, the
    // quote, and the code line.
    for (const text of [
      'Ada Lovelace',
      'item one',
      'quoted text',
      'code line',
    ]) {
      editor?.update(
        () => {
          const node = $getRoot()
            .getAllTextNodes()
            .find(candidate => candidate.getTextContent().startsWith(text));
          node?.select(text.indexOf(' '), text.indexOf(' '));
        },
        {discrete: true},
      );
      editor?.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
    }
    const edited =
      'Ada\\\n Lovelace\n\n- item\\\n one\n\n> quoted\\\n>  text\n\nTwo spaces  \nkept\n\n```\ncode\n line\n```\n';
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(edited));
    // A reload keeps every typed break as a line break.
    const reloaded = JSON.parse(markdownToEditorStateJSON(edited)) as {
      root: SerializedShapeNode;
    };
    const lineBreaks = (node: SerializedShapeNode): number =>
      (node.type === 'linebreak' ? 1 : 0) +
      (node.children ?? []).reduce(
        (count, child) => count + lineBreaks(child),
        0,
      );
    // Paragraph, list item, quote, and the imported two-space break; the
    // code line break is part of the code text.
    expect(lineBreaks(reloaded.root)).toBe(4);
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(edited))).toBe(
      edited,
    );
    editor?.dispatchCommand(UNDO_COMMAND, undefined);
    await waitFor(() => expect(ref.current?.getMarkdown()).not.toBe(edited));
    editor?.dispatchCommand(REDO_COMMAND, undefined);
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(edited));
  });

  it('leaves a line break typed in a heading as Lexical writes it', async () => {
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON('## Release title\n\nBody\n')}
      />,
    );
    // Edit only once the document has loaded.
    await waitFor(() =>
      expect(ref.current?.getMarkdown()).toBe('## Release title\n\nBody\n'),
    );
    const editor = ref.current?.getEditor();
    editor?.update(
      () => {
        const node = $getRoot()
          .getAllTextNodes()
          .find(candidate => candidate.getTextContent() === 'Release title');
        node?.select(7, 7);
      },
      {discrete: true},
    );
    editor?.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
    // No backslash: a heading has no hard-break form.
    const markdown = '## Release\n title\n\nBody\n';
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    const {root} = JSON.parse(markdownToEditorStateJSON(markdown)) as {
      root: SerializedShapeNode;
    };
    expect(root.children?.[0]?.type).toBe('heading');
    expect(JSON.stringify(root)).not.toContain('\\\\');
  });

  it('keeps document facts at the document when blocks move, repeat, or go (FR4)', () => {
    const source = '\uFEFF\n\nAlpha\n\n\\# Beta\n\nGamma\n\n';
    // Moving the first block to the end keeps the envelope at the edges.
    expect(
      editAndExport(source, () => {
        const [alpha] = $getRoot().getChildren();
        $getRoot().append(alpha);
      }),
    ).toBe('\uFEFF\n\n\\# Beta\n\nGamma\n\nAlpha\n\n');
    // Repeating a block does not repeat the envelope.
    expect(
      editAndExport(source, () => {
        const [alpha] = $getRoot().getChildren();
        const copy = $parseSerializedNode(
          alpha.exportJSON() as SerializedLexicalNode,
        );
        if ($isElementNode(alpha) && $isElementNode(copy)) {
          copy.append($createTextNode(alpha.getTextContent()));
        }
        $getRoot().getLastChild()?.insertAfter(copy);
      }),
    ).toBe('\uFEFF\n\nAlpha\n\n\\# Beta\n\nGamma\n\nAlpha\n\n');
    // Deleting the first block keeps the byte order mark and leading lines.
    expect(
      editAndExport(source, () => {
        $getRoot().getFirstChild()?.remove();
      }),
    ).toBe('\uFEFF\n\n\\# Beta\n\nGamma\n\n');
  });

  it('writes a block taken from another document in the line endings of the one it joins (FR4)', () => {
    const lf = 'One\n\nTwo\n';
    const crlf = 'Uno\r\n\r\nDos\r\nmismo\r\n';
    const moveFirstBlock = (from: string, to: string): string => {
      const source = createHeadlessEditor({
        namespace: 'astryx-markdown-source-from',
        nodes: [...DEFAULT_NODES],
        onError(error: Error) {
          throw error;
        },
      });
      source.setEditorState(
        source.parseEditorState(markdownToEditorStateJSON(from)),
      );
      const block = JSON.parse(JSON.stringify(source.getEditorState().toJSON()))
        .root.children[0] as SerializedLexicalNode;
      return editAndExport(to, () => {
        $getRoot().append($parseSerializedNode(block));
      });
    };
    expect(moveFirstBlock(crlf, lf)).toBe('One\n\nTwo\n\nUno\n');
    expect(moveFirstBlock(lf, crlf)).toBe(
      'Uno\r\n\r\nDos\r\nmismo\r\n\r\nOne\r\n',
    );
  });

  it('never mistakes text for an escape token, whatever it contains (FR3)', () => {
    const tricky = 'Keeps \uFDD0 and \uE000 and \u{F0000} as written';
    expect(
      editAndExport(`${tricky}\n\nNext\n`, () =>
        $appendToTextContaining('Keeps', ' [x]'),
      ),
    ).toBe(`${tricky} \\[x\\]\n\nNext\n`);
    expect(absentToken('')).toBe('\uE000');
    expect(absentToken('\uE000')).toBe('\uE001');
    const everySingle = Array.from({length: 0xf8ff - 0xe000 + 1}, (_, index) =>
      String.fromCodePoint(0xe000 + index),
    ).join('');
    expect(absentToken(everySingle)).toBe('\u{F0000}');
  });

  it('follows edits, undo, and redo in a mounted editor (FR1, FR2)', async () => {
    const markdown = '# Title\n\n- One\n  - Two\n\nLast &#169;\n';
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(markdown)}
      />,
    );
    await waitFor(() => expect(ref.current).not.toBeNull());
    const editor = ref.current?.getEditor();
    expect(ref.current?.getMarkdown()).toBe(markdown);
    editor?.update(() => $appendToTextContaining('Last', ' edited'), {
      discrete: true,
    });
    expect(ref.current?.getMarkdown()).toBe(
      '# Title\n\n- One\n  - Two\n\nLast \u00a9 edited\n',
    );
    editor?.dispatchCommand(UNDO_COMMAND, undefined);
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    editor?.dispatchCommand(REDO_COMMAND, undefined);
    await waitFor(() =>
      expect(ref.current?.getMarkdown()).toBe(
        '# Title\n\n- One\n  - Two\n\nLast \u00a9 edited\n',
      ),
    );
  });

  it('gives a custom transformer array the same preservation (FR6)', () => {
    const custom = [BOLD_STAR, ITALIC_STAR, UNORDERED_LIST];
    const source = '# Not a heading here\n\n- **bold** item\n  - nested\n';
    expect(roundTrip(source, custom)).toBe(source);
  });

  it('returns the authored bytes from getMarkdown() after loading imported content (FR1)', async () => {
    for (const name of [
      'mixedDocument',
      'nestedListsThreeSpace',
      'fenceInfoAndMeta',
      'escapes',
      'characterReferences',
      'crlf',
    ]) {
      const markdown = CORPUS[name];
      const ref = createRef<RichTextEditorRef>();
      const {unmount} = render(
        <RichTextEditor
          label="Notes"
          ref={ref}
          defaultValue={markdownToEditorStateJSON(markdown)}
        />,
      );
      await waitFor(() => expect(ref.current).not.toBeNull());
      expect(ref.current?.getMarkdown(), name).toBe(markdown);
      unmount();
    }
  });
});
