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
import {firstStrongDirection} from './BlockDirectionPlugin';

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

  it('orders a list in the document direction and reads each item its own way', async () => {
    // One direction on the list would impose the first item's on the rest:
    // a Hebrew first item would turn `Buy milk.` into `.Buy milk`. Each item
    // carries its own instead, and the list keeps the document's so its
    // markers and indent stay on the document's start edge.
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(
          [
            `- ${HEBREW}`,
            '- Buy milk.',
            '- 123',
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
    // The list and the code block take no direction of their own. A fenced
    // code block has no per-line node to carry one, so the block keeps the
    // document's direction and `unicode-bidi: plaintext` gives each line
    // its own. Core Markdown reorders the whole block instead, so the two
    // surfaces differ here (see editorTheme.ts, codeDirection).
    expect(blockDirections(container)).toEqual(['auto', 'auto']);
    expect(
      [...container.querySelectorAll('li')].map(item => [
        item.textContent,
        item.getAttribute('dir'),
      ]),
    ).toEqual([
      [HEBREW, 'rtl'],
      ['Buy milk.', 'ltr'],
      // No strong character, so it follows the document.
      ['123', null],
    ]);
  });

  it('clears a direction that arrives on a container', async () => {
    // A list pasted as `<ul dir="rtl">`, or an older stored document, must
    // not turn its markers and indent around in an English document. The
    // item keeps its own direction; the list gives up the one it arrived
    // with.
    const stored = JSON.stringify({
      root: {
        children: [
          {
            children: [
              {
                children: [
                  {
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    text: 'Buy milk.',
                    type: 'text',
                    version: 1,
                  },
                ],
                direction: 'rtl',
                format: '',
                indent: 0,
                type: 'listitem',
                value: 1,
                version: 1,
              },
            ],
            direction: 'rtl',
            format: '',
            indent: 0,
            listType: 'bullet',
            start: 1,
            tag: 'ul',
            type: 'list',
            version: 1,
          },
        ],
        direction: 'rtl',
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    });
    const {container} = render(<RichTextView value={stored} />);
    await waitFor(() => expect(container.querySelector('ul')).not.toBeNull());
    await waitFor(() =>
      expect(container.querySelector('ul')?.getAttribute('dir')).toBeNull(),
    );
    // The item reads its own text, which is English.
    expect(container.querySelector('li')?.getAttribute('dir')).toBe('ltr');
  });
  it('reads past an emoji to the first strongly directional character', async () => {
    // Lexical's own getTextDirection answers 'ltr' for all of these: its
    // left-to-right class spans the UTF-16 surrogates and the Samaritan and
    // Mandaic blocks. A browser's dir="auto" reads them right-to-left, and so
    // must the attribute we write in its place.
    expect(firstStrongDirection('🎉 מזל טוב')).toBe('rtl');
    expect(firstStrongDirection('👍 مرحبا')).toBe('rtl');
    expect(firstStrongDirection('𞤀𞤣𞤤𞤢𞤥')).toBe('rtl'); // Adlam, outside the BMP
    expect(firstStrongDirection('ࠀࠁࠂ')).toBe('rtl'); // Samaritan
    expect(firstStrongDirection('ࡀࡁࡂ')).toBe('rtl'); // Mandaic

    // An emoji is not strong in either direction, so it decides nothing.
    expect(firstStrongDirection('🎉 mazel tov')).toBe('ltr');
    expect(firstStrongDirection('🎉👍')).toBeNull();

    // UAX #9 P2 skips digits and punctuation the same way.
    expect(firstStrongDirection('123 — מזל טוב')).toBe('rtl');
    expect(firstStrongDirection('123 456')).toBeNull();
  });

  it('writes rtl on a paragraph whose Hebrew text opens with an emoji', async () => {
    const {container} = render(
      <RichTextView value={markdownToEditorStateJSON('🎉 מזל טוב')} />,
    );
    await waitFor(() =>
      expect(container.querySelector('p')).not.toBeNull(),
    );
    // Fails before the fix with 'ltr': the emoji is a surrogate pair, which
    // Lexical's left-to-right class matches.
    expect(container.querySelector('p')?.getAttribute('dir')).toBe('rtl');
  });
});
