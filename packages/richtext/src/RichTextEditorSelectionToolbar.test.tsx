// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditorSelectionToolbar.test.tsx
 * @input Uses vitest, @testing-library/react, Lexical, @lexical/table,
 *   RichTextEditor, and RichTextEditorSelectionToolbar
 * @output Tests for the toolbar a non-collapsed selection shows while the
 *   editor is editable: when it shows and hides, that it never takes focus,
 *   its controls and their order, formatting, its link popover, Alt+F10,
 *   arrow keys and Escape, table selections, its anchored layer, and the
 *   read-only and disabled editors that show none.
 * @position Testing; validates RichTextEditorSelectionToolbar.tsx
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useEffect, type ReactNode} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$isLinkNode} from '@lexical/link';
import {
  $createTableNodeWithDimensions,
  $createTableSelection,
  $isTableCellNode,
} from '@lexical/table';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  type LexicalEditor,
  type TextNode,
} from 'lexical';
import {RichTextEditor, type RichTextEditorProps} from './RichTextEditor';
import {editorStateJSONToMarkdown} from './markdownSerializers';
import {RichTextEditorToolbar} from './RichTextEditorToolbar';
import {
  RichTextEditorSelectionToolbar,
  type RichTextEditorSelectionToolbarProps,
} from './RichTextEditorSelectionToolbar';

// The link popover's surface is a native popover jsdom does not draw open.
const h = {hidden: true} as const;

beforeAll(() => {
  // jsdom's Range has no geometry; the toolbar and Lexical both measure it.
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function CaptureEditor({onReady}: {onReady: (editor: LexicalEditor) => void}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);
  return null;
}

async function renderEditor({
  bar = {},
  toolbar,
  ...props
}: Partial<RichTextEditorProps> & {
  bar?: RichTextEditorSelectionToolbarProps;
  toolbar?: ReactNode;
} = {}) {
  let captured: LexicalEditor | null = null;
  render(
    <RichTextEditor
      label="Notes"
      {...props}
      toolbar={toolbar}
      plugins={
        <>
          <RichTextEditorSelectionToolbar {...bar} />
          <CaptureEditor onReady={editor => (captured = editor)} />
        </>
      }
    />,
  );
  await waitFor(() => expect(captured).not.toBeNull());
  return captured as unknown as LexicalEditor;
}

/**
 * Seeds "Ship the launch notes today." and selects `from` to `to` of it with
 * focus in the editor, as a person leaves it after dragging over words.
 */
async function seed(editor: LexicalEditor, from = 9, to = 21) {
  // jsdom collapses the page's selection into an element that takes focus
  // and reports it a task later: let that land before selecting.
  act(() => editor.getRootElement()?.focus());
  await act(async () => {});
  act(() => {
    editor.update(
      () => {
        const text = $createTextNode('Ship the launch notes today.');
        $getRoot().clear().append($createParagraphNode().append(text));
        text.select(from, to);
      },
      {discrete: true},
    );
  });
  await act(async () => {});
}

function collapse(editor: LexicalEditor) {
  act(() => {
    editor.update(
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const text = $getRoot().getAllTextNodes()[0] as TextNode;
          text.select(2, 2);
        }
      },
      {discrete: true},
    );
  });
}

const bar = () => screen.queryByRole('toolbar', {name: 'Selected text', ...h});
const labels = (toolbar: HTMLElement) =>
  Array.from(toolbar.querySelectorAll('button')).map(button =>
    button.getAttribute('aria-label'),
  );
const selectedText = () => document.getSelection()?.toString() ?? '';

describe('RichTextEditorSelectionToolbar', () => {
  it('adds no content: the value exports the same Markdown while it shows', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const before = editorStateJSONToMarkdown(
      JSON.stringify(editor.getEditorState().toJSON()),
    );
    await screen.findByRole('toolbar', {name: 'Selected text', ...h});
    expect(
      editorStateJSONToMarkdown(
        JSON.stringify(editor.getEditorState().toJSON()),
      ),
    ).toBe(before);
    expect(before).toBe('Ship the launch notes today.');
  });

  it('sits beside a non-collapsed selection as an anchored layer, outside the editable text, without taking focus', async () => {
    const editor = await renderEditor();
    await seed(editor, 2, 2);
    expect(bar()).toBeNull();

    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    const root = editor.getRootElement();
    expect(document.activeElement).toBe(root);
    expect(root?.contains(toolbar)).toBe(false);
    // An anchored layer: the surface is a popover, and its CSS anchor is a
    // one-pixel box beside the editable text, in the element that positions
    // it.
    const layer = toolbar.closest('[popover]') as HTMLElement | null;
    expect(layer).not.toBeNull();
    const anchorName = layer?.style.getPropertyValue('position-anchor');
    expect(anchorName).not.toBe('');
    const anchor = Array.from(root?.parentElement?.children ?? []).find(
      element =>
        (
          (element as HTMLElement).style as unknown as Record<string, string>
        ).anchorName?.includes(anchorName ?? '-'),
    );
    expect(anchor).toBeDefined();
    expect(root?.contains(anchor as Node)).toBe(false);

    collapse(editor);
    await waitFor(() => expect(bar()).toBeNull());
  });

  it('offers bold, italic, underline, strikethrough, inline code, and Link', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    expect(labels(toolbar)).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline code',
      'Link',
    ]);
  });

  it('leaves Link out with hasLink={false}', async () => {
    const editor = await renderEditor({bar: {hasLink: false}});
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    expect(labels(toolbar)).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline code',
    ]);
  });

  it('formats the selection with the toolbar’s commands and shows the format as pressed', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    const bold = toolbar.querySelector(
      'button[aria-label="Bold"]',
    ) as HTMLButtonElement;
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(bold);
    await waitFor(() =>
      expect(
        editor.getEditorState().read(() =>
          $getRoot()
            .getAllTextNodes()
            .filter(node => node.hasFormat('bold'))
            .map(node => node.getTextContent()),
        ),
      ).toEqual(['launch notes']),
    );
    await waitFor(() => expect(bold).toHaveAttribute('aria-pressed', 'true'));
    expect(bar()).not.toBeNull();
  });

  it('links the selection from its own Link button with the toolbar’s link popover', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    fireEvent.click(
      toolbar.querySelector('button[aria-label="Link"]') as HTMLButtonElement,
    );
    const field = await screen.findByRole('textbox', {name: 'URL', ...h});
    await waitFor(() => expect(field).toHaveFocus());
    expect(bar()).not.toBeNull();
    fireEvent.change(field, {target: {value: 'example.com/launch'}});
    fireEvent.keyDown(field, {key: 'Enter'});
    await waitFor(() =>
      expect(
        editor.getEditorState().read(() =>
          $getRoot()
            .getAllTextNodes()
            .flatMap(node => {
              const parent = node.getParent();
              return $isLinkNode(parent)
                ? [[parent.getURL(), node.getTextContent()]]
                : [];
            }),
        ),
      ).toEqual([['https://example.com/launch', 'launch notes']]),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(editor.getRootElement()),
    );
  });

  it('takes the keyboard on Alt+F10; arrows move along it; Escape returns to the selection', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    expect(toolbar).toHaveAttribute('aria-keyshortcuts', 'Alt+F10');
    const root = editor.getRootElement() as HTMLElement;
    act(() => {
      fireEvent.keyDown(root, {key: 'F10', code: 'F10', altKey: true});
    });
    const bold = toolbar.querySelector('button[aria-label="Bold"]');
    expect(document.activeElement).toBe(bold);
    act(() => {
      fireEvent.keyDown(bold as Element, {key: 'ArrowRight'});
    });
    expect(document.activeElement).toBe(
      toolbar.querySelector('button[aria-label="Italic"]'),
    );
    await act(async () => {
      fireEvent.keyDown(document.activeElement as Element, {key: 'Escape'});
    });
    await waitFor(() => expect(document.activeElement).toBe(root));
    expect(selectedText()).toBe('launch notes');
    expect(bar()).not.toBeNull();
  });

  it('returns focus and the selection to the editor on Escape from a control reached another way', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    const italic = toolbar.querySelector(
      'button[aria-label="Italic"]',
    ) as HTMLButtonElement;
    // Reached with Escape then Tab, or a screen reader's own navigation.
    act(() => italic.focus());
    expect(bar()).not.toBeNull();
    await act(async () => {
      fireEvent.keyDown(italic, {key: 'Escape'});
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(editor.getRootElement()),
    );
    expect(selectedText()).toBe('launch notes');
  });

  it('leaves Alt+F10 alone while no selection shows it', async () => {
    const editor = await renderEditor();
    await seed(editor, 2, 2);
    const root = editor.getRootElement() as HTMLElement;
    expect(
      fireEvent.keyDown(root, {key: 'F10', code: 'F10', altKey: true}),
    ).toBe(true);
    expect(document.activeElement).toBe(root);
  });

  it('formats a table selection’s cells, with no Link', async () => {
    const editor = await renderEditor();
    act(() => editor.getRootElement()?.focus());
    await act(async () => {});
    act(() => {
      editor.update(
        () => {
          const table = $createTableNodeWithDimensions(2, 2, false);
          $getRoot().clear().append(table, $createParagraphNode());
          const cells = table
            .getChildren()
            .flatMap(row => ($isElementNode(row) ? row.getChildren() : []))
            .filter($isTableCellNode);
          cells.forEach((cell, index) => {
            const paragraph = cell.getFirstChild();
            if ($isElementNode(paragraph)) {
              paragraph.append($createTextNode(`cell ${index + 1}`));
            }
          });
          const selection = $createTableSelection();
          selection.set(
            table.getKey(),
            cells[0].getKey(),
            cells[cells.length - 1].getKey(),
          );
          $setSelection(selection);
        },
        {discrete: true},
      );
    });
    await act(async () => {});
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    expect(labels(toolbar)).not.toContain('Link');
    fireEvent.click(
      toolbar.querySelector('button[aria-label="Bold"]') as HTMLButtonElement,
    );
    await waitFor(() =>
      expect(
        editor.getEditorState().read(() =>
          $getRoot()
            .getAllTextNodes()
            .filter(node => node.hasFormat('bold'))
            .map(node => node.getTextContent()),
        ),
      ).toEqual(['cell 1', 'cell 2', 'cell 3', 'cell 4']),
    );
  });

  it.each([
    ['read-only', {isReadOnly: true}],
    ['disabled', {isDisabled: true}],
  ] as const)('shows no formatting in a %s editor', async (_name, props) => {
    const editor = await renderEditor(props);
    act(() => {
      editor.update(
        () => {
          const text = $createTextNode('Ship the launch notes today.');
          $getRoot().clear().append($createParagraphNode().append(text));
          text.select(9, 21);
        },
        {discrete: true},
      );
    });
    await act(async () => {});
    expect(bar()).toBeNull();
  });

  it('opens its link popover on Cmd/Ctrl+K when no formatting toolbar takes it', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    act(() => {
      fireEvent.keyDown(editor.getRootElement() as HTMLElement, {
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
        metaKey: false,
      });
    });
    await waitFor(() =>
      expect(
        toolbar.querySelector('button[aria-label="Link"]'),
      ).toHaveAttribute('aria-expanded', 'true'),
    );
  });

  it('leaves Cmd/Ctrl+K to RichTextEditorToolbar beside it', async () => {
    const editor = await renderEditor({toolbar: <RichTextEditorToolbar />});
    await seed(editor);
    const toolbar = await screen.findByRole('toolbar', {
      name: 'Selected text',
      ...h,
    });
    act(() => {
      fireEvent.keyDown(editor.getRootElement() as HTMLElement, {
        key: 'k',
        code: 'KeyK',
        ctrlKey: true,
        metaKey: false,
      });
    });
    const formatting = screen.getByRole('toolbar', {name: 'Text formatting'});
    await waitFor(() =>
      expect(
        formatting.querySelector('button[aria-label="Link"]'),
      ).toHaveAttribute('aria-expanded', 'true'),
    );
    expect(
      toolbar.querySelector('button[aria-label="Link"]'),
    ).not.toHaveAttribute('aria-expanded', 'true');
  });
});
