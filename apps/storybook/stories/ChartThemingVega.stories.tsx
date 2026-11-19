// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useMemo, useRef, useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {Button, Card, Stack, Text} from '@astryxdesign/core';
import {Theme, defineTheme, useTheme} from '@astryxdesign/core/theme';
import {radiusVars} from '@astryxdesign/core/theme/tokens.stylex';
import {VegaChart, type AnySpec} from '@astryxdesign/vega';
import type {Config} from 'vega-lite';
import {Heading} from '@astryxdesign/core/Text';
import {useCssLengthInPixels} from './chartThemingUtils';

const meta: Meta<typeof VegaChart> = {
  title: 'Lab/ChartTheming/Vega',
  component: VegaChart,
  parameters: {
    docs: {
      description: {
        component:
          'Guide evidence for configuration-driven rendering with the existing Astryx Vega package. Theme values are concrete and JSON-safe; changing compile configuration rebuilds the current Vega View and can reset renderer-owned state.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

const styles = stylex.create({
  chart: {
    borderRadius: radiusVars['--radius-container'],
    overflow: 'hidden',
  },
});

const vegaTheme = defineTheme({
  name: 'chart-theming-vega',
  tokens: {
    '--color-data-categorical-blue': ['#005A4E', '#72E1C1'],
    '--color-data-categorical-orange': ['#7A2E00', '#FFB280'],
  },
});

function useVegaLiteThemeConfig(): Config {
  const {token} = useTheme();
  return useMemo(
    () => ({
      background: token('--color-background-card'),
      axis: {
        domainColor: token('--color-border-emphasized'),
        gridColor: token('--color-border'),
        labelColor: token('--color-text-secondary'),
        labelFont: token('--font-family-body'),
        titleColor: token('--color-text-primary'),
        titleFont: token('--font-family-heading'),
      },
      legend: {
        labelColor: token('--color-text-secondary'),
        labelFont: token('--font-family-body'),
        titleColor: token('--color-text-primary'),
        titleFont: token('--font-family-heading'),
      },
      range: {
        category: [
          token('--color-data-categorical-blue'),
          token('--color-data-categorical-orange'),
          token('--color-data-categorical-purple'),
          token('--color-data-categorical-green'),
        ],
      },
      title: {
        color: token('--color-text-primary'),
        font: token('--font-family-heading'),
      },
      view: {stroke: null},
    }),
    [token],
  );
}

const values = [
  {quarter: 'Q1', series: 'Revenue', value: 128},
  {quarter: 'Q1', series: 'Costs', value: 82},
  {quarter: 'Q2', series: 'Revenue', value: 156},
  {quarter: 'Q2', series: 'Costs', value: 94},
  {quarter: 'Q3', series: 'Revenue', value: 143},
  {quarter: 'Q3', series: 'Costs', value: 101},
  {quarter: 'Q4', series: 'Revenue', value: 184},
  {quarter: 'Q4', series: 'Costs', value: 112},
];

function VegaThemeExample() {
  const {token} = useTheme();
  const [generation, setGeneration] = useState(0);
  const latestView = useRef<unknown>(null);
  const radius = useCssLengthInPixels(token('--radius-element'));
  const categoryColor = token('--color-data-categorical-blue');

  const config = useVegaLiteThemeConfig();
  const serializedConfig = JSON.stringify(config);

  const spec = useMemo<AnySpec>(
    () => ({
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      data: {name: 'table'},
      description:
        'Quarterly revenue and costs: Q1 128 and 82, Q2 156 and 94, Q3 143 and 101, Q4 184 and 112.',
      title: 'Quarterly performance',
      mark: {
        type: 'bar',
        cornerRadiusTopLeft: radius,
        cornerRadiusTopRight: radius,
      },
      encoding: {
        x: {
          axis: {title: 'Quarter'},
          field: 'quarter',
          type: 'ordinal',
        },
        y: {
          axis: {title: 'Value'},
          field: 'value',
          type: 'quantitative',
        },
        color: {
          field: 'series',
          legend: {title: 'Series'},
          type: 'nominal',
        },
        tooltip: [
          {field: 'quarter', type: 'ordinal'},
          {field: 'series', type: 'nominal'},
          {field: 'value', type: 'quantitative'},
        ],
      },
    }),
    [radius],
  );

  return (
    <Stack direction="vertical" gap={3}>
      <div
        {...stylex.props(styles.chart)}
        data-category-color={categoryColor}
        data-config={serializedConfig}
        data-radius={radius}
        data-view-generation={generation}>
        <VegaChart
          compileOptions={{config}}
          data={{table: values}}
          onReady={view => {
            if (latestView.current !== view) {
              latestView.current = view;
              setGeneration(current => current + 1);
            }
          }}
          spec={spec}
          viewOptions={{renderer: 'canvas'}}
        />
      </div>
      <Text type="supporting" color="secondary">
        View generation: {generation}. Changing concrete config rebuilds the
        Vega View, so products must restore any zoom, hover, or signal state
        they own.
      </Text>
    </Stack>
  );
}

function RuntimeVegaThemeSwitch() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  return (
    <Theme theme={vegaTheme} mode={mode}>
      <Card>
        <Stack direction="vertical" gap={4}>
          <Stack direction="vertical" gap={1}>
            <Heading level={3}>Quarterly revenue</Heading>
            <Text type="supporting" color="secondary">
              Vega receives concrete, serializable colors and theme typography.
            </Text>
          </Stack>
          <Button
            label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
            onClick={() =>
              setMode(current => (current === 'light' ? 'dark' : 'light'))
            }
          />
          <VegaThemeExample />
        </Stack>
      </Card>
    </Theme>
  );
}

export const SerializedCanvasConfig: Story = {
  render: () => <RuntimeVegaThemeSwitch />,
  play: async ({canvasElement}) => {
    const wrapper = canvasElement.querySelector<HTMLElement>(
      '[data-view-generation]',
    );
    expect(wrapper).not.toBeNull();
    if (!wrapper) {
      return;
    }

    const readConfig = () =>
      JSON.parse(wrapper.dataset.config ?? '{}') as Config & {
        axis?: {
          domainColor?: string;
          gridColor?: string;
          titleFont?: string;
        };
        range?: {category?: string[]};
      };

    await waitFor(() => {
      expect(Number(wrapper.dataset.viewGeneration)).toBeGreaterThan(0);
      expect(wrapper.dataset.categoryColor).toBe('#005A4E');
      expect(Number(wrapper.dataset.radius)).toBeGreaterThan(5);
      expect(wrapper.dataset.config).not.toContain('var(');
      const config = readConfig();
      expect(config.axis?.domainColor).toBeTruthy();
      expect(config.axis?.gridColor).toBeTruthy();
      expect(config.axis?.titleFont).toBeTruthy();
      expect(config.range?.category?.slice(0, 2)).toEqual([
        '#005A4E',
        '#7A2E00',
      ]);
      expect(wrapper.querySelector('canvas')).not.toBeNull();
    });
    const firstGeneration = Number(wrapper.dataset.viewGeneration);
    const firstCanvas = wrapper.querySelector('canvas');

    const modeButton = within(canvasElement).getByRole('button', {
      name: 'Switch to dark mode',
    });
    await userEvent.click(modeButton);

    await waitFor(() => {
      expect(wrapper.dataset.categoryColor).toBe('#72E1C1');
      expect(readConfig().range?.category?.slice(0, 2)).toEqual([
        '#72E1C1',
        '#FFB280',
      ]);
      expect(Number(wrapper.dataset.viewGeneration)).toBeGreaterThan(
        firstGeneration,
      );
      expect(wrapper.querySelector('canvas')).not.toBe(firstCanvas);
    });
  },
};
