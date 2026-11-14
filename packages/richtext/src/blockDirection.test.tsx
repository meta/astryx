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
import {
  createEditor,
  $getRoot,
  $createTextNode,
  $createParagraphNode,
  type ParagraphNode,
  type TextNode,
} from 'lexical';
import {
  ListNode,
  ListItemNode,
  $createListNode,
  $createListItemNode,
} from '@lexical/list';
import {$createQuoteNode, HeadingNode, QuoteNode} from '@lexical/rich-text';
import {CodeNode} from '@lexical/code';
import {TableCellNode, TableNode, TableRowNode} from '@lexical/table';
import {render, waitFor} from '@testing-library/react';
import {RichTextEditor} from './RichTextEditor';
import {RichTextView} from './RichTextView';
import {markdownToEditorStateJSON} from './markdownSerializers';
import {registerBlockDirection} from './BlockDirectionPlugin';

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
    const parts = [...container.querySelectorAll('table, tr, th, td')].map(
      part => part.getAttribute('dir'),
    );
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
    await waitFor(() => expect(container.querySelector('ul')).not.toBeNull());
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

  it('writes every prose ancestor inside the update that changed the text', async () => {
    // The value a caller stores comes from the update that changed the text.
    // The sweep that follows is tagged history-merge, which OnChangePlugin
    // does not report, so a wrapper written only by the sweep holds a stale
    // direction in that value until the next edit. Driving a real editor is
    // the only way to see which update the write lands in: a whole-state
    // load, as RichTextView does, runs no transforms at all.
    const editor = createEditor({
      namespace: 'block-direction-ancestors',
      nodes: [
        ListNode,
        ListItemNode,
        HeadingNode,
        QuoteNode,
        CodeNode,
        TableNode,
        TableRowNode,
        TableCellNode,
      ],
      onError: error => {
        throw error;
      },
    });
    const teardown = registerBlockDirection(editor);

    let item: ListItemNode | null = null;
    let leaf: TextNode | null = null;
    editor.update(
      () => {
        const outer = $createListNode('bullet');
        const parent = $createListItemNode();
        parent.append($createTextNode('Parent'));
        const holder = $createListItemNode();
        const inner = $createListNode('bullet');
        item = $createListItemNode();
        leaf = $createTextNode('a');
        item.append(leaf);
        inner.append(item);
        holder.append(inner);
        outer.append(parent, holder);
        $getRoot().clear().append(outer);
      },
      {discrete: true},
    );

    // One edit: the nested item's text becomes strongly right-to-left. The
    // item is an ancestor of the text node that changed, so it has to be
    // right-to-left in this update's own state, not a history step later.
    const states: Array<{tags: Set<string>; itemDir: string | null}> = [];
    const stop = editor.registerUpdateListener(({editorState, tags}) => {
      editorState.read(() => {
        states.push({
          tags: new Set(tags),
          itemDir: item?.getLatest().getDirection() ?? null,
        });
      });
    });
    editor.update(
      () => {
        leaf?.setTextContent('\u05e9');
      },
      {discrete: true},
    );

    const typed = states.find(s => !s.tags.has('history-merge'));
    expect(typed).toBeDefined();
    expect(typed?.itemDir).toBe('rtl');

    stop();
    teardown();
  });

  it('gives a nesting list item a direction, so its step follows its text', async () => {
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(
          '- Level one\n  - Level two\n    - Level three\n',
        )}
      />,
    );
    await waitFor(() => expect(container.querySelector('ul')).not.toBeNull());
    // Every item is English, including the two that only hold a nested list.
    // A wrapper left without a direction would put its nesting margin on the
    // document's side while the text inside started on the other, and all
    // three levels would begin at the same edge.
    expect(
      [...container.querySelectorAll('li')].map(li => li.getAttribute('dir')),
    ).toEqual(['ltr', 'ltr', 'ltr', 'ltr', 'ltr']);
  });

  it('writes a grandparent block when only its leaf text changes', async () => {
    const editor = createEditor({
      namespace: 'block-direction-grandparent',
      nodes: [
        ListNode,
        ListItemNode,
        HeadingNode,
        QuoteNode,
        CodeNode,
        TableNode,
        TableRowNode,
        TableCellNode,
      ],
      onError: error => {
        throw error;
      },
    });
    const teardown = registerBlockDirection(editor);

    let quote: QuoteNode | null = null;
    let leaf: TextNode | null = null;
    editor.update(
      () => {
        quote = $createQuoteNode();
        const paragraph = $createParagraphNode();
        leaf = $createTextNode('a');
        paragraph.append(leaf);
        quote.append(paragraph);
        $getRoot().clear().append(quote);
      },
      {discrete: true},
    );

    // The quote is two levels above the text that changes, and a transform
    // on the nearest block alone leaves it reading left-to-right. The walk
    // up the prose ancestors is what settles it, and it has to land in the
    // keystroke's own update so undo does not bounce off a later step.
    const states: Array<{tags: Set<string>; dir: string | null}> = [];
    const stop = editor.registerUpdateListener(({editorState, tags}) => {
      editorState.read(() => {
        states.push({
          tags: new Set(tags),
          dir: quote?.getLatest().getDirection() ?? null,
        });
      });
    });
    editor.update(
      () => {
        leaf?.setTextContent('\u05e9');
      },
      {discrete: true},
    );

    const typed = states.find(state => !state.tags.has('history-merge'));
    expect(typed).toBeDefined();
    expect(typed?.dir).toBe('rtl');

    stop();
    teardown();
  });

  it('settles a prose ancestor when a block is removed, in the same update', async () => {
    const editor = createEditor({
      namespace: 'block-direction-removal',
      nodes: [
        ListNode,
        ListItemNode,
        HeadingNode,
        QuoteNode,
        CodeNode,
        TableNode,
        TableRowNode,
        TableCellNode,
      ],
      onError: error => {
        throw error;
      },
    });
    const teardown = registerBlockDirection(editor);

    let quote: QuoteNode | null = null;
    let hebrew: ParagraphNode | null = null;
    editor.update(
      () => {
        quote = $createQuoteNode();
        hebrew = $createParagraphNode();
        hebrew.append($createTextNode('\u05e9'));
        const english = $createParagraphNode();
        english.append($createTextNode('a'));
        quote.append(hebrew, english);
        $getRoot().clear().append(quote);
      },
      {discrete: true},
    );

    // The Hebrew paragraph came first, so the quote reads right-to-left.
    editor.getEditorState().read(() => {
      expect(quote?.getLatest().getDirection()).toBe('rtl');
    });

    // Removing it leaves only English under the quote. Removing a node
    // dirties its parent, not every prose ancestor, so the quote has to be
    // settled by the walk rather than by the history-merge sweep a step
    // later.
    const states: Array<{tags: Set<string>; dir: string | null}> = [];
    const stop = editor.registerUpdateListener(({editorState, tags}) => {
      editorState.read(() => {
        states.push({
          tags: new Set(tags),
          dir: quote?.getLatest().getDirection() ?? null,
        });
      });
    });
    editor.update(
      () => {
        hebrew?.remove();
      },
      {discrete: true},
    );

    const typed = states.find(state => !state.tags.has('history-merge'));
    expect(typed).toBeDefined();
    expect(typed?.dir).toBe('ltr');

    stop();
    teardown();
  });

  it('reads a table cell by its own text, marks and numerals included', async () => {
    // The written `dir` comes from the block's own text, so it is the same
    // in either document; the computed direction that depends on the
    // document is covered by the parity spec in a real browser.
    const {container} = render(
      <RichTextView
        value={markdownToEditorStateJSON(
          '| a | b | c |\n| --- | --- | --- |\n| \u05b0Annual report | \u2160 | \u05e9\u05dc\u05d5\u05dd |\n',
        )}
      />,
    );
    await waitFor(() => expect(container.querySelector('td')).not.toBeNull());
    // A leading Hebrew point must not make the first cell right-to-left, and
    // a Roman numeral must not leave the second without a direction.
    expect(
      [...container.querySelectorAll('td p')].map(p => p.getAttribute('dir')),
    ).toEqual(['ltr', 'ltr', 'rtl']);
  });

  it('writes rtl on a paragraph whose Hebrew text opens with an emoji', async () => {
    const {container} = render(
      <RichTextView value={markdownToEditorStateJSON('🎉 מזל טוב')} />,
    );
    await waitFor(() => expect(container.querySelector('p')).not.toBeNull());
    // Fails before the fix with 'ltr': the emoji is a surrogate pair, which
    // Lexical's left-to-right class matches.
    expect(container.querySelector('p')?.getAttribute('dir')).toBe('rtl');
  });
});
