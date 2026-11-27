// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input A package slug and a page number from the changelog URL.
 * @output That page of the package's release notes, or the not-found page.
 * @position Server part of the docsite changelog routes: it reads the
 *   changelog text, and sends the browser one page of it.
 */

import {notFound} from 'next/navigation';
import {changelogComponentNames, changelogEntries} from '../lib/changelogData';
import {changelogPage, defaultChangelogSlug} from '../lib/changelogPages';
import {ChangelogNotes} from './ChangelogView';

export function ChangelogRelease({slug, page}: {slug: string; page: number}) {
  const release = changelogPage(
    changelogEntries,
    changelogComponentNames,
    slug,
    page,
  );
  if (release == null) {
    notFound();
  }
  return (
    <ChangelogNotes
      markdown={release.markdown}
      page={release.page}
      pageCount={release.package.pageCount}
      slug={release.package.slug}
      defaultSlug={defaultChangelogSlug(changelogEntries)}
    />
  );
}
