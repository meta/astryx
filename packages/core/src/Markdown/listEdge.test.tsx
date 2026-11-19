// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file listEdge.test.tsx
 * @input Markdown ordered, unordered, nested, and task lists
 * @output Unit proof that Markdown's lists use List's `flush` edge, so a
 *   list fits its column instead of stepping out past both edges, and that
 *   every Markdown list drops List's inline clip through one scope that a
 *   nested List does not inherit
 * @position Markdown regression test; real-browser widths are in
 *   __tests__/MarkdownListBounds.a11y.chromium.spec.ts
 */

import {render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {List} from '../List/List';
import {ListStaticContext, listStaticMark} from '../List/ListContext';
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

describe('Markdown lists drop the inline clip through one scope', () => {
  it.each([
    ['unordered', '- one\n- two'],
    ['ordered', '1. one\n2. two'],
    ['task', '- [x] done\n- [ ] open'],
  ])('%s list drops the inline clip', (_, markdown) => {
    const {container} = render(<Markdown>{markdown}</Markdown>);
    expect(container.querySelector('ul, ol')?.className).toMatch(
      /noInlineClip/,
    );
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

  it('keeps the inline clip on a List inside a static list row', () => {
    const {container} = render(
      <ListStaticContext value={listStaticMark()}>
        <List>
          <ListItem
            label={
              <List>
                <ListItem label="inner" />
              </List>
            }
          />
        </List>
      </ListStaticContext>,
    );
    const [outer, inner] = container.querySelectorAll('ul');
    expect(outer?.className).toMatch(/noInlineClip/);
    expect(inner?.className).not.toMatch(/noInlineClip/);
  });
});
