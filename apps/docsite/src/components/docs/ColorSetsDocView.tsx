// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Compact visual reference for data-color sets.
 * @input Authored set tables and canonical Neutral theme values.
 * @output All color sets and chart styling on one page with paired mode previews.
 * @position The Color sets subpage under Data visualization.
 */

import {useState} from 'react';
import {RechartsThemingPreview, AnatomyNumber} from './RechartsThemingPreview';
import * as stylex from '@stylexjs/stylex';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useAnnounce, useClipboard} from '@astryxdesign/core/hooks';
import {Button} from '@astryxdesign/core/Button';
import {Moon, Sun} from 'lucide-react';
import {Theme} from '@astryxdesign/core/theme';
import '@astryxdesign/theme-neutral/theme.css';
import {Card} from '@astryxdesign/core/Card';
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
  plot: {
    backgroundColor: colorVars['--color-background-card'],
    padding: spacingVars['--spacing-4'],
  },

  radiusAnatomy: {position: 'relative'},
  cardCallout: {
    position: 'absolute',
    top: spacingVars['--spacing-2'],
    right: spacingVars['--spacing-2'],
    pointerEvents: 'none',
  },
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
  Reference:
    'Use neutral for a target or comparison value. Gray 1–5 belong to the sequential gray ramp, not a separate reference palette.',
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
    <Theme theme={neutralTheme} mode={mode}>
      <div {...stylex.props(styles.preview)}>
        <div
          role="img"
          aria-label={`${token}, ${mode}, ${strength * 100}%, ${label}`}
          {...stylex.props(styles.surface(surface))}>
          <div {...stylex.props(styles.fill(color, strength))} />
        </div>
      </div>
    </Theme>
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

function ChartStylingPreview() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <Card>
        <VStack gap={4} xstyle={styles.plot}>
          <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
            <VStack gap={1}>
              <Heading level={3}>Quarterly sales</Heading>
              <Text color="secondary">
                Compare sales by quarter against a $150k target.
              </Text>
            </VStack>
            <Button
              variant="ghost"
              size="lg"
              isIconOnly
              label={
                mode === 'dark'
                  ? 'Switch preview to light mode'
                  : 'Switch preview to dark mode'
              }
              tooltip={
                mode === 'dark'
                  ? 'Switch preview to light mode'
                  : 'Switch preview to dark mode'
              }
              icon={mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              onClick={() =>
                setMode(current => (current === 'dark' ? 'light' : 'dark'))
              }
            />
          </HStack>
          <RechartsThemingPreview />
        </VStack>
      </Card>
    </Theme>
  );
}

function ChartStylingTable({sections}: {sections: DocSection[]}) {
  const data = sections
    .filter(section => section.id === 'map-chart-parts')
    .flatMap(section =>
      section.content.flatMap(block =>
        block.type === 'table' ? (block.rows ?? []) : [],
      ),
    )
    .flatMap<{part: string; token: string | null}>(row => {
      const tokens = row[1].match(/--color-[a-z0-9-]+/g) ?? [];
      const part = row[0]
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`/g, '');
      return tokens.length > 0
        ? tokens.map(token => ({part, token}))
        : [{part, token: null}];
    });
  return (
    <Card>
      <Table
        data={data}
        columns={[
          {key: 'part', header: 'Chart part', width: pixel(192)},
          {
            key: 'token',
            header: 'Token',
            width: proportional(1),
            renderCell: row => (
              <Text>{row.token ?? 'Same token as the plotted series'}</Text>
            ),
          },
          {
            key: 'light',
            header: 'Light mode',
            width: pixel(152),
            renderCell: row =>
              row.token ? (
                <HStack gap={2} vAlign="center">
                  <ModePreview token={row.token} mode="light" strength={1} />
                  <Text type="code" color="secondary">
                    {modeTokens.light[row.token]}
                  </Text>
                </HStack>
              ) : (
                <Text color="secondary">Matches series</Text>
              ),
          },
          {
            key: 'dark',
            header: 'Dark mode',
            width: pixel(152),
            renderCell: row =>
              row.token ? (
                <HStack gap={2} vAlign="center">
                  <ModePreview token={row.token} mode="dark" strength={1} />
                  <Text type="code" color="secondary">
                    {modeTokens.dark[row.token]}
                  </Text>
                </HStack>
              ) : (
                <Text color="secondary">Matches series</Text>
              ),
          },
        ]}
        density="spacious"
        dividers="rows"
      />
    </Card>
  );
}

function ChartRadiusReference({sections}: {sections: DocSection[]}) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const section = sections.find(section => section.id === 'chart-radius');
  if (!section) {
    return null;
  }
  const plainText = (text: string) =>
    text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '');
  const descriptions = section.content.flatMap(block =>
    block.type === 'prose' ? [plainText(block.text ?? '')] : [],
  );
  const rows = section.content.flatMap(block =>
    block.type === 'table' ? (block.rows ?? []) : [],
  );
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading id="chart-radius" level={3}>
          {section.title}
        </Heading>
        {descriptions.map(text => (
          <Text key={text}>{text}</Text>
        ))}
      </VStack>
      <Theme theme={neutralTheme} mode={mode}>
        <Card xstyle={styles.radiusAnatomy}>
          <div {...stylex.props(styles.cardCallout)}>
            <AnatomyNumber value={1} />
          </div>
          <VStack gap={4} xstyle={styles.plot}>
            <HStack hAlign="between" vAlign="start" gap={4}>
              <VStack gap={1}>
                <Heading level={4}>Chart anatomy</Heading>
                <Text color="secondary">
                  Hover a bar to see its sales and target details.
                </Text>
              </VStack>
              <Button
                variant="ghost"
                isIconOnly
                size="lg"
                label={
                  mode === 'dark'
                    ? 'Switch anatomy to light mode'
                    : 'Switch anatomy to dark mode'
                }
                tooltip={
                  mode === 'dark'
                    ? 'Switch anatomy to light mode'
                    : 'Switch anatomy to dark mode'
                }
                icon={mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                onClick={() =>
                  setMode(current => (current === 'dark' ? 'light' : 'dark'))
                }
              />
            </HStack>
            <RechartsThemingPreview anatomy />
          </VStack>
        </Card>
      </Theme>
      <Card>
        <Table
          data={rows.map((row, index) => ({
            number: index + 1,
            part: plainText(row[0]),
            radius: plainText(row[1]),
            treatment: plainText(row[2]),
          }))}
          columns={[
            {
              key: 'number',
              header: '',
              width: pixel(48),
              renderCell: row => <AnatomyNumber value={row.number} />,
            },
            {key: 'part', header: 'Chart part', width: pixel(160)},
            {key: 'radius', header: 'Radius', width: pixel(180)},
            {
              key: 'treatment',
              header: 'Treatment',
              width: proportional(1, {minWidth: 240}),
            },
          ]}
          density="spacious"
          dividers="rows"
        />
      </Card>
    </VStack>
  );
}

function CopyTokensButton({rows}: {rows: string[][]}) {
  const {copy, isCopied} = useClipboard({announce: 'Tokens copied'});
  const announce = useAnnounce();
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
        onClick={async () => {
          const didCopy = await copy(text);
          setFailed(!didCopy);
          if (!didCopy) {
            announce('Could not copy. Try again.', 'assertive');
          }
        }}
      />
      {failed && <Text type="supporting">Could not copy. Try again.</Text>}
    </VStack>
  );
}

function SetSection({section}: {section: DocSection}) {
  const groups = colorGroups(section);
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <HStack hAlign="between" vAlign="center" gap={3}>
          <Heading id={section.title.toLowerCase()} level={2}>
            {section.title}
          </Heading>
          {groups.length === 1 && <CopyTokensButton rows={groups[0].rows} />}
        </HStack>
        <Text>{PURPOSE[section.title]}</Text>
      </VStack>
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
    <DocPageLayout
      title={title}
      description={description}
      titleDescriptionGap={1}>
      <VStack gap={10}>
        {sets.map(section => (
          <SetSection key={section.id} section={section} />
        ))}
        <VStack gap={6}>
          <VStack gap={1}>
            <Heading id="chart-styling" level={2}>
              Chart styling
            </Heading>
            <Text>
              Use data colors for series and reference lines, and text, border,
              and surface colors for the parts around them.
            </Text>
          </VStack>
          <ChartStylingPreview />
          <ChartStylingTable sections={stylingSections} />
          <ChartRadiusReference sections={stylingSections} />
        </VStack>
      </VStack>
    </DocPageLayout>
  );
}
