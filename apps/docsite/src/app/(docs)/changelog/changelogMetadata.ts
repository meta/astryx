// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file changelogMetadata.ts
 * @input A package slug and a page number from the changelog URL
 * @output Page metadata for one page of a package's release notes
 * @position Shared by the package and the package-page changelog routes
 */

import type {Metadata} from 'next';
import {changelogEntries} from '../../../lib/changelogData';
import {
  changelogPackages,
  changelogPagePath,
  defaultChangelogSlug,
} from '../../../lib/changelogPages';
import {pageMetadata} from '../../../lib/pageMetadata';
import {CHANGELOG_PAGE_TITLE} from '../../../lib/pageTitles';

export function changelogPageMetadata(slug: string, page: number): Metadata {
  const pkg = changelogPackages(changelogEntries).find(
    each => each.slug === slug,
  );
  if (pkg == null) {
    return {};
  }
  return pageMetadata({
    title:
      page > 1
        ? `${CHANGELOG_PAGE_TITLE}: ${pkg.name}, page ${page}`
        : `${CHANGELOG_PAGE_TITLE}: ${pkg.name}`,
    description: `Release notes and version history for ${pkg.name}.`,
    path: changelogPagePath(slug, page, defaultChangelogSlug(changelogEntries)),
  });
}
