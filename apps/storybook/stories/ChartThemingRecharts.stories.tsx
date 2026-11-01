// Copyright (c) Meta Platforms, Inc. and affiliates.

import {useState} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {Meta, StoryObj} from '@storybook/react';
import {expect, fireEvent, userEvent, waitFor, within} from 'storybook/test';
import {Button, Card, Stack, Text} from '@astryxdesign/core';
import {Theme, defineTheme, useTheme} from '@astryxdesign/core/theme';
import {Heading} from '@astryxdesign/core/Text';
import {useCssLengthInPixels} from './chartThemingUtils';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {
  colorVars,
  radiusVars,
  shadowVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '@astryxdesign/core/theme/tokens.stylex';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';

const meta: Meta = {
  title: 'Lab/ChartTheming/Recharts',
  parameters: {
    docs: {
      description: {
        component:
          'This example passes public Astryx values to verified Recharts SVG and HTML paint props without an Astryx-specific adapter.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

const styles = stylex.create({
  chart: {
    height: 320,
    width: '100%',
  },
  legendItem: {
    alignItems: 'center',
    display: 'flex',
    gap: spacingVars['--spacing-1'],
  },
  legendList: {
    display: 'flex',
    gap: spacingVars['--spacing-3'],
    justifyContent: 'center',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
  },
  tableCell: {
    borderBottomColor: colorVars['--color-border'],
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    textAlign: 'start',
  },
  tooltip: {
    backgroundColor: colorVars['--color-background-card'],
    borderColor: colorVars['--color-border'],
    borderRadius: radiusVars['--radius-element'],
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: shadowVars['--shadow-med'],
    color: colorVars['--color-text-primary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    padding: spacingVars['--spacing-2'],
  },
  tooltipRow: {
    alignItems: 'center',
    display: 'flex',
    gap: spacingVars['--spacing-1'],
    justifyContent: 'space-between',
  },
});

const data = [
  {quarter: 'Q1', revenue: 128, costs: 82},
  {quarter: 'Q2', revenue: 156, costs: 94},
  {quarter: 'Q3', revenue: 143, costs: 101},
  {quarter: 'Q4', revenue: 184, costs: 112},
];

const series = {
  revenue: dataVars['--color-data-categorical-blue'],
  costs: dataVars['--color-data-categorical-orange'],
};

const hoverSeries = {
  revenue: `color-mix(in srgb, ${series.revenue} 88%, ${colorVars['--color-tint-hover']})`,
  costs: `color-mix(in srgb, ${series.costs} 88%, ${colorVars['--color-tint-hover']})`,
};

const seriesDefinitions = [
  {key: 'revenue', label: 'Revenue', color: series.revenue},
  {key: 'costs', label: 'Costs', color: series.costs},
] as const;

function SeriesCue({color}: {color: string}) {
  return (
    <svg aria-hidden="true" focusable="false" height="12" width="28">
      <line stroke={color} strokeWidth="3" x1="1" x2="27" y1="6" y2="6" />
    </svg>
  );
}

function SeriesLegend() {
  return (
    <ul {...stylex.props(styles.legendList)} aria-label="Chart series">
      {seriesDefinitions.map(definition => (
        <li {...stylex.props(styles.legendItem)} key={definition.key}>
          <SeriesCue color={definition.color} />
          <Text type="supporting">{definition.label}</Text>
        </li>
      ))}
    </ul>
  );
}

function SeriesTooltip({active, label, payload}: TooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div {...stylex.props(styles.tooltip)} data-chart-tooltip role="status">
      <Text type="supporting">{label}</Text>
      {payload.map(entry => {
        const definition = seriesDefinitions.find(
          candidate => candidate.key === String(entry.dataKey),
        );
        if (!definition) {
          return null;
        }
        return (
          <div
            {...stylex.props(styles.tooltipRow)}
            data-series-cue={definition.key}
            key={definition.key}>
            <span {...stylex.props(styles.legendItem)}>
              <SeriesCue color={definition.color} />
              {definition.label}
            </span>
            <span>{String(entry.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ExactValuesTable() {
  return (
    <table {...stylex.props(styles.table)}>
      <caption>Quarterly performance values</caption>
      <thead>
        <tr>
          <th {...stylex.props(styles.tableCell)} scope="col">
            Quarter
          </th>
          <th {...stylex.props(styles.tableCell)} scope="col">
            Revenue
          </th>
          <th {...stylex.props(styles.tableCell)} scope="col">
            Costs
          </th>
        </tr>
      </thead>
      <tbody>
        {data.map(row => (
          <tr key={row.quarter}>
            <th {...stylex.props(styles.tableCell)} scope="row">
              {row.quarter}
            </th>
            <td {...stylex.props(styles.tableCell)}>{row.revenue}</td>
            <td {...stylex.props(styles.tableCell)}>{row.costs}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const customSeriesTheme = defineTheme({
  name: 'chart-theming-custom-series',
  tokens: {
    '--color-data-categorical-blue': ['#005A4E', '#72E1C1'],
    '--color-data-categorical-orange': ['#7A2E00', '#FFB280'],
  },
});

const axisTickStyle = {
  fill: colorVars['--color-text-secondary'],
  fontFamily: typographyVars['--font-family-body'],
  fontSize: typeScaleVars['--text-supporting-size'],
};

function ThemeAwareRechartsExample({
  highlightRevenue = false,
  useThemeRadius = true,
}: {
  highlightRevenue?: boolean;
  useThemeRadius?: boolean;
} = {}) {
  const {token} = useTheme();
  const themeRadius = useCssLengthInPixels(token('--radius-element'));
  const barRadius = useThemeRadius ? themeRadius : 0;

  return (
    <Card>
      <Stack direction="vertical" gap={4}>
        <Stack direction="vertical" gap={1}>
          <Heading level={3}>
            {useThemeRadius
              ? 'Quarterly performance'
              : 'Quarterly performance — square bars'}
          </Heading>
          <Text type="supporting" color="secondary">
            {useThemeRadius
              ? 'Recharts uses the active Astryx theme for series, typography, hover, tooltip radius, and bar radius.'
              : 'This opt-out keeps the bars square while the rest of the chart continues to use the active Astryx theme.'}
          </Text>
        </Stack>
        <div
          {...stylex.props(styles.chart)}
          aria-label="Quarterly performance chart"
          data-bar-radius={barRadius}
          role="group">
          <ResponsiveContainer>
            <BarChart
              data={data}
              accessibilityLayer
              desc="Revenue and costs for Q1 through Q4"
              title="Quarterly performance">
              <CartesianGrid
                stroke={colorVars['--color-border']}
                strokeDasharray="4 4"
                vertical={false}
              />
              <XAxis
                dataKey="quarter"
                axisLine={{
                  stroke: colorVars['--color-border-emphasized'],
                }}
                tick={axisTickStyle}
                tickLine={{
                  stroke: colorVars['--color-border-emphasized'],
                }}
              />
              <YAxis axisLine={false} tick={axisTickStyle} tickLine={false} />
              <Tooltip
                content={props => <SeriesTooltip {...props} />}
                cursor={{
                  fill: colorVars['--color-tint-hover'],
                  fillOpacity: 0.05,
                }}
              />
              <Legend content={<SeriesLegend />} />
              <Bar
                activeBar={{fill: hoverSeries.revenue}}
                dataKey="revenue"
                fill={highlightRevenue ? hoverSeries.revenue : series.revenue}
                isAnimationActive={false}
                name="Revenue"
                radius={[barRadius, barRadius, 0, 0]}
              />
              <Bar
                activeBar={{fill: hoverSeries.costs}}
                dataKey="costs"
                fill={series.costs}
                isAnimationActive={false}
                name="Costs"
                radius={[barRadius, barRadius, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ExactValuesTable />
      </Stack>
    </Card>
  );
}

function CustomDataTokenThemeExample() {
  return (
    <Theme theme={customSeriesTheme} mode="light">
      <ThemeAwareRechartsExample />
    </Theme>
  );
}

function RuntimeThemeSwitchExample() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  return (
    <Theme theme={customSeriesTheme} mode={mode}>
      <Stack direction="vertical" gap={3}>
        <Button
          label={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
          onClick={() =>
            setMode(current => (current === 'light' ? 'dark' : 'light'))
          }
        />
        <ThemeAwareRechartsExample />
      </Stack>
    </Theme>
  );
}

function ThemeTokensExample() {
  const [highlightRevenue, setHighlightRevenue] = useState(false);
  return (
    <Stack direction="vertical" gap={3}>
      <Button
        label={
          highlightRevenue ? 'Clear Revenue highlight' : 'Highlight Revenue'
        }
        onClick={() => setHighlightRevenue(current => !current)}
      />
      <ThemeAwareRechartsExample highlightRevenue={highlightRevenue} />
    </Stack>
  );
}

const BAR_SELECTORS = {
  revenue: `.recharts-bar-rectangle path[fill="${series.revenue}"]`,
  costs: `.recharts-bar-rectangle path[fill="${series.costs}"]`,
} as const;

async function barFills(
  canvasElement: HTMLElement,
): Promise<Record<keyof typeof BAR_SELECTORS, string>> {
  const fills = {revenue: '', costs: ''};
  await waitFor(() => {
    for (const [seriesName, selector] of Object.entries(BAR_SELECTORS)) {
      const bar = canvasElement.querySelector<SVGElement>(selector);
      expect(bar).not.toBeNull();
      if (bar) {
        fills[seriesName as keyof typeof BAR_SELECTORS] =
          getComputedStyle(bar).fill;
      }
    }
    expect(Object.values(fills)).not.toContain('');
  });
  return fills;
}

function resolveSvgFill(reference: SVGElement, fill: string): string {
  const svg = reference.ownerSVGElement;
  if (!svg) {
    throw new Error('Expected the chart bar to belong to an SVG surface.');
  }
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  probe.setAttribute('fill', fill);
  probe.setAttribute('height', '1');
  probe.setAttribute('width', '1');
  probe.setAttribute('x', '-2');
  probe.setAttribute('y', '-2');
  probe.style.visibility = 'hidden';
  svg.appendChild(probe);
  const resolved = getComputedStyle(probe).fill;
  probe.remove();
  return resolved;
}

export const ThemeTokens: Story = {
  render: () => <ThemeTokensExample />,
  play: async ({canvasElement}) => {
    const restingFills = await barFills(canvasElement);
    expect(
      within(canvasElement).getByRole('group', {
        name: 'Quarterly performance chart',
      }),
    ).toBeVisible();
    const revenueBar = canvasElement.querySelector<SVGElement>(
      BAR_SELECTORS.revenue,
    );
    const costsBar = canvasElement.querySelector<SVGElement>(
      BAR_SELECTORS.costs,
    );
    expect(revenueBar).not.toBeNull();
    expect(costsBar).not.toBeNull();
    expect(revenueBar).not.toHaveAttribute('stroke');
    expect(costsBar).not.toHaveAttribute('stroke');
    if (revenueBar) {
      const expectedActiveFill = resolveSvgFill(
        revenueBar,
        hoverSeries.revenue,
      );
      const bounds = revenueBar.getBoundingClientRect();
      fireEvent.mouseMove(revenueBar, {
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
      });
      await waitFor(() => {
        const cursor = canvasElement.querySelector('.recharts-tooltip-cursor');
        expect(cursor).toHaveAttribute('fill', colorVars['--color-tint-hover']);
        expect(cursor).toHaveAttribute('fill-opacity', '0.05');
        const activeBar = canvasElement.querySelector(
          '.recharts-active-bar path',
        );
        expect(activeBar).toHaveAttribute('fill', hoverSeries.revenue);
        expect(activeBar).not.toHaveAttribute('stroke');
        expect(
          canvasElement.querySelector('[data-chart-tooltip]'),
        ).toBeVisible();
        expect(
          canvasElement.querySelector('[data-series-cue="costs"]'),
        ).toBeVisible();
      });
      expect(expectedActiveFill).not.toBe(restingFills.revenue);
      await userEvent.click(
        within(canvasElement).getByRole('button', {
          name: 'Highlight Revenue',
        }),
      );
      await waitFor(() => {
        const highlightedRevenueBar = Array.from(
          canvasElement.querySelectorAll<SVGElement>(
            '.recharts-bar-rectangle path',
          ),
        ).find(bar => bar.getAttribute('fill') === hoverSeries.revenue);
        expect(highlightedRevenueBar).not.toBeUndefined();
        if (highlightedRevenueBar) {
          expect(getComputedStyle(highlightedRevenueBar).fill).toBe(
            expectedActiveFill,
          );
          expect(highlightedRevenueBar).not.toHaveAttribute('stroke');
        }
      });
    }
    const radius = Number(
      canvasElement
        .querySelector('[data-bar-radius]')
        ?.getAttribute('data-bar-radius'),
    );
    expect(Number.isFinite(radius)).toBe(true);
    expect(radius).toBeGreaterThan(5);
    expect(revenueBar?.getAttribute('d')).toContain(`A ${radius},${radius}`);
    expect(
      canvasElement.querySelector('.recharts-cartesian-grid line'),
    ).toHaveAttribute('stroke', colorVars['--color-border']);
    expect(
      canvasElement.querySelector('.recharts-cartesian-axis-tick-value'),
    ).toHaveAttribute('fill', colorVars['--color-text-secondary']);
    const legend = within(canvasElement).getByRole('list', {
      name: 'Chart series',
    });
    expect(legend).toBeVisible();
    expect(legend.querySelector('li:last-child line')).not.toHaveAttribute(
      'stroke-dasharray',
    );
    expect(
      within(canvasElement).getByText('Quarterly performance values'),
    ).toBeVisible();
  },
};

export const SquareBars: Story = {
  render: () => <ThemeAwareRechartsExample useThemeRadius={false} />,
  play: async ({canvasElement}) => {
    await barFills(canvasElement);
    expect(canvasElement.querySelector('[data-bar-radius]')).toHaveAttribute(
      'data-bar-radius',
      '0',
    );
    expect(
      canvasElement
        .querySelector<SVGElement>(BAR_SELECTORS.revenue)
        ?.getAttribute('d'),
    ).not.toContain('A ');
    expect(
      within(canvasElement).getByRole('heading', {
        name: 'Quarterly performance — square bars',
      }),
    ).toBeVisible();
  },
};

export const CustomDataTokens: Story = {
  render: () => <CustomDataTokenThemeExample />,
  play: async ({canvasElement}) => {
    expect(await barFills(canvasElement)).toEqual({
      revenue: 'rgb(0, 90, 78)',
      costs: 'rgb(122, 46, 0)',
    });
  },
};

export const RuntimeThemeSwitch: Story = {
  render: () => <RuntimeThemeSwitchExample />,
  play: async ({canvasElement}) => {
    expect(await barFills(canvasElement)).toEqual({
      revenue: 'rgb(0, 90, 78)',
      costs: 'rgb(122, 46, 0)',
    });

    const surface = canvasElement.querySelector<SVGSVGElement>(
      'svg.recharts-surface',
    );
    const focusTarget = surface;
    expect(surface).not.toBeNull();
    expect(focusTarget).not.toBeNull();
    focusTarget?.focus();
    expect(document.activeElement).toBe(focusTarget);

    const button = canvasElement.querySelector('button');
    expect(button).toHaveTextContent('Switch to dark mode');
    button?.click();

    await waitFor(async () => {
      expect(await barFills(canvasElement)).toEqual({
        revenue: 'rgb(114, 225, 193)',
        costs: 'rgb(255, 178, 128)',
      });
    });
    expect(canvasElement.querySelector('svg.recharts-surface')).toBe(surface);
    expect(document.activeElement).toBe(focusTarget);
  },
};
