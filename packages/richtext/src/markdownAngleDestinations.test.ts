// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$createLinkNode} from '@lexical/link';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
} from 'lexical';
import {parseInlineAst} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {coreRefusesUrl} from './markdownCharacterReferences';
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

/** Each link's URL and title, as RichText imports it. */
function richLinks(
  markdown: string,
): Array<{url: string; title: string | null}> {
  const links: Array<{url: string; title: string | null}> = [];
  const visit = (node: Json) => {
    if (node.type === 'link') {
      links.push({
        url: node.url as string,
        title: (node.title as string | null | undefined) ?? null,
      });
    }
    ((node.children as Json[]) ?? []).forEach(visit);
  };
  visit((JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root);
  return links;
}

/** Each link's URL, as core reads it. */
function coreUrls(markdown: string): string[] {
  const urls: string[] = [];
  const visit = (node: Json) => {
    if (node.type === 'link') {
      urls.push(node.url as string);
    }
    ((node.children as Json[]) ?? []).forEach(visit);
  };
  (parseInlineAst(markdown) as unknown as Json[]).forEach(visit);
  return urls;
}

function newEditor() {
  return createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
}

describe('angle-bracket link destinations (CommonMark 0.31 §6.3)', () => {
  it.each([
    'See [c](<https://e.com/a b>) here',
    'See [c](<https://e.com/a b> "t") here',
    'See [c](<https://e.com/x>) here',
    'See [c](<a b>) and [d](https://e.com) here',
  ])('reads %j with the address core reads, and round-trips it', markdown => {
    expect(richLinks(markdown).map(({url}) => url)).toEqual(coreUrls(markdown));
    expect(
      editorStateJSONToMarkdown(markdownToEditorStateJSON(`${markdown}\n`)),
    ).toBe(`${markdown}\n`);
  });

  it('keeps the title of an angle-bracket destination', () => {
    expect(richLinks('[c](<a b> "t")')).toEqual([{url: 'a b', title: 't'}]);
  });

  it('writes an address holding a space in angle brackets after an edit, so it reads back', () => {
    const editor = newEditor();
    importMarkdownKeepingSource(editor, 'See [c](<https://e.com/a b>) here\n', [
      ...DEFAULT_TRANSFORMERS,
    ]);
    editor.update(
      () => {
        const last = $getRoot().getAllTextNodes().at(-1);
        if (!$isTextNode(last)) {
          throw new Error('No text');
        }
        last.setTextContent(' there');
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported).toBe('See [c](<https://e.com/a b>) there\n');
    expect(richLinks(exported)).toEqual([
      {url: 'https://e.com/a b', title: null},
    ]);
  });

  it('writes a link made in the editor with a space in its address so it reads back', () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createLinkNode('https://e.com/a b').append($createTextNode('c')),
            ),
          );
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported).toBe('[c](<https://e.com/a b>)');
    expect(richLinks(exported)).toEqual([
      {url: 'https://e.com/a b', title: null},
    ]);
  });

  it('still refuses an unsafe address in angle brackets', () => {
    expect(richLinks('[x](<javascript:alert(1)>)')).toEqual([]);
    expect(richLinks('[x](<data: text/html,hi>)')).toEqual([]);
  });
});

describe('angle-bracket destination edges', () => {
  it.each(['[a](<b>c>)', '[link](<foo\\>)', '[a](<b)', '[a](<b<c>)'])(
    'does not link %j, which is no angle-bracket destination, as core does',
    markdown => {
      expect(richLinks(markdown)).toEqual([]);
      expect(coreUrls(markdown)).toEqual([]);
    },
  );

  it('writes a link made in the editor whose address opens with `<` so it reads back', () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createLinkNode('<b').append($createTextNode('x')),
            ),
          );
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported).toBe('[x](<\\<b>)');
    expect(richLinks(exported)).toEqual([{url: '<b', title: null}]);
  });

  it('writes a reference-like `&` in an angle destination and its title so it reads back', () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createLinkNode('https://e.com/a b&amp;c', {
                title: 'x &copy; y',
              }).append($createTextNode('x')),
            ),
          );
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    // Import decodes character references in a destination and a title, so
    // the `&` that would start one is written as a reference itself.
    expect(exported).toBe(
      '[x](<https://e.com/a b&#38;amp;c> "x &#38;copy; y")',
    );
    expect(richLinks(exported)).toEqual([
      {url: 'https://e.com/a b&amp;c', title: 'x &copy; y'},
    ]);
  });

  it('stores no unsafe address, however an angle destination is written', () => {
    let state = 40;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T>(items: ReadonlyArray<T>): T =>
      items[Math.floor(random() * items.length)];
    const schemes = [
      'javascript:',
      'JaVaScRiPt:',
      '&#106;avascript:',
      '&#x6A;avascript:',
      'java\\script:',
      'vbscript:',
      'data:text/html,',
      'data: text/html,',
    ];
    for (let round = 0; round < 300; round++) {
      const body = pick(['x', 'a(b)', 'a\\>b', 'a>b', 'a<b', ' x ', 'a\\', '']);
      const title = pick(['', ' "t"']);
      const markdown = `[a](<${pick(schemes)}${body}>${title})`;
      for (const {url} of richLinks(markdown)) {
        expect(coreRefusesUrl(url), markdown).toBe(false);
      }
    }
  });

  it('reads an escaped bracket inside the angle brackets as part of the address', () => {
    expect(richLinks('[a](<a \\<b>)')).toEqual([{url: 'a <b', title: null}]);
  });

  it('writes an address holding a space and brackets so it reads back', () => {
    const editor = newEditor();
    editor.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $createParagraphNode().append(
              $createLinkNode('a <b c>').append($createTextNode('x')),
            ),
          );
      },
      {discrete: true},
    );
    const exported = editor
      .getEditorState()
      .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
    expect(exported).toBe('[x](<a \\<b c\\>>)');
    expect(richLinks(exported)).toEqual([{url: 'a <b c>', title: null}]);
  });

  it.each([
    '[x](<javascript:x \\<y>)',
    '[x](<data: text/html \\<b\\>>)',
    '[x](<JavaScript:a b>)',
  ])('still refuses the unsafe address in %j', markdown => {
    expect(richLinks(markdown)).toEqual([]);
  });
});

/** A link made in the editor to `url`, exported. */
function exportLinkTo(url: string): string {
  const editor = newEditor();
  editor.update(
    () => {
      $getRoot()
        .clear()
        .append(
          $createParagraphNode().append(
            $createLinkNode(url).append($createTextNode('x')),
          ),
        );
    },
    {discrete: true},
  );
  return editor
    .getEditorState()
    .read(() => $exportMarkdownKeepingSource([...DEFAULT_TRANSFORMERS]));
}

describe('angle-bracket destinations holding parentheses and backslashes', () => {
  it('links `[a](<b)c>)` to `b)c`, as core does', () => {
    const markdown = '[a](<b)c>)';
    expect(richLinks(markdown)).toEqual([{url: 'b)c', title: null}]);
    expect(coreUrls(markdown)).toEqual(['b)c']);
  });

  it.each([
    'https://example.com/a b)',
    'https://example.com/a (b',
    'https://e.com/a\\b c',
    'https://e.com/a\\> b',
    'https://e.com/a b\\',
  ])('writes a link made in the editor to %j so it reads back', url => {
    expect(richLinks(exportLinkTo(url))).toEqual([{url, title: null}]);
  });

  it.each([
    'https://e.com/a\\*b',
    'https://e.com/a\\',
    'https://e.com/a\\(b',
    'https://e.com/a\\b',
    'https://e.com/a\\\\b',
  ])(
    'writes a link made in the editor to %j, backslashes and all, so it reads back',
    url => {
      expect(richLinks(exportLinkTo(url))).toEqual([{url, title: null}]);
    },
  );

  it('reads back every link made in the editor across 4,000 addresses', () => {
    let state = 4000;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    // Backticks are left out: inside an angle-bracket destination they can
    // still pair as code, a separate gap.
    const alphabet = [...'ab/. ()<>"\'#:_*[]&;\\'];
    const lost: string[] = [];
    for (let round = 0; round < 4000; round++) {
      let tail = '';
      const length = 1 + Math.floor(random() * 8);
      for (let index = 0; index < length; index++) {
        tail += alphabet[Math.floor(random() * alphabet.length)];
      }
      const url = `https://e.com/${tail}`;
      const read = richLinks(exportLinkTo(url));
      if (read.length !== 1 || read[0].url !== url) {
        lost.push(url);
      }
    }
    expect(lost).toEqual([]);
  });
});
