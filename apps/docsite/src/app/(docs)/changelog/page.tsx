// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Changelog route for published Astryx packages.
 * @input Generated package changelogs and component names
 * @output The canonical What's New page: the newest releases of the default
 *   package
 * @position Public docsite page at /changelog
 */

import type {Metadata} from 'next';
import {ChangelogRelease} from '../../../components/ChangelogRelease';
import {changelogEntries} from '../../../lib/changelogData';
import {
  CHANGELOG_PATH,
  changelogPackages,
  defaultChangelogSlug,
} from '../../../lib/changelogPages';
import {pageMetadata} from '../../../lib/pageMetadata';
import {CHANGELOG_PAGE_TITLE} from '../../../lib/pageTitles';

export const metadata: Metadata = pageMetadata({
  title: CHANGELOG_PAGE_TITLE,
  description:
    'Release notes and version history for Astryx packages and components.',
  path: CHANGELOG_PATH,
});

export default function ChangelogPage() {
  // With no changelog at all, the layout shows the empty state.
  if (changelogPackages(changelogEntries).length === 0) {
    return null;
  }
  return (
    <ChangelogRelease slug={defaultChangelogSlug(changelogEntries)} page={1} />
  );
}
