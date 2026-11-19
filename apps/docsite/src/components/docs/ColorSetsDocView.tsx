// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Compact visual reference for data-color sets.
 * @input Authored set tables and canonical Neutral theme values.
 * @output All color sets and chart styling on one page with paired mode previews.
 * @position The Color sets subpage under Data visualization.
 */

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useClipboard} from '@astryxdesign/core/hooks';
import {Card} from '@astryxdesign/core/Card';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Table, pixel, proportional} from '@astryxdesign/core/Table';
import {resolveThemeTokens} from '@astryxdesign/core/theme/tokens';
import {
  colorVars,
  radiusVars,
  spacingVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';
import type {DocSection} from '../../generated/docsRegistry';
import {ContentBlockRenderer} from './ContentBlockRenderer';
import {DocPageLayout} from './DocPageLayout';

const modeTokens = {
  light: resolveThemeTokens(neutralTheme, {mode: 'light'}),
  dark: resolveThemeTokens(neutralTheme, {mode: 'dark'}),
};
const styles = stylex.create({
  token: {fontSize: '0.75rem', overflowWrap: 'anywhere'},
  surface: (color: string) => ({
    width: 28,
    height: 28,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: color,
    borderRadius: radiusVars['--radius-element'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colorVars['--color-border'],
  }),
  fill: (color: string, strength: number) => ({
    width: '100%',
    height: '100%',
    backgroundColor: color,
    opacity: strength,
  }),
  preview: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
});

const PURPOSE: Record<string, string> = {
  Categorical: 'Use different colors to compare categories or named series.',
  Sequential:
    'Use a sequential palette to show how values vary from low to high.',
  Reference: 'Use neutral or gray for a target or comparison value.',
  Semantic:
    'Use color to show a status, such as positive, warning, or negative.',
  Diverging:
    'Use two color directions to show values above and below a midpoint.',
  Spectrum: 'Use a sequence of multiple hues to show a range of values.',
  Heatmap: 'Use cell colors to show patterns in a table or grid.',
};

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

export function colorGroups(section: DocSection) {
  const groups: Array<{title: string; rows: string[][]}> = [];
  let title = section.title;
  for (const block of section.content) {
    if (block.type === 'heading') {
      title = block.text ?? section.title;
    }
    if (block.type === 'table') {
      groups.push({title, rows: block.rows ?? []});
    }
  }
  return groups;
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
    <div {...stylex.props(styles.preview)}>
      <div
        role="img"
        aria-label={`${token}, ${mode}, ${strength * 100}%, ${label}`}
        {...stylex.props(styles.surface(surface))}>
        <div {...stylex.props(styles.fill(color, strength))} />
      </div>
    </div>
  );
}

function Palette({
  rows,
  showMeaning = false,
}: {
  rows: string[][];
  showMeaning?: boolean;
}) {
  const data = rows.map((row, index) => {
    const strength = Number.parseFloat(row[2]) / 100;
    if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
      throw new Error('Invalid color-set strength');
    }
    return {
      index,
      token: row[1],
      strength,
      meaning: row[0].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'),
    };
  });
  return (
    <Card>
      <Table
        data={data}
        columns={[
          {
            key: 'token',
            header: 'Token',
            width: proportional(1),
            renderCell: row => (
              <VStack gap={1}>
                <Text>{row.token}</Text>
                {showMeaning && (
                  <Text type="supporting" color="secondary">
                    {row.meaning}
                  </Text>
                )}
                {row.strength !== 1 && (
                  <Text type="supporting" color="secondary">
                    {row.strength * 100}% fill
                  </Text>
                )}
              </VStack>
            ),
          },
          {
            key: 'light',
            header: 'Light mode',
            width: pixel(152),
            renderCell: row => (
              <HStack gap={2} vAlign="center">
                <ModePreview
                  token={row.token}
                  mode="light"
                  strength={row.strength}
                />
                <Text type="code" color="secondary">
                  {colorLabel(modeTokens.light[row.token], row.strength)}
                </Text>
              </HStack>
            ),
          },
          {
            key: 'dark',
            header: 'Dark mode',
            width: pixel(152),
            renderCell: row => (
              <HStack gap={2} vAlign="center">
                <ModePreview
                  token={row.token}
                  mode="dark"
                  strength={row.strength}
                />
                <Text type="code" color="secondary">
                  {colorLabel(modeTokens.dark[row.token], row.strength)}
                </Text>
              </HStack>
            ),
          },
        ]}
        density="spacious"
        dividers="rows"
      />
    </Card>
  );
}

function CopyTokensButton({rows}: {rows: string[][]}) {
  const {copy, isCopied} = useClipboard({announce: 'Tokens copied'});
  const [failed, setFailed] = useState(false);
  const text = JSON.stringify(
    rows.map(row =>
      row[2] === '100%'
        ? row[1]
        : {token: row[1], opacity: Number.parseFloat(row[2]) / 100},
    ),
    null,
    2,
  );
  return (
    <VStack gap={1}>
      <IconButton
        label={isCopied ? 'Copied' : 'Copy tokens'}
        tooltip="Copy tokens"
        icon={<Icon icon={isCopied ? 'check' : 'copy'} />}
        size="sm"
        variant="ghost"
        onClick={async () => setFailed(!(await copy(text)))}
      />
      {failed && (
        <Text type="supporting" role="alert">
          Could not copy. Try again.
        </Text>
      )}
    </VStack>
  );
}

function SetSection({section}: {section: DocSection}) {
  const groups = colorGroups(section);
  return (
    <VStack gap={4}>
      <HStack hAlign="between" vAlign="center" gap={3}>
        <Heading id={section.title.toLowerCase()} level={2}>
          {section.title}
        </Heading>
        {groups.length === 1 && <CopyTokensButton rows={groups[0].rows} />}
      </HStack>
      <Text>{PURPOSE[section.title]}</Text>
      {groups.map((group, index) => (
        <VStack key={index} gap={3}>
          {groups.length > 1 && (
            <HStack hAlign="between" vAlign="center" gap={3}>
              <Heading level={3}>{group.title}</Heading>
              <CopyTokensButton rows={group.rows} />
            </HStack>
          )}
          <Palette
            rows={group.rows}
            showMeaning={[
              'Reference',
              'Semantic',
              'Diverging',
              'Spectrum',
              'Heatmap',
            ].includes(section.title)}
          />
        </VStack>
      ))}
    </VStack>
  );
}

export function ColorSetsDocView({
  title,
  description,
  sections,
  stylingSections,
}: {
  title: string;
  description: string;
  sections: DocSection[];
  stylingSections: DocSection[];
}) {
  const sets = sections.filter(section => section.previewType === 'swatch');
  return (
    <DocPageLayout title={title} description={description}>
      <VStack gap={10}>
        {sets.map(section => (
          <SetSection key={section.id} section={section} />
        ))}
        <VStack gap={6}>
          <Heading id="chart-styling" level={2}>
            Chart styling
          </Heading>
          <Text>
            Use data colors for series and reference lines, and text, border,
            and surface colors for the parts around them. The mappings below are
            examples you can apply to your chart; they do not change component
            defaults.
          </Text>
          {stylingSections
            .filter(section => section.id === 'map-chart-parts')
            .flatMap(section =>
              section.content.filter(block => block.type === 'table'),
            )
            .map((block, i) => (
              <ContentBlockRenderer key={i} block={block} />
            ))}
          <Collapsible trigger="Implementation details" defaultIsOpen={false}>
            <VStack gap={4}>
              {stylingSections
                .filter(section => section.id !== 'readable-chart-details')
                .map(section => (
                  <VStack key={section.id} gap={3}>
                    <Heading level={3}>{section.title}</Heading>
                    {section.content
                      .filter(
                        block =>
                          block.type !== 'table' ||
                          section.id !== 'map-chart-parts',
                      )
                      .map((block, i) => (
                        <ContentBlockRenderer key={i} block={block} />
                      ))}
                  </VStack>
                ))}
            </VStack>
          </Collapsible>
        </VStack>
      </VStack>
    </DocPageLayout>
  );
}
