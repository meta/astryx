// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Color-set documentation with paired Neutral swatches.
 * @input Authored section tables and canonical theme token resolution.
 * @output Visible colors, token labels, and light/dark reference values.
 * @position The Color sets subpage under Data visualization.
 */

import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Table, proportional} from '@astryxdesign/core/Table';
import {Text} from '@astryxdesign/core/Text';
import {resolveThemeTokens} from '@astryxdesign/core/theme/tokens';
import {colorVars, radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import type {ContentBlock, DocSection} from '../../generated/docsRegistry';
import {AnchorHeading} from './AnchorHeading';
import {ContentBlockRenderer} from './ContentBlockRenderer';
import {buildOutline, normalizeHeadingLevel} from './docOutline';
import {ReferenceDocView, type SectionOverrides} from './ReferenceDocView';
import {renderInlineMarkdown} from './inlineMarkdown';

const modeTokens = {
  light: resolveThemeTokens(neutralTheme, {mode: 'light'}),
  dark: resolveThemeTokens(neutralTheme, {mode: 'dark'}),
};
const styles = stylex.create({
  surface: (color: string) => ({
    width: 28,
    height: 28,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: color,
    borderRadius: radiusVars['--radius-element'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border-gray'],
  }),
  value: {whiteSpace: 'nowrap'},
  token: {overflowWrap: 'anywhere'},
  fill: (color: string, strength: number) => ({
    width: '100%',
    height: '100%',
    backgroundColor: color,
    opacity: strength,
  }),
});

export function colorLabel(value: string, strength: number): string {
  if (strength === 1) {
    return value;
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return `${value}${Math.round(strength * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()}`;
  }
  return `color-mix(in srgb, ${value} ${strength * 100}%, transparent)`;
}

function ModePreview({
  token,
  mode,
  strength,
}: {
  token: string;
  mode: 'light' | 'dark';
  strength: number;
}) {
  const color = modeTokens[mode][token];
  const surface = modeTokens[mode]['--color-background-surface'];
  if (!color || !surface) {
    throw new Error(`Cannot resolve ${token} in ${mode} mode`);
  }
  const label = colorLabel(color, strength);
  return (
    <HStack gap={2} vAlign="center">
      <div
        role="img"
        aria-label={`${token}, ${mode}, ${strength * 100}%, ${label}`}
        {...stylex.props(styles.surface(surface))}>
        <div {...stylex.props(styles.fill(color, strength))} />
      </div>
      <Text type="code" color="secondary" xstyle={styles.value}>
        {label}
      </Text>
    </HStack>
  );
}

function ColorSetTable({block}: {block: ContentBlock}) {
  const headers = block.headers ?? [];
  const tokenIndex = headers.indexOf('Token'),
    strengthIndex = headers.indexOf('Strength');
  if (tokenIndex < 0 || strengthIndex < 0) {
    throw new Error('Color-set tables require Token and Strength columns');
  }
  const data = (block.rows ?? []).map(row => {
    const strength = Number.parseFloat(row[strengthIndex]) / 100;
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
      throw new Error('Invalid color-set strength');
    }
    return {meaning: row[0], token: row[tokenIndex], strength};
  });
  return (
    <Table
      data={data}
      columns={[
        {
          key: 'token',
          header: 'Token / use',
          width: proportional(2),
          renderCell: row => (
            <VStack gap={1}>
              <Text type="code" xstyle={styles.token}>
                {row.token}
              </Text>
              <Text type="supporting" color="secondary">
                {renderInlineMarkdown(row.meaning)}
                {row.strength === 1 ? '' : ` · ${row.strength * 100}%`}
              </Text>
            </VStack>
          ),
        },
        {
          key: 'value',
          header: 'Light / Dark',
          width: proportional(1),
          renderCell: row => (
            <VStack gap={2}>
              <ModePreview
                token={row.token}
                mode="light"
                strength={row.strength}
              />
              <ModePreview
                token={row.token}
                mode="dark"
                strength={row.strength}
              />
            </VStack>
          ),
        },
      ]}
      density="spacious"
      dividers="rows"
    />
  );
}

export function ColorSetsDocView({
  title,
  description,
  sections,
}: {
  title: string;
  description: string;
  sections: DocSection[];
}) {
  const {blockIds} = buildOutline(sections);
  const overrides: SectionOverrides = {};
  sections.forEach((section, sectionIndex) => {
    if (section.previewType !== 'swatch') {
      return;
    }
    overrides[section.title] = (current, id) => (
      <VStack gap={4}>
        <AnchorHeading id={id} level={2} type="display-3">
          {current.title}
        </AnchorHeading>
        {current.content.map((block, blockIndex) => {
          if (block.type === 'table') {
            return (
              <Card key={blockIndex}>
                <ColorSetTable block={block} />
              </Card>
            );
          }
          if (block.type === 'heading') {
            return (
              <AnchorHeading
                key={blockIndex}
                id={blockIds.get(`${sectionIndex}:${blockIndex}`) ?? ''}
                level={normalizeHeadingLevel(block.level)}>
                {block.text}
              </AnchorHeading>
            );
          }
          return <ContentBlockRenderer key={blockIndex} block={block} />;
        })}
      </VStack>
    );
  });
  return (
    <ReferenceDocView
      title={title}
      description={description}
      sections={sections}
      sectionOverrides={overrides}
    />
  );
}
