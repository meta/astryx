// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listEdge.test.tsx
 * @input Markdown ordered, unordered, nested, and task lists
 * @output Unit proof that Markdown's lists use List's `flush` edge, so a
 *   list fits its column instead of stepping out past both edges, and that
 *   the task list drops List's inline clip, so an edge focus ring draws whole
 * @position Markdown regression test; real-browser widths are in
 *   __tests__/MarkdownListBounds.a11y.chromium.spec.ts
 */

import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {List} from '../List/List';
import {ListItem} from '../List/ListItem';
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
    ['task', '- [x] done\n- [ ] open'],
  ])('%s list rows are flush', (_, markdown) => {
    const {container} = render(<Markdown>{markdown}</Markdown>);
    const edges = rowEdges(container);
    expect(edges.length).toBeGreaterThan(0);
    expect(new Set(edges)).toEqual(new Set(['Flush']));
  });
});

describe('Markdown task lists keep focus rings whole', () => {
  it('drops the inline clip on the task list only', () => {
    const {container} = render(<Markdown>{'- [x] done\n- [ ] open'}</Markdown>);
    const list = container.querySelector('ul');
    expect(list?.className).toMatch(/noInlineClip/);
  });

  it('keeps the inline clip on a plain List', () => {
    const {container} = render(
      <List>
        <ListItem label="one" />
      </List>,
    );
    expect(container.querySelector('ul')?.className).not.toMatch(
      /noInlineClip/,
    );
  });
});
