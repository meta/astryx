// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditorToolbarLink.test.tsx
 * @input Uses vitest, @testing-library/react, Lexical, RichTextEditor and
 *   RichTextEditorToolbar
 * @output Tests for the toolbar's link popover: a non-modal Popover anchored
 *   to the Link button that holds one URL field and Apply, Remove, and Cancel
 *   icon buttons; Enter applies; Escape and Cancel give the editor back its
 *   focus and selection; an invalid URL keeps focus in the field with an
 *   inline error; Cmd/Ctrl+K opens it; `promptForUrl` still replaces it.
 * @position Testing; validates the link UI of RichTextEditorToolbar.tsx
 */

import {beforeAll, describe, expect, it, vi} from 'vitest';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {useEffect, type ReactElement} from 'react';
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {$createLinkNode, $isLinkNode} from '@lexical/link';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  type LexicalEditor,
  type LexicalNode,
} from 'lexical';
import {RichTextEditor} from './RichTextEditor';
import {
  RICHTEXT_ICON_KEYS,
  RichTextEditorToolbar,
} from './RichTextEditorToolbar';
import {registerIcons, resetIcons} from '@astryxdesign/core/Icon';

// The popover's surface is a native popover, which jsdom does not draw open.
const h = {hidden: true} as const;

beforeAll(() => {
  // jsdom's Range has no geometry; Lexical measures it when it scrolls a
  // selection into view in a focused editor.
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
  // jsdom has no scrolling; opening the form brings the Link button into view.
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
});

function CaptureEditor({onReady}: {onReady: (editor: LexicalEditor) => void}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);
  return null;
}

async function renderEditor(
  toolbar: ReactElement = <RichTextEditorToolbar />,
): Promise<LexicalEditor> {
  let captured: LexicalEditor | null = null;
  render(
    <RichTextEditor
      label="Notes"
      toolbar={toolbar}
      plugins={<CaptureEditor onReady={editor => (captured = editor)} />}
    />,
  );
  await waitFor(() => expect(captured).not.toBeNull());
  return captured as unknown as LexicalEditor;
}

/**
 * Focuses the editor and seeds one paragraph with a selection, as a person
 * leaves it before pressing Link. Plain: "Ship it today." with "Ship"
 * selected. With `link`: "See the docs today.", "the docs" linked to
 * https://example.com/docs and selected.
 */
async function seed(editor: LexicalEditor, {link = false} = {}) {
  // jsdom collapses the page's selection into an element that takes focus
  // and reports it a task later: let that land before selecting.
  act(() => editor.getRootElement()?.focus());
  await act(async () => {});
  act(() => {
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        root.append(paragraph);
        if (link) {
          const words = $createTextNode('the docs');
          paragraph.append(
            $createTextNode('See '),
            $createLinkNode('https://example.com/docs').append(words),
            $createTextNode(' today.'),
          );
          words.select(0, words.getTextContentSize());
        } else {
          const text = $createTextNode('Ship it today.');
          paragraph.append(text);
          text.select(0, 4);
        }
      },
      {discrete: true},
    );
  });
  await act(async () => {});
  expect(editor.getRootElement()).toHaveFocus();
  expect(document.getSelection()?.toString()).toBe(link ? 'the docs' : 'Ship');
}

function selectedText(editor: LexicalEditor): string {
  return editor
    .getEditorState()
    .read(() => $getSelection()?.getTextContent() ?? '');
}

function linksIn(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const links: Array<{url: string; target: string | null; text: string}> = [];
    const visit = (node: LexicalNode) => {
      if ($isLinkNode(node)) {
        links.push({
          url: node.getURL(),
          target: node.getTarget(),
          text: node.getTextContent(),
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

/**
 * The text of the tooltip a button shows. A tooltip that repeats the
 * button's name is not its description, so the layer's own text is read.
 */
function tooltipOf(button: HTMLElement): string {
  const described = (button.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map(id => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
  if (described !== '') {
    return described;
  }
  const name = button.getAttribute('aria-label') ?? '';
  const layer = screen
    .queryAllByRole('tooltip', {hidden: true})
    .find(tooltip => tooltip.textContent === name);
  return layer?.textContent ?? '';
}

async function openFromLinkButton() {
  const button = screen.getByRole('button', {name: 'Link'});
  // The button keeps the editor's selection: its press never takes focus.
  expect(fireEvent.mouseDown(button)).toBe(false);
  fireEvent.click(button);
  const field = await screen.findByRole('textbox', {name: 'URL', ...h});
  await waitFor(() => expect(field).toHaveFocus());
  return {button, field};
}

describe('RichTextEditorToolbar link popover', () => {
  it('opens a non-modal popover anchored to the Link button, outside the toolbar', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const {button, field} = await openFromLinkButton();

    const popover = screen.getByRole('dialog', {name: 'Insert link', ...h});
    expect(popover).not.toHaveAttribute('aria-modal');
    expect(popover).toContainElement(field);
    // No modal dialog: the page stays usable around the popover.
    expect(document.querySelector('dialog')).toBeNull();
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const controlled = document.getElementById(
      button.getAttribute('aria-controls') ?? '',
    );
    expect(controlled).not.toBeNull();
    expect(controlled).toContainElement(popover);
    // Outside the toolbar's roving tab stop, so Tab moves through the form.
    expect(screen.getByRole('toolbar')).not.toContainElement(popover);
    // Anchored to a wrapper around the button, which a press never scales,
    // not to the button itself.
    const anchor = button.parentElement as HTMLElement;
    expect(anchor.getAttribute('style') ?? '').toContain('anchor-name');
    expect(button.getAttribute('style') ?? '').not.toContain('anchor-name');
  });

  it('holds one plain-text URL field with a placeholder', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const {field} = await openFromLinkButton();

    const textboxes = screen.getAllByRole('textbox', h);
    expect(textboxes).toHaveLength(2);
    expect(textboxes).toContain(screen.getByRole('textbox', {name: 'Notes'}));
    expect(textboxes).toContain(field);
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveAttribute('inputmode', 'url');
    expect(field).toHaveAttribute('autocomplete', 'url');
    expect(field).toHaveAttribute('spellcheck', 'false');
    expect(field).toHaveAttribute('placeholder', 'example.com');
    expect(field).toHaveValue('');
  });

  it('offers Apply and Cancel as icon buttons with tooltips, and no Remove outside a link', async () => {
    const editor = await renderEditor();
    await seed(editor);
    await openFromLinkButton();

    const popover = screen.getByRole('dialog', {name: 'Insert link', ...h});
    const buttons = [...popover.querySelectorAll('button')];
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
      'Add link',
      'Cancel',
    ]);
    for (const button of buttons) {
      // Icon-only: the name is the label, the glyph is decorative.
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).not.toBeNull();
      expect(tooltipOf(button)).toBe(button.getAttribute('aria-label'));
    }
  });

  it('draws Apply and Cancel from the shared check and close icons, with no new richtext keys', async () => {
    registerIcons({
      check: <svg data-testid="shared-check" />,
      close: <svg data-testid="shared-close" />,
    });
    try {
      const editor = await renderEditor();
      await seed(editor);
      await openFromLinkButton();
      expect(
        screen
          .getByRole('button', {name: 'Add link', ...h})
          .querySelector('[data-testid="shared-check"]'),
      ).not.toBeNull();
      expect(
        screen
          .getByRole('button', {name: 'Cancel', ...h})
          .querySelector('[data-testid="shared-close"]'),
      ).not.toBeNull();
      expect(Object.keys(RICHTEXT_ICON_KEYS)).not.toEqual(
        expect.arrayContaining(['applyLink', 'removeLink', 'cancel']),
      );
    } finally {
      resetIcons();
    }
  });

  it('edits a link the selection is in, and Remove unlinks it keeping the text', async () => {
    const editor = await renderEditor();
    await seed(editor, {link: true});
    const {button, field} = await openFromLinkButton();

    expect(
      screen.getByRole('dialog', {name: 'Edit link', ...h}),
    ).toBeInTheDocument();
    expect(field).toHaveValue('https://example.com/docs');
    expect(
      screen.getByRole('button', {name: 'Update link', ...h}),
    ).toBeInTheDocument();
    const remove = screen.getByRole('button', {name: 'Remove link', ...h});
    expect(tooltipOf(remove)).toBe('Remove link');

    fireEvent.click(remove);
    await waitFor(() => expect(linksIn(editor)).toEqual([]));
    expect(
      editor.getEditorState().read(() => $getRoot().getTextContent()),
    ).toBe('See the docs today.');
    await waitFor(() =>
      expect(button).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(editor.getRootElement()).toHaveFocus();
  });

  it('applies the URL on Enter and gives the editor back its focus', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const {button, field} = await openFromLinkButton();

    fireEvent.change(field, {target: {value: 'example.com'}});
    // The Enter is claimed, so it cannot go on to type a new line into the
    // editor, which has focus by then.
    expect(fireEvent.keyDown(field, {key: 'Enter'})).toBe(false);

    await waitFor(() =>
      expect(linksIn(editor)).toEqual([
        {url: 'https://example.com/', target: '_blank', text: 'Ship'},
      ]),
    );
    await waitFor(() =>
      expect(button).toHaveAttribute('aria-expanded', 'false'),
    );
    expect(editor.getRootElement()).toHaveFocus();
  });

  it('writes same-tab links when hasNewTabLinks is false', async () => {
    const editor = await renderEditor(
      <RichTextEditorToolbar hasNewTabLinks={false} />,
    );
    await seed(editor);
    const {field} = await openFromLinkButton();

    fireEvent.change(field, {target: {value: 'https://example.com/a'}});
    fireEvent.keyDown(field, {key: 'Enter'});

    await waitFor(() =>
      expect(linksIn(editor)).toEqual([
        {url: 'https://example.com/a', target: null, text: 'Ship'},
      ]),
    );
  });

  it.each([
    [
      'Escape',
      (field: HTMLElement) => fireEvent.keyDown(field, {key: 'Escape'}),
    ],
    [
      'Cancel',
      () => fireEvent.click(screen.getByRole('button', {name: 'Cancel', ...h})),
    ],
  ])(
    '%s closes it and returns focus and the selection to the editor',
    async (_name, dismiss) => {
      const editor = await renderEditor();
      await seed(editor);
      const {button, field} = await openFromLinkButton();
      fireEvent.change(field, {target: {value: 'example.com'}});

      dismiss(field);

      await waitFor(() =>
        expect(button).toHaveAttribute('aria-expanded', 'false'),
      );
      const root = editor.getRootElement();
      expect(root).toHaveFocus();
      expect(selectedText(editor)).toBe('Ship');
      const domSelection = document.getSelection();
      expect(root?.contains(domSelection?.anchorNode ?? null)).toBe(true);
      expect(domSelection?.toString()).toBe('Ship');
      expect(linksIn(editor)).toEqual([]);
    },
  );

  it('shows an inline error for an invalid URL and keeps focus in the field', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const {button, field} = await openFromLinkButton();
    const message = 'Enter a valid http, https, mailto, or tel URL.';

    fireEvent.change(field, {target: {value: 'javascript:alert(1)'}});
    fireEvent.keyDown(field, {key: 'Enter'});

    await screen.findByText(message);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // The field is described by its error.
    const descriptions = (field.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map(id => document.getElementById(id)?.textContent ?? '');
    expect(descriptions).toContain(message);
    // Announced at once, through the persistent assertive live region.
    await waitFor(() =>
      expect(
        document.querySelector('[data-astryx-live-region="assertive"]'),
      ).toHaveTextContent(message),
    );
    expect(field).toHaveFocus();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(linksIn(editor)).toEqual([]);

    // Apply from its button: focus goes back to the field to fix it.
    const apply = screen.getByRole('button', {name: 'Add link', ...h});
    act(() => apply.focus());
    fireEvent.click(apply);
    await waitFor(() => expect(field).toHaveFocus());

    // Typing clears the error.
    fireEvent.change(field, {target: {value: 'example.com'}});
    expect(field).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText(message)).toBeNull();
  });

  it('opens on Cmd/Ctrl+K but not on Cmd/Ctrl+Shift+K', async () => {
    const editor = await renderEditor();
    await seed(editor);
    const root = editor.getRootElement() as HTMLElement;
    const button = screen.getByRole('button', {name: 'Link'});

    fireEvent.keyDown(root, {
      key: 'k',
      code: 'KeyK',
      ctrlKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(root, {
      key: 'k',
      code: 'KeyK',
      metaKey: true,
      shiftKey: true,
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    // The Link button can be scrolled out of view; opening brings it back.
    const scrollIntoView = vi.fn();
    button.scrollIntoView = scrollIntoView;
    // jsdom is not an Apple platform, so the primary modifier is Ctrl.
    fireEvent.keyDown(root, {key: 'k', code: 'KeyK', ctrlKey: true});
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
    const field = await screen.findByRole('textbox', {name: 'URL', ...h});
    await waitFor(() => expect(field).toHaveFocus());
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('leaves the built-in popover out when promptForUrl replaces it', async () => {
    const promptForUrl = vi.fn(() => 'example.com');
    const editor = await renderEditor(
      <RichTextEditorToolbar promptForUrl={promptForUrl} />,
    );
    await seed(editor);
    const button = screen.getByRole('button', {name: 'Link'});
    expect(button).not.toHaveAttribute('aria-haspopup');

    fireEvent.click(button);

    expect(promptForUrl).toHaveBeenCalledWith('Ship');
    expect(screen.queryByRole('dialog', h)).toBeNull();
    expect(screen.queryByRole('textbox', {name: 'URL', ...h})).toBeNull();
    await waitFor(() =>
      expect(linksIn(editor)).toEqual([
        {url: 'https://example.com/', target: '_blank', text: 'Ship'},
      ]),
    );
  });
});
