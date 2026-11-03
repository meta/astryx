// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file guideSidebarData.ts
 * @input The docs registry's pages
 * @output The Guide section's sidebar items: each guide page, by title, with
 *   the pages that name it as `parent` nested under it
 * @position Read by DocsShell; tested on its own
 */

import type {DocsNavTopic} from './docsNav';

export interface GuideSidebarItem {
  page: DocsNavTopic;
  children: DocsNavTopic[];
}

const byTitle = (a: DocsNavTopic, b: DocsNavTopic) =>
  a.title.localeCompare(b.title);

/**
 * Getting Started has its own item at the top of the sidebar, so the Guide
 * section leaves it out. A page whose parent is not a guide page stays at the
 * top level.
 */
export function guideSidebarItems(
  docTopics: DocsNavTopic[],
): GuideSidebarItem[] {
  const guides = docTopics
    .filter(d => d.category === 'guide' && d.topic !== 'getting-started')
    .sort(byTitle);
  const slugs = new Set(guides.map(d => d.topic));
  const nested = (d: DocsNavTopic) => d.parent != null && slugs.has(d.parent);
  return guides
    .filter(d => !nested(d))
    .map(page => ({
      page,
      children: guides.filter(d => nested(d) && d.parent === page.topic),
    }));
}
