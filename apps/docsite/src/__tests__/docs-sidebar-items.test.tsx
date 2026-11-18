// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file A parent page's sidebar entry opens when the reader reaches one of its
 * pages without the sidebar remounting, as a link or site search does, and
 * the reader can still collapse it there.
 */

import '@testing-library/jest-dom/vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
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
    children: [
      page('styling', 'Styling components'),
      page('styling-themes', 'Styling themes'),
    ],
  },
];

const childName = 'Styling components';
const parentToggle = () =>
  screen.getByRole('button', {name: /^(Collapse|Expand) Styling overview$/});

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

  it('collapses the parent entry on a child page when the reader presses its toggle', () => {
    render(<DocsSidebarItems items={items} pathname="/docs/styling" />);
    expect(parentToggle()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(parentToggle());
    expect(parentToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', {name: childName})).toBeNull();
  });

  it('opens the collapsed parent entry again on a move to another of its pages', () => {
    const {rerender} = render(
      <DocsSidebarItems items={items} pathname="/docs/styling" />,
    );
    fireEvent.click(parentToggle());
    expect(parentToggle()).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <DocsSidebarItems items={items} pathname="/docs/styling-themes" />,
    );
    expect(parentToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', {name: 'Styling themes'})).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
