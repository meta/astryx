// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Meta, StoryObj} from '@storybook/react';
import * as React from 'react';
import {Theme, defineTheme, useTheme} from '@astryxdesign/core/theme';
import {Card} from '@astryxdesign/core/Card';
import {Stack} from '@astryxdesign/core/Stack';
import {Heading} from '@astryxdesign/core/Text';
import {Badge} from '@astryxdesign/core/Badge';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import {neutralTheme} from '@astryxdesign/theme-neutral';

// =============================================================================
// Sample data for the chart
// =============================================================================

const CHART_DATA = [
  {label: 'Mon', value: 42},
  {label: 'Tue', value: 78},
  {label: 'Wed', value: 56},
  {label: 'Thu', value: 91},
  {label: 'Fri', value: 64},
  {label: 'Sat', value: 35},
  {label: 'Sun', value: 48},
];

const MULTI_SERIES = [
  {label: 'Q1', series: [120, 90, 70]},
  {label: 'Q2', series: [140, 110, 85]},
  {label: 'Q3', series: [100, 130, 95]},
  {label: 'Q4', series: [160, 105, 120]},
];

// =============================================================================
// Chart component using useTheme
// =============================================================================

/**
 * A simple SVG bar chart that reads theme tokens via useTheme.
 * Demonstrates how data viz components can use raw token values
 * without CSS custom properties or DOM reads.
 */
function ThemeAwareBarChart({
  data,
  width = 400,
  height = 200,
}: {
  data: typeof CHART_DATA;
  width?: number;
  height?: number;
}) {
  const {token} = useTheme();

  const maxValue = Math.max(...data.map(d => d.value));
  const barWidth = (width - 60) / data.length - 8;
  const chartHeight = height - 40;

  return (
    <svg width={width} height={height} role="img" aria-label="Bar chart">
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map(pct => {
        const y = chartHeight - chartHeight * pct + 20;
        return (
          <g key={pct}>
            <line
              x1={50}
              y1={y}
              x2={width - 10}
              y2={y}
              stroke={token('--color-border')}
              strokeDasharray="4 4"
            />
            <text
              x={45}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              fill={token('--color-text-secondary')}>
              {Math.round(maxValue * pct)}
            </text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barHeight = (d.value / maxValue) * chartHeight;
        const x = 55 + i * (barWidth + 8);
        const y = chartHeight - barHeight + 20;

        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={token('--color-accent')}
            />
            <text
              x={x + barWidth / 2}
              y={height - 5}
              textAnchor="middle"
              fontSize={11}
              fill={token('--color-text-secondary')}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * A multi-series grouped bar chart demonstrating multiple color tokens.
 */
function ThemeAwareGroupedChart({
  data,
  width = 480,
  height = 220,
}: {
  data: typeof MULTI_SERIES;
  width?: number;
  height?: number;
}) {
  const {token} = useTheme();

  const seriesColors = [
    token('--color-accent'),
    token('--color-success'),
    token('--color-warning'),
  ];
  const seriesLabels = ['Revenue', 'Users', 'Sessions'];

  const maxValue = Math.max(...data.flatMap(d => d.series));
  const groupWidth = (width - 80) / data.length;
  const barWidth = (groupWidth - 16) / 3;
  const chartHeight = height - 50;

  return (
    <div>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Grouped bar chart">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(pct => {
          const y = chartHeight - chartHeight * pct + 20;
          return (
            <line
              key={pct}
              x1={55}
              y1={y}
              x2={width - 10}
              y2={y}
              stroke={token('--color-border')}
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Grouped bars */}
        {data.map((group, gi) => {
          const groupX = 60 + gi * groupWidth;
          return (
            <g key={group.label}>
              {group.series.map((value, si) => {
                const barHeight = (value / maxValue) * chartHeight;
                const x = groupX + si * (barWidth + 2);
                const y = chartHeight - barHeight + 20;
                return (
                  <rect
                    key={si}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={2}
                    fill={seriesColors[si]}
                    opacity={0.85}
                  />
                );
              })}
              <text
                x={groupX + (groupWidth - 16) / 2}
                y={height - 26}
                textAnchor="middle"
                fontSize={11}
                fill={token('--color-text-secondary')}>
                {group.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{display: 'flex', gap: 16, paddingLeft: 55}}>
        {seriesLabels.map((label, i) => (
          <div
            key={label}
            style={{display: 'flex', alignItems: 'center', gap: 6}}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: seriesColors[i],
                opacity: 0.85,
              }}
            />
            <span
              style={{
                fontSize: 11,
                color: token('--color-text-secondary'),
              }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Displays the raw token values for inspection.
 */
function TokenInspector() {
  const {token, mode, name} = useTheme();

  const inspectedTokens = [
    '--color-accent',
    '--color-success',
    '--color-warning',
    '--color-error',
    '--color-text-primary',
    '--color-text-secondary',
    '--color-background-surface',
    '--color-border',
    '--spacing-4',
    '--radius-element',
  ];

  return (
    <Card>
      <Stack direction="vertical" gap={2}>
        <Stack direction="horizontal" gap={2} vAlign="center">
          <Heading level={4}>Token Inspector</Heading>
          <Badge label={name} />
          <Badge variant={mode === 'dark' ? 'neutral' : 'info'} label={mode} />
        </Stack>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '4px 16px',
            fontFamily: 'monospace',
            fontSize: 12,
          }}>
          {inspectedTokens.map(tokenName => (
            <React.Fragment key={tokenName}>
              <span style={{color: token('--color-text-secondary')}}>
                {tokenName}
              </span>
              <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                {tokenName.startsWith('--color-') && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      backgroundColor: token(tokenName),
                      border: `1px solid ${token('--color-border-emphasized')}`,
                    }}
                  />
                )}
                <code>{token(tokenName)}</code>
              </span>
            </React.Fragment>
          ))}
        </div>
      </Stack>
    </Card>
  );
}

// =============================================================================
// Custom theme for demonstrating override behavior
// =============================================================================

const oceanTheme = defineTheme({
  name: 'ocean',
  tokens: {
    '--color-accent': ['#0077B6', '#48CAE4'],
    '--color-success': ['#2D6A4F', '#52B788'],
    '--color-warning': ['#E76F51', '#F4A261'],
    '--color-background-surface': ['#F0F8FF', '#0A1628'],
    '--color-text-primary': ['#023E8A', '#CAF0F8'],
    '--color-text-secondary': ['#4A7FB5', '#89C2D9'],
    '--color-border': ['#ADE8F433', '#02394A66'],
  },
  typography: {scale: {base: 14, ratio: 1.2}},
});

// =============================================================================
// Stories
// =============================================================================

const meta: Meta = {
  title: 'Core/Themes/Theme',
  parameters: {
    docs: {
      description: {
        component:
          '`Theme` applies a theme to its children via CSS custom properties and ' +
          'provides programmatic token access through `useTheme()`.\n\n' +
          '`useTheme()` returns resolved token values for the current color mode, ' +
          'designed for non-CSS consumers like data visualization libraries, canvas rendering, ' +
          'and SVG charts that need concrete values (hex colors, px values) rather than ' +
          'CSS custom property references.\n\n' +
          '**No double render.** Values are available on first paint; no `getComputedStyle` ' +
          'or `useEffect` needed.',
      },
    },
  },
};

export default meta;

/**
 * A simple bar chart using `useTheme` to read token values.
 * The chart colors, text, and grid lines all come from the theme.
 */
export const BarChart: StoryObj = {
  render: () => (
    <Theme theme={neutralTheme} mode="light">
      <Stack direction="vertical" gap={4}>
        <Heading level={3}>Weekly Activity</Heading>
        <Card>
          <ThemeAwareBarChart data={CHART_DATA} />
        </Card>
      </Stack>
    </Theme>
  ),
};

/**
 * The same chart in dark mode \u2014 token values automatically resolve
 * to their dark variants.
 */
export const BarChartDark: StoryObj = {
  render: () => (
    <Theme theme={neutralTheme} mode="dark">
      <Stack direction="vertical" gap={4}>
        <Heading level={3}>Weekly Activity</Heading>
        <Card>
          <ThemeAwareBarChart data={CHART_DATA} />
        </Card>
      </Stack>
    </Theme>
  ),
};

/**
 * A grouped bar chart using multiple color tokens (accent, success, warning)
 * to differentiate data series.
 */
export const GroupedChart: StoryObj = {
  render: () => (
    <Theme theme={neutralTheme} mode="light">
      <Stack direction="vertical" gap={4}>
        <Heading level={3}>Quarterly Metrics</Heading>
        <Card>
          <ThemeAwareGroupedChart data={MULTI_SERIES} />
        </Card>
      </Stack>
    </Theme>
  ),
};

/**
 * Side-by-side comparison: same chart rendered with two different themes.
 * The ocean theme overrides accent, success, and warning colors.
 */
export const ThemeComparison: StoryObj = {
  render: () => (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
      <Theme theme={neutralTheme} mode="light">
        <Stack direction="vertical" gap={2}>
          <Heading level={4}>Default Theme</Heading>
          <Card>
            <ThemeAwareGroupedChart data={MULTI_SERIES} width={360} />
          </Card>
        </Stack>
      </Theme>
      <Theme theme={oceanTheme} mode="light">
        <Stack direction="vertical" gap={2}>
          <Heading level={4}>Ocean Theme</Heading>
          <Card>
            <ThemeAwareGroupedChart data={MULTI_SERIES} width={360} />
          </Card>
        </Stack>
      </Theme>
    </div>
  ),
};

/**
 * Shows the raw resolved token values for both themes side by side.
 * Useful for debugging and understanding what values your charts receive.
 */
export const TokenInspectorStory: StoryObj = {
  name: 'Token Inspector',
  render: () => (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
      <Theme theme={neutralTheme} mode="light">
        <TokenInspector />
      </Theme>
      <Theme theme={oceanTheme} mode="dark">
        <TokenInspector />
      </Theme>
    </div>
  ),
};

const pressTheme = defineTheme({
  name: 'themed-press',
  components: {
    button: {
      base: {':active': {backgroundColor: '#7c3aed', color: '#ffffff'}},
    },
    item: {
      base: {':active': {backgroundColor: '#ede9fe'}},
    },
  },
});

const PRESS_ROWS = Array.from({length: 30}, (_, index) => `Row ${index + 1}`);

/**
 * A theme that overrides `:active` on Button and on list rows. With a mouse
 * the theme's press paints on `:active`. Under a finger it follows the touch
 * press model: it paints once the press is believed, never on the touch
 * itself or through a scroll.
 */
export const ThemedPress: StoryObj = {
  name: 'Themed press',
  render: () => (
    <Theme theme={pressTheme} mode="light">
      <Stack direction="vertical" gap={3}>
        <Button label="Themed button" variant="secondary" onClick={() => {}} />
        <div style={{height: 320, overflowY: 'auto'}}>
          <List aria-label="Themed rows">
            {PRESS_ROWS.map(row => (
              <ListItem key={row} label={row} onClick={() => {}} />
            ))}
          </List>
        </div>
      </Stack>
    </Theme>
  ),
};
