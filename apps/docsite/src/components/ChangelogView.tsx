// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input The changelog's packages, and one page of a package's release notes.
 * @output The changelog frame (title and package tabs) and the release notes
 *   with their page navigation.
 * @position Client parts of the docsite changelog routes.
 */

'use client';

import type {ComponentProps, ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Carousel} from '@astryxdesign/core/Carousel';
import {Pagination} from '@astryxdesign/core/Pagination';
import {typeScaleVars} from '@astryxdesign/core/theme/tokens.stylex';
import {layout} from '../layout.stylex';
import {
  changelogPagePath,
  changelogSlugFromPath,
  type ChangelogPackage,
} from '../lib/changelogPages';
import {CHANGELOG_PAGE_TITLE} from '../lib/pageTitles';

const styles = stylex.create({
  section: {
    marginInline: 'auto',
    // Match the docs article body treatment (16px / 1.75) from DocPageLayout.
    // The release-notes body renders via Markdown, whose root reads these
    // tokens; re-assigning them here scopes the larger/airier body to the
    // changelog article only. The title (display-1), subtitle (large), and
    // tab labels use different tokens, so they're unaffected.
    [typeScaleVars['--text-body-size']]: '1rem', // 16px
    [typeScaleVars['--text-body-leading']]: '1.75', // 28px line box
  },
  pages: {
    alignSelf: 'center',
  },
});

const ignoreTabChange = (_name: string) => undefined;
const ignorePageChange = (_page: number) => undefined;

/**
 * The link of a package tab. A tab is view state of the changelog: it replaces
 * the history entry, and the page keeps its scroll position.
 */
function PackageTabLink({
  to: _to,
  ...props
}: ComponentProps<typeof Link> & {to?: string}) {
  return <Link {...props} replace scroll={false} />;
}

/**
 * The link of a page of releases. The page number is view state of the
 * changelog: it replaces the history entry. An older page loads when the
 * reader asks for it, not when its link comes into view.
 */
function ReleasePageLink({
  to: _to,
  ...props
}: ComponentProps<typeof Link> & {to?: string}) {
  return <Link {...props} replace prefetch={false} />;
}

interface ChangelogFrameProps {
  packages: ChangelogPackage[];
  /** The slug of the package that `/changelog` shows. */
  defaultSlug: string;
  children: ReactNode;
}

/**
 * The title and the package tabs. The changelog layout renders it, so it stays
 * mounted, and a tab keeps focus, when a visitor changes package or page.
 */
export function ChangelogFrame({
  packages,
  defaultSlug,
  children,
}: ChangelogFrameProps) {
  const pathname = usePathname();
  const activeSlug = changelogSlugFromPath(pathname) ?? defaultSlug;
  const active = packages.find(pkg => pkg.slug === activeSlug) ?? packages[0];

  return (
    <Section
      maxWidth={layout.proseMaxWidth}
      padding={6}
      xstyle={styles.section}>
      <VStack gap={8}>
        <VStack gap={4}>
          <Heading level={1} type="display-1">
            {CHANGELOG_PAGE_TITLE}
          </Heading>
          <Text type="large" weight="normal" color="secondary">
            Release notes and changelog for all packages.
          </Text>
        </VStack>

        {active != null ? (
          <>
            {/* Each tab is a link to the package's page: the link navigates. */}
            <TabList value={active.name} onChange={ignoreTabChange} hasDivider>
              <Carousel gap={0.5} hasSnap={false}>
                {packages.map(pkg => (
                  <Tab
                    key={pkg.name}
                    value={pkg.name}
                    label={pkg.name}
                    href={pkg.href}
                    as={PackageTabLink}
                  />
                ))}
              </Carousel>
            </TabList>
            {children}
          </>
        ) : (
          <Text type="body" color="secondary">
            Changelogs could not be loaded.
          </Text>
        )}
      </VStack>
    </Section>
  );
}

interface ChangelogNotesProps {
  /** The page's releases, ready for the Markdown renderer. */
  markdown: string;
  page: number;
  pageCount: number;
  slug: string;
  defaultSlug: string;
}

/** One page of a package's release notes, newest first. */
export function ChangelogNotes({
  markdown,
  page,
  pageCount,
  slug,
  defaultSlug,
}: ChangelogNotesProps) {
  return (
    <VStack gap={8}>
      <Markdown headingLevelStart={2}>{markdown}</Markdown>
      {pageCount > 1 && (
        // Each page control is a link to that page: the link navigates.
        <Pagination
          label="Older and newer releases"
          page={page}
          totalPages={pageCount}
          getPageHref={target => changelogPagePath(slug, target, defaultSlug)}
          as={ReleasePageLink}
          onChange={ignorePageChange}
          xstyle={styles.pages}
        />
      )}
    </VStack>
  );
}
