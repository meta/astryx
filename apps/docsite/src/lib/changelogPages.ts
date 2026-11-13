// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file changelogPages.ts
 * @input Package changelogs as authored (CHANGELOG.md text) and component names
 * @output The changelog's packages in tab order, each split into pages of
 *   releases, and the URL of each page
 * @position Shared by the changelog routes, their navigation and the sitemap
 */

import {
  addEmptyReleasePlaceholders,
  linkifyComponents,
  linkifyContributors,
  linkifyPRs,
  stripTitle,
} from '../components/changelogLinkify';

export const CHANGELOG_PATH = '/changelog';

/**
 * Releases on one page. A page with a package's whole history is megabytes of
 * HTML, most of it for releases few visitors read.
 */
export const RELEASES_PER_PAGE = 5;

const DEFAULT_PACKAGE = '@astryxdesign/core';
const CLI_PACKAGE = '@astryxdesign/cli';
const THEME_PACKAGE_PREFIX = '@astryxdesign/theme-';
const RELEASE_HEADING = /^#{1,2}\s+\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\s*$/;
const RELEASE_SEPARATOR = '\n\n---\n\n';

export interface ChangelogEntry {
  pkg: string;
  content: string;
}

export interface ChangelogPackage {
  name: string;
  /** The package name without its scope: the package's URL segment. */
  slug: string;
  /** URL of the package's newest releases. */
  href: string;
  pageCount: number;
}

export interface ChangelogPage {
  package: ChangelogPackage;
  page: number;
  /** The page's releases, ready for the Markdown renderer. */
  markdown: string;
}

function packagePriority(pkg: string): number {
  if (pkg === DEFAULT_PACKAGE) {
    return 0;
  }
  if (pkg === CLI_PACKAGE) {
    return 1;
  }
  return 2;
}

function packageSlug(name: string): string {
  return name.replace(/^@[^/]+\//, '');
}

function displayedEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
  return entries
    .filter(entry => !entry.pkg.startsWith(THEME_PACKAGE_PREFIX))
    .sort((a, b) => packagePriority(a.pkg) - packagePriority(b.pkg));
}

/** A package's releases, newest first, one markdown string for each. */
export function splitReleases(content: string): string[] {
  const releases: string[][] = [];
  for (const line of stripTitle(content).split('\n')) {
    if (RELEASE_HEADING.test(line) || releases.length === 0) {
      releases.push([]);
    }
    releases[releases.length - 1]?.push(line);
  }
  return releases
    .map(lines =>
      lines
        .join('\n')
        .replace(/\n+---\s*$/, '')
        .trim(),
    )
    .filter(release => release !== '');
}

/** The slug of the package that `/changelog` shows. */
export function defaultChangelogSlug(entries: ChangelogEntry[]): string {
  const displayed = displayedEntries(entries);
  const core = displayed.find(entry => entry.pkg === DEFAULT_PACKAGE);
  return packageSlug((core ?? displayed[0])?.pkg ?? '');
}

/** The URL of one page of a package's releases. Page 1 is the newest. */
export function changelogPagePath(
  slug: string,
  page: number,
  defaultSlug: string,
): string {
  if (page > 1) {
    return `${CHANGELOG_PATH}/${slug}/${page}`;
  }
  return slug === defaultSlug ? CHANGELOG_PATH : `${CHANGELOG_PATH}/${slug}`;
}

/** The package slug in a changelog URL, or null on `/changelog` itself. */
export function changelogSlugFromPath(pathname: string): string | null {
  const [root, slug] = pathname.split('/').filter(Boolean);
  return `/${root}` === CHANGELOG_PATH && slug != null ? slug : null;
}

/** The packages with a changelog tab, in tab order. */
export function changelogPackages(
  entries: ChangelogEntry[],
): ChangelogPackage[] {
  const defaultSlug = defaultChangelogSlug(entries);
  return displayedEntries(entries).map(entry => {
    const slug = packageSlug(entry.pkg);
    return {
      name: entry.pkg,
      slug,
      href: changelogPagePath(slug, 1, defaultSlug),
      pageCount: Math.max(
        1,
        Math.ceil(splitReleases(entry.content).length / RELEASES_PER_PAGE),
      ),
    };
  });
}

/** Every changelog page that exists, as a slug and a page number. */
export function changelogPageList(
  entries: ChangelogEntry[],
): Array<{slug: string; page: number}> {
  return changelogPackages(entries).flatMap(pkg =>
    Array.from({length: pkg.pageCount}, (_, index) => ({
      slug: pkg.slug,
      page: index + 1,
    })),
  );
}

/** One page of a package's releases, or null when the URL names none. */
export function changelogPage(
  entries: ChangelogEntry[],
  componentNames: string[],
  slug: string,
  page: number,
): ChangelogPage | null {
  const pkg = changelogPackages(entries).find(each => each.slug === slug);
  const entry = entries.find(each => each.pkg === pkg?.name);
  if (
    pkg == null ||
    entry == null ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > pkg.pageCount
  ) {
    return null;
  }
  const releases = splitReleases(entry.content).slice(
    (page - 1) * RELEASES_PER_PAGE,
    page * RELEASES_PER_PAGE,
  );
  return {
    package: pkg,
    page,
    markdown: linkifyComponents(
      linkifyContributors(
        linkifyPRs(
          addEmptyReleasePlaceholders(releases.join(RELEASE_SEPARATOR)),
        ),
      ),
      componentNames,
    ),
  };
}
