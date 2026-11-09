// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {$createHorizontalRuleNode} from '@lexical/extension';
import {createHeadlessEditor} from '@lexical/headless';
import {$getRoot} from 'lexical';
import {DEFAULT_NODES} from './editorNodes';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

interface SerializedNode {
  type: string;
  children?: Array<SerializedNode>;
  text?: string;
}

function paragraphTexts(markdown: string): Array<string> {
  const state = JSON.parse(markdownToEditorStateJSON(markdown)) as {
    root: SerializedNode;
  };
  return (state.root.children ?? [])
    .filter(node => node.type === 'paragraph')
    .map(node => (node.children ?? []).map(child => child.text ?? '').join(''));
}

function blockTypes(markdown: string): Array<string> {
  const state = JSON.parse(markdownToEditorStateJSON(markdown)) as {
    root: SerializedNode;
  };
  return (state.root.children ?? []).map(node => node.type);
}

describe('thematic breaks (spec:AST-061 FR5)', () => {
  it('imports every CommonMark thematic break as a horizontal rule', () => {
    for (const line of [
      '---',
      '***',
      '___',
      '- - -',
      '* * *',
      '_ _ _',
      '   ----',
      '***   ',
    ]) {
      expect(blockTypes(`Before\n\n${line}\n\nAfter`), line).toEqual([
        'paragraph',
        'horizontalrule',
        'paragraph',
      ]);
    }
  });

  it('leaves lines that are not thematic breaks as text', () => {
    for (const line of ['--', '-*-', '--- x', '    ---']) {
      expect(blockTypes(`Before\n\n${line}\n\nAfter`), line).not.toContain(
        'horizontalrule',
      );
    }
  });

  it('keeps a dash line under a paragraph line as literal text in that paragraph', () => {
    // CommonMark reads these as setext heading underlines, not breaks; the
    // editor keeps the underline as text rather than dropping it.
    for (const [markdown, text] of [
      ['Title\n---\n\nAfter', 'Title ---'],
      ['  Title\n   ---  \n\nAfter', 'Title ---'],
      ['Title\n===\n\nAfter', 'Title ==='],
    ] as const) {
      expect(blockTypes(markdown), markdown).toEqual([
        'paragraph',
        'paragraph',
      ]);
      // Lexical keeps a paragraph's indentation as text; the dashes survive.
      expect(paragraphTexts(markdown)[0]?.trim(), markdown).toBe(text);
    }
    // Two underlined paragraphs keep both underlines.
    expect(paragraphTexts('A\n---\n\nB\n---\n')).toEqual(['A ---', 'B ---']);
  });

  it('breaks after a blank line, a heading, a list, a quote, or with spaced dashes', () => {
    for (const markdown of [
      'Title\n\n---\n\nAfter',
      '# Heading\n---\n\nAfter',
      '> Quote\n---\n\nAfter',
      // `- - -` cannot underline a heading, so it breaks even under a line.
      'Title\n- - -\n\nAfter',
    ]) {
      expect(blockTypes(markdown), markdown).toContain('horizontalrule');
    }
    expect(blockTypes('- item\n---\n\nAfter')).toEqual([
      'list',
      'horizontalrule',
      'paragraph',
    ]);
  });

  it('keeps an underlined paragraph exact, and keeps its dashes when edited (spec:AST-062)', () => {
    const markdown = 'Title\n---\n\nAfter\n';
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
    const edit = (needle: string, suffix: string): string => {
      const editor = createHeadlessEditor({
        namespace: 'astryx-thematic-break-edit',
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
          const node = $getRoot()
            .getAllTextNodes()
            .find(candidate => candidate.getTextContent().startsWith(needle));
          node?.setTextContent(node.getTextContent() + suffix);
        },
        {discrete: true},
      );
      return editorStateJSONToMarkdown(
        JSON.stringify(editor.getEditorState().toJSON()),
      );
    };
    // Editing the next paragraph leaves the underlined one byte-identical.
    expect(edit('After', ' more')).toBe('Title\n---\n\nAfter more\n');
    // Editing the underlined paragraph keeps its dashes as text.
    expect(edit('Title', '!')).toContain('---');
    expect(blockTypes(edit('Title', '!'))).not.toContain('horizontalrule');
  });

  it('keeps an imported rule as written and writes a new rule as ---', () => {
    // An untouched rule keeps its authored bytes (spec:AST-062).
    expect(
      editorStateJSONToMarkdown(
        markdownToEditorStateJSON('Before\n\n* * *\n\nAfter'),
      ),
    ).toBe('Before\n\n* * *\n\nAfter');
    const editor = createHeadlessEditor({
      namespace: 'astryx-thematic-break-test',
      nodes: [...DEFAULT_NODES],
      onError(error: Error) {
        throw error;
      },
    });
    editor.setEditorState(
      editor.parseEditorState(markdownToEditorStateJSON('Before\n\nAfter')),
    );
    editor.update(
      () => {
        $getRoot().getFirstChild()?.insertAfter($createHorizontalRuleNode());
      },
      {discrete: true},
    );
    const markdown = editorStateJSONToMarkdown(
      JSON.stringify(editor.getEditorState().toJSON()),
    );
    expect(markdown).toBe('Before\n\n---\n\nAfter');
    expect(blockTypes(markdown)).toEqual([
      'paragraph',
      'horizontalrule',
      'paragraph',
    ]);
  });

  it('draws a rule in the editor and in RichTextView', async () => {
    const value = markdownToEditorStateJSON('Before\n\n---\n\nAfter');
    const {container} = render(
      <>
        <RichTextEditor label="Notes" defaultValue={value} />
        <RichTextView value={value} />
      </>,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('hr')).toHaveLength(2);
    });
    expect(container.textContent).not.toContain('---');
  });
});
