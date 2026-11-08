// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input Package changelogs, component names, and an optional URL selection.
 * @output Changelog navigation and the selected package's release notes.
 * @position Main content for the docsite changelog route.
 */

'use client';

import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Text, Heading} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {Carousel} from '@astryxdesign/core/Carousel';
import {typeScaleVars} from '@astryxdesign/core/theme/tokens.stylex';
import {layout} from '../layout.stylex';
import {CHANGELOG_PAGE_TITLE} from '../lib/pageTitles';
import {
  linkifyPRs,
  linkifyContributors,
  linkifyComponents,
  addEmptyReleasePlaceholders,
  stripTitle,
} from './changelogLinkify';

interface ChangelogEntry {
  pkg: string;
  content: string;
}

interface ChangelogViewProps {
  changelogs: ChangelogEntry[];
  componentNames: string[];
  selectedPackage?: string;
  onPackageChange?: (pkg: string) => void;
}

const DEFAULT_PACKAGE = '@astryxdesign/core';
const CLI_PACKAGE = '@astryxdesign/cli';
const THEME_PACKAGE_PREFIX = '@astryxdesign/theme-';
const ignorePackageChange = (_pkg: string) => undefined;

function packagePriority(pkg: string): number {
  if (pkg === DEFAULT_PACKAGE) {
    return 0;
  }
  if (pkg === CLI_PACKAGE) {
    return 1;
  }
  return 2;
}

function resolveActivePackage(
  changelogs: ChangelogEntry[],
  selectedPackage: string | undefined,
): string {
  if (selectedPackage != null) {
    const selected = changelogs.find(
      changelog => changelog.pkg === selectedPackage,
    );
    if (selected != null) {
      return selected.pkg;
    }
  }

  const core = changelogs.find(changelog => changelog.pkg === DEFAULT_PACKAGE);
  if (core != null) {
    return core.pkg;
  }

  return changelogs[0]?.pkg ?? '';
}

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
});

export function UrlChangelogView(props: ChangelogViewProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPackage = searchParams.get('package') ?? undefined;

  const handlePackageChange = (pkg: string) => {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.set('package', pkg);
    router.replace(`${pathname}?${nextSearchParams}`, {scroll: false});
  };

  return (
    <ChangelogView
      {...props}
      selectedPackage={selectedPackage}
      onPackageChange={handlePackageChange}
    />
  );
}

export function ChangelogView({
  changelogs,
  componentNames,
  selectedPackage,
  onPackageChange,
}: ChangelogViewProps) {
  const displayedChangelogs = changelogs
    .filter(changelog => !changelog.pkg.startsWith(THEME_PACKAGE_PREFIX))
    .sort((a, b) => packagePriority(a.pkg) - packagePriority(b.pkg));
  const activeTab = resolveActivePackage(displayedChangelogs, selectedPackage);
  const active = displayedChangelogs.find(c => c.pkg === activeTab);

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

        {displayedChangelogs.length > 0 ? (
          <>
            <TabList
              value={activeTab}
              onChange={onPackageChange ?? ignorePackageChange}
              hasDivider>
              <Carousel gap={0.5} hasSnap={false}>
                {displayedChangelogs.map(c => (
                  <Tab key={c.pkg} value={c.pkg} label={c.pkg} />
                ))}
              </Carousel>
            </TabList>

            {active != null && (
              <Markdown headingLevelStart={2}>
                {linkifyComponents(
                  linkifyContributors(
                    linkifyPRs(
                      addEmptyReleasePlaceholders(stripTitle(active.content)),
                    ),
                  ),
                  componentNames,
                )}
              </Markdown>
            )}
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
