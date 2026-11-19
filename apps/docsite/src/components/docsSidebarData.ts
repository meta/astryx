// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file docsSidebarData.ts
 * @input The docs registry's pages
 * @output The Guide and Foundations sidebar groups: each page in its group's
 *   order, with the pages that name it as `parent` nested under it
 * @position Read by DocsShell; tested on its own
 */

import type {DocsNavTopic} from './docsNav';

export interface DocsSidebarItem {
  page: DocsNavTopic;
  children: DocsNavTopic[];
}

export interface DocsSidebarGroups {
  guide: DocsSidebarItem[];
  foundations: DocsSidebarItem[];
}

type Group = keyof DocsSidebarGroups;

/**
 * Getting Started has its own item at the top of the sidebar, so the Guide
 * group leaves it out.
 */
function groupOf(page: DocsNavTopic): Group | null {
  if (page.category === 'foundations') {
    return 'foundations';
  }
  if (page.category === 'guide' && page.topic !== 'getting-started') {
    return 'guide';
  }
  return null;
}

const byTitle = (a: DocsNavTopic, b: DocsNavTopic) =>
  a.title.localeCompare(b.title);

/** Foundations: tokens first, then by title. */
const foundationsOrder = (a: DocsNavTopic, b: DocsNavTopic) => {
  if (a.topic === 'tokens') {
    return -1;
  }
  if (b.topic === 'tokens') {
    return 1;
  }
  return byTitle(a, b);
};

/**
 * A page sits under its parent in the parent's group, whatever its own group.
 * Nesting is one level deep: a page whose parent is not in the sidebar, or is
 * itself nested, stays at the top of its own group.
 */
export function docsSidebarGroups(
  docTopics: DocsNavTopic[],
): DocsSidebarGroups {
  const shown = docTopics.filter(page => groupOf(page) !== null);
  const bySlug = new Map(shown.map(page => [page.topic, page]));
  const inSidebar = (slug?: string) =>
    slug != null ? bySlug.get(slug) : undefined;
  const parentOf = (page: DocsNavTopic) => {
    const parent = inSidebar(page.parent);
    if (!parent || parent === page || inSidebar(parent.parent)) {
      return null;
    }
    return parent;
  };
  const items = (
    group: Group,
    order: (a: DocsNavTopic, b: DocsNavTopic) => number,
  ): DocsSidebarItem[] =>
    shown
      .filter(page => groupOf(page) === group && !parentOf(page))
      .sort(order)
      .map(page => ({
        page,
        children: shown.filter(child => parentOf(child) === page).sort(byTitle),
      }));
  return {
    guide: items('guide', byTitle),
    foundations: items('foundations', foundationsOrder),
  };
}
