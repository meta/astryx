// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pagination.targets.test.tsx
 * @input Pagination in the pages variant, with first/last in compact
 * @output Verifies the control row, its Button cells and the ellipsis carry
 *   their theme targets, the current page's cell reflects data-selected, the
 *   row's first and last controls reflect data-first and data-last, and
 *   the default markup otherwise matches the Button cells' own
 * @position Unit test for Pagination's joined-strip theme seams
 */

import {render} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {Pagination} from '../Pagination';

describe('Pagination theme targets', () => {
  it('names the control row, each Button cell, the current cell and the ellipsis', () => {
    const {container} = render(
      <Pagination
        page={5}
        onChange={vi.fn()}
        totalPages={20}
        variant="pages"
        size="sm"
      />,
    );
    const list = container.querySelector('.astryx-pagination-list');
    expect(list).not.toBeNull();
    expect(list?.getAttribute('data-variant')).toBe('pages');
    expect(list?.getAttribute('data-size')).toBe('sm');

    const items = [
      ...container.querySelectorAll<HTMLElement>('.astryx-pagination-item'),
    ];
    // Previous, the page numbers shown, and next: every Button in the row.
    const buttons = [...list!.querySelectorAll('button, a')];
    expect(items).toHaveLength(buttons.length);
    expect(items.every(item => item.classList.contains('astryx-button'))).toBe(
      true,
    );

    const current = items.filter(
      item => item.getAttribute('data-selected') === 'selected',
    );
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute('aria-current')).toBe('page');

    expect(
      container.querySelectorAll('.astryx-pagination-ellipsis').length,
    ).toBeGreaterThan(0);
  });

  it('names the first and last buttons as cells too', () => {
    const {container} = render(
      <Pagination
        page={3}
        onChange={vi.fn()}
        totalPages={9}
        variant="compact"
        hasFirstLast
      />,
    );
    const items = container.querySelectorAll('.astryx-pagination-item');
    // First, previous, next, last.
    expect(items).toHaveLength(4);
    expect(container.querySelector('[data-selected]')).toBeNull();
  });

  it('names the first and last control in the row as its ends', () => {
    const {container} = render(
      <Pagination
        page={5}
        onChange={vi.fn()}
        totalPages={20}
        variant="pages"
      />,
    );
    const items = [
      ...container.querySelectorAll<HTMLElement>('.astryx-pagination-item'),
    ];
    const firsts = items.filter(item => item.dataset.first === 'first');
    const lasts = items.filter(item => item.dataset.last === 'last');
    expect(firsts).toEqual([items[0]]);
    expect(lasts).toEqual([items.at(-1)]);
    // Previous and next have tooltips, whose layers can follow them in the
    // row, so the ends are read from the controls, not the row's children.
    expect(items[0]?.getAttribute('aria-label')).toMatch(/previous/i);
    expect(items.at(-1)?.getAttribute('aria-label')).toMatch(/next/i);
  });

  it('moves the ends to first and last when those buttons show', () => {
    const {container} = render(
      <Pagination
        page={3}
        onChange={vi.fn()}
        totalPages={9}
        variant="compact"
        hasFirstLast
      />,
    );
    const items = [
      ...container.querySelectorAll<HTMLElement>('.astryx-pagination-item'),
    ];
    expect(items.map(item => item.dataset.first ?? null)).toEqual([
      'first',
      null,
      null,
      null,
    ]);
    expect(items.map(item => item.dataset.last ?? null)).toEqual([
      null,
      null,
      null,
      'last',
    ]);
  });
});
