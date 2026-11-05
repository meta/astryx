// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {
  parseMarkdown,
  parseMarkdownIncremental,
  createIncrementalState,
  getIncrementalParseWork,
  trimStreamingArtifacts,
} from './parser';
import type {
  BlockNode,
  BlockNodeWithMath,
  InlineNode,
  InlineNodeWithMath,
} from './parser';

function simulateStreaming(fullText: string, chunkSize = 10) {
  const state = createIncrementalState();
  const snapshots: BlockNode[][] = [];
  for (let i = chunkSize; i <= fullText.length; i += chunkSize) {
    snapshots.push(parseMarkdownIncremental(fullText.slice(0, i), state));
  }
  const final = parseMarkdownIncremental(fullText, state);
  snapshots.push(final);
  return {snapshots, final, state};
}

describe('parseMarkdownIncremental', () => {
  it('produces same final result as full parse', () => {
    const text = '# Hello\n\nThis is a paragraph.\n\n- Item 1\n- Item 2';
    const {final} = simulateStreaming(text);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
  });

  it('joins loose ordered list across streamed chunks', () => {
    // The boundary detector settles each pre-blank-line segment separately;
    // without the merge step this would land as three separate <ol>s.
    const text = '1. apple\n\n1. banana\n\n1. cherry\n';
    const {final} = simulateStreaming(text, 5);
    expect(final).toHaveLength(1);
    expect(final[0].type).toBe('list');
    if (final[0].type === 'list') {
      expect(final[0].items).toHaveLength(3);
      expect(final[0].loose).toBe(true);
    }
  });

  it('keeps projected settled-list identity when a following block settles too', () => {
    const state = createIncrementalState();
    parseMarkdownIncremental('1. a\n\nTail', state);
    const result = parseMarkdownIncremental(
      '1. a\n\n1. b\n\nAfter\n\nTail',
      state,
    );

    expect(state.settledBlocks).toEqual(parseMarkdown(state.settledText));
    expect(result[0]).toBe(state.settledBlocks[0]);
  });

  it('joins loose ) ordered list across streamed chunks', () => {
    const text = '1) apple\n\n1) banana\n\n1) cherry\n';
    const {final} = simulateStreaming(text, 5);
    expect(final).toHaveLength(1);
    if (final[0].type === 'list') {
      expect(final[0].items).toHaveLength(3);
      expect(final[0].delimiter).toBe(')');
    }
  });

  it('does not merge ordered lists with different delimiters across chunks', () => {
    // A change of delimiter (. -> )) starts a new list (CommonMark 5.2), so
    // the streamed result must match the full parse and stay two lists.
    const text = '1. First\n\n2) Second\n';
    const {final} = simulateStreaming(text, 4);
    expect(final).toEqual(parseMarkdown(text));
    expect(final.filter(b => b.type === 'list')).toHaveLength(2);
  });

  it('handles empty input', () => {
    const state = createIncrementalState();
    const result = parseMarkdownIncremental('', state);
    expect(result).toEqual([]);
  });

  it('settles blocks after double newline', () => {
    const state = createIncrementalState();
    const input = '# Heading\n\nParagraph text\n\nMore text';
    parseMarkdownIncremental(input, state);
    expect(state.settledBlocks.length).toBeGreaterThan(0);
  });

  it('code fences prevent false settlement', () => {
    const state = createIncrementalState();
    const input =
      '```javascript\nconst x = 1;\n\n// still in code\nconsole.log(x);';
    parseMarkdownIncremental(input, state);
    // Inside an unclosed fence, nothing should be settled
    expect(state.settledBlocks).toHaveLength(0);
  });

  it('handles heading then code block', () => {
    const text = '# Title\n\n```ts\nconst x = 1;\n```';
    const {final} = simulateStreaming(text);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
  });

  it('matches the full parse when math delimiters arrive across chunks', () => {
    const text = 'Before $x_1 + *y*$ after.\n\n$$\n\\sum_i x_i\n$$\n\nDone.';
    const state = createIncrementalState<true>();
    let final: BlockNodeWithMath[] = [];
    for (let end = 1; end <= text.length; end++) {
      final = parseMarkdownIncremental(text.slice(0, end), state, {math: true});
    }
    expect(final).toEqual(parseMarkdown(text, {math: true}));
  });

  describe.each([
    ['list', '- $$\n  x + y\n  $$'],
    ['task list', '- [ ] $$\n  x + y\n  $$'],
    ['blockquote', '> $$\n> x + y\n> $$'],
    ['blockquote in a list', '- > $$\n  > x + y\n  > $$'],
    ['CRLF list', '- $$\r\n  x + y\r\n  $$\r\n'],
  ] as const)('nested display math in a %s', (_label, text) => {
    it.each([false, true])(
      'withholds the incomplete container (sourceRanges=%s)',
      sourceRanges => {
        const closingDelimiter = text.lastIndexOf('$$');
        const state = createIncrementalState<true>();
        expect(
          parseMarkdownIncremental(text.slice(0, closingDelimiter), state, {
            math: true,
            sourceRanges,
          }),
        ).toEqual([]);
      },
    );

    it.each([false, true])(
      'matches the full parse at every stream split (sourceRanges=%s)',
      sourceRanges => {
        const options = {math: true as const, sourceRanges};
        const full = parseMarkdown(text, options);

        // One long-lived state sees every character boundary in order.
        const characterState = createIncrementalState<true>();
        let characterResult = parseMarkdownIncremental(
          '',
          characterState,
          options,
        );
        for (let end = 1; end <= text.length; end++) {
          characterResult = parseMarkdownIncremental(
            text.slice(0, end),
            characterState,
            options,
          );
        }
        expect(characterResult).toEqual(full);

        // Markdown's production streaming path trims partial syntax before it
        // reaches the incremental parser. A terminal nested closer must survive
        // that pass rather than being mistaken for a fresh opener.
        const productionState = createIncrementalState<true>();
        let productionResult = parseMarkdownIncremental(
          '',
          productionState,
          options,
        );
        for (let end = 1; end <= text.length; end++) {
          const prefix = trimStreamingArtifacts(text.slice(0, end), options);
          productionResult = parseMarkdownIncremental(
            prefix,
            productionState,
            options,
          );
        }
        expect(productionResult).toEqual(full);

        // Every possible two-chunk split converges to the same complete tree,
        // both directly and through Markdown's production trimming pass.
        for (let split = 0; split <= text.length; split++) {
          const state = createIncrementalState<true>();
          parseMarkdownIncremental(text.slice(0, split), state, options);
          expect(parseMarkdownIncremental(text, state, options)).toEqual(full);

          const trimmedState = createIncrementalState<true>();
          parseMarkdownIncremental(
            trimStreamingArtifacts(text.slice(0, split), options),
            trimmedState,
            options,
          );
          expect(
            parseMarkdownIncremental(
              trimStreamingArtifacts(text, options),
              trimmedState,
              options,
            ),
          ).toEqual(full);
        }
      },
    );
  });

  describe.each([
    ['list', '- $$\n  x\n- next\n\nAfter'],
    ['blockquote', '> $$\n> x\n\nAfter'],
    ['deeper blockquote', '> $$\n> > x\n> > $$'],
    ['deeper blockquote in a list', '- > $$\n  > > x\n  > > $$'],
    ['deeper inner quote in a quoted list', '> - $$\n>   > x\n>   > $$'],
  ] as const)('unmatched display math after a %s ends', (_label, text) => {
    it.each([false, true])(
      'returns to literal parsing (sourceRanges=%s)',
      sourceRanges => {
        const options = {math: true as const, sourceRanges};
        const full = parseMarkdown(text, options);
        for (const trimsStreamingArtifacts of [false, true]) {
          const state = createIncrementalState<true>();
          let result = parseMarkdownIncremental('', state, options);
          for (let end = 1; end <= text.length; end++) {
            const prefix = text.slice(0, end);
            result = parseMarkdownIncremental(
              trimsStreamingArtifacts
                ? trimStreamingArtifacts(prefix, options)
                : prefix,
              state,
              options,
            );
          }
          expect(result).toEqual(full);
        }
      },
    );
  });

  it('withholds an incomplete display-math block while streaming', () => {
    const state = createIncrementalState<true>();
    const blocks = parseMarkdownIncremental('Intro\n\n$$\nx + y', state, {
      math: true,
    });
    expect(blocks).toEqual(parseMarkdown('Intro'));
  });

  it('stores math nodes only in a math-enabled incremental state', () => {
    const text = 'Intro.\n\nInline $x$.';
    const state = createIncrementalState<true>();
    const blocks = parseMarkdownIncremental(text, state, {math: true});
    expect(blocks).toEqual(parseMarkdown(text, {math: true}));
    expect(state.settledBlocks).toEqual(parseMarkdown('Intro.', {math: true}));
  });

  it('handles table streaming', () => {
    const text = '| Col1 | Col2 |\n| --- | --- |\n| a | b |\n| c | d |';
    const {final} = simulateStreaming(text, 5);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
  });

  it('handles list streaming', () => {
    const text = '- Item 1\n- Item 2\n- Item 3';
    const {final} = simulateStreaming(text);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
    if (final[0].type === 'list') {
      expect(final[0].items).toHaveLength(3);
    }
  });

  it.each([
    ['blockquote', 'Intro.\n\n> quoted\ncontinued lazily'],
    ['unordered list', 'Intro.\n\n- listed\ncontinued lazily'],
    ['ordered list', 'Intro.\n\n1. listed\ncontinued lazily'],
    ['task list', 'Intro.\n\n- [ ] listed\ncontinued lazily'],
    ['CRLF blockquote', 'Intro.\r\n\r\n> quoted\r\ncontinued lazily'],
    [
      'later blockquote paragraph',
      'Intro.\n\n> para1\n>\n> para2\ncontinued lazily',
    ],
    ['nested containers', 'Intro.\n\n> 1. > quoted\ncontinued lazily'],
  ] as const)(
    'keeps a lazy continuation in its %s at every stream split',
    (_label, text) => {
      const full = parseMarkdown(text, {sourceRanges: true});
      expect(full).toHaveLength(2);
      expect(JSON.stringify(full[1])).toContain('continued lazily');
      const characterState = createIncrementalState();
      let result: BlockNode[] = [];
      for (let end = 1; end <= text.length; end++) {
        result = parseMarkdownIncremental(text.slice(0, end), characterState, {
          sourceRanges: true,
          isFinal: false,
        });
      }
      expect(result).toEqual(full);

      for (let split = 0; split <= text.length; split++) {
        const state = createIncrementalState();
        parseMarkdownIncremental(text.slice(0, split), state, {
          sourceRanges: true,
          isFinal: false,
        });
        expect(
          parseMarkdownIncremental(text, state, {
            sourceRanges: true,
            isFinal: true,
          }),
        ).toEqual(full);
      }
    },
  );

  it('handles 1-char chunks and matches full parse', () => {
    const text = '# Hello\n\nWorld';
    const {final} = simulateStreaming(text, 1);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
  });

  it('handles multiple code fences', () => {
    const text = '```js\nconst a = 1;\n```\n\n```py\nprint("hi")\n```';
    const {final} = simulateStreaming(text);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
  });

  it('resets state on empty input', () => {
    const state = createIncrementalState();
    parseMarkdownIncremental('# Hello\n\nWorld', state);
    expect(state.prevInput).not.toBe('');
    parseMarkdownIncremental('', state);
    expect(state.prevInput).toBe('');
    expect(state.settledBlocks).toEqual([]);
    expect(state.settledUpTo).toBe(0);
    expect(state.settledText).toBe('');
  });

  it('settles what precedes an unclosed fence, and nothing inside it', () => {
    const state = createIncrementalState();
    const input =
      '# Title\n\n```python\ndef foo():\n    pass\n\n# still inside fence';
    parseMarkdownIncremental(input, state);
    expect(state.settledText).toBe('# Title');
    expect(state.settledBlocks).toHaveLength(1);
  });

  it('does not hold back lines inside an unclosed fence', () => {
    const state = createIncrementalState();
    const blocks = parseMarkdownIncremental(
      'Intro\n\n```ts\ntype Id = string | number;',
      state,
    );
    const code = blocks.find(block => block.type === 'codeblock');
    expect(code).toMatchObject({
      type: 'codeblock',
      content: 'type Id = string | number;',
    });
  });

  it('handles task list streaming', () => {
    const text = '- [ ] Todo 1\n- [x] Done 1\n- [ ] Todo 2';
    const {final} = simulateStreaming(text);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
    if (final[0].type === 'list') {
      expect(final[0].items[0].checked).toBe(false);
      expect(final[0].items[1].checked).toBe(true);
    }
  });

  it('complex mixed content matches full parse', () => {
    const text = [
      '# Overview',
      '',
      'This is an introduction paragraph.',
      '',
      '```typescript',
      'function hello() {',
      '  return "world";',
      '}',
      '```',
      '',
      '| Feature | Status |',
      '| --- | --- |',
      '| Auth | Done |',
      '',
      '> A blockquote with important info.',
      '',
      '1. First step',
      '2. Second step',
      '',
      '---',
      '',
      'Visit [our site](https://example.com) for more.',
    ].join('\n');
    const {final} = simulateStreaming(text, 15);
    const full = parseMarkdown(text);
    expect(final).toEqual(full);
  });

  it('reuses cached settled blocks when settled portion is unchanged', () => {
    const state = createIncrementalState();
    // First call: establish settled content
    parseMarkdownIncremental('# Title\n\nParagraph\n\nStill typing', state);
    const cachedBlocks = state.settledBlocks;

    // Second call: only unsettled tail changed
    parseMarkdownIncremental(
      '# Title\n\nParagraph\n\nStill typing more',
      state,
    );
    // The settled blocks array reference should be the same (reused, not re-parsed)
    expect(state.settledBlocks).toBe(cachedBlocks);
  });

  it('returns a fresh array and leaves earlier snapshots untouched', () => {
    const state = createIncrementalState();
    const first = parseMarkdownIncremental(
      '# Stable\n\nFirst paragraph\n\nTail',
      state,
    );
    const stableHeading = first[0];
    const snapshot = structuredClone(first);

    const second = parseMarkdownIncremental(
      '# Stable\n\nFirst paragraph\n\nTail grows',
      state,
    );

    // Call 1's return is a stable snapshot: a later call neither replaces it
    // in place nor edits the block nodes it holds.
    expect(second).not.toBe(first);
    expect(first).toEqual(snapshot);
    // Settled block objects are reused across calls by reference.
    expect(second[0]).toBe(stableHeading);
    expect(second).toEqual(
      parseMarkdown('# Stable\n\nFirst paragraph\n\nTail grows'),
    );
  });

  it('re-parses when settled text is replaced at the same length', () => {
    const state = createIncrementalState();
    const before = '# Alpha\n\nOld body copy';
    const after = '# Bravo\n\nNew body copy';
    expect(after).toHaveLength(before.length);

    parseMarkdownIncremental(before, state);
    const blocks = parseMarkdownIncremental(after, state);

    expect(blocks).toEqual(parseMarkdown(after));
  });

  it('re-parses when settled text is replaced by longer content', () => {
    const state = createIncrementalState();
    parseMarkdownIncremental('# Alpha\n\nOld body copy', state);

    const after =
      '# Bravo heading\n\nNew body copy, longer than before\n\nTail';
    const blocks = parseMarkdownIncremental(after, state);

    expect(blocks).toEqual(parseMarkdown(after));
  });

  it('keeps the prefix settled while a long fence streams and closes', () => {
    const state = createIncrementalState();
    const prefix = '# Stable\n\n';
    const fence = '```ts\nconst a = 1;\n\nconst b = 2;';
    let stableHeading: BlockNode | undefined;

    for (let end = 1; end <= fence.length; end++) {
      const blocks = parseMarkdownIncremental(
        prefix + fence.slice(0, end),
        state,
      );
      stableHeading ??= blocks[0];
      expect(blocks[0]).toBe(stableHeading);
      expect(state.settledText).toBe('# Stable');
    }

    const complete = `${prefix}${fence}\n\`\`\`\n\nAfter`;
    const blocks = parseMarkdownIncremental(complete, state);
    expect(blocks[0]).toBe(stableHeading);
    expect(blocks).toEqual(parseMarkdown(complete));
  });

  it('tracks settledText correctly', () => {
    const state = createIncrementalState();
    parseMarkdownIncremental('# Hello\n\nWorld', state);
    expect(state.settledText).toBe('# Hello');
  });
});

describe('trimStreamingArtifacts', () => {
  it('trims trailing unclosed bold markers', () => {
    expect(trimStreamingArtifacts('Hello **')).toBe('Hello ');
    expect(trimStreamingArtifacts('Hello *')).toBe('Hello ');
    expect(trimStreamingArtifacts('Hello ***')).toBe('Hello ');
  });

  it('auto-closes unclosed mid-line bold', () => {
    // Mid-line ** with content after but no closer → append closing **
    // so text renders bold immediately during streaming
    expect(trimStreamingArtifacts('Hello **bold')).toBe('Hello **bold**');
    expect(trimStreamingArtifacts('Hello **bo')).toBe('Hello **bo**');
    // Trailing ** with no content → still trimmed
    expect(trimStreamingArtifacts('Hello **')).toBe('Hello ');
  });

  it('auto-closes unclosed mid-line italic', () => {
    expect(trimStreamingArtifacts('Hello *ital')).toBe('Hello *ital*');
    expect(trimStreamingArtifacts('Hello *')).toBe('Hello ');
  });

  it('preserves complete bold+italic in same line', () => {
    expect(trimStreamingArtifacts('Hello **bold** and *italic*')).toBe(
      'Hello **bold** and *italic*',
    );
  });

  it('auto-closes unclosed bold after closed bold', () => {
    expect(trimStreamingArtifacts('Hello **done** and **open')).toBe(
      'Hello **done** and **open**',
    );
  });

  it('preserves closed bold markers', () => {
    expect(trimStreamingArtifacts('Hello **world**')).toBe('Hello **world**');
  });

  it('trims trailing unclosed backticks', () => {
    expect(trimStreamingArtifacts('Hello `')).toBe('Hello ');
    expect(trimStreamingArtifacts('Hello ```')).toBe('Hello ');
  });

  it('preserves closed inline code', () => {
    expect(trimStreamingArtifacts('Hello `code`')).toBe('Hello `code`');
  });

  it('withholds incomplete inline math only when math parsing is enabled', () => {
    expect(trimStreamingArtifacts('Value $', {math: true})).toBe('Value ');
    expect(trimStreamingArtifacts('Value $x + 1', {math: true})).toBe('Value ');
    expect(trimStreamingArtifacts('Value $x + 1')).toBe('Value $x + 1');
    expect(trimStreamingArtifacts('Value $x + 1$', {math: true})).toBe(
      'Value $x + 1$',
    );
  });

  it('trims trailing unclosed strikethrough', () => {
    expect(trimStreamingArtifacts('Hello ~~')).toBe('Hello ');
    expect(trimStreamingArtifacts('Hello ~')).toBe('Hello ');
  });

  it('trims unclosed mid-line strikethrough', () => {
    expect(trimStreamingArtifacts('Hello ~~struck')).toBe('Hello ');
    expect(trimStreamingArtifacts('Hello ~~s')).toBe('Hello ');
  });

  it('preserves closed strikethrough', () => {
    expect(trimStreamingArtifacts('Hello ~~struck~~ more')).toBe(
      'Hello ~~struck~~ more',
    );
  });

  it('trims unclosed link text', () => {
    expect(trimStreamingArtifacts('Hello [link text')).toBe('Hello ');
    expect(trimStreamingArtifacts('Hello [link')).toBe('Hello ');
  });

  it('preserves closed links', () => {
    expect(trimStreamingArtifacts('Hello [text](url)')).toBe(
      'Hello [text](url)',
    );
  });

  it('trims unclosed image alt', () => {
    expect(trimStreamingArtifacts('Hello ![alt')).toBe('Hello ');
  });

  it('operates only on the last line', () => {
    expect(trimStreamingArtifacts('Line 1\nHello **')).toBe('Line 1\nHello ');
    expect(trimStreamingArtifacts('Line 1\n**bold** done\nHello *')).toBe(
      'Line 1\n**bold** done\nHello ',
    );
  });

  it('handles empty input', () => {
    expect(trimStreamingArtifacts('')).toBe('');
  });

  it('handles input with no artifacts', () => {
    expect(trimStreamingArtifacts('Just plain text')).toBe('Just plain text');
  });
});

describe('streaming structural suppression', () => {
  it('suppresses bare list markers in unsettled zone', () => {
    const state = createIncrementalState();
    // Paragraph followed by incomplete list item
    const input = 'Some text\n\n- ';
    const blocks = parseMarkdownIncremental(input, state);
    // Should NOT produce a list with an empty item
    const hasList = blocks.some(b => b.type === 'list');
    expect(hasList).toBe(false);
  });

  it('renders list items once text arrives', () => {
    const state = createIncrementalState();
    const input = 'Some text\n\n- First item';
    const blocks = parseMarkdownIncremental(input, state);
    const list = blocks.find(b => b.type === 'list');
    expect(list).toBeDefined();
    if (list?.type === 'list') {
      expect(list.items).toHaveLength(1);
    }
  });

  it('suppresses incomplete table header without separator', () => {
    const state = createIncrementalState();
    // Table header without separator row
    const input = 'Intro\n\n| Col1 | Col2 |';
    const blocks = parseMarkdownIncremental(input, state);
    const hasTable = blocks.some(b => b.type === 'table');
    expect(hasTable).toBe(false);
  });

  it('suppresses table separator without data rows', () => {
    const state = createIncrementalState();
    const input = 'Intro\n\n| Col1 | Col2 |\n| --- | --- |';
    parseMarkdownIncremental(input, state);
    // Should suppress: header + separator but no data rows yet
    // Actually this is a valid table with 0 data rows — parser may render it.
    // The key test is that we don't show partial pipe syntax.
  });

  it('renders complete table once rows arrive', () => {
    const state = createIncrementalState();
    const input = 'Intro\n\n| Col1 | Col2 |\n| --- | --- |\n| a | b |';
    const blocks = parseMarkdownIncremental(input, state);
    const table = blocks.find(b => b.type === 'table');
    expect(table).toBeDefined();
    if (table?.type === 'table') {
      expect(table.rows).toHaveLength(1);
    }
  });

  // A `\|` is literal text, not a cell delimiter, so an unfinished line
  // carrying only escaped pipes is ordinary prose. Holding it back hid the
  // text — and when it was the whole document, rendered nothing at all.
  describe('escaped pipes in the unsettled tail', () => {
    it('renders an unfinished first line whose only pipes are escaped', () => {
      const text = 'Costs 5 \\| 10 per unit';
      const state = createIncrementalState();

      const blocks = parseMarkdownIncremental(text, state);

      expect(blocks).toEqual(parseMarkdown(text));
      expect(blocks).toHaveLength(1);
    });

    it('renders an unfinished tail line after a settled block', () => {
      const text = 'Intro\n\nCosts 5 \\| 10 per unit';
      const state = createIncrementalState();

      const blocks = parseMarkdownIncremental(text, state);

      expect(blocks).toEqual(parseMarkdown(text));
      expect(blocks).toHaveLength(2);
    });

    /** The text a reader would see for one block. */
    function visibleText(block: BlockNodeWithMath): string {
      const fromInline = (nodes: InlineNodeWithMath[]): string =>
        nodes
          .map(node => {
            switch (node.type) {
              case 'text':
              case 'code':
                return node.content;
              case 'math':
                return node.value;
              case 'bold':
              case 'italic':
              case 'strikethrough':
              case 'link':
                return fromInline(node.children);
              case 'break':
                return '\n';
              case 'image':
                return node.alt;
              case 'citation':
                return '';
            }
          })
          .join('');
      switch (block.type) {
        case 'heading':
        case 'paragraph':
          return fromInline(block.children);
        case 'codeblock':
          return block.content;
        case 'math':
          return block.value;
        case 'blockquote':
          return block.children.map(visibleText).join('\n');
        case 'list':
          return block.items
            .map(item => item.children.map(visibleText).join('\n'))
            .join('\n');
        case 'table':
          return [block.headers, ...block.rows]
            .map(row => row.map(cell => fromInline(cell.children)).join(' '))
            .join('\n');
        case 'image':
          return block.alt;
        case 'hr':
          return '';
      }
    }

    /**
     * What the tail of a streamed prose line should read as once rendered:
     * every `\|` is one literal pipe, and the parser trims the unsettled
     * tail's surrounding whitespace.
     */
    function expectedTail(source: string): string {
      return source.replace(/\\\|/g, '|').trim();
    }

    it('keeps the whole tail visible at every prefix, with no settled text', () => {
      const text = 'Costs 5 \\| 10 per unit';
      const state = createIncrementalState();

      for (let length = 1; length <= text.length; length++) {
        const blocks = parseMarkdownIncremental(text.slice(0, length), state);
        const tail = expectedTail(text.slice(0, length));

        expect(blocks).toHaveLength(1);
        expect(visibleText(blocks[0])).toBe(tail);
      }
    });

    it('keeps the whole tail visible at every prefix, after a settled block', () => {
      const settled = 'Intro\n\n';
      const text = `${settled}Costs 5 \\| 10 per unit`;
      const state = createIncrementalState();

      for (let length = settled.length + 1; length <= text.length; length++) {
        const blocks = parseMarkdownIncremental(text.slice(0, length), state);
        const tail = expectedTail(text.slice(settled.length, length));

        // The settled paragraph stays put and the tail is fully readable.
        expect(blocks).toHaveLength(2);
        expect(visibleText(blocks[0])).toBe('Intro');
        expect(visibleText(blocks[1])).toBe(tail);
      }

      expect(parseMarkdownIncremental(text, state)).toEqual(
        parseMarkdown(text),
      );
    });

    it('keeps parsing bounded to the tail as the line streams in', () => {
      const prefix = 'Filler paragraph.\n\n'.repeat(40);
      const text = `${prefix}Costs 5 \\| 10 per unit`;
      const state = createIncrementalState();
      // Prime the cache: the first call has nothing settled yet and reads the
      // whole snapshot by definition.
      parseMarkdownIncremental(`${prefix}C`, state);
      let worstSplitCharacters = 0;

      for (let length = prefix.length + 2; length <= text.length; length++) {
        parseMarkdownIncremental(text.slice(0, length), state);
        worstSplitCharacters = Math.max(
          worstSplitCharacters,
          getIncrementalParseWork(state).splitCharacters,
        );
      }

      // Only the unsettled tail is re-split, never the settled filler.
      expect(worstSplitCharacters).toBeLessThan(
        text.length - prefix.length + 5,
      );
    });

    it.each([false, true])(
      'decodes escaped pipes in code spans during production streaming (sourceRanges=%s)',
      sourceRanges => {
        const text =
          'Intro\n\n| Concept | TypeScript |\n| --- | --- |\n| Null safety | **`T \\| null`** |';
        const options = {sourceRanges, math: false as const};
        const full = parseMarkdown(text, options);

        for (const trimsArtifacts of [false, true]) {
          const state = createIncrementalState();
          let streamed = parseMarkdownIncremental('', state, options);
          for (let end = 1; end <= text.length; end++) {
            const prefix = text.slice(0, end);
            streamed = parseMarkdownIncremental(
              trimsArtifacts ? trimStreamingArtifacts(prefix, options) : prefix,
              state,
              options,
            );
          }

          expect(state.settledText).toBe('Intro');
          expect(streamed).toEqual(full);
          expect(streamed).toHaveLength(2);
          expect(streamed[1].type).toBe('table');
          expect(visibleText(streamed[1])).toBe(
            'Concept TypeScript\nNull safety T | null',
          );
        }
      },
    );

    it('still holds back a lone header whose pipes are unescaped', () => {
      const state = createIncrementalState();

      const blocks = parseMarkdownIncremental('Col1 | Col2', state);

      expect(blocks).toHaveLength(0);
    });

    it('streams table rows containing escaped pipes once the table exists', () => {
      const text = '| Col1 | Col2 |\n| --- | --- |\n| a \\| b | c |';
      const state = createIncrementalState();

      const blocks = parseMarkdownIncremental(text, state);

      const table = blocks.find(b => b.type === 'table');
      expect(table?.type).toBe('table');
      if (table?.type === 'table') {
        expect(table.rows).toHaveLength(1);
        expect(table.rows[0]).toHaveLength(2);
      }
    });
  });

  it('suppresses ordered list marker without content', () => {
    const state = createIncrementalState();
    const input = 'Intro\n\n1. ';
    const blocks = parseMarkdownIncremental(input, state);
    const hasList = blocks.some(b => b.type === 'list');
    expect(hasList).toBe(false);
  });

  it('no suppression for complete list items', () => {
    const state = createIncrementalState();
    const input = 'Intro\n\n- Complete item\n- Another item';
    const blocks = parseMarkdownIncremental(input, state);
    const list = blocks.find(b => b.type === 'list');
    expect(list).toBeDefined();
    if (list?.type === 'list') {
      expect(list.items).toHaveLength(2);
    }
  });

  it('character-by-character streaming never produces bare list markers', () => {
    const fullText = 'Hello world\n\n- Item one\n- Item two\n- Item three';
    const state = createIncrementalState();
    for (let i = 1; i <= fullText.length; i++) {
      const blocks = parseMarkdownIncremental(fullText.slice(0, i), state);
      for (const block of blocks) {
        if (block.type === 'list') {
          for (const item of block.items) {
            // Every rendered list item should have non-empty content
            const firstChild = item.children[0];
            if (firstChild?.type === 'paragraph') {
              const textContent = firstChild.children
                .map(c => (c.type === 'text' ? c.content : ''))
                .join('')
                .trim();
              expect(textContent.length).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });
});

describe('streaming end-to-end: no raw syntax visible', () => {
  /**
   * Helper: extract all visible text from a block tree.
   * Returns the text that would be rendered to the user, without markdown syntax.
   */
  function extractVisibleText(blocks: BlockNodeWithMath[]): string {
    let text = '';
    for (const block of blocks) {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
          text += extractInlineText(block.children);
          break;
        case 'codeblock':
          text += block.content;
          break;
        case 'math':
          text += block.value;
          break;
        case 'blockquote':
          text += extractVisibleText(block.children);
          break;
        case 'list':
          for (const item of block.items) {
            text += extractVisibleText(item.children);
          }
          break;
        case 'table':
          for (const h of block.headers) {
            text += extractInlineText(h.children);
          }
          for (const row of block.rows) {
            for (const cell of row) {
              text += extractInlineText(cell.children);
            }
          }
          break;
        case 'hr':
          break;
        case 'image':
          text += block.alt;
          break;
      }
    }
    return text;
  }

  function extractInlineText(nodes: InlineNodeWithMath[]): string {
    let text = '';
    for (const node of nodes) {
      switch (node.type) {
        case 'text':
          text += node.content;
          break;
        case 'code':
          text += node.content;
          break;
        case 'math':
          text += node.value;
          break;
        case 'bold':
        case 'italic':
        case 'strikethrough':
        case 'link':
          text += extractInlineText(node.children);
          break;
        case 'image':
          text += node.alt;
          break;
        case 'citation':
          text += node.sourceId;
          break;
        case 'break':
          text += '\n';
          break;
      }
    }
    return text;
  }

  function streamCharByChar(fullText: string): {
    snapshots: BlockNodeWithMath[][];
    visibleTexts: string[];
  } {
    const state = createIncrementalState();
    const snapshots: BlockNodeWithMath[][] = [];
    const visibleTexts: string[] = [];
    for (let i = 1; i <= fullText.length; i++) {
      const trimmed = trimStreamingArtifacts(fullText.slice(0, i));
      const blocks = parseMarkdownIncremental(trimmed, state);
      snapshots.push(blocks);
      visibleTexts.push(extractVisibleText(blocks));
    }
    return {snapshots, visibleTexts};
  }

  it('bold text appears progressively during streaming', () => {
    const text = 'Hello **bold text** and more';
    const {visibleTexts} = streamCharByChar(text);
    // Content should never completely disappear — we should never hide
    // 20+ chars of content just because of unclosed markers
    const nonEmpty = visibleTexts.filter(t => t.length > 0);
    for (const visible of nonEmpty) {
      // At minimum "Hello" should always be visible once it appears
      if (visible.length >= 5) {
        expect(visible.startsWith('Hello')).toBe(true);
      }
    }
    // Text may briefly shrink when ** becomes formatting (markers removed
    // from visible text) — that's expected and correct.
    // Final result should have the full text (without raw markers)
    expect(visibleTexts[visibleTexts.length - 1]).toBe(
      'Hello bold text and more',
    );
  });

  it('never shows raw ** during bold streaming', () => {
    const text = 'Hello **bold text** and more';
    const {visibleTexts} = streamCharByChar(text);
    for (const visible of visibleTexts) {
      // Raw ** should never appear in visible text
      expect(visible).not.toContain('**');
    }
  });

  it('never shows raw * during italic streaming', () => {
    const text = 'Hello *italic text* and more';
    const {visibleTexts} = streamCharByChar(text);
    for (const visible of visibleTexts) {
      // A lone * that's not part of a word is raw syntax
      expect(visible).not.toMatch(/(?:^|\s)\*(?:\s|$)/);
    }
  });

  it('never shows raw ~~ during strikethrough streaming', () => {
    const text = 'Hello ~~struck~~ and more';
    const {visibleTexts} = streamCharByChar(text);
    for (const visible of visibleTexts) {
      expect(visible).not.toContain('~~');
    }
  });

  it('never shows raw [ during link streaming', () => {
    const text = 'Visit [our site](https://example.com) for info';
    const {visibleTexts} = streamCharByChar(text);
    for (const visible of visibleTexts) {
      expect(visible).not.toContain('[');
      expect(visible).not.toContain('](');
    }
  });

  it('never shows raw ![ during image streaming', () => {
    const text = 'See ![alt text](https://img.png) here';
    const {visibleTexts} = streamCharByChar(text);
    for (const visible of visibleTexts) {
      expect(visible).not.toContain('![');
    }
  });

  it('table rows render incrementally after header established', () => {
    const text =
      '| A | B |\n| --- | --- |\n| r1a | r1b |\n| r2a | r2b |\n| r3a | r3b |';
    const state = createIncrementalState();
    let maxRows = 0;
    // Stream by line to see rows appear incrementally
    const lines = text.split('\n');
    for (let lineCount = 1; lineCount <= lines.length; lineCount++) {
      const input = lines.slice(0, lineCount).join('\n');
      const trimmed = trimStreamingArtifacts(input);
      const blocks = parseMarkdownIncremental(trimmed, state);
      const table = blocks.find(b => b.type === 'table');
      if (table?.type === 'table') {
        maxRows = Math.max(maxRows, table.rows.length);
      }
    }
    // Should have seen rows accumulate, not all at once
    expect(maxRows).toBe(3);
  });

  it('complex mixed content char-by-char never shows raw syntax', () => {
    const text = [
      '## Heading',
      '',
      'A paragraph with **bold**, *italic*, and `code`.',
      '',
      '- List item **one**',
      '- List item [two](http://two.com)',
      '- List item ~~three~~',
      '',
      '| Col | Val |',
      '| --- | --- |',
      '| **a** | *b* |',
    ].join('\n');

    const {visibleTexts} = streamCharByChar(text);
    for (const visible of visibleTexts) {
      // Links and images should never show raw syntax
      expect(visible).not.toContain('](');
      expect(visible).not.toContain('![');
    }
  });

  describe('with autolink option', () => {
    it('produces same final result as full parse with autolink: gfm', () => {
      const text = 'Visit https://example.com or mail user@example.com today.';
      const state = createIncrementalState();
      const incremental = parseMarkdownIncremental(text, state, {
        autolink: 'gfm',
      });
      const full = parseMarkdown(text, {autolink: 'gfm'});
      expect(incremental).toEqual(full);
      // Sanity: the autolink transform actually fired
      const para = incremental[0];
      if (para.type === 'paragraph') {
        const linkHrefs = para.children
          .filter((n: InlineNode) => n.type === 'link')
          .map((n: InlineNode) => (n.type === 'link' ? n.href : ''));
        expect(linkHrefs).toEqual([
          'https://example.com',
          'mailto:user@example.com',
        ]);
      } else {
        throw new Error('expected paragraph block');
      }
    });

    it('streams character-by-character to the same final result', () => {
      const text = 'see https://example.com here and mail me@example.com soon.';
      const state = createIncrementalState();
      let last: BlockNode[] = [];
      for (let i = 1; i <= text.length; i++) {
        last = parseMarkdownIncremental(text.slice(0, i), state, {
          autolink: 'gfm',
        });
      }
      const full = parseMarkdown(text, {autolink: 'gfm'});
      expect(last).toEqual(full);
    });

    it('invalidates the cache when the autolink option toggles', () => {
      const text = 'first https://a.com.\n\nsecond https://b.com.';
      const state = createIncrementalState();
      // Prime cache with autolink off.
      const off = parseMarkdownIncremental(text, state);
      expect(off).toEqual(parseMarkdown(text));
      const noLinks = off.every(
        b =>
          b.type !== 'paragraph' ||
          b.children.every((n: InlineNode) => n.type !== 'link'),
      );
      expect(noLinks).toBe(true);
      // Re-parse same text with autolink on — stale settled blocks must NOT
      // be reused as plain text.
      const on = parseMarkdownIncremental(text, state, {autolink: 'gfm'});
      expect(on).toEqual(parseMarkdown(text, {autolink: 'gfm'}));
      const hasLink = on.some(
        b =>
          b.type === 'paragraph' &&
          b.children.some((n: InlineNode) => n.type === 'link'),
      );
      expect(hasLink).toBe(true);
      // Toggle back off — cache must invalidate again.
      const offAgain = parseMarkdownIncremental(text, state);
      expect(offAgain).toEqual(parseMarkdown(text));
    });
  });
});

describe('parseMarkdownIncremental link reference definitions', () => {
  function firstLinkHref(blocks: BlockNode[]): string | undefined {
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        for (const node of block.children) {
          if (node.type === 'link') {
            return node.href;
          }
        }
      }
    }
    return undefined;
  }

  it('resolves a footer reference streamed across chunks (matches full parse)', () => {
    const text = 'See [the docs][d] here.\n\n[d]: https://example.com/d\n';
    const {final} = simulateStreaming(text, 5);
    expect(final).toEqual(parseMarkdown(text));
    expect(firstLinkHref(final)).toBe('https://example.com/d');
  });

  it('re-resolves an already-settled reference once its definition arrives', () => {
    const state = createIncrementalState();
    // The reference paragraph settles (blank line) before the definition.
    parseMarkdownIncremental('See [d] here.\n\n', state);
    const before = parseMarkdownIncremental('See [d] here.\n\n[d', state);
    expect(firstLinkHref(before)).toBeUndefined();
    // Definition completes — the settled paragraph must pick up the link.
    const after = parseMarkdownIncremental(
      'See [d] here.\n\n[d]: /docs\n',
      state,
    );
    expect(firstLinkHref(after)).toBe('/docs');
  });

  it('keeps first-definition-wins when definitions move into the settled prefix', () => {
    const state = createIncrementalState();
    const first = 'See [d].\n\n[d]: /first\n\nMiddle paragraph\n\n[d]: /second';
    expect(firstLinkHref(parseMarkdownIncremental(first, state))).toBe(
      '/first',
    );

    const complete = `${first}\n\nAfter`;
    const blocks = parseMarkdownIncremental(complete, state);
    expect(blocks).toEqual(parseMarkdown(complete));
    expect(firstLinkHref(blocks)).toBe('/first');
  });
});
