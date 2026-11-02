// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LinkCard.test.tsx
 * @input Uses vitest, @testing-library/react, Lexical, RichTextEditor,
 *   RichTextEditorToolbar, and LinkCard's placement geometry
 * @output Tests for the card RichTextEditorToolbar shows for a link in an
 *   editable editor: when it opens (caret, pointer) and closes, what it shows
 *   and opens, its Edit form (Text and Link, one undo step, refusals),
 *   Remove, Cmd/Ctrl+K, Escape, Cmd/Ctrl-click and the follow modifier, where
 *   it renders and sits, and the read-only and disabled editors it leaves
 *   alone.
 * @position Testing; validates LinkCard.tsx through RichTextEditorToolbar
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useEffect, type ReactElement} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$createLinkNode, $isLinkNode} from '@lexical/link';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  UNDO_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import {RichTextEditor, type RichTextEditorProps} from './RichTextEditor';
import {RichTextEditorToolbar} from './RichTextEditorToolbar';
import {$createRichTextExtensionNode} from './markdownExtensionNode';
import {linkCardPlacement} from './LinkCard';

// The toolbar popover's surface is a native popover jsdom does not draw open.
const h = {hidden: true} as const;
const URL = 'https://example.com/docs/';

beforeAll(() => {
  // jsdom's Range has no geometry; Lexical measures it when it scrolls a
  // selection into view in a focused editor.
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
  if (typeof Range.prototype.getClientRects !== 'function') {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
});

afterEach(() => {
  vi.useRealTimers();
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
  toolbar = <RichTextEditorToolbar />,
  ...props
}: Partial<RichTextEditorProps> & {toolbar?: ReactElement} = {}) {
  let captured: LexicalEditor | null = null;
  render(
    <RichTextEditor
      label="Notes"
      {...props}
      toolbar={toolbar}
      plugins={<CaptureEditor onReady={editor => (captured = editor)} />}
    />,
  );
  await waitFor(() => expect(captured).not.toBeNull());
  return captured as unknown as LexicalEditor;
}

/**
 * Seeds "See the docs today." with "the docs" linked to `url` and the caret
 * inside the link, as a person leaves it after clicking there.
 */
async function seedLink(
  editor: LexicalEditor,
  {
    url = URL,
    bold = false,
    caret = true,
  }: {url?: string; bold?: boolean; caret?: boolean} = {},
) {
  // jsdom collapses the page's selection into an element that takes focus
  // and reports it a task later: let that land before placing the caret.
  act(() => editor.getRootElement()?.focus());
  await act(async () => {});
  act(() => {
    editor.update(
      () => {
        const words = $createTextNode('the docs');
        if (bold) {
          words.toggleFormat('bold');
        }
        const before = $createTextNode('See ');
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              before,
              $createLinkNode(url).append(words),
              $createTextNode(' today.'),
            ),
          );
        if (caret) {
          words.select(3, 3);
        } else {
          before.select(1, 1);
        }
      },
      {discrete: true},
    );
  });
  await act(async () => {});
}

function linksIn(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const links: Array<{url: string; text: string; bold: boolean}> = [];
    const visit = (node: LexicalNode) => {
      if ($isLinkNode(node)) {
        const first = node.getAllTextNodes()[0] as TextNode | undefined;
        links.push({
          url: node.getURL(),
          text: node.getTextContent(),
          bold: first?.hasFormat('bold') ?? false,
        });
      }
      if ($isElementNode(node)) {
        node.getChildren().forEach(visit);
      }
    };
    visit($getRoot());
    return links;
  });
}

const textOf = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => $getRoot().getTextContent());

const card = () => screen.queryByRole('group', {name: 'Link'});

/** The tooltip text an element is described by. */
function tooltipOf(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

function linkElement(editor: LexicalEditor): HTMLAnchorElement {
  const anchor = editor.getRootElement()?.querySelector('a');
  if (anchor == null) {
    throw new Error('no link in the editor');
  }
  return anchor;
}

describe('the link card', () => {
  it('shows for the caret in a link while the editor has focus, beside the editable text', async () => {
    const editor = await renderEditor();
    await seedLink(editor);

    const shown = await screen.findByRole('group', {name: 'Link'});
    const root = editor.getRootElement() as HTMLElement;
    // Outside the editable text, as a sibling of it.
    expect(root.contains(shown)).toBe(false);
    expect(shown.parentElement).toBe(root.parentElement);
    // Over the document, out of its flow.
    expect(getComputedStyle(shown).position).toBe('absolute');

    const address = screen.getByRole('link', {name: 'example.com/docs'});
    expect(address).toHaveAttribute('href', URL);
    expect(address).toHaveAttribute('target', '_blank');
    expect(address.getAttribute('rel')?.split(' ')).toEqual(
      expect.arrayContaining(['noopener', 'noreferrer']),
    );
    expect(tooltipOf(address)).toBe(URL);
    for (const name of ['Open in new tab', 'Edit link', 'Remove link']) {
      const button = screen.getByRole('button', {name});
      expect(shown).toContainElement(button);
      expect(tooltipOf(button)).toBe(name);
    }
    // jsdom is not an Apple platform.
    expect(shown).toHaveTextContent('Ctrl-click to open');

    // Focus leaving the editor takes the card with it.
    act(() => root.blur());
    await waitFor(() => expect(card()).toBeNull());
  });

  it('stays away while the caret is outside a link or the selection is a range', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    expect(card()).toBeNull();

    act(() => {
      editor.update(
        () => {
          const words = $getRoot().getAllTextNodes()[1];
          words.select(0, 3);
        },
        {discrete: true},
      );
    });
    await act(async () => {});
    expect(card()).toBeNull();
  });

  it('opens when the pointer rests on a link for 300 ms, and stays 250 ms after it leaves', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    act(() => editor.getRootElement()?.blur());
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const anchor = linkElement(editor);

    fireEvent.mouseOver(anchor);
    act(() => vi.advanceTimersByTime(299));
    expect(card()).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(card()).not.toBeNull();

    fireEvent.mouseOut(anchor, {relatedTarget: document.body});
    act(() => vi.advanceTimersByTime(249));
    expect(card()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(card()).toBeNull();
  });

  it('stays open while the pointer is over the card', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    act(() => editor.getRootElement()?.blur());
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    const anchor = linkElement(editor);

    fireEvent.mouseOver(anchor);
    act(() => vi.advanceTimersByTime(300));
    const shown = card() as HTMLElement;
    fireEvent.mouseOut(anchor, {relatedTarget: shown});
    fireEvent.mouseEnter(shown);
    act(() => vi.advanceTimersByTime(1000));
    expect(card()).not.toBeNull();

    fireEvent.mouseLeave(shown);
    act(() => vi.advanceTimersByTime(250));
    expect(card()).toBeNull();
  });

  it('opens the link in a new tab from its address and from Open in new tab', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});

    fireEvent.click(screen.getByRole('link', {name: 'example.com/docs'}));
    fireEvent.click(screen.getByRole('button', {name: 'Open in new tab'}));
    expect(opened.mock.calls).toEqual([
      [URL, '_blank', 'noopener,noreferrer'],
      [URL, '_blank', 'noopener,noreferrer'],
    ]);
  });

  it.each(['javascript:alert(1)', '/docs'])(
    'shows %s as text, with nothing to open it',
    async url => {
      const opened = vi.spyOn(window, 'open').mockReturnValue(null);
      const editor = await renderEditor();
      await seedLink(editor, {url});
      const shown = await screen.findByRole('group', {name: 'Link'});

      expect(shown).toHaveTextContent(url);
      expect(screen.queryByRole('link', {name: url})).toBeNull();
      expect(
        screen.queryByRole('button', {name: 'Open in new tab'}),
      ).toBeNull();
      expect(shown).not.toHaveTextContent('click to open');
      fireEvent.click(linkElement(editor), {ctrlKey: true});
      expect(opened).not.toHaveBeenCalled();
    },
  );

  it('edits the text and address together, keeping the format, as one undo step', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {bold: true});
    await screen.findByRole('group', {name: 'Link'});

    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));
    const text = screen.getByRole('textbox', {name: 'Text'});
    const address = screen.getByRole('textbox', {name: 'Link'});
    await waitFor(() => expect(text).toHaveFocus());
    expect(text).toHaveValue('the docs');
    expect(address).toHaveValue(URL);
    expect(address).toHaveAttribute('inputmode', 'url');
    expect(address).toHaveAttribute('autocomplete', 'url');
    expect(address).toHaveAttribute('spellcheck', 'false');
    expect(address).toHaveAttribute('placeholder', 'example.com');
    for (const name of ['Update link', 'Cancel']) {
      expect(tooltipOf(screen.getByRole('button', {name}))).toBe(name);
    }

    fireEvent.change(text, {target: {value: 'the guide'}});
    fireEvent.change(address, {target: {value: 'example.org/guide'}});
    // The Enter is claimed, so it cannot type a new line into the editor.
    expect(fireEvent.keyDown(address, {key: 'Enter'})).toBe(false);

    await waitFor(() =>
      expect(linksIn(editor)).toEqual([
        {url: 'https://example.org/guide', text: 'the guide', bold: true},
      ]),
    );
    expect(textOf(editor)).toBe('See the guide today.');
    await waitFor(() =>
      expect(screen.queryByRole('textbox', {name: 'Link'})).toBeNull(),
    );
    expect(editor.getRootElement()).toHaveFocus();

    act(() => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await waitFor(() =>
      expect(linksIn(editor)).toEqual([
        {url: URL, text: 'the docs', bold: true},
      ]),
    );
  });

  it('removes the link but keeps its text when the address is emptied', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));

    fireEvent.change(screen.getByRole('textbox', {name: 'Link'}), {
      target: {value: '  '},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Update link'}));

    await waitFor(() => expect(linksIn(editor)).toEqual([]));
    expect(textOf(editor)).toBe('See the docs today.');
  });

  it('refuses an address the toolbar refuses, keeping focus in the Link field', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));
    await waitFor(() =>
      expect(screen.getByRole('textbox', {name: 'Text'})).toHaveFocus(),
    );
    const address = screen.getByRole('textbox', {name: 'Link'});
    const message = 'Enter a valid http, https, mailto, or tel URL.';

    fireEvent.change(address, {target: {value: 'javascript:alert(1)'}});
    fireEvent.keyDown(address, {key: 'Enter'});

    await screen.findByText(message);
    expect(address).toHaveAttribute('aria-invalid', 'true');
    expect(address).toHaveFocus();
    expect(linksIn(editor)).toEqual([
      {url: URL, text: 'the docs', bold: false},
    ]);
  });

  it('rewords a link whose first child is a line break', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    act(() => {
      editor.update(
        () => {
          const link = $getRoot().getAllTextNodes()[1].getParentOrThrow();
          const words = link.getFirstChildOrThrow();
          words.insertBefore($createLineBreakNode());
          if ($isTextNode(words)) {
            words.select(2, 2);
          }
        },
        {discrete: true},
      );
    });
    await screen.findByRole('group', {name: 'Link'});
    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));

    fireEvent.change(screen.getByRole('textbox', {name: 'Text'}), {
      target: {value: 'the guide'},
    });
    fireEvent.keyDown(screen.getByRole('textbox', {name: 'Text'}), {
      key: 'Enter',
    });

    await waitFor(() =>
      expect(linksIn(editor)).toEqual([
        {url: URL, text: 'the guide', bold: false},
      ]),
    );
    expect(textOf(editor)).toBe('See the guide today.');
  });

  it('refuses new words for a link that holds more than text, but still changes its address', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    act(() => {
      editor.update(
        () => {
          const words = $getRoot().getAllTextNodes()[1];
          words.insertAfter(
            $createRichTextExtensionNode({
              plugin: 'mentions',
              apiVersion: 1,
              name: 'mention',
              display: 'inline',
              data: {label: 'ada'},
              source: '@{ada}',
            }),
          );
          words.select(2, 2);
        },
        {discrete: true},
      );
    });
    await screen.findByRole('group', {name: 'Link'});
    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));
    const text = screen.getByRole('textbox', {name: 'Text'});
    const address = screen.getByRole('textbox', {name: 'Link'});
    await waitFor(() => expect(text).toHaveFocus());
    const before = editor.getEditorState().toJSON();

    fireEvent.change(text, {target: {value: 'the guide'}});
    fireEvent.change(address, {target: {value: 'example.org'}});
    fireEvent.keyDown(address, {key: 'Enter'});

    await waitFor(() => expect(text).toHaveAttribute('aria-invalid', 'true'));
    expect(text).toHaveFocus();
    expect(editor.getEditorState().toJSON()).toEqual(before);

    // Its address alone still changes.
    fireEvent.change(text, {target: {value: textOf(editor).slice(4, -7)}});
    fireEvent.keyDown(address, {key: 'Enter'});
    await waitFor(() =>
      expect(linksIn(editor)[0]?.url).toBe('https://example.org/'),
    );
  });

  it('Remove unlinks the words and keeps them', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});

    fireEvent.click(screen.getByRole('button', {name: 'Remove link'}));

    await waitFor(() => expect(linksIn(editor)).toEqual([]));
    expect(textOf(editor)).toBe('See the docs today.');
    expect(card()).toBeNull();
  });

  it('opens Edit on Cmd/Ctrl+K with the caret in a link, and the toolbar popover elsewhere', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    const root = editor.getRootElement() as HTMLElement;

    // jsdom is not an Apple platform, so the primary modifier is Ctrl.
    fireEvent.keyDown(root, {key: 'k', code: 'KeyK', ctrlKey: true});
    const text = await screen.findByRole('textbox', {name: 'Text'});
    await waitFor(() => expect(text).toHaveFocus());
    expect(screen.getByRole('button', {name: 'Link'})).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    fireEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    await waitFor(() => expect(root).toHaveFocus());
    act(() => {
      editor.update(() => $getRoot().getAllTextNodes()[0].select(0, 3), {
        discrete: true,
      });
    });
    fireEvent.keyDown(root, {key: 'k', code: 'KeyK', ctrlKey: true});
    expect(
      await screen.findByRole('textbox', {name: 'URL', ...h}),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', {name: 'Text'})).toBeNull();
  });

  it('Escape in the card returns focus to the editor and keeps the card away until a link is targeted again', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    const root = editor.getRootElement() as HTMLElement;
    const address = screen.getByRole('link', {name: 'example.com/docs'});
    act(() => address.focus());

    fireEvent.keyDown(address, {key: 'Escape'});

    await waitFor(() => expect(card()).toBeNull());
    expect(root).toHaveFocus();
    // The caret stays in the link, and the card stays away.
    await act(async () => {});
    expect(card()).toBeNull();

    // The caret leaves the link and comes back: it is targeted again.
    act(() => {
      editor.update(() => $getRoot().getAllTextNodes()[0].select(1, 1), {
        discrete: true,
      });
    });
    act(() => {
      editor.update(() => $getRoot().getAllTextNodes()[1].select(2, 2), {
        discrete: true,
      });
    });
    expect(
      await screen.findByRole('group', {name: 'Link'}),
    ).toBeInTheDocument();
  });

  it('opens a link on Cmd/Ctrl-click in the editor, and not on a plain click', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    const anchor = linkElement(editor);

    fireEvent.click(anchor);
    expect(opened).not.toHaveBeenCalled();
    fireEvent.click(anchor, {ctrlKey: true});
    expect(opened).toHaveBeenCalledWith(URL, '_blank', 'noopener,noreferrer');
  });

  it('marks only the link under the pointer while the modifier is held, never the root', async () => {
    const editor = await renderEditor();
    act(() => {
      editor.update(
        () => {
          $getRoot()
            .clear()
            .append(
              $createParagraphNode().append(
                $createTextNode('See '),
                $createLinkNode('https://one.example/').append(
                  $createTextNode('one'),
                ),
                $createTextNode(' and '),
                $createLinkNode('https://two.example/').append(
                  $createTextNode('two'),
                ),
              ),
            );
        },
        {discrete: true},
      );
    });
    await act(async () => {});
    const root = editor.getRootElement() as HTMLElement;
    const links = [...root.querySelectorAll('a')];
    expect(links).toHaveLength(2);
    // Links here follow on Ctrl-click, so they read as text until then.
    expect(root).toHaveAttribute('data-richtext-follow-links');
    const marks = () =>
      links.map(link => link.hasAttribute('data-richtext-link-follow'));

    fireEvent.mouseMove(links[0]);
    act(() => {
      fireEvent.keyDown(window, {key: 'Control', ctrlKey: true});
    });
    expect(root).not.toHaveAttribute('data-richtext-link-follow');
    expect(marks()).toEqual([true, false]);

    fireEvent.mouseOver(links[1]);
    expect(marks()).toEqual([false, true]);

    act(() => {
      fireEvent.keyUp(window, {key: 'Control', ctrlKey: false});
    });
    expect(marks()).toEqual([false, false]);
  });

  it.each([
    ['read-only', {isReadOnly: true}],
    ['disabled', {isDisabled: true}],
  ] as const)(
    'leaves a %s editor its links as they were',
    async (_state, props) => {
      const opened = vi.spyOn(window, 'open').mockReturnValue(null);
      const editor = await renderEditor(props);
      await seedLink(editor);
      const root = editor.getRootElement() as HTMLElement;
      const anchor = linkElement(editor);

      fireEvent.mouseOver(anchor, {ctrlKey: true});
      fireEvent.click(anchor, {ctrlKey: true});
      await act(async () => {});

      expect(card()).toBeNull();
      expect(root).not.toHaveAttribute('data-richtext-follow-links');
      expect(opened).not.toHaveBeenCalled();
    },
  );

  it('stays out when promptForUrl replaces the built-in link UI', async () => {
    const editor = await renderEditor({
      toolbar: <RichTextEditorToolbar promptForUrl={() => null} />,
    });
    await seedLink(editor);
    await act(async () => {});
    expect(card()).toBeNull();
  });
});

describe('linkCardPlacement', () => {
  // The link's line spans 100–220px in a 400px-wide editor at x = 50.
  const container = new DOMRect(50, 10, 400, 300);
  const line = new DOMRect(150, 40, 120, 20);

  it('sits under the line, start-aligned with it', () => {
    expect(
      linkCardPlacement({line, container, cardWidth: 200, isRtl: false}),
    ).toEqual({top: 50, left: 100});
  });

  it('aligns with the line end in right-to-left text', () => {
    expect(
      linkCardPlacement({line, container, cardWidth: 200, isRtl: true}),
    ).toEqual({top: 50, left: 20});
  });

  it('stays inside the editor at either edge', () => {
    expect(
      linkCardPlacement({
        line: new DOMRect(400, 40, 40, 20),
        container,
        cardWidth: 200,
        isRtl: false,
      }).left,
    ).toBe(200);
    expect(
      linkCardPlacement({
        line: new DOMRect(60, 40, 40, 20),
        container,
        cardWidth: 200,
        isRtl: true,
      }).left,
    ).toBe(0);
    // A card wider than the editor starts at its start edge.
    expect(
      linkCardPlacement({line, container, cardWidth: 500, isRtl: false}).left,
    ).toBe(0);
  });
});
