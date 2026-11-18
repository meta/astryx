// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Compact visual reference for data-color sets.
 * @input Authored set tables and canonical Neutral theme values.
 * @output One readable palette with token names and paired mode previews.
 * @position The Color sets subpage under Data visualization.
 */

import {useEffect, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Card} from '@astryxdesign/core/Card';
import {Collapsible} from '@astryxdesign/core/Collapsible';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Selector} from '@astryxdesign/core/Selector';
import {Tab, TabList} from '@astryxdesign/core/TabList';
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
  tabs: {maxWidth: '100%', minWidth: 0},
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
  controls: {maxWidth: '22rem'},
});

const PURPOSE: Record<string, string> = {
  Categorical:
    'Different categories, different colors. Keep each category’s color consistent across charts.',
  Sequential:
    'One measure, ordered from less to more. Choose a ramp and label the value ranges.',
  Reference: 'A quieter color for a comparison or a labeled target line.',
  Semantic:
    'A named status: positive, warning, negative, or neutral. Always label what the color means.',
  Diverging:
    'Two directions from a midpoint, such as above and below a target.',
  Spectrum:
    'A mixed-hue example with 10 positions but only 8 distinct colors. A single ramp is usually easier to read.',
  Heatmap:
    'Fill strength shows patterns in a table or grid. Keep the exact values visible.',
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

function Palette({rows}: {rows: string[][]}) {
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
            width: pixel(260),
            renderCell: row => (
              <VStack gap={1}>
                <Text>{row.token}</Text>
                {row.strength !== 1 && (
                  <Text type="supporting" color="secondary">
                    {row.strength * 100}% fill
                  </Text>
                )}
              </VStack>
            ),
          },
          {
            key: 'value',
            header: 'Value',
            width: proportional(1),
            renderCell: row => {
              const light = colorLabel(
                modeTokens.light[row.token],
                row.strength,
              );
              const dark = colorLabel(modeTokens.dark[row.token], row.strength);
              return (
                <HStack gap={2} vAlign="center">
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
                  <Text type="code" color="secondary">
                    {light === dark ? light : `${light} / ${dark}`}
                  </Text>
                </HStack>
              );
            },
          },
        ]}
        density="spacious"
        dividers="rows"
      />
    </Card>
  );
}

function SetPanel({section}: {section: DocSection}) {
  const groups = colorGroups(section);
  const [groupIndex, setGroupIndex] = useState('0');
  const group = groups[Number(groupIndex)] ?? groups[0];
  const rows = group?.rows ?? [];
  const changes = rows.some(
    row => modeTokens.light[row[1]] !== modeTokens.dark[row[1]],
  );
  const alpha = rows.some(row => row[2] !== '100%');
  return (
    <VStack gap={4}>
      <Heading level={2}>{section.title}</Heading>
      <Text>{PURPOSE[section.title]}</Text>
      {groups.length > 1 && (
        <div {...stylex.props(styles.controls)}>
          <Selector
            label={section.title === 'Sequential' ? 'Ramp' : 'Palette'}
            value={groupIndex}
            options={groups.map((item, i) => ({
              value: String(i),
              label: item.title,
            }))}
            onChange={setGroupIndex}
            width="100%"
          />
        </div>
      )}
      <Text type="supporting" color="secondary">
        {changes
          ? 'Gray and neutral change in dark mode.'
          : 'Same token colors in both modes.'}
        {alpha
          ? ' Transparent fills blend with the light or dark surface.'
          : ''}
        {section.title === 'Sequential' ? ' Shown dark → light (5 → 1).' : ''}
      </Text>
      {section.title === 'Semantic' && (
        <Text type="supporting" color="secondary">
          Warning yellow is an example, not an approved default.
        </Text>
      )}
      <Palette rows={rows} />
      <Collapsible trigger="Implementation details" defaultIsOpen={false}>
        <VStack gap={4}>
          {section.content
            .filter(block => block.type === 'prose' || block.type === 'code')
            .map((block, i) => (
              <ContentBlockRenderer key={i} block={block} />
            ))}
        </VStack>
      </Collapsible>
    </VStack>
  );
}

export function ColorSetsDocView({
  title,
  sections,
}: {
  title: string;
  description: string;
  sections: DocSection[];
}) {
  const sets = sections.filter(section => section.previewType === 'swatch');
  const [selected, setSelected] = useState('categorical');
  const keys = sets.map(section => section.title.toLowerCase());
  const keyString = keys.join('|');
  useEffect(() => {
    const restore = () => {
      const hash = window.location.hash.slice(1);
      const found = keyString
        .split('|')
        .find(key => hash === key || hash.startsWith(`${key}-`));
      setSelected(found ?? 'categorical');
    };
    restore();
    window.addEventListener('hashchange', restore);
    window.addEventListener('popstate', restore);
    return () => {
      window.removeEventListener('hashchange', restore);
      window.removeEventListener('popstate', restore);
    };
  }, [keyString]);
  const select = (value: string) => {
    setSelected(value);
    window.history.replaceState(window.history.state, '', `#${value}`);
  };
  return (
    <DocPageLayout
      title={title}
      description="Existing Astryx colors, shown in Neutral.">
      <VStack gap={6}>
        <TabList
          value="colors"
          onChange={() => {}}
          aria-label="Data visualization guides"
          hasDivider>
          <Tab
            value="colors"
            label="Color sets"
            href="/docs/visualization-color-sets"
          />
          <Tab
            value="styling"
            label="Chart styling"
            href="/docs/visualization#match-each-chart-part-to-an-existing-role"
          />
        </TabList>
        <TabList
          value={selected}
          onChange={select}
          role="tablist"
          aria-label="Color sets"
          size="sm"
          hasDivider
          xstyle={styles.tabs}>
          {sets.map((section, i) => (
            <Tab
              key={keys[i]}
              value={keys[i]}
              label={section.title}
              panelId={`set-${keys[i]}`}
            />
          ))}
        </TabList>
        {sets.map((section, i) => (
          <div
            key={keys[i]}
            id={`set-${keys[i]}`}
            role="tabpanel"
            aria-label={section.title}
            hidden={selected !== keys[i]}>
            {selected === keys[i] && (
              <SetPanel key={keys[i]} section={section} />
            )}
          </div>
        ))}
        <Text type="supporting" color="secondary">
          Composed palettes are examples, not new token families or approved
          defaults.
        </Text>
      </VStack>
    </DocPageLayout>
  );
}
