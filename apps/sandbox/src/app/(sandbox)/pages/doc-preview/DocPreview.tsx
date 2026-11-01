// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {useMemo} from 'react';
import * as stylex from '@stylexjs/stylex';
import {VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Divider} from '@astryxdesign/core/Divider';
import type {DefinedTheme} from '@astryxdesign/core/theme';
import type {DocsReadDoc, DocsReadSection} from '@astryxdesign/cli/api';
import {SectionRenderer} from './SectionRenderer';
import {
  ColorTokenTable,
  SpacingTokenTable,
  TypographyTokenTable,
  ElevationTokenTable,
  ShapeTokenTable,
  MotionTokenTable,
} from './token-tables';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  root: {
    maxWidth: 960,
    margin: '0 auto',
    padding: 32,
  },
  version: {
    fontFamily: 'var(--font-family-code)',
  },
});

// =============================================================================
// Token table routing
// =============================================================================

const TOKEN_TABLE_BY_CATEGORY: Record<
  string,
  React.ComponentType<{theme: DefinedTheme}>
> = {
  color: ColorTokenTable,
  spacing: SpacingTokenTable,
  typography: TypographyTokenTable,
  shadow: ElevationTokenTable,
  radius: ShapeTokenTable,
  duration: MotionTokenTable,
  easing: MotionTokenTable,
  motion: MotionTokenTable,
};

function ThemeTokenSection({
  category,
  theme,
}: {
  category: string;
  theme: DefinedTheme;
}) {
  const Component = TOKEN_TABLE_BY_CATEGORY[category];
  if (!Component) {
    return null;
  }
  return <Component theme={theme} />;
}

// =============================================================================
// DocPreview
// =============================================================================

export function DocPreview({
  doc,
  version,
  theme,
}: {
  doc: DocsReadDoc;
  version?: string;
  theme: DefinedTheme;
}) {
  const {usageSections, practiceSections, overviewSections} = useMemo(() => {
    const usage: DocsReadSection[] = [];
    const practice: DocsReadSection[] = [];
    const other: DocsReadSection[] = [];

    for (const section of doc.sections) {
      const titleLower = section.title.toLowerCase();
      if (
        section.previewType ||
        section.content.some(b => b.type === 'table')
      ) {
        // Token sections — handled by ThemeTokenSection, skip
        continue;
      } else if (titleLower.includes('usage')) {
        usage.push(section);
      } else if (
        titleLower.includes('best practice') ||
        titleLower.includes('guidance')
      ) {
        practice.push(section);
      } else {
        other.push(section);
      }
    }

    // Prepend the doc description into the first overview section
    const overview = [...other];
    if (overview.length > 0) {
      overview[0] = {
        ...overview[0],
        content: [
          {type: 'prose' as const, text: doc.description},
          ...overview[0].content,
        ],
      };
    } else {
      overview.push({
        title: 'Overview',
        content: [{type: 'prose' as const, text: doc.description}],
      });
    }

    return {
      usageSections: usage,
      practiceSections: practice,
      overviewSections: overview,
    };
  }, [doc.sections, doc.description]);

  return (
    <div {...stylex.props(styles.root)}>
      <VStack gap={8}>
        {/* Title + Version */}
        <VStack gap={1}>
          <Text type="display-1" as="h1">
            {doc.title}
          </Text>
          {version && (
            <Text type="supporting" color="secondary" xstyle={styles.version}>
              v{version}
            </Text>
          )}
        </VStack>

        {/* Overview */}
        {overviewSections.map((section, i) => (
          <SectionRenderer key={`overview-${i}`} section={section} />
        ))}

        {/* Usage */}
        {usageSections.length > 0 && (
          <>
            <Divider />
            {usageSections.map((section, i) => (
              <SectionRenderer key={`usage-${i}`} section={section} />
            ))}
          </>
        )}

        {/* Best Practices */}
        {practiceSections.length > 0 && (
          <>
            <Divider />
            {practiceSections.map((section, i) => (
              <SectionRenderer key={`practice-${i}`} section={section} />
            ))}
          </>
        )}

        {/* Token tables */}
        {doc.tokenCategory && (
          <>
            <Divider />
            <ThemeTokenSection category={doc.tokenCategory} theme={theme} />
          </>
        )}
      </VStack>
    </div>
  );
}
