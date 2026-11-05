// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {Card} from '@astryxdesign/core/Card';
import {VStack} from '@astryxdesign/core/Layout';
import {Theme, useTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import {useThemeMode} from '../../app/providers';
import {AnchorHeading} from './AnchorHeading';
import {
  ColorTokenTable,
  SpacingTokenTable,
  SizeTokenTable,
  RadiusTokenTable,
  BorderTokenTable,
  ElevationTokenTable,
  DurationTokenTable,
  EasingTokenTable,
  TypographyTokenTable,
  FontFamilyTokenTable,
  FontWeightTokenTable,
  FontSizeTokenTable,
} from '../tokens';
import {ReferenceDocView} from './ReferenceDocView';
import {ContentBlockRenderer} from './ContentBlockRenderer';
import type {DocSection} from '../../generated/docsRegistry';
import type {TokenTableProps} from '../tokens';
import type {ComponentType} from 'react';

// ---------------------------------------------------------------------------
// Map section titles to token table components per topic
// ---------------------------------------------------------------------------

type TableComponent = ComponentType<TokenTableProps>;

const TOPIC_SECTION_OVERRIDES: Record<
  string,
  Record<string, TableComponent>
> = {
  tokens: {
    'Color Tokens': ColorTokenTable,
    'Spacing Tokens': SpacingTokenTable,
    'Size Tokens': SizeTokenTable,
    'Border Tokens': BorderTokenTable,
    'Radius Tokens': RadiusTokenTable,
    'Shadow Tokens': ElevationTokenTable,
    'Duration Tokens': DurationTokenTable,
    'Easing Tokens': EasingTokenTable,
    'Font Family Tokens': FontFamilyTokenTable,
    'Font Size Tokens': FontSizeTokenTable,
    'Font Weight Tokens': FontWeightTokenTable,
    'Type Scale Tokens': TypographyTokenTable,
  },
  color: {
    'Color Tokens': ColorTokenTable,
  },
  elevation: {
    'Elevation Scale': ElevationTokenTable,
  },
  motion: {
    Duration: DurationTokenTable,
    Easing: EasingTokenTable,
  },
  shape: {
    'Radius Scale': RadiusTokenTable,
  },
  spacing: {
    Scale: SpacingTokenTable,
  },
  typography: {
    'Font Families': FontFamilyTokenTable,
    'Font Sizes': FontSizeTokenTable,
    'Font Weights': FontWeightTokenTable,
    'Type Scale': TypographyTokenTable,
  },
};

// ---------------------------------------------------------------------------
// TokenSection — renders prose blocks from the section + the table component
// ---------------------------------------------------------------------------

function TokenSection({
  section,
  id,
  Table,
  theme,
}: {
  section: DocSection;
  id: string;
  Table: TableComponent;
  theme: TokenTableProps['theme'];
}) {
  const {mode} = useThemeMode();
  const prose = section.content.filter(block => block.type !== 'table');
  return (
    <VStack gap={4}>
      <AnchorHeading id={id} level={3} type="display-3">
        {section.title}
      </AnchorHeading>
      {prose.map((block, i) => (
        <ContentBlockRenderer key={i} block={block} />
      ))}
      <Card>
        {/* Resolve swatches against the canonical neutralTheme (the base theme
            we ship), not the docsite's astryx brand skin. The resolver reads
            from ThemeContext, so the nested Theme is what redirects it. */}
        <Theme theme={neutralTheme} mode={mode}>
          <Table theme={theme} />
        </Theme>
      </Card>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// TokensDocView
// ---------------------------------------------------------------------------

export function TokensDocView({
  title,
  description,
  sections,
  topic,
}: {
  title: string;
  description: string;
  sections: DocSection[];
  topic: string;
}) {
  const theme = useTheme();
  const overrideMap = TOPIC_SECTION_OVERRIDES[topic] ?? {};

  const sectionOverrides: Record<
    string,
    (section: DocSection, id: string) => React.ReactNode
  > = {};
  for (const [sectionTitle, Table] of Object.entries(overrideMap)) {
    sectionOverrides[sectionTitle] = (section: DocSection, id: string) => (
      <TokenSection section={section} id={id} Table={Table} theme={theme} />
    );
  }

  return (
    <ReferenceDocView
      title={title}
      description={description}
      sections={sections}
      sectionOverrides={sectionOverrides}
    />
  );
}
