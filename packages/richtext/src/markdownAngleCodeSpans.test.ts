// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {createHeadlessEditor} from '@lexical/headless';
import {$createLinkNode} from '@lexical/link';
import {$createParagraphNode, $createTextNode, $getRoot} from 'lexical';
import {parseInlineAst} from '@astryxdesign/core/Markdown/parser';
import {DEFAULT_NODES} from './editorNodes';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {$exportMarkdownKeepingSource} from './markdownSource';
import {markdownToEditorStateJSON} from './markdownSerializers';

type Json = {type: string; url?: string; children?: Json[]};

const urlsIn = (nodes: ReadonlyArray<Json>): string[] =>
  nodes.flatMap(node => [
    ...(node.type === 'link' ? [node.url ?? ''] : []),
    ...urlsIn(node.children ?? []),
  ]);

const richUrls = (markdown: string): string[] =>
  urlsIn([
    (JSON.parse(markdownToEditorStateJSON(markdown)) as {root: Json}).root,
  ]);

const coreUrls = (markdown: string): string[] =>
  urlsIn(parseInlineAst(markdown) as unknown as Json[]);

/** A link made in the editor to `url`, exported. */
function exportLinkTo(url: string): string {
  const editor = createHeadlessEditor({
    nodes: [...DEFAULT_NODES],
    onError(error) {
      throw error;
    },
  });
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

describe('backticks inside an angle-bracket destination with a parenthesis', () => {
  it.each([
    '[x](<https://e.com/* ([b`\\<`>)',
    '[a](<b ([c`d`>)',
    '`x` [a](<b (`c`>)',
  ])('stay in the address of %j, as core reads it', markdown => {
    expect(richUrls(markdown)).toEqual(coreUrls(markdown));
    expect(richUrls(markdown)).toHaveLength(1);
  });

  it('read back from a link made in the editor', () => {
    const url = 'https://e.com/* ([b`<`';
    expect(richUrls(exportLinkTo(url))).toEqual([url]);
  });

  it('read back across 4,000 addresses made in the editor', () => {
    let state = 7050;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    // Backslashes outside angle brackets are a separate gap (#7098).
    const alphabet = [...'ab/. ()<>"\'#:_*[]&;`'];
    const lost: string[] = [];
    for (let round = 0; round < 4000; round++) {
      let tail = '';
      const length = 1 + Math.floor(random() * 8);
      for (let index = 0; index < length; index++) {
        tail += alphabet[Math.floor(random() * alphabet.length)];
      }
      const url = `https://e.com/${tail}`;
      const read = richUrls(exportLinkTo(url));
      if (read.length !== 1 || read[0] !== url) {
        lost.push(url);
      }
    }
    expect(lost).toEqual([]);
  });
});
