// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$isCodeNode, type CodeNode} from '@lexical/code';
import {$getRoot, $isTextNode} from 'lexical';
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

/** Each top-level block: a code block's language and code, or its type. */
function blocks(markdown: string): Array<unknown> {
  const root = (JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json})
    .root;
  return (root.children as Array<Json>).map(node =>
    node.type === 'code'
      ? {
          language: node.language ?? null,
          code: ((node.children as Array<Json>) ?? [])
            .map(child =>
              child.type === 'linebreak' ? '\n' : (child.text as string),
            )
            .join(''),
        }
      : node.type,
  );
}

/** The same, as core Markdown reads it. */
function coreBlocks(markdown: string): Array<unknown> {
  return (parseMarkdownAst(markdown).children as unknown as Array<Json>).map(
    node =>
      node.type === 'code'
        ? {language: node.lang ?? null, code: node.value as string}
        : node.type,
  );
}

/** Imports `markdown`, edits its code block with `edit`, and exports. */
function editAndExport(
  markdown: string,
  edit: (code: CodeNode) => void,
): string {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  importMarkdownKeepingSource(editor, markdown, [...DEFAULT_TRANSFORMERS]);
  editor.update(
    () => {
      const code = $getRoot().getFirstChild();
      if (!$isCodeNode(code)) {
        throw new Error('No code block');
      }
      edit(code);
    },
    {discrete: true},
  );
  return editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
}

const setCode = (text: string) => (code: CodeNode) => {
  const first = code.getFirstChild();
  if (!$isTextNode(first)) {
    throw new Error('No code text');
  }
  first.setTextContent(text);
};

describe.each(['~~~', '```'])('%s fences (CommonMark 0.31 §4.5)', fence => {
  it.each([
    `${fence} js\nx\n${fence}\n`,
    `${fence}python title="a.py"\nx = 1\n${fence}\n`,
    `${fence} {.haskell .numberLines}\nmain = pure ()\n${fence}\n`,
    `${fence}c++\nint x;\n${fence}\n`,
    `${fence}\nplain\n${fence}\n`,
  ])(
    'reads %j with the language and code core reads, and round-trips it',
    markdown => {
      expect(blocks(markdown)).toEqual(coreBlocks(markdown));
      expect(
        editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown)),
      ).toBe(markdown);
    },
  );

  it('keeps the info string through an edit', () => {
    const edited = editAndExport(
      `${fence}python title="a.py"\nx = 1\n${fence}\n`,
      setCode('x = 2'),
    );
    expect(edited).toBe(`${fence}python title="a.py"\nx = 2\n${fence}\n`);
    expect(blocks(edited)).toEqual(coreBlocks(edited));
  });

  it('writes a changed language first, before the rest of the info string', () => {
    const edited = editAndExport(
      `${fence}python title="a.py"\nx = 1\n${fence}\n`,
      code => code.setLanguage('ruby'),
    );
    expect(edited).toBe(`${fence}ruby title="a.py"\nx = 1\n${fence}\n`);
  });
});

describe.each(['~~~', '```'])('%s fenced code lines', fence => {
  it.each([
    `${fence}python\n    indented = 1\nx = 2\n${fence}\n`,
    `${fence}\n single\nnext\n${fence}\n`,
    `${fence}\n\nafter a blank line\n${fence}\n`,
    `${fence}\nbefore a blank line\n\n${fence}\n`,
    `${fence}\n  only line\n${fence}\n`,
  ])(
    'keeps every line of %j as core reads it, and round-trips it',
    markdown => {
      expect(blocks(markdown)).toEqual(coreBlocks(markdown));
      expect(
        editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown)),
      ).toBe(markdown);
    },
  );

  it('keeps the first line indented through an edit', () => {
    const edited = editAndExport(
      `${fence}python\n    indented = 1\nx = 2\n${fence}\n`,
      code => {
        const text = code.getFirstChild();
        if (!$isTextNode(text)) {
          throw new Error('No code text');
        }
        text.setTextContent(text.getTextContent().replace('x = 2', 'x = 3'));
      },
    );
    expect(edited).toBe(`${fence}python\n    indented = 1\nx = 3\n${fence}\n`);
  });

  it('keeps a longer fence through an edit', () => {
    const long = fence[0].repeat(5);
    const edited = editAndExport(`${long}\nx\n${long}\n`, setCode('y'));
    expect(edited).toBe(`${long}\ny\n${long}\n`);
  });
});

describe.each(['~~~', '```'])('%s fence info after a space', fence => {
  it('reads the language after the space, and keeps the info as written through an edit', () => {
    const markdown = `${fence} js\nx = 1\n${fence}\n`;
    expect(blocks(markdown)).toEqual([{language: 'js', code: 'x = 1'}]);
    expect(blocks(markdown)).toEqual(coreBlocks(markdown));
    expect(editAndExport(markdown, setCode('x = 2'))).toBe(
      `${fence} js\nx = 2\n${fence}\n`,
    );
    expect(editAndExport(markdown, code => code.setLanguage('ruby'))).toBe(
      `${fence}ruby\nx = 1\n${fence}\n`,
    );
  });
});

describe('tilde code fences', () => {
  it.each([
    '~~~~\n~~~\ninner\n~~~\n~~~~\n',
    '~~~\n```\nbackticks\n```\n~~~\n',
    'Before\n\n~~~js\nx();\n~~~\n\nAfter\n',
  ])('reads %j as core does, and round-trips it', markdown => {
    expect(blocks(markdown)).toEqual(coreBlocks(markdown));
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
  });

  it.each(['~~~\nopen\ncode\n', '~~~\nopen\ncode'])(
    'runs the unclosed tilde block %j to the end of the document, as core does',
    markdown => {
      expect(blocks(markdown)).toEqual(coreBlocks(markdown));
    },
  );

  it('exports an edited tilde block with tildes, longer than any tilde fence in its code', () => {
    const edited = editAndExport('~~~ts\nconst a = 1;\n~~~\n', setCode('~~~'));
    expect(edited).toBe('~~~~ts\n~~~\n~~~~\n');
    expect(blocks(edited)).toEqual([{language: 'ts', code: '~~~'}]);
  });
});
