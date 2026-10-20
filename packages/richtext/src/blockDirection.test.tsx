// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blockDirection.test.tsx
 * @input Renders RichTextEditor and RichTextView over a mixed-direction
 *   document.
 * @output Proves each top-level block carries the direction of its own text,
 *   and that a block with no direction of its own stays `auto` so the theme
 *   can hand it the document's direction (spec:AST-061 FR6).
 * @position Unit cover for BlockDirectionPlugin. The browser-level proof,
 *   including caret motion and logical insets, is in
 *   MarkdownParitySandbox.a11y.chromium.spec.ts.
 */

import {describe, it, expect} from 'vitest';
import {render, waitFor} from '@testing-library/react';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';

const HEBREW = 'פסקה בעברית לבדיקת כיוון הטקסט.';
const ENGLISH = 'An English paragraph.';

/** `dir` on each top-level block of the one editor in this container. */
function blockDirections(container: HTMLElement): Array<string | null> {
  const root = container.querySelector('[data-lexical-editor]');
  return [...(root?.children ?? [])].map(child => child.getAttribute('dir'));
}

const MIXED = markdownToEditorStateJSON(
  [ENGLISH, HEBREW, '## שלום', '## Hello', '123 — 456'].join('\n\n'),
);

describe('a top-level block carries its own direction (spec:AST-061 FR6)', () => {
  it('writes ltr, rtl, or auto onto each block in the editor', async () => {
    const {container} = render(
      <RichTextEditor label="Notes" defaultValue={MIXED} />,
    );
    await waitFor(() =>
      expect(blockDirections(container)).toEqual([
        // English paragraph, Hebrew paragraph, Hebrew heading, English
        // heading, and a block of digits and punctuation with no direction
        // of its own.
        'ltr',
        'rtl',
        'rtl',
        'ltr',
        'auto',
      ]),
    );
  });

  it('writes the same directions in the read-only view', async () => {
    const {container} = render(<RichTextView value={MIXED} />);
    await waitFor(() =>
      expect(blockDirections(container)).toEqual([
        'ltr',
        'rtl',
        'rtl',
        'ltr',
        'auto',
      ]),
    );
  });

  it('rewrites a block when the view is handed a new document', async () => {
    const {container, rerender} = render(
      <RichTextView value={markdownToEditorStateJSON(ENGLISH)} />,
    );
    await waitFor(() => expect(blockDirections(container)).toEqual(['ltr']));
    rerender(<RichTextView value={markdownToEditorStateJSON(HEBREW)} />);
    await waitFor(() => expect(blockDirections(container)).toEqual(['rtl']));
  });

  it('leaves a table on the document direction, cells and all', async () => {
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(
          ['| Name | שם |', '| --- | --- |', '| Ada | עדה |'].join('\n'),
        )}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('table')).not.toBeNull(),
    );
    expect(blockDirections(container)).toEqual(['auto']);
    const parts = [
      ...container.querySelectorAll('table, tr, th, td'),
    ].map(part => part.getAttribute('dir'));
    expect(parts.every(dir => dir === null || dir === 'auto')).toBe(true);
  });

  it('leaves a list and a fenced code block on the document direction', async () => {
    // Both hold several lines under one element, so one direction would
    // impose the first line's on the rest: a Hebrew first item would turn
    // `Buy milk.` into `.Buy milk`.
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(
          [
            `- ${HEBREW}`,
            '- Buy milk.',
            '',
            '```js',
            '// שלום',
            'const x = 1;',
            '```',
          ].join('\n'),
        )}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('ul')).not.toBeNull(),
    );
    expect(blockDirections(container)).toEqual(['auto', 'auto']);
    // And nothing is written onto the items inside the list either.
    const items = [...container.querySelectorAll('li')].map(item =>
      item.getAttribute('dir'),
    );
    expect(items.every(dir => dir === null)).toBe(true);
  });
});
