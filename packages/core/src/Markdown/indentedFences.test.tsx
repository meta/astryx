// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownAst,
  parseMarkdownIncremental,
} from './parser';

type Json = {
  type: string;
  value?: string;
  lang?: string | null;
  children?: Json[];
};

/** The document's blocks as compact markup. */
function blocks(markdown: string): string {
  const show = (node: Json): string =>
    node.type === 'text'
      ? JSON.stringify(node.value)
      : node.type === 'code'
        ? `code(${node.lang ?? ''})${JSON.stringify(node.value)}`
        : node.children == null
          ? node.type
          : `${node.type}[${node.children.map(show).join(', ')}]`;
  return (parseMarkdownAst(markdown).children as unknown as Json[])
    .map(show)
    .join(' | ');
}

describe('a code fence may be indented up to three spaces (CommonMark 0.31 §4.5)', () => {
  it.each([
    [
      'a backtick fence indented two spaces, its code losing two',
      '  ```js\n  x\n    y\n  ```',
      'code(js)"x\\n  y"',
    ],
    ['a backtick fence indented one space', ' ```\na\n ```', 'code()"a"'],
    [
      'a tilde fence indented three spaces',
      '   ~~~\n   b\n   ~~~',
      'code()"b"',
    ],
    [
      'an indented closing fence',
      '```\ncode\n  ```\nafter',
      'code()"code" | paragraph["after"]',
    ],
    [
      'an indented fence interrupting a paragraph',
      'Text\n ```\n code\n ```',
      'paragraph["Text"] | code()"code"',
    ],
    [
      'a fence in a list item, unchanged',
      '1. Step\n   ```bash\n   cmd\n   ```',
      'list[listItem[paragraph["Step"], code(bash)"cmd"]]',
    ],
  ])('reads %s', (_, markdown, expected) => {
    expect(blocks(markdown)).toBe(expected);
  });

  it('keeps a line indented four spaces inside the block, not as its closer', () => {
    expect(blocks('```\na\n    ```\nb\n```')).toBe('code()"a\\n    ```\\nb"');
  });

  it('reads a fence indented four spaces as no fence', () => {
    expect(blocks('    ```\n    x\n    ```')).not.toContain('code(');
  });

  it('collects no link definition inside an indented fence', () => {
    expect(blocks(' ```\n[x]: /u\n ```\n\n[x]')).toBe(
      'code()"[x]: /u" | paragraph["[x]"]',
    );
  });

  it('streams indented fences with blank lines to the full parse at every character', () => {
    // `d` sits at the margin after a blank line inside a fence: that blank
    // line settles nothing, since the fence is still open.
    const markdown =
      'a\n\n  ```js\n  x\n\n  y\n  ```\n\nb\n\n ~~~\n\n c\n\nd\n ~~~\n';
    for (const sourceRanges of [false, true]) {
      const state = createIncrementalState();
      let streamed = parseMarkdownIncremental('', state, {sourceRanges});
      for (let end = 1; end <= markdown.length; end++) {
        streamed = parseMarkdownIncremental(markdown.slice(0, end), state, {
          sourceRanges,
        });
      }
      expect(streamed).toEqual(parseMarkdown(markdown, {sourceRanges}));
    }
  });
});

/** The streamed parse of `markdown` in chunks of the given sizes, cycled. */
function streamInChunks(
  markdown: string,
  sizes: ReadonlyArray<number>,
  sourceRanges = false,
) {
  const state = createIncrementalState();
  let result = parseMarkdownIncremental('', state, {sourceRanges});
  let end = 0;
  for (let step = 0; end < markdown.length; step++) {
    end = Math.min(markdown.length, end + sizes[step % sizes.length]);
    result = parseMarkdownIncremental(markdown.slice(0, end), state, {
      sourceRanges,
    });
  }
  return result;
}

const STEP_CLOSED_AT_MARGIN = [
  '1. Install:',
  '   ```bash',
  '   npm i',
  '```',
  '',
  '2. Run:',
  '   ```bash',
  '   npm test',
  '   ```',
  '',
  'Done.',
].join('\n');

describe('a fence inside a list step stays the step’s', () => {
  it('streams a step’s fence closed at the margin to the full parse at every character', () => {
    for (const sourceRanges of [false, true]) {
      expect(streamInChunks(STEP_CLOSED_AT_MARGIN, [1], sourceRanges)).toEqual(
        parseMarkdown(STEP_CLOSED_AT_MARGIN, {sourceRanges}),
      );
    }
  });

  it('reads the margin line after a step’s fence as the opening of a fence of its own', () => {
    expect(blocks('1. Step\n   ```\n   code\n```\nafter')).toBe(
      'list[listItem[paragraph["Step"], code()"code"]] | code()"after"',
    );
  });

  it('keeps a definition-shaped line inside that margin fence as code', () => {
    expect(blocks('1. Step\n   ```\n   code\n```\n[x]: /u\n\n[x]')).toBe(
      'list[listItem[paragraph["Step"], code()"code"]] | code()"[x]: /u\\n\\n[x]"',
    );
  });

  it('streams 600 step-by-step answers to the full parse, closers at the margin included', () => {
    let state = 7111;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T,>(choices: ReadonlyArray<T>): T =>
      choices[Math.floor(random() * choices.length)];
    const answer = () => {
      const lines: string[] = [];
      if (random() < 0.5) {
        lines.push('Here are the steps:', '');
      }
      const steps = 1 + Math.floor(random() * 4);
      for (let step = 1; step <= steps; step++) {
        const marker = random() < 0.7 ? `${step}. ` : '- ';
        lines.push(`${marker}Step ${step}:`);
        if (random() < 0.3) {
          lines.push(`${' '.repeat(marker.length)}Some detail.`);
        }
        if (random() < 0.4) {
          lines.push('');
        }
        const indent = pick([0, 1, 2, 3, marker.length, marker.length + 1]);
        const fence = random() < 0.85 ? '```' : '~~~';
        lines.push(`${' '.repeat(indent)}${fence}${pick(['', 'bash', 'js'])}`);
        const codeLines = 1 + Math.floor(random() * 3);
        for (let line = 0; line < codeLines; line++) {
          lines.push(
            random() < 0.15
              ? ''
              : `${' '.repeat(pick([0, indent, indent + 2]))}code ${line}`,
          );
        }
        const closer = random();
        if (closer < 0.4) {
          lines.push(fence);
        } else if (closer < 0.9) {
          lines.push(`${' '.repeat(indent)}${fence}`);
        }
        if (random() < 0.6) {
          lines.push('');
        }
      }
      if (random() < 0.5) {
        lines.push('That is all.');
      }
      // A fence left open at the very end with a newline after it keeps a
      // final empty line in the full parse only — a separate difference.
      return lines.join('\n').trimEnd();
    };
    const diverged: string[] = [];
    for (let round = 0; round < 600; round++) {
      const markdown = answer();
      const sizes = [
        1 + Math.floor(random() * 12),
        1 + Math.floor(random() * 5),
      ];
      const full = parseMarkdown(markdown);
      if (
        JSON.stringify(streamInChunks(markdown, sizes)) !== JSON.stringify(full)
      ) {
        diverged.push(markdown);
      }
    }
    expect(diverged).toEqual([]);
  });
});

describe('fences around list steps, streamed', () => {
  it('streams 600 varied answers to the full parse: sub-steps, blank lines in fences, text after a step’s fence', () => {
    let state = 424242;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T,>(choices: ReadonlyArray<T>): T =>
      choices[Math.floor(random() * choices.length)];
    const pushFence = (indent: number, lines: string[]) => {
      const fence = pick(['```', '```', '~~~', '````']);
      lines.push(`${' '.repeat(indent)}${fence}${pick(['', 'bash', ' py'])}`);
      const codeLines = Math.floor(random() * 4);
      for (let line = 0; line < codeLines; line++) {
        lines.push(
          random() < 0.2
            ? ''
            : `${' '.repeat(pick([0, indent, indent + 1, indent + 4]))}${pick(['code', '[x]: /u', '- item', '# title', '> q'])} ${line}`,
        );
      }
      const closer = random();
      if (closer < 0.35) {
        lines.push(fence);
      } else if (closer < 0.75) {
        lines.push(`${' '.repeat(indent)}${fence}`);
      } else if (closer < 0.85) {
        lines.push(`${' '.repeat(indent)}${fence}js`);
      } else if (closer < 0.9) {
        lines.push(`${' '.repeat(indent + 1)}${fence}  `);
      }
    };
    const answer = () => {
      const lines: string[] = [];
      if (random() < 0.4) {
        lines.push(pick(['Steps:', 'Here you go']));
        if (random() < 0.6) {
          lines.push('');
        }
      }
      // Every list at the margin with a `-` bullet, as lines escaping a step's
      // fence are: two lists of different styles, a blank line apart, are a
      // separate case of the settled-list merge.
      const bullet = pick(['- ', '-   ']);
      const delimiter = pick(['.', ')']);
      const base = 0;
      let number = pick([1, 1, 2]);
      const steps = 1 + Math.floor(random() * 5);
      for (let step = 0; step < steps; step++) {
        const marker = random() < 0.65 ? `${number++}${delimiter} ` : bullet;
        lines.push(`${' '.repeat(base)}${marker}Step ${step}`);
        const content = base + marker.length;
        const parts = Math.floor(random() * 3);
        for (let part = 0; part < parts; part++) {
          const roll = random();
          if (roll < 0.3) {
            lines.push('');
          }
          // A sub-step directly under its step: placed after the step has
          // ended, it would start a list of its own at another indentation.
          if (roll < 0.15 && part === 0) {
            lines.push(`${' '.repeat(content)}- sub ${part}`);
          } else if (roll < 0.45) {
            pushFence(pick([0, 1, 2, 3, content, content + 1]), lines);
          } else if (roll < 0.6) {
            lines.push(
              pick(['lazy text', `${' '.repeat(content)}more`, 'Then:']),
            );
          } else if (roll < 0.7) {
            lines.push(`${' '.repeat(pick([0, content]))}# Heading`);
          }
        }
        if (random() < 0.5) {
          lines.push('');
        }
        if (random() < 0.2) {
          lines.push('Between steps.');
          if (random() < 0.5) {
            lines.push('');
          }
        }
      }
      if (random() < 0.3) {
        pushFence(pick([0, 1, 2, 3]), lines);
      }
      if (random() < 0.4) {
        lines.push('That is all.');
      }
      return lines.join('\n').trimEnd();
    };
    const diverged: string[] = [];
    for (let round = 0; round < 600; round++) {
      const markdown = answer();
      const sizes =
        round % 10 === 0
          ? [1]
          : [1 + Math.floor(random() * 12), 1 + Math.floor(random() * 5)];
      if (
        JSON.stringify(streamInChunks(markdown, sizes)) !==
        JSON.stringify(parseMarkdown(markdown))
      ) {
        diverged.push(markdown);
      }
    }
    expect(diverged).toEqual([]);
  });
});

describe('a closing fence has only spaces or tabs after it (CommonMark 0.31 §4.5)', () => {
  it.each([
    [
      'a backtick line with an info string',
      '```\na\n   ```js\nb\n```',
      'code()"a\\n   ```js\\nb"',
    ],
    [
      'a tilde line with an info string',
      '~~~\na\n   ~~~ note\nb\n~~~',
      'code()"a\\n   ~~~ note\\nb"',
    ],
    [
      'a closer followed by spaces and a tab',
      '```\na\n```  \t\nb',
      'code()"a" | paragraph["b"]',
    ],
  ])(
    'keeps %s inside the open block, or closes on spaces',
    (_, markdown, expected) => {
      expect(blocks(markdown)).toBe(expected);
    },
  );

  const STEP_TWO_OPENS = [
    '1. Step one',
    '   ```bash',
    '   cmd',
    '```',
    '2. Step two',
    '   ```js',
    '   x',
    '   ```',
  ].join('\n');

  it('reads step 1 closed at the margin, then step 2 opening, as CommonMark does', () => {
    expect(blocks(STEP_TWO_OPENS)).toBe(
      'list[listItem[paragraph["Step one"], code(bash)"cmd"]] | code()"2. Step two\\n   ```js\\n   x"',
    );
  });

  it('streams that answer to the full parse at every character', () => {
    for (const sourceRanges of [false, true]) {
      expect(streamInChunks(STEP_TWO_OPENS, [1], sourceRanges)).toEqual(
        parseMarkdown(STEP_TWO_OPENS, {sourceRanges}),
      );
    }
  });
});
