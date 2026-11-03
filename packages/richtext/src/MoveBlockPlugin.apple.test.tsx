// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MoveBlockPlugin.apple.test.tsx
 * @input Uses vitest (with Lexical's platform flag set to Apple),
 *   @testing-library/react, lexical, RichTextEditor, and the Markdown
 *   serializers.
 * @output Checks that on Apple platforms Cmd+Option+ArrowUp moves the block
 *   holding the caret, and that Ctrl+Alt does not.
 * @position Testing; validates MoveBlockPlugin.tsx's Apple shortcut. jsdom is
 *   not an Apple platform, so MoveBlockPlugin.test.tsx covers Ctrl+Alt.
 */

import {beforeAll, describe, expect, it, vi} from 'vitest';
import {createRef} from 'react';
import {act, fireEvent, render} from '@testing-library/react';
import {$getRoot, SKIP_SCROLL_INTO_VIEW_TAG} from 'lexical';
import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';
import {markdownToEditorStateJSON} from './markdownSerializers';

vi.mock('lexical', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  IS_APPLE: true,
}));

// jsdom's Range has no getBoundingClientRect, which Lexical calls to scroll
// the caret into view in a focused editor.
beforeAll(() => {
  if (typeof Range.prototype.getBoundingClientRect !== 'function') {
    Range.prototype.getBoundingClientRect = () => new DOMRect();
  }
});

describe('moving a block on Apple platforms', () => {
  it('takes Cmd+Option, not Ctrl+Alt', async () => {
    const ref = createRef<RichTextEditorRef>();
    render(
      <RichTextEditor
        label="Notes"
        ref={ref}
        defaultValue={markdownToEditorStateJSON('First.\n\nSecond.\n')}
      />,
    );
    const editor = ref.current?.getEditor();
    const root = editor?.getRootElement();
    if (editor == null || root == null) {
      throw new Error('No editor');
    }
    await act(async () => {
      root.focus();
      editor.update(
        () => {
          $getRoot().getLastDescendant()?.selectStart();
        },
        {discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG},
      );
    });
    await act(async () => {
      fireEvent.keyDown(root, {key: 'ArrowUp', ctrlKey: true, altKey: true});
    });
    expect(ref.current?.getMarkdown()).toBe('First.\n\nSecond.\n');
    await act(async () => {
      fireEvent.keyDown(root, {key: 'ArrowUp', metaKey: true, altKey: true});
    });
    expect(ref.current?.getMarkdown()).toBe('Second.\n\nFirst.\n');
  });
});
