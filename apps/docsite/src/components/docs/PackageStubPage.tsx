// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useCallback, useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Markdown} from '@astryxdesign/core/Markdown';
import {Divider} from '@astryxdesign/core/Divider';
import {parseOutlineFromMarkdown} from '@astryxdesign/core/Outline';
import {stripHtmlComments} from './stripHtmlComments';
import {spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {DocPageLayout} from './DocPageLayout';
import {PackageActions, type InstallStep} from './PackageActions';

/** TOC depth cap so deeply-nested README headings don't overwhelm the outline. */
const MAX_OUTLINE_LEVEL = 3;

const headingStyles = stylex.create({
  // Match the Markdown block rhythm so headings aren't cramped.
  major: {
    marginBlockStart: spacingVars['--spacing-6'],
    marginBlockEnd: spacingVars['--spacing-3'],
  },
  minor: {
    marginBlockStart: spacingVars['--spacing-4'],
    marginBlockEnd: spacingVars['--spacing-2'],
  },
});

/**
 * Render README headings to match the hand-authored docs: section headings use
 * the display-3 scale (like ReferenceDocView), keeping the semantic h1–h6 level.
 */
function MarkdownHeading({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: React.ReactNode;
}) {
  const isMajor = level <= 3;
  return (
    <Heading
      level={level}
      // Top-level sections match the docs' section headings (display-3);
      // deeper headings keep the standard, smaller heading scale.
      type={level <= 2 ? 'display-3' : undefined}
      xstyle={isMajor ? headingStyles.major : headingStyles.minor}>
      {children}
    </Heading>
  );
}

const markdownComponents = {heading: MarkdownHeading};

interface PackageStubPageProps {
  name: string;
  description?: string;
  version?: string;
  readme: string | null;
  installSteps?: InstallStep[];
  cta?: {label: string; href: string};
  /** Markdown section headings (## level) to strip from the README */
  stripSections?: string[];
  /**
   * Drop the README's leading intro prose (everything before the first `##`
   * section). The canonical short description already renders as the page
   * subtitle via `description`, so this avoids duplicating it — and removes any
   * cross-references in the intro that point at stripped sections.
   */
  stripIntro?: boolean;
}

export function PackageStubPage({
  name,
  description,
  version,
  readme,
  installSteps,
  cta,
  stripSections,
  stripIntro,
}: PackageStubPageProps) {
  let body = readme ? stripHtmlComments(readme).replace(/^# .+\n+/, '') : null;

  if (body && stripIntro) {
    // Remove leading prose up to the first ## section heading.
    body = body.replace(/^[\s\S]*?(?=\n## |^## )/, '').trimStart();
  }

  if (body && stripSections && stripSections.length > 0) {
    for (const section of stripSections) {
      // Remove ## Section through to the next ## or end of string
      const pattern = new RegExp(
        `## ${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n[\\s\\S]*?(?=\\n## |$)`,
      );
      body = body.replace(pattern, '');
    }
    // Clean up extra blank lines
    body = body.replace(/\n{3,}/g, '\n\n').trim();
  }

  // Heading outline derived from the README, in document order. The full list
  // assigns ids to every rendered heading; the display list is depth-capped.
  const headingItems = useMemo(
    () => (body ? parseOutlineFromMarkdown(body) : []),
    [body],
  );
  const outline = useMemo(
    () => headingItems.filter(item => item.level <= MAX_OUTLINE_LEVEL),
    [headingItems],
  );

  // Assign ids to the rendered Markdown headings so the outline anchors resolve.
  // A callback ref runs during commit — before the Outline's scroll-spy effect —
  // so the heading elements already carry ids when scroll-spy starts observing.
  const assignHeadingIds = useCallback(
    (node: HTMLDivElement | null) => {
      if (node == null) {
        return;
      }
      const headings = node.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((heading, i) => {
        const item = headingItems[i];
        if (item == null) {
          return;
        }
        heading.id = item.id;
        (heading as HTMLElement).style.scrollMarginTop =
          'calc(var(--appshell-header-height, 0px) + var(--docs-anchor-offset, 0px) + 16px)';
      });
    },
    [headingItems],
  );

  return (
    <DocPageLayout
      title={name}
      description={description}
      outline={outline.length > 0 ? outline : undefined}>
      <VStack gap={10}>
        <PackageActions
          packageName={name}
          version={version}
          installSteps={installSteps}
          cta={cta}
        />
        <Divider />
        {body ? (
          <div ref={assignHeadingIds}>
            <Markdown
              headingLevelStart={1}
              contentWidth={800}
              components={markdownComponents}>
              {body}
            </Markdown>
          </div>
        ) : (
          <Text type="body" color="secondary">
            No README available.
          </Text>
        )}
      </VStack>
    </DocPageLayout>
  );
}
