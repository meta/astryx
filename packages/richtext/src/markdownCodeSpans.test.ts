// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$getRoot, $isTextNode} from 'lexical';
import {parseInlineAst} from '@astryxdesign/core/Markdown/parser';
import {parseMarkdownAst} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {
  $exportMarkdownKeepingSource,
  importMarkdownKeepingSource,
} from './markdownSource';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from './markdownSerializers';

type Json = Record<string, unknown>;

const FORMATS: ReadonlyArray<readonly [number, string]> = [
  [1, 'strong'],
  [2, 'emphasis'],
  [4, 'delete'],
  [16, 'code'],
];

/** Each run of text with the marks around it, as RichText imports it. */
function richText(markdown: string): string[] {
  const runs: string[] = [];
  const visit = (node: Json) => {
    if (node.type === 'text') {
      const format = node.format as number;
      const marks = FORMATS.filter(([bit]) => (format & bit) !== 0)
        .map(([, name]) => name)
        .join('+');
      runs.push(`${node.text as string}|${marks}`);
    }
    ((node.children as Json[]) ?? []).forEach(visit);
  };
  visit((JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root);
  return runs;
}

/** The same, as core Markdown reads it. */
function core(markdown: string): string[] {
  const runs: string[] = [];
  const visit = (node: Json, marks: string[]) => {
    if (node.type === 'text') {
      runs.push(`${node.value as string}|${[...marks].sort(order).join('+')}`);
    } else if (node.type === 'inlineCode') {
      runs.push(
        `${node.value as string}|${[...marks, 'code'].sort(order).join('+')}`,
      );
    } else {
      const next = ['strong', 'emphasis', 'delete'].includes(
        node.type as string,
      )
        ? [...marks, node.type as string]
        : marks;
      ((node.children as Json[]) ?? []).forEach(child => visit(child, next));
    }
  };
  const order = (a: string, b: string) =>
    FORMATS.findIndex(([, name]) => name === a) -
    FORMATS.findIndex(([, name]) => name === b);
  (parseMarkdownAst(markdown).children as unknown as Json[]).forEach(node =>
    visit(node, []),
  );
  return runs;
}

describe('code spans read before the marks around them (CommonMark 0.31 §6.1)', () => {
  it.each([
    '~~a~~ ~~`c`~~',
    '*a* **b `c` d**',
    '*a* *`code`*',
    '**bold `code` more**',
    '`a*b*c` and *x*',
    '``a`b`` and ~~`x`~~',
    'A `\\[x\\]` span',
  ])('reads %j as core does, and round-trips it', markdown => {
    expect(richText(markdown)).toEqual(core(markdown));
    expect(
      editorStateJSONToMarkdown(markdownToEditorStateJSON(`${markdown}\n`)),
    ).toBe(`${markdown}\n`);
  });

  it('reads code in table cells, with an escaped pipe as a pipe', () => {
    const markdown =
      '| a | b |\n| --- | --- |\n| ~~x~~ ~~`c`~~ | `p \\| q` |\n';
    expect(richText(markdown)).toEqual([
      'a|',
      'b|',
      'x|delete',
      ' |',
      'c|delete+code',
      'p | q|code',
    ]);
    expect(editorStateJSONToMarkdown(markdownToEditorStateJSON(markdown))).toBe(
      markdown,
    );
  });

  it('keeps the marks around code through an edit', () => {
    const editor = createHeadlessEditor({
      nodes: [...DEFAULT_NODES],
      onError(error) {
        throw error;
      },
    });
    importMarkdownKeepingSource(editor, '*a* **b `c` d** end\n', [
      ...DEFAULT_TRANSFORMERS,
    ]);
    editor.update(
      () => {
        const last = $getRoot().getAllTextNodes().at(-1);
        if (!$isTextNode(last)) {
          throw new Error('No text');
        }
        last.setTextContent(`${last.getTextContent()}!`);
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(richText(exported)).toEqual(core('*a* **b `c` d** end!'));
  });
});

/** Each link's URL with its text runs and their marks, as RichText imports it. */
function richLinks(markdown: string): Array<{url: string; runs: string[]}> {
  const links: Array<{url: string; runs: string[]}> = [];
  const visit = (node: Json, link: {url: string; runs: string[]} | null) => {
    if (node.type === 'link') {
      const entry = {url: node.url as string, runs: [] as string[]};
      links.push(entry);
      ((node.children as Json[]) ?? []).forEach(child => visit(child, entry));
      return;
    }
    if (node.type === 'text' && link != null) {
      const format = node.format as number;
      link.runs.push(
        `${node.text as string}|${(format & 16) !== 0 ? 'code' : ''}`,
      );
    }
    ((node.children as Json[]) ?? []).forEach(child => visit(child, link));
  };
  visit(
    (JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root,
    null,
  );
  return links;
}

describe('code spans in link text', () => {
  it('shows a refused link holding code whole, as core shows it', () => {
    const markdown = 'See [`x`](javascript:y) now';
    expect(richLinks(markdown)).toEqual([]);
    // Plain text with no marks on either surface, however it is split.
    const plain = (runs: string[]): string =>
      runs.map(run => run.replace(/\|$/, '')).join('');
    expect(richText(markdown).every(run => run.endsWith('|'))).toBe(true);
    expect(plain(richText(markdown))).toBe(plain(core(markdown)));
    expect(plain(core(markdown))).toBe('See [`x`](javascript:y) now');
  });

  it('still links a safe destination, with its code as code', () => {
    expect(richLinks('See [`x`](https://example.com) now')).toEqual([
      {url: 'https://example.com', runs: ['x|code']},
    ]);
  });
});

/** Each link's URL and title, as RichText imports it. */
function richTargets(
  markdown: string,
): Array<{url: string; title: string | null}> {
  const targets: Array<{url: string; title: string | null}> = [];
  const visit = (node: Json) => {
    if (node.type === 'link') {
      targets.push({
        url: node.url as string,
        title: (node.title as string | null | undefined) ?? null,
      });
    }
    ((node.children as Json[]) ?? []).forEach(visit);
  };
  visit((JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root);
  return targets;
}

/** Each link's or image's URL and title, as core reads it. */
function coreTargets(
  markdown: string,
): Array<{url: string; title: string | null}> {
  const targets: Array<{url: string; title: string | null}> = [];
  const visit = (node: Json) => {
    if (node.type === 'link' || node.type === 'image') {
      targets.push({
        url: node.url as string,
        title: (node.title as string | null | undefined) ?? null,
      });
    }
    ((node.children as Json[]) ?? []).forEach(visit);
  };
  (parseInlineAst(markdown) as unknown as Json[]).forEach(visit);
  return targets;
}

/** Whether `text` holds a private-use character: a stand-in left behind. */
const PRIVATE_USE = /[\uE000-\uF8FF]|[\u{F0000}-\u{10FFFD}]/u;

/** Edits the last text of `markdown`'s first block, exports, and re-imports. */
function editedTargets(markdown: string): {
  exported: string;
  targets: Array<{url: string; title: string | null}>;
} {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
  importMarkdownKeepingSource(editor, `${markdown} end\n`, [
    ...DEFAULT_TRANSFORMERS,
  ]);
  editor.update(
    () => {
      const last = $getRoot().getAllTextNodes().at(-1);
      if (!$isTextNode(last)) {
        throw new Error('No text');
      }
      last.setTextContent(`${last.getTextContent()}!`);
    },
    {discrete: true},
  );
  const exported = editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
  return {exported, targets: richTargets(exported)};
}

describe("backticks in a link destination or title are the link's", () => {
  it.each([
    '[a](`x`)',
    '[a](https://e.com/`x`)',
    '![i](`x`)',
    '[a](b "`t`")',
    '`c` then [a](`x`)',
  ])('reads %j with the destination core reads', markdown => {
    expect(richTargets(markdown).map(({url}) => url)).toEqual(
      coreTargets(markdown).map(({url}) => url),
    );
  });

  it('keeps a title holding backticks as written', () => {
    // Core does not draw titles; RichText keeps one for export.
    expect(richTargets('[a](b "`t`")')).toEqual([{url: 'b', title: '`t`'}]);
  });

  it.each([
    '[a](`x`)',
    '[a](https://e.com/`x`)',
    '[a](<`x`>)',
    '![i](`x`)',
    '[a](b "`t`")',
  ])('keeps %j through an edit, with no stand-in left behind', markdown => {
    const before = richTargets(markdown);
    const {exported, targets} = editedTargets(markdown);
    expect(PRIVATE_USE.test(exported)).toBe(false);
    expect(targets).toEqual(before);
  });

  it('leaves no stand-in in any link, for random backticks in destinations, titles, and text', () => {
    let state = 11;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T>(items: ReadonlyArray<T>): T =>
      items[Math.floor(random() * items.length)];
    for (let round = 0; round < 200; round++) {
      const destination = pick([
        '`x`',
        'a`b`c',
        'https://e.com/``y``',
        '<`x`>',
        '`x`?q=`y`',
        'p',
      ]);
      const title = pick(['', ' "`t`"', ' "a `b` c"']);
      const text = pick(['a', '`c`', 'a `c` b', '**`c`**']);
      const markdown = `${pick(['', '`z` ', '~~s~~ '])}[${text}](${destination}${title})${pick(['', ' `w`'])}`;
      const json = markdownToEditorStateJSON(markdown);
      expect(PRIVATE_USE.test(json), markdown).toBe(false);
      const {exported} = editedTargets(markdown);
      expect(PRIVATE_USE.test(exported), markdown).toBe(false);
    }
  });
});

describe('a code span holding `|` outside a table', () => {
  it.each(['~~s~~ ~~`a|b`~~', '*e* **[`a|b`](https://example.com)**'])(
    'reads the marks around %j as core does',
    markdown => {
      expect(richText(markdown)).toEqual(core(markdown));
    },
  );

  it('stays code in link text, after an earlier code span on the line', () => {
    const markdown = '`x` and [`a|b`](https://example.com)';
    expect(richLinks(markdown)).toEqual([
      {url: 'https://example.com', runs: ['a|b|code']},
    ]);
    expect(richText(markdown)).toEqual(core(markdown));
  });
});

/** Each link's URL and title in a document, as RichText imports it. */
function allTargets(json: string): Array<{url: string; title: string | null}> {
  const targets: Array<{url: string; title: string | null}> = [];
  const visit = (node: Json) => {
    if (node.type === 'link') {
      targets.push({
        url: node.url as string,
        title: (node.title as string | null | undefined) ?? null,
      });
    }
    ((node.children as Json[]) ?? []).forEach(visit);
  };
  visit((JSON.parse(json) as {root: Json}).root);
  return targets;
}

describe('a link with backticks in its destination or title after a code-text link', () => {
  it.each([
    [
      '[`a`](u) [b](`x`)',
      [
        {url: 'u', title: null},
        {url: '`x`', title: null},
      ],
    ],
    [
      '[`a`](u) [b](https://e.com/`x`)',
      [
        {url: 'u', title: null},
        {url: 'https://e.com/`x`', title: null},
      ],
    ],
    [
      '[`a`](u) [b](c "`t`")',
      [
        {url: 'u', title: null},
        {url: 'c', title: '`t`'},
      ],
    ],
  ])('keeps both links in %j, through an edit', (markdown, expected) => {
    expect(richTargets(markdown)).toEqual(expected);
    expect(richTargets(markdown).map(({url}) => url)).toEqual(
      coreTargets(markdown).map(({url}) => url),
    );
    const {exported, targets} = editedTargets(markdown);
    expect(PRIVATE_USE.test(exported)).toBe(false);
    expect(targets).toEqual(expected);
  });

  it('loses no link and leaves no stand-in, for random code-text links before backtick targets', () => {
    let state = 23;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T>(items: ReadonlyArray<T>): T =>
      items[Math.floor(random() * items.length)];
    for (let round = 0; round < 200; round++) {
      const before = pick([
        '[`a`](u)',
        '`c` [`a`](u)',
        '[**`a`**](u)',
        '[x](u)',
      ]);
      const destination = pick(['`x`', 'p`y`q', 'https://e.com/``z``', 'p']);
      const title = pick(['', ' "`t`"', ' "a `b` c"']);
      const markdown = `${before} and [b](${destination}${title})${pick(['', ' `w`'])}`;
      const json = markdownToEditorStateJSON(markdown);
      expect(PRIVATE_USE.test(json), markdown).toBe(false);
      expect(
        allTargets(json).map(({url}) => url),
        markdown,
      ).toEqual(coreTargets(markdown).map(({url}) => url));
      const {exported, targets} = editedTargets(markdown);
      expect(PRIVATE_USE.test(exported), markdown).toBe(false);
      expect(targets, markdown).toEqual(allTargets(json));
    }
  });
});
