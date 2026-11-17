// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Changelog route for one package's older releases.
 * @input The package slug and the page number from the URL
 * @output That page of the package's releases; page 2 holds the releases
 *   after the newest page
 * @position Public docsite page at /changelog/<package>/<page>
 */

import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ChangelogRelease} from '../../../../../components/ChangelogRelease';
import {changelogEntries} from '../../../../../lib/changelogData';
import {changelogPageList} from '../../../../../lib/changelogPages';
import {changelogPageMetadata} from '../../changelogMetadata';

interface Params {
  params: Promise<{pkg: string; page: string}>;
}

// Page 1 lives at /changelog/<package>.
function olderPageNumber(page: string): number | null {
  return /^[1-9]\d*$/.test(page) && Number(page) > 1 ? Number(page) : null;
}

export function generateStaticParams() {
  return changelogPageList(changelogEntries)
    .filter(each => each.page > 1)
    .map(each => ({pkg: each.slug, page: String(each.page)}));
}

export async function generateMetadata({params}: Params): Promise<Metadata> {
  const {pkg, page} = await params;
  const pageNumber = olderPageNumber(page);
  return pageNumber == null ? {} : changelogPageMetadata(pkg, pageNumber);
}

export default async function ChangelogOlderReleasesPage({params}: Params) {
  const {pkg, page} = await params;
  const pageNumber = olderPageNumber(page);
  if (pageNumber == null) {
    notFound();
  }
  return <ChangelogRelease slug={pkg} page={pageNumber} />;
}
