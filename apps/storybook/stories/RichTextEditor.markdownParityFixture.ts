// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.markdownParityFixture.ts
 * @input None; plain data.
 * @output The one Markdown document the Markdown/RichText parity sandbox
 *   renders on both surfaces, authored as an ordered list of blocks.
 * @position Storybook-only fixture for RichTextEditor.markdownParity.tsx. It is
 *   an input, not an oracle: nothing here says how a block should look.
 *
 * Coverage: ATX headings 1-4; emphasis, strong, strikethrough, inline code,
 * titled and bare links; soft and hard line breaks; a blockquote; nested
 * unordered (2-space) and ordered (3-space) lists; a GFM task list, and a
 * list that mixes task and plain items; a fenced
 * code block with an info string; a GFM table with column alignment; a
 * thematic break; backslash escapes and character references; a right-to-left
 * paragraph; and the Storybook demo plugins' mention, TODO, and callout syntax.
 * There is no image: the repository has no offline image fixture, and Markdown
 * refuses `data:` image sources by design.
 */

export interface MarkdownParityBlock {
  /** Stable identity, written to `data-parity-block` on the rendered element. */
  readonly key: string;
  /** Label for the measurement table. */
  readonly label: string;
  /**
   * Text that appears in this block's rendered text on both surfaces, so the
   * sandbox can pair equivalent blocks without relying on either renderer's
   * markup. `null` for a block with no text of its own (a thematic break): it
   * pairs with an `<hr>`, or with a block whose text is its literal source.
   */
  readonly probe: string | null;
  /** The block's Markdown source. */
  readonly markdown: string;
}

const lines = (...rows: readonly string[]): string => rows.join('\n');

export const MARKDOWN_PARITY_BLOCKS: readonly MarkdownParityBlock[] = [
  {
    key: 'heading-1',
    label: 'Heading 1',
    probe: 'Release notes',
    markdown: '# Release notes',
  },
  {
    key: 'paragraph-inline',
    label: 'Paragraph: inline marks and line breaks',
    probe: 'faster sync',
    markdown: lines(
      'Version 2.4 brings **faster sync**, *clearer errors*, ***both at once***, ~~surprise reloads~~, `inline code`, a [titled link](https://example.com/changelog "Changelog"), and a bare URL https://example.com/status that may autolink.',
      'A soft break keeps this sentence in the same paragraph.',
      'A hard break ends this line with two trailing spaces  ',
      'so this line starts below it.',
    ),
  },
  {
    key: 'heading-2',
    label: 'Heading 2',
    probe: 'What changed',
    markdown: '## What changed',
  },
  {
    key: 'heading-3',
    label: 'Heading 3',
    probe: 'Sync engine',
    markdown: '### Sync engine',
  },
  {
    key: 'heading-4',
    label: 'Heading 4',
    probe: 'Background retries',
    markdown: '#### Background retries',
  },
  {
    key: 'blockquote',
    label: 'Blockquote',
    probe: 'retry policy',
    markdown: lines(
      '> The new retry policy waits **longer** between attempts; see the [runbook](https://example.com/runbook).',
      '> A second quote line continues the same blockquote.',
    ),
  },
  {
    key: 'list-unordered',
    label: 'Unordered list, nested with 2 spaces',
    probe: 'Unordered item one',
    markdown: lines(
      '- Unordered item one',
      '- Unordered item two',
      '  - Nested item',
      '  - Second nested item',
      '    - Deeply nested item',
      '- Unordered item three',
    ),
  },
  {
    key: 'list-ordered',
    label: 'Ordered list, nested with 3 spaces',
    probe: 'Ordered step one',
    markdown: lines(
      '1. Ordered step one',
      '2. Ordered step two',
      '   1. Nested ordered step',
      '3. Ordered step three',
    ),
  },
  {
    key: 'list-task',
    label: 'Task list',
    probe: 'Open task',
    markdown: lines('- [ ] Open task', '- [x] Completed task'),
  },
  {
    key: 'code-fence',
    label: 'Fenced code',
    probe: 'retryDelay',
    markdown: lines(
      '```ts',
      'export function retryDelay(attempt: number): number {',
      '  return Math.min(30_000, 2 ** attempt * 250);',
      '}',
      '```',
    ),
  },
  {
    key: 'list-task-mixed',
    label: 'Task and plain items',
    probe: 'Mixed open task',
    // Not right after the task list, which it would continue as one list.
    markdown: lines(
      '- [ ] Mixed open task',
      '- Mixed plain item',
      '- [x] Mixed done task',
    ),
  },
  // Fences that show no language label, as core CodeBlock decides: no info
  // string, a blank one, and `plaintext`; and an unknown language, which
  // shows its name.
  {
    key: 'code-plain',
    label: 'Fenced code, no info string',
    probe: 'plainFence',
    markdown: lines('```', 'const plainFence = true;', '```'),
  },
  {
    key: 'code-blank',
    label: 'Fenced code, blank info string',
    probe: 'blankFence',
    markdown: lines('```   ', 'const blankFence = true;', '```'),
  },
  {
    key: 'code-plaintext',
    label: 'Fenced code, plaintext',
    probe: 'typedAsIs',
    markdown: lines('```plaintext', 'typedAsIs = 1', '```'),
  },
  {
    key: 'code-unknown',
    label: 'Fenced code, unknown language',
    probe: 'unknownFence',
    markdown: lines('```notalanguage', 'unknownFence()', '```'),
  },
  // A line longer than the prose measure: the frame grows to fit it, up to
  // the full width, and wraps beyond that.
  {
    key: 'code-long',
    label: 'Fenced code, long line',
    probe: 'longFenceLine',
    markdown: lines(
      '```sh',
      'echo "longFenceLine: the quick brown fox jumps over the lazy dog, then runs back across the field to do it again"',
      '```',
    ),
  },
  // A long line in a fence that names no language: the copy button sits in
  // its own column beside the code, so the line wraps before it.
  {
    key: 'code-plain-long',
    label: 'Fenced code, no info string, long line',
    probe: 'plainLongFence',
    markdown: lines(
      '```',
      'plainLongFence: the quick brown fox jumps over the lazy dog, then runs back across the field to do it again',
      '```',
    ),
  },
  {
    key: 'table',
    label: 'Table',
    probe: 'Owner',
    markdown: lines(
      '| Area | Owner | Status |',
      '| :--- | :---: | ---: |',
      '| Sync | Platform | Shipped |',
      '| Search **beta** | `search` | 80% |',
    ),
  },
  {
    key: 'thematic-break',
    label: 'Thematic break',
    probe: null,
    markdown: '---',
  },
  {
    key: 'paragraph-escapes',
    label: 'Paragraph: escapes and character references',
    probe: 'not italic',
    markdown:
      'Escaped \\*not italic\\* and \\# not a heading; references &amp; &copy; &#169;.',
  },
  {
    key: 'paragraph-rtl',
    label: 'Paragraph: right-to-left script',
    probe: 'כיוון',
    markdown: 'פסקה בעברית לבדיקת כיוון הטקסט.',
  },
  {
    key: 'paragraph-plugins',
    label: 'Paragraph: mention and TODO plugin syntax',
    probe: 'before launch',
    markdown: 'Ask @{Ada} about the TODO before launch.',
  },
  {
    key: 'callout',
    label: 'Callout plugin block',
    probe: 'Callouts',
    markdown: lines(
      ':::note',
      'Callouts come from a Markdown plugin and can hold **bold** text.',
      ':::',
    ),
  },
  {
    key: 'paragraph-final',
    label: 'Final paragraph',
    probe: 'Final paragraph',
    markdown: 'Final paragraph.',
  },
];

/** The fixture as one Markdown string, one blank line between blocks. */
export const MARKDOWN_PARITY_SOURCE = `${MARKDOWN_PARITY_BLOCKS.map(
  block => block.markdown,
).join('\n\n')}\n`;
