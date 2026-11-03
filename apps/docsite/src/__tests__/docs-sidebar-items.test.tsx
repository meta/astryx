// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file A parent page's sidebar entry opens when the reader reaches one of its
 * pages without the sidebar remounting, as a link or site search does.
 */

import '@testing-library/jest-dom/vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {DocsSidebarItems} from '../components/DocsSidebarItems';
import type {DocsSidebarItem} from '../components/docsSidebarData';
import type {DocTopic} from '../generated/docsRegistry';

const page = (topic: string, title: string): DocTopic => ({
  topic,
  title,
  description: '',
  category: 'guide',
  sections: [],
});

const items: DocsSidebarItem[] = [
  {
    page: page('styling-overview', 'Styling overview'),
    children: [page('styling', 'Styling components')],
  },
];

const childName = 'Styling components';

afterEach(cleanup);

describe('docs sidebar items', () => {
  it('opens the parent entry and marks the child current after a move from the parent page', () => {
    const {rerender} = render(
      <DocsSidebarItems items={items} pathname="/docs/styling-overview" />,
    );
    expect(screen.queryByRole('link', {name: childName})).toBeNull();

    rerender(<DocsSidebarItems items={items} pathname="/docs/styling" />);
    expect(screen.getByRole('link', {name: childName})).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
