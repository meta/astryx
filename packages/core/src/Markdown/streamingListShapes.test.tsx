// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createIncrementalState,
  parseMarkdown,
  parseMarkdownIncremental,
} from './parser';

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

const listCount = (blocks: ReadonlyArray<{type: string}>) =>
  blocks.filter(block => block.type === 'list').length;

describe('lists a blank line apart, streamed', () => {
  it.each([
    ['a bullet change', '- a\n\n* b', 2],
    ['another bullet change', '* a\n\n- b', 2],
    ['two bullet changes', '- a\n\n+ b\n\n- c', 3],
    ['numbered items at another indentation', ' 1. a\n\n2. b', 2],
    ['bullets at another indentation', ' - a\n\n- b', 2],
    ['one list, then a bullet change', '- a\n\n- b\n\n* c', 2],
    ['one loose bulleted list', '- a\n\n- b\n\n- c', 1],
    ['one loose numbered list', '1. a\n\n3. b\n\n4. c', 1],
  ])('streams %s as the full parse reads it', (_, markdown, lists) => {
    expect(listCount(parseMarkdown(markdown))).toBe(lists);
    for (const sourceRanges of [false, true]) {
      expect(streamInChunks(markdown, [1], sourceRanges)).toEqual(
        parseMarkdown(markdown, {sourceRanges}),
      );
    }
  });

  it('streams 600 answers mixing list styles to the full parse', () => {
    let state = 5656;
    const random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const pick = <T,>(choices: ReadonlyArray<T>): T =>
      choices[Math.floor(random() * choices.length)];
    const answer = () => {
      const lines: string[] = [];
      const items = 2 + Math.floor(random() * 6);
      for (let item = 0; item < items; item++) {
        const indent = ' '.repeat(pick([0, 0, 0, 1, 2]));
        const marker = pick(['- ', '* ', '+ ', '1. ', '2) ', '3. ']);
        lines.push(`${indent}${marker}item ${item}`);
        if (random() < 0.2) {
          lines.push(`${indent}${' '.repeat(marker.length)}more`);
        }
        if (random() < 0.7) {
          lines.push('');
        }
        if (random() < 0.15) {
          lines.push('A paragraph.', '');
        }
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
