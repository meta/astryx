// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pagination.targets.test.tsx
 * @input Pagination in the pages variant, with first/last in compact
 * @output Verifies the control row, its Button cells and the ellipsis carry
 *   their theme targets, the current page's cell reflects data-selected, and
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
});
