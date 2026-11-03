// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DocsSidebarItems.tsx
 * @input The items of one docs sidebar group and the current path
 * @output One sidebar entry per page, with a parent's pages nested under it
 * @position Rendered by DocsShell in the Guide and Foundations groups
 */

import {useState} from 'react';
import {SideNavItem} from '@astryxdesign/core/SideNav';
import type {DocsNavTopic} from './docsNav';
import type {DocsSidebarItem} from './docsSidebarData';

interface DocsSidebarItemsProps {
  items: DocsSidebarItem[];
  pathname: string;
}

const hrefOf = (page: DocsNavTopic) => `/docs/${page.topic}`;

function DocsPageEntry({
  page,
  pathname,
}: {
  page: DocsNavTopic;
  pathname: string;
}) {
  return (
    <SideNavItem
      label={page.title}
      href={hrefOf(page)}
      isSelected={pathname === hrefOf(page)}
    />
  );
}

/**
 * The shell stays mounted across in-site navigation, so the open state comes
 * from the current path on every render: a mount-time default would leave the
 * parent closed when a link or search moves the reader to one of its pages.
 */
function DocsParentEntry({
  item: {page, children},
  pathname,
}: {
  item: DocsSidebarItem;
  pathname: string;
}) {
  const [isClosedByReader, setIsClosedByReader] = useState(true);
  const hasCurrentChild = children.some(child => pathname === hrefOf(child));
  return (
    <SideNavItem
      label={page.title}
      href={hrefOf(page)}
      isSelected={pathname === hrefOf(page)}
      collapsible={{
        isCollapsed: !hasCurrentChild && isClosedByReader,
        onCollapsedChange: setIsClosedByReader,
      }}>
      {children.map(child => (
        <DocsPageEntry key={child.topic} page={child} pathname={pathname} />
      ))}
    </SideNavItem>
  );
}

export function DocsSidebarItems({items, pathname}: DocsSidebarItemsProps) {
  return (
    <>
      {items.map(item =>
        item.children.length === 0 ? (
          <DocsPageEntry
            key={item.page.topic}
            page={item.page}
            pathname={pathname}
          />
        ) : (
          <DocsParentEntry
            key={item.page.topic}
            item={item}
            pathname={pathname}
          />
        ),
      )}
    </>
  );
}
