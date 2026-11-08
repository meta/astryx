// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Changelog route for published Astryx packages.
 * @input Generated package changelogs, component names, and URL selection state
 * @output The canonical What's New page with package-filtered release notes
 * @position Public docsite page at /changelog
 */

import {Suspense} from 'react';
import type {Metadata} from 'next';
import {
  ChangelogView,
  UrlChangelogView,
} from '../../../components/ChangelogView';
import {components} from '../../../generated/componentRegistry';
import {packages} from '../../../generated/packageRegistry';
import {pageMetadata} from '../../../lib/pageMetadata';
import {CHANGELOG_PAGE_TITLE} from '../../../lib/pageTitles';

export const metadata: Metadata = pageMetadata({
  title: CHANGELOG_PAGE_TITLE,
  description:
    'Release notes and version history for Astryx packages and components.',
  path: '/changelog',
});

export default function ChangelogPage() {
  const changelogs = packages
    .filter((p): p is typeof p & {changelog: string} => p.changelog != null)
    .map(p => ({pkg: p.name, content: p.changelog}));

  const componentNames = Object.values(components)
    .flat()
    .map(c => c.name);

  const viewProps = {changelogs, componentNames};

  return (
    <Suspense fallback={<ChangelogView {...viewProps} />}>
      <UrlChangelogView {...viewProps} />
    </Suspense>
  );
}
