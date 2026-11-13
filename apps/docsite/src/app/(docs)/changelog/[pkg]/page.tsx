// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Changelog route for one package.
 * @input The package slug from the URL
 * @output The newest releases of that package; the default package's are at
 *   /changelog
 * @position Public docsite page at /changelog/<package>
 */

import type {Metadata} from 'next';
import {permanentRedirect} from 'next/navigation';
import {ChangelogRelease} from '../../../../components/ChangelogRelease';
import {changelogEntries} from '../../../../lib/changelogData';
import {
  CHANGELOG_PATH,
  changelogPackages,
  defaultChangelogSlug,
} from '../../../../lib/changelogPages';
import {changelogPageMetadata} from '../changelogMetadata';

interface Params {
  params: Promise<{pkg: string}>;
}

export function generateStaticParams() {
  return changelogPackages(changelogEntries).map(pkg => ({pkg: pkg.slug}));
}

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {pkg} = await params;
  return changelogPageMetadata(pkg, 1);
}

export default async function ChangelogPackagePage({params}: Params) {
  const {pkg} = await params;
  // The default package's newest releases have one URL: /changelog.
  if (pkg === defaultChangelogSlug(changelogEntries)) {
    permanentRedirect(CHANGELOG_PATH);
  }
  return <ChangelogRelease slug={pkg} page={1} />;
}
