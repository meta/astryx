// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {
  createIncrementalState,
  parseInline,
  parseMarkdown,
  parseMarkdownIncremental,
} from './parser';
import type {BlockNode, InlineNode} from './parser';

describe('parseInline', () => {
  it('parses plain text', () => {
    const result = parseInline('hello world');
    expect(result).toEqual([{type: 'text', content: 'hello world'}]);
  });

  it('parses bold with **', () => {
    const result = parseInline('**bold text**');
    expect(result[0].type).toBe('bold');
    if (result[0].type === 'bold') {
      expect(result[0].children[0]).toEqual({
        type: 'text',
        content: 'bold text',
      });
    }
  });

  it('parses italic with *', () => {
    const result = parseInline('*italic text*');
    expect(result[0].type).toBe('italic');
    if (result[0].type === 'italic') {
      expect(result[0].children[0]).toEqual({
        type: 'text',
        content: 'italic text',
      });
    }
  });

  it('parses inline code', () => {
    const result = parseInline('`const x`');
    expect(result).toEqual([{type: 'code', content: 'const x'}]);
  });

  it('keeps backslash escapes literal inside standalone inline code', () => {
    const result = parseInline('`T \\| null`');
    expect(result).toEqual([{type: 'code', content: 'T \\| null'}]);
  });

  it('leaves math delimiters as literal text by default', () => {
    expect(parseInline('Euler: $e^{i * pi} + 1 = 0$.')).toEqual([
      {type: 'text', content: 'Euler: $e^{i * pi} + 1 = 0$.'},
    ]);
  });

  it('parses inline math before Markdown formatting when explicitly enabled', () => {
    expect(parseInline('Euler: $e^{i * pi} + 1 = 0$.', {math: true})).toEqual([
      {type: 'text', content: 'Euler: '},
      {type: 'math', value: 'e^{i * pi} + 1 = 0'},
      {type: 'text', content: '.'},
    ]);
  });

  it('preserves escaped delimiters inside math and leaves escaped openers literal', () => {
    expect(
      parseInline('Price: \\$5; formula: $x \\$ y$.', {math: true}),
    ).toEqual([
      {type: 'text', content: 'Price: '},
      {type: 'text', content: '$5; formula: '},
      {type: 'math', value: 'x \\$ y'},
      {type: 'text', content: '.'},
    ]);
  });

  it('leaves an unmatched inline math delimiter literal', () => {
    expect(parseInline('The value is $x + 1.', {math: true})).toEqual([
      {type: 'text', content: 'The value is $x + 1.'},
    ]);
  });

  it('does not mistake paired currency amounts for inline math', () => {
    expect(
      parseInline('Tickets cost $20 and $30 today.', {math: true}),
    ).toEqual([{type: 'text', content: 'Tickets cost $20 and $30 today.'}]);
    expect(parseInline('$x$5 and $y$', {math: true})).toEqual([
      {type: 'text', content: '$x$5 and '},
      {type: 'math', value: 'y'},
    ]);
  });

  it('allows an inline expression to begin with a number', () => {
    expect(parseInline('Result: $2 + 2$.', {math: true})).toEqual([
      {type: 'text', content: 'Result: '},
      {type: 'math', value: '2 + 2'},
      {type: 'text', content: '.'},
    ]);
  });

  it('does not treat non-block double-dollar runs as inline math', () => {
    expect(parseInline('Keep $$x + y$$ literal.', {math: true})).toEqual([
      {type: 'text', content: 'Keep $$x + y$$ literal.'},
    ]);
  });

  it('keeps code and link destinations opaque while parsing math in link labels', () => {
    expect(parseInline('`$code$` [$label$](/price/$5)', {math: true})).toEqual([
      {type: 'code', content: '$code$'},
      {type: 'text', content: ' '},
      {
        type: 'link',
        href: '/price/$5',
        children: [{type: 'math', value: 'label'}],
      },
    ]);
  });

  it('parses links', () => {
    const result = parseInline('[click](https://example.com)');
    expect(result[0].type).toBe('link');
    if (result[0].type === 'link') {
      expect(result[0].href).toBe('https://example.com');
      expect(result[0].children[0]).toEqual({type: 'text', content: 'click'});
    }
  });

  it('parses images', () => {
    const result = parseInline('![alt](img.png)');
    expect(result).toEqual([{type: 'image', src: 'img.png', alt: 'alt'}]);
  });

  it('rejects javascript: links as plain text (XSS prevention)', () => {
    const result = parseInline('[click](javascript:alert(1))');
    // Should be emitted as plain text, NOT as a link node
    expect(result).toEqual([
      {type: 'text', content: '[click](javascript:alert(1))'},
    ]);
  });

  it('rejects javascript: with mixed case and whitespace (XSS prevention)', () => {
    const result = parseInline('[click](JaVaScRiPt:alert(1))');
    expect(result).toEqual([
      {type: 'text', content: '[click](JaVaScRiPt:alert(1))'},
    ]);
  });

  it('rejects vbscript: links (XSS prevention)', () => {
    const result = parseInline('[click](vbscript:MsgBox(1))');
    expect(result).toEqual([
      {type: 'text', content: '[click](vbscript:MsgBox(1))'},
    ]);
  });

  it('rejects data:text/html image src (XSS prevention)', () => {
    const result = parseInline(
      '![xss](data:text/html,<script>alert(1)</script>)',
    );
    expect(result).toEqual([
      {
        type: 'text',
        content: '![xss](data:text/html,<script>alert(1)</script>)',
      },
    ]);
  });

  it('allows normal http/https links', () => {
    const result = parseInline('[safe](https://example.com)');
    expect(result[0].type).toBe('link');
    if (result[0].type === 'link') {
      expect(result[0].href).toBe('https://example.com');
    }
  });

  it('decides link destinations with the shared navigation rule', () => {
    const destinations: [string, boolean][] = [
      ['https://example.com', true],
      ['/page', true],
      ['#section', true],
      ['mailto:a@example.com', true],
      ['tel:+1234567890', true],
      ['custom:document', true],
      ['data:image/png;base64,iVBORw0KGgo=', true],
      ['javascript:alert(1)', false],
      ['vbscript:MsgBox(1)', false],
      ['data:text/html,<b>x</b>', false],
      ['java\u0000script:alert(1)', false],
    ];
    for (const [destination, accepted] of destinations) {
      const [node] = parseInline(`[t](${destination})`);
      expect(node.type === 'link').toBe(accepted);
    }
  });

  it('parses strikethrough', () => {
    const result = parseInline('~~deleted~~');
    expect(result[0].type).toBe('strikethrough');
    if (result[0].type === 'strikethrough') {
      expect(result[0].children[0]).toEqual({type: 'text', content: 'deleted'});
    }
  });

  it('parses mixed inline formatting', () => {
    const result = parseInline(
      'Hello **bold** and *italic* with `code` and [link](url)',
    );
    expect(result.length).toBeGreaterThanOrEqual(5);
  });

  it('handles escape sequences', () => {
    const result = parseInline('\\*not italic\\*');
    const hasItalic = result.some(n => n.type === 'italic');
    expect(hasItalic).toBe(false);
  });

  // --- Bold-italic ---

  it('parses ***bold italic*** with asterisks', () => {
    const result = parseInline('***bold italic***');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('bold');
    if (result[0].type === 'bold') {
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].type).toBe('italic');
      if (result[0].children[0].type === 'italic') {
        expect(result[0].children[0].children[0]).toEqual({
          type: 'text',
          content: 'bold italic',
        });
      }
    }
  });

  it('parses ___bold italic___ with underscores', () => {
    const result = parseInline('___bold italic___');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('bold');
    if (result[0].type === 'bold') {
      expect(result[0].children[0].type).toBe('italic');
    }
  });

  // --- Underscore word boundary ---

  it('does NOT italicize underscores inside words', () => {
    const result = parseInline('some_variable_name');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    if (result[0].type === 'text') {
      expect(result[0].content).toBe('some_variable_name');
    }
  });

  it('does NOT bold underscores inside words', () => {
    const result = parseInline('foo__bar__baz');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('text');
    if (result[0].type === 'text') {
      expect(result[0].content).toBe('foo__bar__baz');
    }
  });

  it('italicizes underscores at word boundaries', () => {
    const result = parseInline('hello _world_ end');
    const italic = result.find(n => n.type === 'italic');
    expect(italic).toBeDefined();
    if (italic?.type === 'italic') {
      expect(italic.children[0]).toEqual({type: 'text', content: 'world'});
    }
  });

  it('asterisk italic works mid-word', () => {
    const result = parseInline('some*thing*here');
    const italic = result.find(n => n.type === 'italic');
    expect(italic).toBeDefined();
  });

  // --- Balanced parentheses in URLs ---

  it('handles parentheses in link URLs', () => {
    const result = parseInline('[text](https://example.com/wiki/Foo_(bar))');
    expect(result[0].type).toBe('link');
    if (result[0].type === 'link') {
      expect(result[0].href).toBe('https://example.com/wiki/Foo_(bar)');
    }
  });

  it('keeps a link title out of the destination', () => {
    const cases = [
      ['[t](https://example.com/notes "Notes")', 'https://example.com/notes'],
      ["[t](https://example.com/notes 'Notes')", 'https://example.com/notes'],
      ['[t](https://example.com/notes (Notes))', 'https://example.com/notes'],
      ['[t](https://example.com "Say \\"hi\\"")', 'https://example.com'],
      ['[t](<https://example.com/a b> "Spaced")', 'https://example.com/a b'],
      [
        '[t](https://example.com/wiki/Foo_(bar) "Wiki")',
        'https://example.com/wiki/Foo_(bar)',
      ],
    ] as const;
    for (const [source, href] of cases) {
      expect(parseInline(source)[0], source).toMatchObject({
        type: 'link',
        href,
      });
    }
  });

  it('keeps an image title out of the source, inline and standalone', () => {
    expect(parseInline('![alt](img.png "Caption")')).toEqual([
      {type: 'image', src: 'img.png', alt: 'alt'},
    ]);
    expect(parseMarkdown('![alt](img.png "Caption")')[0]).toMatchObject({
      type: 'image',
      src: 'img.png',
    });
  });

  it('keeps link content that has no title shape as the destination', () => {
    // A space without a quoted title is not a destination and title pair, so
    // the content keeps its released meaning.
    expect(parseInline('[t](https://example.com/a b)')[0]).toMatchObject({
      type: 'link',
      href: 'https://example.com/a b',
    });
  });

  it('decodes named and numeric character references in text', () => {
    expect(
      parseInline('Fish &amp; chips &copy; &#169; &#x1F600; a&nbsp;b'),
    ).toEqual([
      {type: 'text', content: 'Fish & chips \u00a9 \u00a9 \u{1F600} a\u00a0b'},
    ]);
  });

  it('keeps unknown names, missing semicolons, and escaped ampersands literal', () => {
    const nodes = parseInline('&notareference; &amp no semicolon \\&amp;');
    expect(nodes.every(node => node.type === 'text')).toBe(true);
    expect(
      nodes.map(node => (node.type === 'text' ? node.content : '')).join(''),
    ).toBe('&notareference; &amp no semicolon &amp;');
  });

  it('replaces NUL, surrogate, and out-of-range numeric references', () => {
    expect(parseInline('&#0; &#xD800; &#1114112;')).toEqual([
      {type: 'text', content: '\uFFFD \uFFFD \uFFFD'},
    ]);
  });

  it('never turns a decoded character into markup', () => {
    expect(
      parseInline('&ast;not emphasis&ast; &lsqb;not a link&rsqb;(x)'),
    ).toEqual([{type: 'text', content: '*not emphasis* [not a link](x)'}]);
  });

  it('keeps character references literal in inline and fenced code', () => {
    expect(parseInline('`&amp;`')).toEqual([{type: 'code', content: '&amp;'}]);
    expect(parseMarkdown('```\n&copy; &#169;\n```')[0]).toMatchObject({
      type: 'codeblock',
      content: '&copy; &#169;',
    });
  });

  it('decodes character references and escapes in image alt text', () => {
    expect(parseInline('![Fish &amp; chips \\*fresh\\*](fish.png)')).toEqual([
      {type: 'image', src: 'fish.png', alt: 'Fish & chips *fresh*'},
    ]);
    expect(parseMarkdown('![&copy; 2026 &#169;](logo.png)')[0]).toMatchObject({
      type: 'image',
      alt: '\u00a9 2026 \u00a9',
    });
    expect(
      parseMarkdown('![Q&amp;A][logo]\n\n[logo]: /logo.png')[0],
    ).toMatchObject({
      type: 'paragraph',
      children: [{type: 'image', src: '/logo.png', alt: 'Q&A'}],
    });
  });

  it('keeps an escaped ampersand and unknown names literal in alt text', () => {
    expect(parseInline('![\\&amp; &nope;](x.png)')).toEqual([
      {type: 'image', src: 'x.png', alt: '&amp; &nope;'},
    ]);
  });

  it('makes two spaces or a backslash before a CRLF line ending a hard break', () => {
    expect(parseInline('two  \r\nspaces')).toEqual([
      {type: 'text', content: 'two'},
      {type: 'break'},
      {type: 'text', content: 'spaces'},
    ]);
    expect(parseInline('back\\\r\nslash')).toEqual([
      {type: 'text', content: 'back'},
      {type: 'break'},
      {type: 'text', content: 'slash'},
    ]);
    // A Windows path ending a line keeps its other backslashes.
    expect(parseInline('C:\\Users\\Ada\\\r\nnext')).toEqual([
      {type: 'text', content: 'C:\\Users\\Ada'},
      {type: 'break'},
      {type: 'text', content: 'next'},
    ]);
  });

  it('escapes only ASCII punctuation and keeps other backslashes literal', () => {
    const textOf = (source: string) =>
      parseInline(source)
        .map(node => (node.type === 'text' ? node.content : `<${node.type}>`))
        .join('');
    expect(textOf('C:\\Users\\Ada')).toBe('C:\\Users\\Ada');
    expect(textOf('\\*not emphasis\\* and \\\\ one backslash')).toBe(
      '*not emphasis* and \\ one backslash',
    );
    expect(textOf('caf\\\u00e9 \\a \\1')).toBe('caf\\\u00e9 \\a \\1');
  });

  it('makes a backslash before a line break a hard break', () => {
    expect(parseInline('line\\\nnext')).toEqual([
      {type: 'text', content: 'line'},
      {type: 'break'},
      {type: 'text', content: 'next'},
    ]);
  });

  it('keeps non-punctuation backslashes in image alt text', () => {
    expect(parseInline('![C:\\Users \\& more](x.png)')).toEqual([
      {type: 'image', src: 'x.png', alt: 'C:\\Users & more'},
    ]);
  });

  it('handles parentheses in image URLs', () => {
    const result = parseInline('![alt](https://example.com/img_(1).png)');
    expect(result[0].type).toBe('image');
    if (result[0].type === 'image') {
      expect(result[0].src).toBe('https://example.com/img_(1).png');
    }
  });

  // --- Line breaks ---

  it('detects line break from two trailing spaces before newline', () => {
    const result = parseInline('hello  \nworld');
    const breakNode = result.find(n => n.type === 'break');
    expect(breakNode).toBeDefined();
    expect(result).toEqual([
      {type: 'text', content: 'hello'},
      {type: 'break'},
      {type: 'text', content: 'world'},
    ]);
  });

  it('does NOT produce break with only one trailing space', () => {
    const result = parseInline('hello \nworld');
    const breakNode = result.find(n => n.type === 'break');
    expect(breakNode).toBeUndefined();
  });
});

describe('parseMarkdown', () => {
  describe('hard breaks in CRLF documents', () => {
    const hasBreak = (value: unknown): boolean =>
      JSON.stringify(value).includes('"type":"break"');
    const lf = (source: string) => source.replace(/\r\n/g, '\n');
    // The parser keeps each CRLF line's `\r` in its text; drop it, and any text
    // node left empty, to compare structure with the LF document. Parsed
    // blocks are plain JSON data, so the comparison works on that shape.
    type Json =
      string | number | boolean | null | Json[] | {[key: string]: Json};
    const isEmptyText = (node: Json): boolean =>
      typeof node === 'object' &&
      node !== null &&
      !Array.isArray(node) &&
      node.type === 'text' &&
      node.content === '';
    const withoutCarriageReturns = (value: Json): Json => {
      if (Array.isArray(value)) {
        return value
          .map(withoutCarriageReturns)
          .filter(node => !isEmptyText(node));
      }
      if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key,
            withoutCarriageReturns(entry),
          ]),
        );
      }
      return typeof value === 'string' ? value.replace(/\r/g, '') : value;
    };
    const asJson = (blocks: ReadonlyArray<BlockNode>): Json =>
      JSON.parse(JSON.stringify(blocks)) as Json;

    it('breaks lines the same way as the LF document', () => {
      for (const source of [
        'Line one  \r\nLine two\r\n',
        'C:\\Users\\Ada\\\r\nnext\r\n',
        '[two  \r\nlines](https://example.com)\r\n',
        '> quoted  \r\n> lines\r\n',
      ]) {
        const crlf = parseMarkdown(source);
        expect(hasBreak(crlf), source).toBe(true);
        expect(withoutCarriageReturns(asJson(crlf)), source).toEqual(
          asJson(parseMarkdown(lf(source))),
        );
      }
    });

    it('leaves code spans, code blocks, and table cells without breaks', () => {
      for (const source of [
        '`a  \r\nb` and `c\\\r\nd`\r\n',
        '```\r\ncode  \r\nmore\\\r\n```\r\n',
        '| a |\r\n| --- |\r\n| x  |\r\n',
      ]) {
        expect(hasBreak(parseMarkdown(source)), source).toBe(false);
      }
    });

    it('streams to the same result when chunks split the line ending', () => {
      const source = 'One  \r\ntwo\\\r\nthree\r\n\r\nC:\\Users\r\n';
      const state = createIncrementalState();
      let blocks: BlockNode[] = [];
      for (let end = 1; end <= source.length; end++) {
        blocks = parseMarkdownIncremental(source.slice(0, end), state);
      }
      expect(blocks).toEqual(parseMarkdown(source));
      expect(hasBreak(blocks)).toBe(true);
    });
  });

  it('parses headings', () => {
    const result = parseMarkdown('# Hello');
    expect(result[0].type).toBe('heading');
    if (result[0].type === 'heading') {
      expect(result[0].level).toBe(1);
    }
  });

  it('parses h1-h6', () => {
    const input = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
    const result = parseMarkdown(input);
    expect(result).toHaveLength(6);
    result.forEach((block, i) => {
      expect(block.type).toBe('heading');
      if (block.type === 'heading') {
        expect(block.level).toBe(i + 1);
      }
    });
  });

  it('parses paragraphs', () => {
    const result = parseMarkdown('Hello world');
    expect(result[0].type).toBe('paragraph');
  });

  it('separates paragraphs by blank lines', () => {
    const result = parseMarkdown('First paragraph\n\nSecond paragraph');
    const paragraphs = result.filter(b => b.type === 'paragraph');
    expect(paragraphs).toHaveLength(2);
  });

  it('parses fenced code blocks with backticks', () => {
    const input = '```javascript\nconst x = 1;\nconsole.log(x);\n```';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('codeblock');
    if (result[0].type === 'codeblock') {
      expect(result[0].language).toBe('javascript');
      expect(result[0].content).toContain('const x = 1;');
    }
  });

  it('parses code blocks with tilde fences', () => {
    const input = '~~~python\nprint("hello")\n~~~';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('codeblock');
    if (result[0].type === 'codeblock') {
      expect(result[0].language).toBe('python');
    }
  });

  it('parses display math only when explicitly enabled', () => {
    const source = '$$\n\\int_0^1 x^2 \\, dx\n$$';
    expect(parseMarkdown(source)).not.toContainEqual({
      type: 'math',
      value: '\\int_0^1 x^2 \\, dx',
    });
    expect(parseMarkdown(source, {math: true})).toEqual([
      {type: 'math', value: '\\int_0^1 x^2 \\, dx'},
    ]);
  });

  it('parses a same-line display math block', () => {
    expect(parseMarkdown('$$E = mc^2$$', {math: true})).toEqual([
      {type: 'math', value: 'E = mc^2'},
    ]);
  });

  it('keeps empty display delimiters literal', () => {
    const source = '$$\n$$';
    expect(parseMarkdown(source, {math: true})).toEqual(parseMarkdown(source));
  });

  it('leaves unmatched display math delimiters literal', () => {
    const source = '$$\nx + y';
    expect(parseMarkdown(source, {math: true})).toEqual(parseMarkdown(source));
  });

  it('leaves escaped display delimiters literal', () => {
    const blocks = parseMarkdown('\\$\\$\nx + y\n\\$\\$', {math: true});
    expect(blocks.some(block => block.type === 'math')).toBe(false);
  });

  it('reports a display-math source range including its delimiters', () => {
    const source = 'Before.\n\n$$\nx + y\n$$\n\nAfter.';
    const blocks = parseMarkdown(source, {math: true, sourceRanges: true});
    expect(blocks[1]?.range).toEqual({start: 9, end: 20});
    expect(source.slice(blocks[1].range?.start, blocks[1].range?.end)).toBe(
      '$$\nx + y\n$$',
    );
  });

  it('keeps fenced code opaque when math parsing is enabled', () => {
    expect(parseMarkdown('```tex\n$x$\n$$y$$\n```', {math: true})).toEqual([
      {type: 'codeblock', language: 'tex', content: '$x$\n$$y$$'},
    ]);
  });

  it('does not collect link definitions from display math', () => {
    const blocks = parseMarkdown('$$\n[x]: /not-a-link\n$$\n\n[x]', {
      math: true,
    });
    expect(blocks[0]).toEqual({type: 'math', value: '[x]: /not-a-link'});
    expect(JSON.stringify(blocks[1])).not.toContain('"type":"link"');
  });

  it('parses blockquotes', () => {
    const result = parseMarkdown('> This is a quote');
    expect(result[0].type).toBe('blockquote');
  });

  it('keeps lazy paragraph continuations inside blockquotes and list items', () => {
    expect(parseMarkdown('> quoted\ncontinued lazily')).toEqual([
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{type: 'text', content: 'quoted\ncontinued lazily'}],
          },
        ],
      },
    ]);

    for (const marker of ['-', '1.', '- [ ]']) {
      const [list] = parseMarkdown(`${marker} listed\ncontinued lazily`);
      expect(list).toMatchObject({
        type: 'list',
        items: [
          {
            children: [
              {
                type: 'paragraph',
                children: [{type: 'text', content: 'listed\ncontinued lazily'}],
              },
            ],
          },
        ],
      });
    }
    expect(parseMarkdown('> # Foo\n> bar\nbaz')).toMatchObject([
      {
        type: 'blockquote',
        children: [
          {type: 'heading', level: 1},
          {
            type: 'paragraph',
            children: [{type: 'text', content: 'bar\nbaz'}],
          },
        ],
      },
    ]);
    expect(parseMarkdown('> bar\nbaz\n> foo')).toMatchObject([
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{type: 'text', content: 'bar\nbaz\nfoo'}],
          },
        ],
      },
    ]);
  });

  it('keeps lazy continuations in the deepest open paragraph', () => {
    expect(parseMarkdown('> 1. > Blockquote\ncontinued here.')).toMatchObject([
      {
        type: 'blockquote',
        children: [
          {
            type: 'list',
            items: [
              {
                children: [
                  {
                    type: 'blockquote',
                    children: [
                      {
                        type: 'paragraph',
                        children: [
                          {
                            type: 'text',
                            content: 'Blockquote\ncontinued here.',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(
      parseMarkdown('- Outer item\n  > Nested quote\ncontinued here.'),
    ).toMatchObject([
      {
        type: 'list',
        items: [
          {
            children: [
              {type: 'paragraph'},
              {
                type: 'blockquote',
                children: [
                  {
                    type: 'paragraph',
                    children: [
                      {
                        type: 'text',
                        content: 'Nested quote\ncontinued here.',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('resumes lazy continuation for a later blockquote paragraph', () => {
    expect(parseMarkdown('> para1\n>\n> para2\nlazy')).toMatchObject([
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [{type: 'text', content: 'para1'}],
          },
          {
            type: 'paragraph',
            children: [{type: 'text', content: 'para2\nlazy'}],
          },
        ],
      },
    ]);

    expect(parseMarkdown('> > para1\n> >\n> > para2\nlazy')).toMatchObject([
      {
        type: 'blockquote',
        children: [
          {
            type: 'blockquote',
            children: [
              {
                type: 'paragraph',
                children: [{type: 'text', content: 'para1'}],
              },
              {
                type: 'paragraph',
                children: [{type: 'text', content: 'para2\nlazy'}],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('does not continue a container paragraph across a blank or block start', () => {
    expect(
      parseMarkdown('> quoted\n\noutside').map(block => block.type),
    ).toEqual(['blockquote', 'paragraph']);
    expect(
      parseMarkdown('- listed\n\noutside').map(block => block.type),
    ).toEqual(['list', 'paragraph']);
    expect(
      parseMarkdown('> quoted\n# Outside').map(block => block.type),
    ).toEqual(['blockquote', 'heading']);
    expect(parseMarkdown('- listed\n```\noutside\n```')).toMatchObject([
      {type: 'list'},
      {type: 'codeblock', content: 'outside'},
    ]);
  });

  it('parses horizontal rules', () => {
    const result = parseMarkdown('---');
    expect(result[0].type).toBe('hr');
  });

  it('parses unordered lists', () => {
    const input = '- Item 1\n- Item 2\n- Item 3';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].ordered).toBe(false);
      expect(result[0].items).toHaveLength(3);
    }
  });

  it('parses ordered lists', () => {
    const input = '1. First\n2. Second';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].ordered).toBe(true);
      expect(result[0].items).toHaveLength(2);
    }
  });

  it('parses an ordered list with a custom start number', () => {
    const result = parseMarkdown('5. five\n6. six\n7. seven');
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].ordered).toBe(true);
      expect(result[0].start).toBe(5);
      expect(result[0].items).toHaveLength(3);
    }
  });

  it('parses an ordered list using the ) delimiter (CommonMark 5.2)', () => {
    const result = parseMarkdown('1) First\n2) Second\n3) Third');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].ordered).toBe(true);
      expect(result[0].start).toBe(1);
      expect(result[0].items).toHaveLength(3);
    }
  });

  it('parses a ) ordered list with a custom start number', () => {
    const result = parseMarkdown('3) three\n4) four');
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].ordered).toBe(true);
      expect(result[0].start).toBe(3);
      expect(result[0].items).toHaveLength(2);
    }
  });

  it('starts a new list when the ordered delimiter changes', () => {
    // CommonMark: changing the marker delimiter (. -> )) begins a new list.
    const result = parseMarkdown('1. First\n2) Second');
    const lists = result.filter(b => b.type === 'list');
    expect(lists).toHaveLength(2);
    if (lists[0].type === 'list' && lists[1].type === 'list') {
      expect(lists[0].items).toHaveLength(1);
      expect(lists[1].items).toHaveLength(1);
      expect(lists[1].start).toBe(2);
    }
  });

  it('only lets a marker value of 1 interrupt a paragraph', () => {
    // CommonMark 5.2: an ordered list interrupts a paragraph only when it
    // starts at 1 (for either delimiter). A `2)`/`2.` line is lazy paragraph
    // text.
    const two = parseMarkdown('Intro\n2) second step');
    expect(two).toHaveLength(1);
    expect(two[0].type).toBe('paragraph');

    const one = parseMarkdown('Intro\n1) first step');
    expect(one.map(b => b.type)).toEqual(['paragraph', 'list']);
  });

  it('treats a zero-padded value-1 marker as interrupting a paragraph', () => {
    // The interruption rule is by numeric value, so `01.` / `001)` (value 1)
    // still start a list, while `0)` (value 0) does not.
    expect(parseMarkdown('Intro\n01. first').map(b => b.type)).toEqual([
      'paragraph',
      'list',
    ]);
    expect(parseMarkdown('Intro\n001) first').map(b => b.type)).toEqual([
      'paragraph',
      'list',
    ]);
    expect(parseMarkdown('Intro\n0) zero')).toHaveLength(1);
  });

  it('joins blank-line-separated same-style items into one loose list', () => {
    // CommonMark §5.3 loose-list: blank lines between items of the same
    // style/indent still form a single list. LLM output very commonly uses
    // the 1./1./1. shape — each item must be treated as a continuation.
    const result = parseMarkdown('1. apple\n\n1. banana\n\n1. cherry');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].ordered).toBe(true);
      expect(result[0].loose).toBe(true);
      expect(result[0].items).toHaveLength(3);
      expect(result[0].start).toBe(1);
    }
  });

  it('joins blank-line-separated unordered items into one loose list', () => {
    const result = parseMarkdown('- a\n\n- b\n\n- c');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].ordered).toBe(false);
      expect(result[0].loose).toBe(true);
      expect(result[0].items).toHaveLength(3);
    }
  });

  it('does not join lists of different styles across a blank line', () => {
    // Bulleted then numbered — these are two distinct lists.
    const result = parseMarkdown('- a\n\n1. b');
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('list');
    expect(result[1].type).toBe('list');
    if (result[0].type === 'list' && result[1].type === 'list') {
      expect(result[0].ordered).toBe(false);
      expect(result[1].ordered).toBe(true);
    }
  });

  it('treats a tight list with no blank lines as not loose', () => {
    const result = parseMarkdown('1. a\n2. b\n3. c');
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].loose).toBeUndefined();
    }
  });

  it('parses task lists', () => {
    const input = '- [ ] Unchecked\n- [x] Checked';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].items[0].checked).toBe(false);
      expect(result[0].items[1].checked).toBe(true);
    }
  });

  it('parses GFM tables', () => {
    const input = '| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('table');
    if (result[0].type === 'table') {
      expect(result[0].headers).toHaveLength(2);
      expect(result[0].rows).toHaveLength(2);
    }
  });

  it('parses table alignment', () => {
    const input =
      '| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('table');
    if (result[0].type === 'table') {
      expect(result[0].alignments).toEqual(['left', 'center', 'right']);
    }
  });

  it('parses standalone images', () => {
    const result = parseMarkdown('![alt text](image.png)');
    expect(result[0].type).toBe('image');
    if (result[0].type === 'image') {
      expect(result[0].src).toBe('image.png');
      expect(result[0].alt).toBe('alt text');
    }
  });

  it('rejects a standalone image with an unsafe scheme as literal text (XSS prevention)', () => {
    // Same rule as inline images: the line falls through to the paragraph
    // path and stays literal text instead of becoming an image node.
    const result = parseMarkdown('![alt](vbscript:msgbox)');
    expect(result[0].type).toBe('paragraph');
    expect(JSON.stringify(result)).not.toContain('"type":"image"');
  });

  it('parses complex AI response', () => {
    const input = [
      '# Analysis',
      '',
      'Here is the result of the analysis.',
      '',
      '```typescript',
      'const result = analyze(data);',
      '```',
      '',
      '- Point one',
      '- Point two',
      '- Point three',
      '',
      '> Important note about the findings.',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      '| Score | 95 |',
    ].join('\n');
    const result = parseMarkdown(input);
    const types = result.map(b => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('codeblock');
    expect(types).toContain('list');
    expect(types).toContain('blockquote');
    expect(types).toContain('table');
  });

  // --- Nested lists ---

  it('parses nested unordered lists', () => {
    const input = '- Item 1\n  - Nested 1a\n  - Nested 1b\n- Item 2';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      expect(result[0].items).toHaveLength(2);
      // Item 1 should have children that include a nested list
      const item1Children = result[0].items[0].children;
      const nestedList = item1Children.find(c => c.type === 'list');
      expect(nestedList).toBeDefined();
      if (nestedList?.type === 'list') {
        expect(nestedList.items).toHaveLength(2);
      }
    }
  });

  it('parses deeply nested lists', () => {
    const input = '- L1\n  - L2\n    - L3';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('list');
    if (result[0].type === 'list') {
      const item = result[0].items[0];
      const l2 = item.children.find(c => c.type === 'list');
      expect(l2).toBeDefined();
      if (l2?.type === 'list') {
        const l3 = l2.items[0].children.find(c => c.type === 'list');
        expect(l3).toBeDefined();
      }
    }
  });

  // --- Table without leading pipe ---

  it('parses table without leading pipe', () => {
    const input = 'Name | Age\n--- | ---\nAlice | 30\nBob | 25';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('table');
    if (result[0].type === 'table') {
      expect(result[0].headers).toHaveLength(2);
      expect(result[0].rows).toHaveLength(2);
    }
  });

  // --- Table with escaped pipes ---

  it('decodes escaped pipes in table code spans without changing prose nodes', () => {
    const input =
      '| Concept | TypeScript |\n| --- | --- |\n| Prose | A \\| B |\n| Null safety | `T \\| null` |\n| Union | `A \\| B \\| C` |';
    const result = parseMarkdown(input);
    expect(result[0].type).toBe('table');
    if (result[0].type === 'table') {
      expect(result[0].headers).toHaveLength(2);
      expect(result[0].rows).toHaveLength(3);
      expect(result[0].rows[0][1].children).toEqual([
        {type: 'text', content: 'A '},
        {type: 'text', content: '| B'},
      ]);
      expect(result[0].rows[1][1].children).toEqual([
        {type: 'code', content: 'T | null'},
      ]);
      expect(result[0].rows[2][1].children).toEqual([
        {type: 'code', content: 'A | B | C'},
      ]);
    }
  });

  // --- HR variants ---

  it('parses spaced HR: - - -', () => {
    expect(parseMarkdown('- - -')[0].type).toBe('hr');
  });

  it('parses spaced HR: * * *', () => {
    expect(parseMarkdown('* * *')[0].type).toBe('hr');
  });

  it('parses spaced HR: _ _ _', () => {
    expect(parseMarkdown('_ _ _')[0].type).toBe('hr');
  });
});

// ---------------------------------------------------------------------------
// Citation parsing
// ---------------------------------------------------------------------------

describe('citation parsing', () => {
  const sourceIds = new Set(['abc1', 'def2', 'src3']);

  describe('bracket notation [id]', () => {
    it('parses a bracket citation when sourceId matches', () => {
      const result = parseInline('Tokyo is large[abc1].', sourceIds);
      expect(result).toEqual([
        {type: 'text', content: 'Tokyo is large'},
        {type: 'citation', sourceId: 'abc1'},
        {type: 'text', content: '.'},
      ]);
    });

    it('parses multiple bracket citations', () => {
      const result = parseInline('Fact[abc1][def2].', sourceIds);
      expect(result).toEqual([
        {type: 'text', content: 'Fact'},
        {type: 'citation', sourceId: 'abc1'},
        {type: 'citation', sourceId: 'def2'},
        {type: 'text', content: '.'},
      ]);
    });

    it('does NOT treat [id] as citation when id is not in sourceIds', () => {
      const result = parseInline('Use [PID] here.', sourceIds);
      expect(result.some(n => n.type === 'citation')).toBe(false);
    });

    it('does NOT treat [text](url) as citation', () => {
      const result = parseInline(
        '[click here](https://example.com)',
        sourceIds,
      );
      expect(result).toEqual([
        {
          type: 'link',
          href: 'https://example.com',
          children: [{type: 'text', content: 'click here'}],
        },
      ]);
    });

    it('handles citation next to link', () => {
      const result = parseInline(
        'See [link](https://example.com)[abc1].',
        sourceIds,
      );
      expect(result[0]).toEqual({type: 'text', content: 'See '});
      expect(result[1]).toEqual({
        type: 'link',
        href: 'https://example.com',
        children: [{type: 'text', content: 'link'}],
      });
      expect(result[2]).toEqual({type: 'citation', sourceId: 'abc1'});
    });

    it('ignores brackets when no sourceIds provided', () => {
      const result = parseInline('Text [abc1] here.');
      expect(result.some(n => n.type === 'citation')).toBe(false);
    });
  });

  describe('fullwidth bracket notation 【id】', () => {
    it('parses a fullwidth bracket citation', () => {
      const result = parseInline('Data【abc1】.', sourceIds);
      expect(result).toEqual([
        {type: 'text', content: 'Data'},
        {type: 'citation', sourceId: 'abc1'},
        {type: 'text', content: '.'},
      ]);
    });

    it('parses consecutive fullwidth citations', () => {
      const result = parseInline('Info【abc1】【def2】end.', sourceIds);
      expect(result).toEqual([
        {type: 'text', content: 'Info'},
        {type: 'citation', sourceId: 'abc1'},
        {type: 'citation', sourceId: 'def2'},
        {type: 'text', content: 'end.'},
      ]);
    });

    it('preserves fullwidth brackets when id is not in sourceIds', () => {
      const result = parseInline('Keep【hello world】.', sourceIds);
      expect(result.some(n => n.type === 'citation')).toBe(false);
    });
  });

  describe('mixed formats', () => {
    it('handles both bracket and fullwidth in same text', () => {
      const result = parseInline('A[abc1] B【def2】.', sourceIds);
      expect(result).toEqual([
        {type: 'text', content: 'A'},
        {type: 'citation', sourceId: 'abc1'},
        {type: 'text', content: ' B'},
        {type: 'citation', sourceId: 'def2'},
        {type: 'text', content: '.'},
      ]);
    });
  });

  describe('block-level threading', () => {
    it('detects citations inside paragraphs', () => {
      const blocks = parseMarkdown('Tokyo is big[abc1].', sourceIds);
      expect(blocks).toHaveLength(1);
      if (blocks[0].type === 'paragraph') {
        expect(blocks[0].children.some(n => n.type === 'citation')).toBe(true);
      }
    });

    it('detects citations inside list items', () => {
      const blocks = parseMarkdown('- Item[abc1]\n- Item[def2]', sourceIds);
      expect(blocks).toHaveLength(1);
      if (blocks[0].type === 'list') {
        const firstItem = blocks[0].items[0].children[0];
        if (firstItem.type === 'paragraph') {
          expect(firstItem.children.some(n => n.type === 'citation')).toBe(
            true,
          );
        }
      }
    });

    it('detects citations inside table cells', () => {
      const md = '| A | B |\n|---|---|\n| data[abc1] | ok |';
      const blocks = parseMarkdown(md, sourceIds);
      expect(blocks).toHaveLength(1);
      if (blocks[0].type === 'table') {
        expect(
          blocks[0].rows[0][0].children.some(n => n.type === 'citation'),
        ).toBe(true);
      }
    });
  });

  describe('autolink (gfm)', () => {
    it('is opt-in: bare URLs stay literal by default', () => {
      const result = parseInline('see https://example.com for info');
      expect(result).toEqual([
        {type: 'text', content: 'see https://example.com for info'},
      ]);
    });

    it('links a bare https URL when enabled', () => {
      const result = parseInline('see https://example.com for info', {
        autolink: 'gfm',
      });
      expect(result).toEqual([
        {type: 'text', content: 'see '},
        {
          type: 'link',
          href: 'https://example.com',
          children: [{type: 'text', content: 'https://example.com'}],
        },
        {type: 'text', content: ' for info'},
      ]);
    });

    it('links a bare http URL', () => {
      const result = parseInline('go to http://example.com', {
        autolink: 'gfm',
      });
      expect(result[1]).toEqual({
        type: 'link',
        href: 'http://example.com',
        children: [{type: 'text', content: 'http://example.com'}],
      });
    });

    it('links a bare www. URL with http:// prefix on href', () => {
      const result = parseInline('go www.example.com', {autolink: 'gfm'});
      expect(result[1]).toEqual({
        type: 'link',
        href: 'http://www.example.com',
        children: [{type: 'text', content: 'www.example.com'}],
      });
    });

    it('links a bare email', () => {
      const result = parseInline('ping user@example.com please', {
        autolink: 'gfm',
      });
      expect(result[1]).toEqual({
        type: 'link',
        href: 'mailto:user@example.com',
        children: [{type: 'text', content: 'user@example.com'}],
      });
    });

    it('allows + and % in the email local part', () => {
      const result = parseInline('mail user+tag%suffix@example.com here', {
        autolink: 'gfm',
      });
      expect(result[1].type).toBe('link');
      if (result[1].type === 'link') {
        expect(result[1].href).toBe('mailto:user+tag%suffix@example.com');
      }
    });

    it('parses <scheme:url> angle-bracket autolinks', () => {
      const result = parseInline('see <https://example.com> ok', {
        autolink: 'gfm',
      });
      expect(result[1]).toEqual({
        type: 'link',
        href: 'https://example.com',
        children: [{type: 'text', content: 'https://example.com'}],
      });
    });

    it('rejects <javascript:...> angle-bracket autolinks (XSS prevention)', () => {
      const result = parseInline('see <javascript:alert(1)> ok', {
        autolink: 'gfm',
      });
      // Should NOT produce a link node with javascript: href
      const linkNodes = result.filter(
        (n): n is Extract<typeof n, {type: 'link'}> => n.type === 'link',
      );
      expect(linkNodes).toHaveLength(0);
    });

    it('parses <email> angle-bracket autolinks', () => {
      const result = parseInline('mail <user@example.com> please', {
        autolink: 'gfm',
      });
      expect(result[1]).toEqual({
        type: 'link',
        href: 'mailto:user@example.com',
        children: [{type: 'text', content: 'user@example.com'}],
      });
    });

    it('peels trailing sentence punctuation off bare URLs', () => {
      const result = parseInline('see https://example.com.', {
        autolink: 'gfm',
      });
      expect(result).toEqual([
        {type: 'text', content: 'see '},
        {
          type: 'link',
          href: 'https://example.com',
          children: [{type: 'text', content: 'https://example.com'}],
        },
        {type: 'text', content: '.'},
      ]);
    });

    it('peels unbalanced trailing close-parens', () => {
      const result = parseInline('(see https://example.com/foo) here', {
        autolink: 'gfm',
      });
      expect(result).toEqual([
        {type: 'text', content: '(see '},
        {
          type: 'link',
          href: 'https://example.com/foo',
          children: [{type: 'text', content: 'https://example.com/foo'}],
        },
        {type: 'text', content: ') here'},
      ]);
    });

    it('keeps balanced parens inside the URL', () => {
      const result = parseInline('go https://example.com/Foo_(bar) ok', {
        autolink: 'gfm',
      });
      expect(result[1]).toEqual({
        type: 'link',
        href: 'https://example.com/Foo_(bar)',
        children: [{type: 'text', content: 'https://example.com/Foo_(bar)'}],
      });
    });

    it('peels multiple trailing punctuation chars in one pass', () => {
      const result = parseInline('see https://example.com?!.', {
        autolink: 'gfm',
      });
      expect(result).toEqual([
        {type: 'text', content: 'see '},
        {
          type: 'link',
          href: 'https://example.com',
          children: [{type: 'text', content: 'https://example.com'}],
        },
        {type: 'text', content: '?!.'},
      ]);
    });

    it('peels interleaved punct and unbalanced parens', () => {
      const result = parseInline('(https://example.com/path).', {
        autolink: 'gfm',
      });
      expect(result).toEqual([
        {type: 'text', content: '('},
        {
          type: 'link',
          href: 'https://example.com/path',
          children: [{type: 'text', content: 'https://example.com/path'}],
        },
        {type: 'text', content: ').'},
      ]);
    });

    it('peels all trailing punctuation leaving only scheme', () => {
      // "https://..." peels the dots, leaving "https://" as the href.
      // This is a degenerate case but not rejected — the PR intentionally
      // does not validate TLDs or path content.
      const result = parseInline('see https://...', {
        autolink: 'gfm',
      });
      const link = result.find(n => n.type === 'link');
      expect(link).toBeDefined();
      if (link && link.type === 'link') {
        expect(link.href).toBe('https://');
      }
    });

    it('does not autolink URLs inside inline code', () => {
      const result = parseInline('try `https://example.com` here', {
        autolink: 'gfm',
      });
      expect(result).toEqual([
        {type: 'text', content: 'try '},
        {type: 'code', content: 'https://example.com'},
        {type: 'text', content: ' here'},
      ]);
    });

    it('does not nest links: skips URLs inside an existing link', () => {
      const result = parseInline(
        '[my site https://other.com](https://example.com)',
        {autolink: 'gfm'},
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('link');
      if (result[0].type === 'link') {
        expect(result[0].href).toBe('https://example.com');
        // The label still has the URL as plain text, not a nested link.
        expect(result[0].children).toEqual([
          {type: 'text', content: 'my site https://other.com'},
        ]);
      }
    });

    it('does not autolink the destination of a markdown link', () => {
      const result = parseInline('see [docs](https://example.com)', {
        autolink: 'gfm',
      });
      expect(result).toHaveLength(2);
      expect(result[1].type).toBe('link');
      if (result[1].type === 'link') {
        expect(result[1].href).toBe('https://example.com');
      }
    });

    it('autolinks inside emphasis containers', () => {
      const result = parseInline('see **https://example.com** ok', {
        autolink: 'gfm',
      });
      expect(result[1].type).toBe('bold');
      if (result[1].type === 'bold') {
        expect(result[1].children).toEqual([
          {
            type: 'link',
            href: 'https://example.com',
            children: [{type: 'text', content: 'https://example.com'}],
          },
        ]);
      }
    });

    it('does not match when preceded by an alphanumeric char', () => {
      const result = parseInline('xhttps://example.com', {autolink: 'gfm'});
      expect(result).toEqual([{type: 'text', content: 'xhttps://example.com'}]);
    });

    it('handles multiple autolinks in one block', () => {
      const result = parseInline(
        'see https://a.com or https://b.com or me@x.com',
        {autolink: 'gfm'},
      );
      const linkHrefs = result
        .filter(n => n.type === 'link')
        .map(n => (n.type === 'link' ? n.href : ''));
      expect(linkHrefs).toEqual([
        'https://a.com',
        'https://b.com',
        'mailto:me@x.com',
      ]);
    });

    it('does not autolink inside fenced code blocks', () => {
      const md = '```\nhttps://example.com\n```';
      const blocks = parseMarkdown(md, {autolink: 'gfm'});
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        type: 'codeblock',
        language: 'plaintext',
        content: 'https://example.com',
      });
    });

    it('passes through parseMarkdown for headings and paragraphs', () => {
      const md = '# https://heading.com\n\nsee https://para.com here';
      const blocks = parseMarkdown(md, {autolink: 'gfm'});
      expect(blocks).toHaveLength(2);
      if (blocks[0].type === 'heading') {
        expect(blocks[0].children[0]).toEqual({
          type: 'link',
          href: 'https://heading.com',
          children: [{type: 'text', content: 'https://heading.com'}],
        });
      }
      if (blocks[1].type === 'paragraph') {
        expect(blocks[1].children.some(n => n.type === 'link')).toBe(true);
      }
    });

    it('still accepts ReadonlySet<string> sourceIds via legacy signature', () => {
      // Default behavior — no autolink, sourceIds passed positionally
      const sources = new Set(['abc1']);
      const result = parseInline('see [abc1] for https://example.com', sources);
      expect(result.some(n => n.type === 'citation')).toBe(true);
      // Bare URL remains literal text because autolink is unset
      expect(result).toContainEqual({
        type: 'text',
        content: ' for https://example.com',
      });
    });

    it('combines sourceIds + autolink in the options bag', () => {
      const sources = new Set(['abc1']);
      const result = parseInline('see [abc1] for https://example.com', {
        sourceIds: sources,
        autolink: 'gfm',
      });
      expect(result.some(n => n.type === 'citation')).toBe(true);
      expect(result.some(n => n.type === 'link')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Link reference definitions
// ---------------------------------------------------------------------------

describe('link reference definitions', () => {
  // Collect every link/image node across a block tree for concise assertions.
  function collectLinks(
    nodes: InlineNode[],
  ): {type: string; href?: string; src?: string; text: string}[] {
    const out: {type: string; href?: string; src?: string; text: string}[] = [];
    const textOf = (inlineNodes: InlineNode[]): string =>
      inlineNodes
        .map(inline =>
          inline.type === 'text'
            ? inline.content
            : 'children' in inline
              ? textOf(inline.children)
              : '',
        )
        .join('');
    for (const node of nodes) {
      if (node.type === 'link') {
        out.push({type: 'link', href: node.href, text: textOf(node.children)});
      } else if (node.type === 'image') {
        out.push({type: 'image', src: node.src, text: node.alt});
      } else if ('children' in node) {
        out.push(...collectLinks(node.children));
      }
    }
    return out;
  }

  function paragraphLinks(input: string) {
    const blocks = parseMarkdown(input);
    const links = blocks.flatMap(block =>
      block.type === 'paragraph' ? collectLinks(block.children) : [],
    );
    return {blocks, links};
  }

  it('resolves a full reference `[text][label]` and drops the definition', () => {
    const {blocks, links} = paragraphLinks(
      'See [the docs][docs] here.\n\n[docs]: https://example.com/docs\n',
    );
    // Only the paragraph survives; the definition line produces no block.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(links).toEqual([
      {type: 'link', href: 'https://example.com/docs', text: 'the docs'},
    ]);
  });

  it('resolves a collapsed reference `[text][]`', () => {
    const {links} = paragraphLinks(
      'See [the docs][].\n\n[the docs]: https://example.com/docs',
    );
    expect(links).toEqual([
      {type: 'link', href: 'https://example.com/docs', text: 'the docs'},
    ]);
  });

  it('resolves a shortcut reference `[text]`', () => {
    const {links} = paragraphLinks(
      'See [the docs].\n\n[the docs]: https://example.com/docs',
    );
    expect(links).toEqual([
      {type: 'link', href: 'https://example.com/docs', text: 'the docs'},
    ]);
  });

  it('resolves a reference that appears before its definition', () => {
    const {links} = paragraphLinks('[foo]\n\n[foo]: /bar');
    expect(links).toEqual([{type: 'link', href: '/bar', text: 'foo'}]);
  });

  it('matches labels case-insensitively with collapsed whitespace', () => {
    const {links} = paragraphLinks(
      'See [The   Docs][DOCS].\n\n[docs]: https://example.com/d',
    );
    expect(links).toEqual([
      {type: 'link', href: 'https://example.com/d', text: 'The   Docs'},
    ]);
  });

  it('supports an angle-bracket destination and a title', () => {
    const {links} = paragraphLinks(
      'See [x].\n\n[x]: <https://example.com/x> "the title"',
    );
    expect(links).toEqual([
      {type: 'link', href: 'https://example.com/x', text: 'x'},
    ]);
  });

  it('absorbs a title on the line after a title-less definition', () => {
    const {blocks, links} = paragraphLinks(
      'See [x].\n\n[x]: https://example.com/x\n  "the title"\n',
    );
    // The continuation title line must not leak as its own paragraph.
    expect(blocks).toHaveLength(1);
    expect(links).toEqual([
      {type: 'link', href: 'https://example.com/x', text: 'x'},
    ]);
  });

  it('resolves an empty angle-bracket destination to an empty href', () => {
    const {blocks, links} = paragraphLinks('[foo]\n\n[foo]: <>');
    expect(blocks).toHaveLength(1);
    expect(links).toEqual([{type: 'link', href: '', text: 'foo'}]);
  });

  it('recognizes a definition immediately after a heading (no blank line)', () => {
    const {blocks, links} = paragraphLinks('# Title\n[x]: /url\n\n[x]');
    expect(blocks.map(block => block.type)).toEqual(['heading', 'paragraph']);
    expect(links).toEqual([{type: 'link', href: '/url', text: 'x'}]);
  });

  it('recognizes a definition immediately after a closed code fence', () => {
    const {blocks, links} = paragraphLinks('```\ncode\n```\n[x]: /url\n\n[x]');
    expect(blocks.map(block => block.type)).toEqual(['codeblock', 'paragraph']);
    expect(links).toEqual([{type: 'link', href: '/url', text: 'x'}]);
  });

  it('uses the first definition when a label is defined twice', () => {
    const {links} = paragraphLinks('[a]\n\n[a]: /first\n[a]: /second');
    expect(links).toEqual([{type: 'link', href: '/first', text: 'a'}]);
  });

  it('resolves a blockquote-nested definition even with a top-level definition present', () => {
    const blocks = parseMarkdown('[outer]: /o\n\n> [inner]\n>\n> [inner]: /i');
    const quote = blocks.find(block => block.type === 'blockquote');
    expect(quote?.type).toBe('blockquote');
    if (quote != null && quote.type === 'blockquote') {
      const links = quote.children.flatMap(block =>
        block.type === 'paragraph' ? collectLinks(block.children) : [],
      );
      expect(links).toEqual([{type: 'link', href: '/i', text: 'inner'}]);
    }
  });

  it('resolves a reference image `![alt][label]`', () => {
    const {links} = paragraphLinks('![logo][l]\n\n[l]: /logo.png');
    expect(links).toEqual([{type: 'image', src: '/logo.png', text: 'logo'}]);
  });

  it('rejects a reference image whose definition has an unsafe scheme (XSS prevention)', () => {
    const {links} = paragraphLinks('![logo][l]\n\n[l]: <javascript:alert(1)>');
    expect(links).toEqual([]);
  });

  it('rejects a shortcut reference image with an unsafe definition (XSS prevention)', () => {
    const {links} = paragraphLinks('![logo]\n\n[logo]: <javascript:alert(1)>');
    expect(links).toEqual([]);
  });

  it('rejects definitions that hide the scheme behind control chars (XSS prevention)', () => {
    // isSafeUrl strips control characters before testing; the angle-bracket
    // destination form is the only definition shape that can contain them.
    // Both consumers of a definition — reference images and reference links —
    // must apply it.
    const {links: imageLinks} = paragraphLinks(
      '![logo][l]\n\n[l]: <java\tscript:alert(1)>',
    );
    expect(imageLinks).toEqual([]);
    const {links: refLinks} = paragraphLinks(
      '[click][l]\n\n[l]: <java\tscript:alert(1)>',
    );
    expect(refLinks).toEqual([]);
  });

  it('does not treat a whitespace-only second label as collapsed', () => {
    // `[foo][ ]` is a full reference to the empty (normalized) label and matches
    // nothing; `[foo]` still resolves as a shortcut and `[ ]` stays literal.
    const blocks = parseMarkdown('[foo][ ]\n\n[foo]: /f');
    expect(blocks[0].type).toBe('paragraph');
    if (blocks[0].type === 'paragraph') {
      expect(collectLinks(blocks[0].children)).toEqual([
        {type: 'link', href: '/f', text: 'foo'},
      ]);
      const literal = blocks[0].children
        .map(node => (node.type === 'text' ? node.content : ''))
        .join('');
      expect(literal).toContain('[ ]');
    }
  });

  it('leaves an unresolved reference as literal text', () => {
    const {blocks, links} = paragraphLinks('See [the docs][missing].');
    expect(links).toEqual([]);
    expect(blocks[0].type).toBe('paragraph');
    if (blocks[0].type === 'paragraph') {
      expect(blocks[0].children).toContainEqual({
        type: 'text',
        content: 'See [the docs][missing].',
      });
    }
  });

  it('does not resolve a definition or reference inside a code fence', () => {
    const blocks = parseMarkdown('```\n[x]\n[x]: /should-not-resolve\n```');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('codeblock');
    if (blocks[0].type === 'codeblock') {
      expect(blocks[0].content).toBe('[x]\n[x]: /should-not-resolve');
    }
  });

  it('does not treat a definition-shaped line as a definition mid-paragraph', () => {
    // CommonMark: a definition cannot interrupt a paragraph.
    const {blocks, links} = paragraphLinks('Foo\n[bar]: /baz');
    expect(links).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
  });

  it('leaves footnote markers and definitions untouched', () => {
    const blocks = parseMarkdown(
      'A claim.[^1]\n\n[^1]: https://example.com/note',
    );
    // No link nodes; the `[^1]` marker stays literal and `[^1]:` is not
    // treated as a link reference definition (footnotes are out of scope).
    const links = blocks.flatMap(block =>
      block.type === 'paragraph' ? collectLinks(block.children) : [],
    );
    expect(links).toEqual([]);
    expect(blocks).toHaveLength(2);
  });

  it('leaves ordinary bracketed text with no definition alone', () => {
    const {links, blocks} = paragraphLinks('an array like [1, 2, 3] here');
    expect(links).toEqual([]);
    expect(blocks[0].type).toBe('paragraph');
  });
});

describe('sourceRanges', () => {
  const slice = (source: string, block: BlockNode) =>
    block.range == null
      ? null
      : source.slice(block.range.start, block.range.end);

  it('is off by default', () => {
    const [block] = parseMarkdown('# Title');
    expect(block.range).toBeUndefined();
  });

  it('addresses a block with named start and end offsets', () => {
    const source = 'One.\n\nTwo.';
    const [, second] = parseMarkdown(source, {sourceRanges: true});
    expect(second.range).toEqual({start: 6, end: 10});
  });

  it('gives every top-level block the source it came from', () => {
    const source = [
      '# Title',
      '',
      'A paragraph that',
      'wraps onto two lines.',
      '',
      '- one',
      '- two',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '> quoted',
      '',
      '---',
    ].join('\n');
    const blocks = parseMarkdown(source, {sourceRanges: true});
    expect(blocks.map(b => slice(source, b))).toEqual([
      '# Title',
      'A paragraph that\nwraps onto two lines.',
      '- one\n- two',
      '```js\nconst x = 1;\n```',
      '| a | b |\n| --- | --- |\n| 1 | 2 |',
      '> quoted',
      '---',
    ]);
  });

  it('reports offsets into the input, not into the link-definition-stripped text', () => {
    // The definition lines are removed before the block loop runs, so a naive
    // offset would drift by their length for everything after them.
    const source = [
      '[ref]: https://example.com',
      '',
      'See [the docs][ref].',
      '',
      'Another paragraph.',
    ].join('\n');
    const blocks = parseMarkdown(source, {sourceRanges: true});
    expect(blocks.map(b => slice(source, b))).toEqual([
      'See [the docs][ref].',
      'Another paragraph.',
    ]);
  });

  it('reports absolute offsets when the document is parsed incrementally', () => {
    const source = ['# Title', '', 'One.', '', 'Two.', '', 'Three.'].join('\n');
    const state = createIncrementalState();
    let blocks: BlockNode[] = [];
    for (let end = 1; end <= source.length; end++) {
      blocks = parseMarkdownIncremental(source.slice(0, end), state, {
        sourceRanges: true,
      });
    }
    expect(blocks.map(b => slice(source, b))).toEqual([
      '# Title',
      'One.',
      'Two.',
      'Three.',
    ]);
  });

  it('keeps the blank lines an unterminated fence owns', () => {
    // Mid-stream the closing fence has not arrived, and the blank lines are
    // part of the code, not spacing between blocks.
    const source = '```\ncode\n\n';
    const [block] = parseMarkdown(source, {sourceRanges: true});
    // The whole thing: the fence consumed those lines as code.
    expect(slice(source, block)).toBe(source);
  });

  it('slices to something that re-parses to the same block', () => {
    // The property a consumer actually needs, and the one that says the
    // offsets are right: what the range points at is the block.
    const check = (source: string) => {
      for (const block of parseMarkdown(source, {sourceRanges: true})) {
        const {range: _range, ...node} = block;
        expect(parseMarkdown(slice(source, block)!)).toEqual([node]);
      }
    };
    check('# Title\n\nA paragraph.\n\n- one\n- two\n\n> quoted');
    // CRLF: the parser keeps the `\r` in its own content, so the range does
    // too rather than slicing to text that parses differently.
    check('# Title\r\n\r\nA paragraph.\r\n');
  });

  it('re-parses when the caller flips the option on an existing state', () => {
    const source = 'One.\n\nTwo.\n\nThree.';
    const state = createIncrementalState();
    const without = parseMarkdownIncremental(source, state);
    expect(without.every(b => b.range == null)).toBe(true);
    const with_ = parseMarkdownIncremental(source, state, {
      sourceRanges: true,
    });
    expect(with_.map(b => slice(source, b))).toEqual([
      'One.',
      'Two.',
      'Three.',
    ]);
    const back = parseMarkdownIncremental(source, state);
    expect(back.every(b => b.range == null)).toBe(true);
  });

  it('spans both halves of a list the incremental parser merged', () => {
    const source = '1. one\n\n1. two';
    const state = createIncrementalState();
    parseMarkdownIncremental('1. one\n\n', state, {sourceRanges: true});
    const blocks = parseMarkdownIncremental(source, state, {
      sourceRanges: true,
    });
    expect(blocks).toHaveLength(1);
    expect(slice(source, blocks[0])).toBe(source);
  });
});
