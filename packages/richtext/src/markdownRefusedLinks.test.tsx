// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {createHeadlessEditor} from '@lexical/headless';
import {$getRoot, $isTextNode} from 'lexical';
import {parseInlineAst} from '@astryxdesign/core/Markdown/parser';
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
import {RichTextView} from './RichTextView';
import {
  coreRefusesUrl,
  protectRefusedLinks,
} from './markdownCharacterReferences';

type Json = Record<string, unknown>;

/** The paragraph's links and its text, as RichText imports it. */
function imported(markdown: string): {links: string[]; text: string} {
  const links: string[] = [];
  let text = '';
  const visit = (node: Json) => {
    if (node.type === 'link' || node.type === 'autolink') {
      links.push(node.url as string);
    }
    if (node.type === 'text') {
      text += node.text as string;
    }
    ((node.children as Json[]) ?? []).forEach(visit);
  };
  visit((JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root);
  return {links, text};
}

/** The text core Markdown shows for an inline line. */
function coreText(markdown: string): string {
  const flat = (node: Json): string =>
    node.type === 'text'
      ? (node.value as string)
      : ((node.children as Json[]) ?? []).map(flat).join('');
  return (parseInlineAst(markdown) as unknown as Json[]).map(flat).join('');
}

describe('links core refuses (spec:AST-061 FR7)', () => {
  it.each([
    'Go [here](javascript:alert(1)) now',
    'Go [here](JavaScript:alert(1)) now',
    'Go [here](&#106;avascript:alert(1)) now',
    'Go [here](vbscript:msgbox) now',
    'Go [here](data:text/html,hi) now',
    'Go **[here](javascript:alert(1))** now',
    // Link text holding brackets of its own.
    '[a [b] c](javascript:alert(1))',
    '[[b]](vbscript:msgbox)',
    '[**a [b]**](javascript:alert(1))',
    '[a [b] c](&#106;avascript:alert(1))',
    '[[b]](&#x76;bscript:msgbox)',
    'See [**a [b]**](JaVaScRiPt:alert(1)) now',
  ])('imports %j as its source text, as core shows it', markdown => {
    const {links, text} = imported(markdown);
    expect(links).toEqual([]);
    expect(text).toBe(coreText(markdown));
  });

  it('still links a safe destination beside a refused one', () => {
    const {links, text} = imported(
      '[bad](javascript:x) and [good](https://example.com)',
    );
    expect(links).toEqual(['https://example.com']);
    expect(text).toBe('[bad](javascript:x) and good');
  });

  it('round-trips a refused link byte for byte, and keeps it text through an edit', () => {
    const markdown = 'Go [here](javascript:alert(1)) now\n';
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
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
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(imported(exported)).toEqual({
      links: [],
      text: 'Go [here](javascript:alert(1)) now!',
    });
  });

  it('renders no anchor for it', async () => {
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON('Go [here](javascript:alert(1)) now')}
      />,
    );
    await waitFor(() =>
      expect(container.textContent).toContain('[here](javascript:alert(1))'),
    );
    expect(container.querySelector('a')).toBeNull();
  });
});

/** A small deterministic generator, so the fuzz is the same every run. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('no unsafe URL is ever stored', () => {
  const unsafe = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '&#106;avascript:alert(1)',
    '&#x6A;avascript:alert(1)',
    'vbscript:msgbox',
    'data:text/html,hi',
    '\\javascript:alert(1)',
  ];

  it('for link text with random nested brackets and marks', () => {
    const random = generator(7);
    const pick = <T,>(items: ReadonlyArray<T>): T =>
      items[Math.floor(random() * items.length)];
    const text = (depth: number): string =>
      Array.from({length: 1 + Math.floor(random() * 3)}, () =>
        depth < 3 && random() < 0.4
          ? `${pick(['[', '[', '**[', '\\['])}${text(depth + 1)}${pick([']', ']', ']**', ''])}`
          : pick(['a', 'b c', '*d*', '`e`', ' ']),
      ).join('');
    for (let round = 0; round < 300; round++) {
      const markdown = `${pick(['', 'x ', '[', '] '])}[${text(0)}](${pick(unsafe)})${pick(['', ' y', ')', ']'])}`;
      const {links} = imported(markdown);
      expect(
        links.filter(url => coreRefusesUrl(url)),
        markdown,
      ).toEqual([]);
    }
  });

  it('for a link the editor makes that the source pass leaves', () => {
    // An unclosed inner bracket: the editor's own link rule reads the link
    // text from the first `[`.
    const {links} = imported('[a [b](javascript:alert(1))');
    expect(links).toEqual([]);
  });

  it('finds refused links in linear time, even in bracket-dense text', () => {
    const time = (markdown: string): number => {
      protectRefusedLinks(markdown);
      let fastest = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 3; round++) {
        const started = performance.now();
        protectRefusedLinks(markdown);
        fastest = Math.min(fastest, performance.now() - started);
      }
      return fastest;
    };
    // Alone, each takes a few milliseconds; the budget leaves room for a
    // loaded test machine. A rescan per candidate takes seconds.
    for (const markdown of [
      '[a]('.repeat(20_000),
      `${'['.repeat(20_000)}${'](x'.repeat(20_000)}`,
      `${'[a]('.repeat(10_000)}${')'.repeat(10_000)}`,
    ]) {
      expect(time(markdown)).toBeLessThan(2000);
    }
  });
});
