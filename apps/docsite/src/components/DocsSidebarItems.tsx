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
 * The shell stays mounted across in-site navigation, so a mount-time default
 * alone would leave the parent closed when a link or search moves the reader
 * to one of its pages. Each move to a child page opens the parent again; a
 * collapse on that page stays until the next move.
 */
function DocsParentEntry({
  item: {page, children},
  pathname,
}: {
  item: DocsSidebarItem;
  pathname: string;
}) {
  const hasCurrentChild = children.some(child => pathname === hrefOf(child));
  const [isCollapsed, setIsCollapsed] = useState(!hasCurrentChild);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (hasCurrentChild) {
      setIsCollapsed(false);
    }
  }
  return (
    <SideNavItem
      label={page.title}
      href={hrefOf(page)}
      isSelected={pathname === hrefOf(page)}
      collapsible={{
        isCollapsed,
        onCollapsedChange: setIsCollapsed,
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
