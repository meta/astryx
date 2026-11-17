// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listEdge.test.tsx
 * @input Markdown ordered, unordered, and nested lists
 * @output Unit proof that Markdown's lists use List's `flush` edge, so a
 *   list fits its column instead of stepping out past both edges
 * @position Markdown regression test; real-browser widths are in
 *   __tests__/MarkdownListBounds.a11y.chromium.spec.ts
 */

import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {Markdown} from './Markdown';

/** The edge each row resolved, read from the row's own edge class. */
function rowEdges(container: HTMLElement): string[] {
  return [...container.querySelectorAll('li')].map(
    li => /edge(Flush|Outset|Bleed)/.exec(li.className)?.[1] ?? 'padded',
  );
}

describe('Markdown lists fit their column', () => {
  it.each([
    ['unordered', '- one\n- two'],
    ['ordered', '1. one\n2. two'],
    ['nested', '- one\n  1. inner\n  2. inner\n- two'],
  ])('%s list rows are flush', (_, markdown) => {
    const {container} = render(<Markdown>{markdown}</Markdown>);
    const edges = rowEdges(container);
    expect(edges.length).toBeGreaterThan(0);
    expect(new Set(edges)).toEqual(new Set(['Flush']));
  });
});
