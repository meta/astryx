// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditorLinkPopoverPlugin.test.tsx
 * @input Uses vitest, @testing-library/react, Lexical, RichTextEditor,
 *   RichTextEditorToolbar, and RichTextEditorLinkPopoverPlugin
 * @output Tests for the opt-in link popover plugin: nothing without it, when
 *   it shows (caret only) and closes, what it shows and opens, its Edit form
 *   (the shared link form, one undo step, refusals), Remove, Cmd/Ctrl+K,
 *   Escape through the layer stack, a link deleted while its form is open,
 *   where it renders and sits, and read-only and disabled editors
 * @position Testing; validates RichTextEditorLinkPopoverPlugin.tsx
 */

import {afterEach, beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useEffect, type ReactElement} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$createLinkNode, $isLinkNode} from '@lexical/link';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  UNDO_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import {RichTextEditor, type RichTextEditorProps} from './RichTextEditor';
import {RichTextEditorToolbar} from './RichTextEditorToolbar';
import {
  RichTextEditorLinkPopoverPlugin,
  linkPopoverPlacement,
} from './RichTextEditorLinkPopoverPlugin';

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
  hasPlugin = true,
  hasNewTabLinks,
  ...props
}: Partial<RichTextEditorProps> & {
  toolbar?: ReactElement;
  hasPlugin?: boolean;
  hasNewTabLinks?: boolean;
} = {}) {
  let captured: LexicalEditor | null = null;
  render(
    <RichTextEditor
      label="Notes"
      {...props}
      toolbar={toolbar}
      plugins={
        <>
          <CaptureEditor onReady={editor => (captured = editor)} />
          {hasPlugin && (
            <RichTextEditorLinkPopoverPlugin hasNewTabLinks={hasNewTabLinks} />
          )}
        </>
      }
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

const popover = () => screen.queryByRole('group', {name: 'Link'});

/**
 * The tooltip text an element shows. A tooltip that repeats the element's
 * name is not its description, so the layer's own text is read then.
 */
function tooltipOf(element: HTMLElement): string {
  const described = (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
  if (described !== '') {
    return described;
  }
  const name = element.getAttribute('aria-label') ?? '';
  return (
    screen
      .queryAllByRole('tooltip', {hidden: true})
      .find(tooltip => tooltip.textContent === name)?.textContent ?? ''
  );
}

function linkElement(editor: LexicalEditor): HTMLAnchorElement {
  const anchor = editor.getRootElement()?.querySelector('a');
  if (anchor == null) {
    throw new Error('no link in the editor');
  }
  return anchor;
}

describe('the link popover plugin', () => {
  it('shows nothing and follows no Cmd/Ctrl-click without the plugin', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const editor = await renderEditor({hasPlugin: false});
    await seedLink(editor);
    await act(async () => {});

    expect(popover()).toBeNull();
    fireEvent.click(linkElement(editor), {ctrlKey: true});
    expect(opened).not.toHaveBeenCalled();
  });

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

    // Focus leaving the editor takes the popover with it.
    act(() => root.blur());
    await waitFor(() => expect(popover()).toBeNull());
  });

  it('shows when the caret arrives in a link without a click, as arrowing into it does', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    expect(popover()).toBeNull();

    // The caret steps from "See " into the link's words.
    act(() => {
      editor.update(() => $getRoot().getAllTextNodes()[1].select(1, 1), {
        discrete: true,
      });
    });
    expect(
      await screen.findByRole('group', {name: 'Link'}),
    ).toBeInTheDocument();
  });

  it('opens a link in a new tab on Cmd/Ctrl-click, and not on a plain click', async () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    const anchor = linkElement(editor);

    fireEvent.click(anchor);
    expect(opened).not.toHaveBeenCalled();
    // jsdom is not an Apple platform, so the modifier is Ctrl.
    fireEvent.click(anchor, {metaKey: true});
    expect(opened).not.toHaveBeenCalled();
    expect(fireEvent.click(anchor, {ctrlKey: true})).toBe(false);
    expect(opened.mock.calls).toEqual([[URL, '_blank', 'noopener,noreferrer']]);
  });

  it('writes no new-tab attributes on an edited link when hasNewTabLinks is false', async () => {
    const editor = await renderEditor({hasNewTabLinks: false});
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));
    const address = screen.getByRole('textbox', {name: 'URL'});
    fireEvent.change(address, {target: {value: 'example.org'}});
    fireEvent.keyDown(address, {key: 'Enter'});

    await waitFor(() =>
      expect(linkElement(editor)).toHaveAttribute(
        'href',
        'https://example.org/',
      ),
    );
    expect(linkElement(editor)).not.toHaveAttribute('target');
    expect(linkElement(editor)).not.toHaveAttribute('rel');
  });

  it('stays away while the caret is outside a link or the selection is a range', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    expect(popover()).toBeNull();

    act(() => {
      editor.update(() => $getRoot().getAllTextNodes()[1].select(0, 3), {
        discrete: true,
      });
    });
    await act(async () => {});
    expect(popover()).toBeNull();
  });

  it('does not open for a pointer resting on a link', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {caret: false});
    act(() => editor.getRootElement()?.blur());
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});

    fireEvent.mouseOver(linkElement(editor));
    act(() => vi.advanceTimersByTime(1000));
    expect(popover()).toBeNull();
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
      const editor = await renderEditor();
      await seedLink(editor, {url});
      const shown = await screen.findByRole('group', {name: 'Link'});

      expect(shown).toHaveTextContent(url);
      expect(screen.queryByRole('link', {name: url})).toBeNull();
      expect(
        screen.queryByRole('button', {name: 'Open in new tab'}),
      ).toBeNull();
    },
  );

  it('edits the address in the shared link form, as one undo step', async () => {
    const editor = await renderEditor();
    await seedLink(editor, {bold: true});
    await screen.findByRole('group', {name: 'Link'});

    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));
    const address = screen.getByRole('textbox', {name: 'URL'});
    await waitFor(() => expect(address).toHaveFocus());
    expect(address).toHaveValue(URL);
    expect(address).toHaveAttribute('inputmode', 'url');
    expect(address).toHaveAttribute('placeholder', 'example.com');
    for (const name of ['Update link', 'Remove link', 'Cancel']) {
      expect(tooltipOf(screen.getByRole('button', {name}))).toBe(name);
    }

    fireEvent.change(address, {target: {value: 'example.org/guide'}});
    // The Enter is claimed, so it cannot type a new line into the editor.
    expect(fireEvent.keyDown(address, {key: 'Enter'})).toBe(false);

    await waitFor(() =>
      expect(linksIn(editor)).toEqual([
        {url: 'https://example.org/guide', text: 'the docs', bold: true},
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByRole('textbox', {name: 'URL'})).toBeNull(),
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

    fireEvent.change(screen.getByRole('textbox', {name: 'URL'}), {
      target: {value: '  '},
    });
    fireEvent.click(screen.getByRole('button', {name: 'Update link'}));

    await waitFor(() => expect(linksIn(editor)).toEqual([]));
    expect(textOf(editor)).toBe('See the docs today.');
  });

  it('refuses an address the link rules refuse, keeping focus in the field', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));
    const address = screen.getByRole('textbox', {name: 'URL'});
    await waitFor(() => expect(address).toHaveFocus());

    fireEvent.change(address, {target: {value: 'javascript:alert(1)'}});
    fireEvent.keyDown(address, {key: 'Enter'});

    await screen.findByText('Enter a valid http, https, mailto, or tel URL.');
    expect(address).toHaveAttribute('aria-invalid', 'true');
    expect(address).toHaveFocus();
    expect(linksIn(editor)).toEqual([
      {url: URL, text: 'the docs', bold: false},
    ]);
  });

  it('Remove unlinks the words and keeps them', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});

    fireEvent.click(screen.getByRole('button', {name: 'Remove link'}));

    await waitFor(() => expect(linksIn(editor)).toEqual([]));
    expect(textOf(editor)).toBe('See the docs today.');
    expect(popover()).toBeNull();
  });

  it('opens Edit on Cmd/Ctrl+K with the caret in a link, and the toolbar popover elsewhere', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    const root = editor.getRootElement() as HTMLElement;

    // jsdom is not an Apple platform, so the primary modifier is Ctrl.
    fireEvent.keyDown(root, {key: 'k', code: 'KeyK', ctrlKey: true});
    const address = await screen.findByRole('textbox', {name: 'URL'});
    expect(popover()).toContainElement(address);
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
    await waitFor(() =>
      expect(screen.getByRole('button', {name: 'Link'})).toHaveAttribute(
        'aria-expanded',
        'true',
      ),
    );
  });

  it('Escape closes it through the layer stack and keeps it away until the caret is in another link', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    const root = editor.getRootElement() as HTMLElement;
    const address = screen.getByRole('link', {name: 'example.com/docs'});
    act(() => address.focus());

    fireEvent.keyDown(address, {key: 'Escape'});

    await waitFor(() => expect(popover()).toBeNull());
    expect(root).toHaveFocus();
    await act(async () => {});
    expect(popover()).toBeNull();

    // The caret leaves the link and comes back: it shows again.
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

  it('closes the form when its link is deleted, and shows for the next link the caret is in', async () => {
    const editor = await renderEditor();
    await seedLink(editor);
    await screen.findByRole('group', {name: 'Link'});
    fireEvent.click(screen.getByRole('button', {name: 'Edit link'}));
    await screen.findByRole('textbox', {name: 'URL'});

    act(() => {
      editor.update(
        () => {
          const second = $createLinkNode('https://example.net/');
          const words = $createTextNode('other');
          $getRoot()
            .clear()
            .append($createParagraphNode().append(second.append(words)));
          words.select(2, 2);
        },
        {discrete: true},
      );
    });
    act(() => editor.getRootElement()?.focus());

    await waitFor(() =>
      expect(screen.queryByRole('textbox', {name: 'URL'})).toBeNull(),
    );
    expect(
      await screen.findByRole('link', {name: 'example.net'}),
    ).toBeInTheDocument();
  });

  it.each([
    ['read-only', {isReadOnly: true}],
    ['disabled', {isDisabled: true}],
  ] as const)(
    'shows nothing and follows no Cmd/Ctrl-click in a %s editor',
    async (_state, props) => {
      const opened = vi.spyOn(window, 'open').mockReturnValue(null);
      const editor = await renderEditor(props);
      await seedLink(editor);
      await act(async () => {});
      expect(popover()).toBeNull();
      fireEvent.click(linkElement(editor), {ctrlKey: true});
      expect(opened).not.toHaveBeenCalled();
    },
  );
});

describe('linkPopoverPlacement', () => {
  // The link's line spans 100–220px in a 400px-wide editor at x = 50.
  const container = new DOMRect(50, 10, 400, 300);
  const line = new DOMRect(150, 40, 120, 20);

  it('sits under the line, start-aligned with it', () => {
    expect(
      linkPopoverPlacement({line, container, width: 200, isRtl: false}),
    ).toEqual({top: 50, left: 100});
  });

  it('aligns with the line end in right-to-left text', () => {
    expect(
      linkPopoverPlacement({line, container, width: 200, isRtl: true}),
    ).toEqual({top: 50, left: 20});
  });

  it('stays inside the editor at either edge', () => {
    expect(
      linkPopoverPlacement({
        line: new DOMRect(400, 40, 40, 20),
        container,
        width: 200,
        isRtl: false,
      }).left,
    ).toBe(200);
    expect(
      linkPopoverPlacement({
        line: new DOMRect(60, 40, 40, 20),
        container,
        width: 200,
        isRtl: true,
      }).left,
    ).toBe(0);
    // A popover wider than the editor starts at its start edge.
    expect(
      linkPopoverPlacement({line, container, width: 500, isRtl: false}).left,
    ).toBe(0);
  });
});
