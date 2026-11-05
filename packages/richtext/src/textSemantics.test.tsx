// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {createRef} from 'react';
import {act, render, waitFor} from '@testing-library/react';
import {
  $getRoot,
  $isTextNode,
  REDO_COMMAND,
  UNDO_COMMAND,
  type TextFormatType,
} from 'lexical';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';

/** Each deletion's text and the tags inside it, outermost first. */
function deletions(root: Element): Array<{text: string; tags: string}> {
  return [...root.querySelectorAll('del')].map(deletion => {
    const tags: Array<string> = [];
    for (
      let element = deletion.firstElementChild;
      element != null;
      element = element.firstElementChild
    ) {
      tags.push(element.tagName.toLowerCase());
    }
    return {text: deletion.textContent ?? '', tags: tags.join('>')};
  });
}

/** Each emphasis's text and the tags inside it, outermost first. */
function emphases(root: Element): Array<{text: string; tags: string}> {
  return [...root.querySelectorAll('em')].map(emphasis => {
    const tags: Array<string> = [];
    for (
      let element = emphasis.firstElementChild;
      element != null;
      element = element.firstElementChild
    ) {
      tags.push(element.tagName.toLowerCase());
    }
    return {text: emphasis.textContent ?? '', tags: tags.join('>')};
  });
}

describe('struck-through text (spec:AST-061 FR7)', () => {
  it('is a deletion around the strong, emphasis, and link text Lexical draws', async () => {
    const value = markdownToEditorStateJSON(
      'Keep ~~plain~~, **~~bold~~**, *~~italic~~*, [~~link~~](https://example.com), and `~~literal~~`.\n',
    );
    const {container} = render(
      <>
        <div data-surface="editor">
          <RichTextEditor label="Notes" defaultValue={value} />
        </div>
        <div data-surface="view">
          <RichTextView value={value} />
        </div>
      </>,
    );
    for (const surface of ['editor', 'view']) {
      const root = container.querySelector(`[data-surface="${surface}"]`);
      if (root == null) {
        throw new Error(`No ${surface}`);
      }
      await waitFor(() =>
        expect(deletions(root)).toEqual([
          {text: 'plain', tags: 'span'},
          {text: 'bold', tags: 'strong'},
          {text: 'italic', tags: 'em'},
          {text: 'link', tags: 'span'},
        ]),
      );
      // The link keeps its deletion inside it; text that only looks struck
      // inside code is code.
      expect(root.querySelector('a del')?.textContent).toBe('link');
      expect(root.querySelector('del a')).toBeNull();
      expect(
        [...root.querySelectorAll('code')].some(
          code =>
            code.textContent === '~~literal~~' && code.closest('del') == null,
        ),
      ).toBe(true);
      // No element gives up its own role for the deletion.
      expect(root.querySelector('[role="deletion"]')).toBeNull();
    }
  });

  it('adds and removes the deletion as the mark changes, and keeps updating the text', async () => {
    const ref = createRef<RichTextEditorRef>();
    const {container} = render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON('**plain**\n')}
      />,
    );
    const editor = await waitFor(() => {
      const instance = ref.current?.getEditor();
      expect(instance).toBeTruthy();
      return instance;
    });
    const update = async (change: () => void) => {
      await act(async () => {
        editor?.update(change, {discrete: true});
      });
    };
    const text = () => $getRoot().getAllTextNodes()[0];
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.toggleFormat('strikethrough');
      }
    });
    await waitFor(() =>
      expect(deletions(container)).toEqual([{text: 'plain', tags: 'strong'}]),
    );
    // Lexical keeps updating its own element inside the deletion.
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.setTextContent('plain and more');
      }
    });
    await waitFor(() =>
      expect(deletions(container)).toEqual([
        {text: 'plain and more', tags: 'strong'},
      ]),
    );
    expect(ref.current?.getMarkdown()).toBe('**~~plain and more~~**\n');
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.toggleFormat('strikethrough');
      }
    });
    await waitFor(() => expect(deletions(container)).toEqual([]));
    expect(container.querySelector('strong')?.textContent).toBe(
      'plain and more',
    );
    // Struck code is a deletion around Lexical's code element.
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.setFormat('code');
        node.toggleFormat('strikethrough');
      }
    });
    await waitFor(() =>
      expect(deletions(container)).toEqual([
        {text: 'plain and more', tags: 'code>span'},
      ]),
    );
  });
});

describe('bold italic text (spec:AST-061 FR7)', () => {
  it('is emphasis around the strong Lexical draws, struck or not', async () => {
    const value = markdownToEditorStateJSON(
      'Keep ***both***, ~~***struck***~~, *italic*, and **bold**.\n',
    );
    const {container} = render(
      <>
        <div data-surface="editor">
          <RichTextEditor label="Notes" defaultValue={value} />
        </div>
        <div data-surface="view">
          <RichTextView value={value} />
        </div>
      </>,
    );
    for (const surface of ['editor', 'view']) {
      const root = container.querySelector(`[data-surface="${surface}"]`);
      if (root == null) {
        throw new Error(`No ${surface}`);
      }
      // Italic alone is Lexical's own `<em>`; bold italic gains one around
      // its `<strong>`, inside the deletion when struck.
      await waitFor(() =>
        expect(emphases(root)).toEqual([
          {text: 'both', tags: 'strong'},
          {text: 'struck', tags: 'strong'},
          {text: 'italic', tags: ''},
        ]),
      );
      expect(deletions(root)).toEqual([{text: 'struck', tags: 'em>strong'}]);
      expect(
        [...root.querySelectorAll('strong')].map(strong => strong.textContent),
      ).toEqual(['both', 'struck', 'bold']);
      expect(root.querySelector('[role]:not([role="textbox"])')).toBeNull();
    }
  });

  it('adds and removes the emphasis as italic changes on bold text, and keeps updating the text', async () => {
    const ref = createRef<RichTextEditorRef>();
    const {container} = render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON('**plain**\n')}
      />,
    );
    const editor = await waitFor(() => {
      const instance = ref.current?.getEditor();
      expect(instance).toBeTruthy();
      return instance;
    });
    const update = async (change: () => void) => {
      await act(async () => {
        editor?.update(change, {discrete: true});
      });
    };
    const text = () => $getRoot().getAllTextNodes()[0];
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.toggleFormat('italic');
      }
    });
    await waitFor(() =>
      expect(emphases(container)).toEqual([{text: 'plain', tags: 'strong'}]),
    );
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.setTextContent('plain and more');
      }
    });
    await waitFor(() =>
      expect(emphases(container)).toEqual([
        {text: 'plain and more', tags: 'strong'},
      ]),
    );
    expect(ref.current?.getMarkdown()).toBe('***plain and more***\n');
    // Striking it puts the deletion outside the emphasis.
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.toggleFormat('strikethrough');
      }
    });
    await waitFor(() =>
      expect(deletions(container)).toEqual([
        {text: 'plain and more', tags: 'em>strong'},
      ]),
    );
    await update(() => {
      const node = text();
      if ($isTextNode(node)) {
        node.toggleFormat('strikethrough');
        node.toggleFormat('italic');
      }
    });
    await waitFor(() => expect(emphases(container)).toEqual([]));
    expect(deletions(container)).toEqual([]);
    expect(container.querySelector('strong')?.textContent).toBe(
      'plain and more',
    );
  });
  it("wraps Lexical's code, highlight, subscript, and superscript elements, and leaves single marks alone", async () => {
    const ref = createRef<RichTextEditorRef>();
    const {container} = render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON(
          'one two three four five six seven eight\n',
        )}
      />,
    );
    const editor = await waitFor(() => {
      const instance = ref.current?.getEditor();
      expect(instance).toBeTruthy();
      return instance;
    });
    await act(async () => {
      editor?.update(
        () => {
          const [node] = $getRoot().getAllTextNodes();
          if (!$isTextNode(node)) {
            return;
          }
          const words = node.splitText(4, 8, 14, 19, 24, 28, 34);
          const formats: Array<ReadonlyArray<TextFormatType>> = [
            ['bold', 'italic', 'code'],
            ['bold', 'italic', 'highlight'],
            ['bold', 'italic', 'subscript'],
            ['bold', 'italic', 'superscript'],
            ['bold', 'italic', 'strikethrough', 'code'],
            ['italic'],
            ['bold'],
            ['code'],
          ];
          words.forEach((word, index) => {
            for (const format of formats[index] ?? []) {
              word.toggleFormat(format);
            }
          });
        },
        {discrete: true},
      );
    });
    // Each bold italic word is emphasis around exactly the element Lexical
    // draws for it; a single mark keeps Lexical's own element and no other.
    await waitFor(() =>
      expect(emphases(container)).toEqual([
        {text: 'one ', tags: 'code>strong'},
        {text: 'two ', tags: 'mark>strong'},
        {text: 'three ', tags: 'sub>strong'},
        {text: 'four ', tags: 'sup>strong'},
        {text: 'five ', tags: 'code>strong'},
        {text: 'six ', tags: ''},
      ]),
    );
    expect(deletions(container)).toEqual([
      {text: 'five ', tags: 'em>code>strong'},
    ]);
    const paragraph = container.querySelector('[data-lexical-editor] p');
    expect(
      [...(paragraph?.children ?? [])].map(child =>
        child.tagName.toLowerCase(),
      ),
    ).toEqual(['em', 'em', 'em', 'em', 'del', 'em', 'strong', 'code']);
  });

  it('puts the emphasis back on undo and takes it away on redo', async () => {
    const ref = createRef<RichTextEditorRef>();
    const {container} = render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON('***both***\n')}
      />,
    );
    const editor = await waitFor(() => {
      const instance = ref.current?.getEditor();
      expect(instance).toBeTruthy();
      return instance;
    });
    await waitFor(() =>
      expect(emphases(container)).toEqual([{text: 'both', tags: 'strong'}]),
    );
    await act(async () => {
      editor?.update(
        () => {
          const [node] = $getRoot().getAllTextNodes();
          if ($isTextNode(node)) {
            node.toggleFormat('italic');
          }
        },
        {discrete: true},
      );
    });
    await waitFor(() => expect(emphases(container)).toEqual([]));
    await act(async () => {
      editor?.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await waitFor(() =>
      expect(emphases(container)).toEqual([{text: 'both', tags: 'strong'}]),
    );
    await act(async () => {
      editor?.dispatchCommand(REDO_COMMAND, undefined);
    });
    await waitFor(() => expect(emphases(container)).toEqual([]));
    expect(ref.current?.getMarkdown()).toBe('**both**\n');
  });
});
