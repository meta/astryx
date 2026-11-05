// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {render} from '@testing-library/react';
import {Markdown} from './Markdown';
import {parseMarkdownAst} from './parser';

type Json = {type: string; value?: string; children?: Json[]};

/** A list nested `levels` deep by indentation, one item per level. */
const indentedList = (levels: number): string =>
  Array.from({length: levels}, (_, level) => `${'  '.repeat(level)}- a`).join(
    '\n',
  );

/** A list nested `levels` deep on one line: each item opens the next list. */
const nestedList = (levels: number, marker = '- '): string =>
  `${marker.repeat(levels)}a`;

/** A blockquote nested `levels` deep. */
const nestedQuote = (levels: number): string => `${'> '.repeat(levels)}a`;

/** Lists and blockquotes alternating `levels` deep, on one line. */
const mixed = (levels: number): string =>
  `${Array.from({length: levels}, (_, level) => (level % 2 === 0 ? '> ' : '- ')).join('')}a`;

/** The deepest run of lists and blockquotes, iteratively. */
function blockDepth(nodes: ReadonlyArray<Json>): number {
  let deepest = 0;
  const stack: {node: Json; depth: number}[] = nodes.map(node => ({
    node,
    depth: 0,
  }));
  while (stack.length > 0) {
    const {node, depth} = stack.pop() as {node: Json; depth: number};
    const next =
      node.type === 'list' || node.type === 'blockquote' ? depth + 1 : depth;
    deepest = Math.max(deepest, next);
    for (const child of node.children ?? []) {
      stack.push({node: child, depth: next});
    }
  }
  return deepest;
}

/**
 * The least CPU time of five runs of `run`, in milliseconds. CPU time, not
 * elapsed time: on a loaded test machine, other work stretches elapsed time
 * but not the time this parse spends computing.
 */
function leastCpuTime(run: () => void): number {
  run();
  let least = Number.POSITIVE_INFINITY;
  for (let round = 0; round < 5; round++) {
    const started = process.cpuUsage();
    run();
    const used = process.cpuUsage(started);
    least = Math.min(least, (used.user + used.system) / 1000);
  }
  return least;
}

describe('lists and blockquotes nest at most 100 deep', () => {
  it('nests a list at most 100 deep, and reads deeper items as text', () => {
    const at = (levels: number) =>
      blockDepth(parseMarkdownAst(indentedList(levels)).children as never);
    expect(at(50)).toBe(50);
    expect(at(100)).toBe(100);
    expect(at(101)).toBe(100);
    expect(at(150)).toBe(100);
  });

  it.each([
    ['a list 2,000 deep', nestedList(2_000)],
    ['a list 10,000 deep', nestedList(10_000)],
    ['an ordered list 10,000 deep', nestedList(10_000, '1. ')],
    ['a list 500 deep by indentation', indentedList(500)],
    ['a blockquote 2,000 deep', nestedQuote(2_000)],
    ['a blockquote 10,000 deep', nestedQuote(10_000)],
    ['lists and blockquotes 10,000 deep', mixed(10_000)],
  ])('parses %s without throwing, within a time budget', (_, markdown) => {
    expect(() => parseMarkdownAst(markdown)).not.toThrow();
    const depth = blockDepth(parseMarkdownAst(markdown).children as never);
    expect(depth).toBeGreaterThan(50);
    expect(depth).toBeLessThanOrEqual(100);
    // The budget leaves room for a loaded test machine.
    expect(leastCpuTime(() => parseMarkdownAst(markdown))).toBeLessThan(5000);
  });

  it.each([
    ['a list', nestedList(10_000)],
    ['a blockquote', nestedQuote(10_000)],
    ['lists and blockquotes', mixed(10_000)],
  ])(
    'renders %s nested past the cap without exhausting the stack',
    (_, markdown) => {
      const {container} = render(<Markdown>{markdown}</Markdown>);
      expect(container.textContent).toContain('a');
    },
  );
});

describe('lazy continuation lines in deeply nested input', () => {
  it.each([
    ['blockquotes', `${'> '.repeat(20_000)}a\nlazy`],
    ['lists', `${'- '.repeat(20_000)}a\nlazy`],
    [
      'lists and blockquotes',
      `${Array.from({length: 20_000}, (_, level) => (level % 2 === 0 ? '> ' : '- ')).join('')}a\nlazy`,
    ],
    ['blockquotes, with two lazy lines', `${'> '.repeat(20_000)}a\nlazy\nmore`],
  ])('parse %s 20,000 deep (40 KB) within 100 ms', (_, markdown) => {
    expect(leastCpuTime(() => parseMarkdownAst(markdown))).toBeLessThan(100);
  });

  it('still continue the innermost paragraph', () => {
    const [quote] = parseMarkdownAst('> > a\nlazy').children as never as Json[];
    expect(quote.type).toBe('blockquote');
    const [inner] = quote.children ?? [];
    expect(inner.type).toBe('blockquote');
    expect(inner.children?.[0]?.type).toBe('paragraph');
    expect(JSON.stringify(inner.children)).toContain('lazy');
  });
});
