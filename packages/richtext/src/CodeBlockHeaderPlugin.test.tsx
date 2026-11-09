// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, it, expect, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';

describe('code block headers (spec:AST-061 FR8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('labels a fenced block with its language and copies its code, outside the editable text', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText},
    });
    const value = markdownToEditorStateJSON(
      'Before\n\n```ts\nconst a = 1;\nconst b = 2;\n```\n',
    );
    const {container} = render(<RichTextView value={value} />);
    const header = await waitFor(() => {
      const element = container.querySelector('[data-richtext-code-header]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });
    expect(header.textContent).toContain('ts');
    expect(header.closest('[contenteditable]')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name: 'Copy code'}));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('const a = 1;\nconst b = 2;'),
    );
  });

  it('shows only the copy button when the block names no language', async () => {
    const {container} = render(
      <RichTextView value={markdownToEditorStateJSON('```\nplain\n```\n')} />,
    );
    // The header's text ends with the copy button's tooltip, which its layer
    // draws in a later render than the header itself: wait for the text, not
    // only for the header.
    await waitFor(() =>
      expect(
        container.querySelector('[data-richtext-code-header]')?.textContent,
      ).toBe('Copy code'),
    );
    expect(screen.getByRole('button', {name: 'Copy code'})).toBeTruthy();
  });

  it('names no language for a plaintext fence, as core CodeBlock does', async () => {
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(
          '```plaintext\nas typed\n```\n\n```Plaintext\ncased\n```\n',
        )}
      />,
    );
    // Exactly `plaintext` names nothing; core compares it case-sensitively.
    // Each header's text ends with its copy button's tooltip, drawn in a later
    // render than the header: wait for the text.
    await waitFor(() =>
      expect(
        [...container.querySelectorAll('[data-richtext-code-header]')].map(
          header => header.textContent,
        ),
      ).toEqual(['Copy code', 'PlaintextCopy code']),
    );
  });

  it('draws one header per code block in the editor, outside the editable text', async () => {
    const {container} = render(
      <RichTextEditor
        label="Notes"
        defaultValue={markdownToEditorStateJSON(
          '```ts\none\n```\n\nText\n\n```js\ntwo\n```\n',
        )}
      />,
    );
    // Each header: its language label, then the copy button's tooltip, which
    // its layer draws in a later render than the header: wait for the text.
    await waitFor(() =>
      expect(
        [...container.querySelectorAll('[data-richtext-code-header]')].map(
          header => header.textContent,
        ),
      ).toEqual(['tsCopy code', 'jsCopy code']),
    );
    const headers = [
      ...container.querySelectorAll('[data-richtext-code-header]'),
    ];
    for (const header of headers) {
      expect(header.closest('[contenteditable]')).toBeNull();
    }
  });
});
