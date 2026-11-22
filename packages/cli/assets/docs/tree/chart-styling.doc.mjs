// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Apply existing theme roles to chart axes, grids, labels, surfaces, and detail views.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'chart-styling',
  title: 'Style the parts around your chart data',
  placement: {parent: 'namespace:visualization', slot: 'guides', order: 30},
  category: 'guide',
  description:
    'Use existing text, surface, border, typography, and spacing tokens for chart axes, grids, legends, and tooltips.',
  keywords: [
    'chart labels',
    'axis',
    'grid',
    'legend',
    'tooltip',
    'primary text',
    'secondary text',
    'Recharts',
    'chart chrome',
  ],
  sections: [
    {
      id: 'map-chart-parts',
      title: 'Match each chart part to an existing role',
      content: [
        {
          type: 'prose',
          text: 'Use data tokens for the marks that encode data, and general theme tokens for the text and surfaces around them. The table describes example choices, not a new chart-token API. {@link generic:choosing-data-colors} covers palette choice; {@link generic:data-colors-in-renderers} covers renderer delivery.',
        },
        {
          type: 'table',
          headers: ['Chart part', 'Token', 'How to use it'],
          rows: [
            [
              'Title and key values',
              '`--color-text-primary`',
              'Keep the main information prominent.',
            ],
            [
              'Tick labels, axis titles, legend labels, and supporting annotations',
              '`--color-text-secondary`',
              'Keep labels quieter than the chart title and key findings. Check them at their rendered size.',
            ],
            [
              'Axis or zero line',
              '`--color-border-emphasized`',
              'Uses Divider’s strong structural border. This example does not change ChartAxis’s current primary-color line.',
            ],
            [
              'Background grid',
              '`--color-border`',
              'Use subtle guides so the stronger axis stays distinct. This example does not change ChartGrid’s current emphasized default.',
            ],
            [
              'Neutral target or reference',
              '`--color-data-neutral`',
              'Label the value and use a dash or another distinct line treatment.',
            ],
            [
              'Plot surface',
              '`--color-background-card` or `--color-background-surface`',
              'Match the surface the chart actually owns.',
            ],
            [
              'Tooltip surface and border',
              '`--color-background-surface` and `--color-border`',
              'Use HoverCard’s background token for the tooltip surface.',
            ],
            [
              'Tooltip values',
              '`--color-text-primary`',
              'Show exact values and units.',
            ],
            [
              'Tooltip labels',
              '`--color-text-secondary`',
              'Keep supporting labels quieter than primary exact values.',
            ],
            [
              'Hover region',
              '`--color-overlay-hover`',
              'Combine the translucent tint with the plot background; do not replace a series color.',
            ],
            [
              'Legend keys and tooltip series markers',
              'The same data token as the plotted series',
              'Repeat its non-color cue too.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Use secondary text for tick, axis, legend, and supporting tooltip labels. Use primary text for titles and exact values. Astryx’s `Text type="label"` defaults to primary, while `type="supporting"` defaults to secondary, so set a chart label’s color explicitly when needed. These examples are not a change to those component defaults.',
        },
        {
          type: 'prose',
          text: 'Use the active theme’s body or heading font and text-role size. Tooltip geometry uses `--radius-container`, `--spacing-3`, and `--shadow-med`, as HoverCard does. Plot margins and tick placement remain renderer-owned. CSS token lengths may be rem; convert them against the actual font size only when an API requires numeric pixels.',
        },
      ],
    },
    {
      id: 'chart-radius',
      title: 'Radius',
      content: [
        {
          type: 'prose',
          text: 'Use container radius for chart cards and tooltip surfaces, and element radius for bars and filled legend keys. Limit corners to fit the mark without changing its value, scale, or baseline.',
        },
        {
          type: 'prose',
          text: 'For bars and filled legend keys, cap the radius at the smaller of the theme’s element radius, half the rendered width, and half the rendered height. Round that final bounded radius down to a whole CSS pixel. Never round data values, bar dimensions, scales, or baselines as part of this rule. The half-size cap is a geometric ceiling, not a guarantee that the mark keeps a square shape.',
        },
        {
          type: 'table',
          headers: ['Chart part', 'Radius', 'Treatment'],
          rows: [
            [
              'Chart card',
              '--radius-container',
              'Round the outer card, not the plot area inside it.',
            ],
            [
              'Tooltip surface',
              '--radius-container',
              'Render tooltip content in an Astryx Card with container radius, like HoverCard.',
            ],
            [
              'Bars',
              '--radius-element',
              'Round the end away from the baseline and keep the baseline square. Limit radius to half the bar’s width or height, then round it down to a whole CSS pixel. This changes the corners, not the bar’s length.',
            ],
            [
              'Filled legend keys',
              '--radius-element',
              'Use the theme’s element radius within the geometric cap, then round it down to a whole CSS pixel. An 8×8px key with 4px corners becomes a circle; use a smaller visual cap when the key needs to remain a rounded square.',
            ],
            [
              'Plot and hover region',
              '--radius-none',
              'Keep the plot and hover highlight rectangular. Apply the hover overlay without changing the series color.',
            ],
            [
              'Line and point legend keys',
              'Match the plotted mark',
              'Use the same line, dash pattern, or point shape as the plotted mark. For a dashed reference line, use a Recharts Curve with the same stroke and dash pattern.',
            ],
          ],
        },
      ],
    },
    {
      id: 'recharts-styled-example',
      title: 'Use secondary labels in a Recharts chart',
      content: [
        {
          type: 'prose',
          text: 'After the app’s Astryx and Recharts setup, render this component inside the active Theme. It uses secondary labels, a neutral dashed target, a themed tooltip, and an adjacent exact-value table. SVG text reads fill; HTML text reads color. The chart keeps its series identity and values when the theme changes.',
        },
        {
          type: 'code',
          lang: 'tsx',
          label:
            'Revenue chart with secondary labels and theme-aware supporting parts',
          code: `'use client';

import * as stylex from '@stylexjs/stylex';
import {Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps} from 'recharts';
import {Card, Heading, HStack, Text, VStack} from '@astryxdesign/core';
import {dataVars} from '@astryxdesign/core/theme/dataTokens.stylex';
import {colorVars, shadowVars, spacingVars, typographyVars, typeScaleVars} from '@astryxdesign/core/theme/tokens.stylex';

const styles = stylex.create({
  tooltip: {
    backgroundColor: colorVars['--color-background-surface'],
    boxShadow: shadowVars['--shadow-med'],
  },
});

const quarters = [
  {quarter: 'Q1', revenue: 128},
  {quarter: 'Q2', revenue: 156},
  {quarter: 'Q3', revenue: 143},
  {quarter: 'Q4', revenue: 184},
];

function RevenueDetails({active, payload, label}: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <Card padding={3} xstyle={styles.tooltip}>
      <VStack gap={2}>
        <Text weight="semibold">{String(label)}</Text>
        <HStack gap={4} hAlign="between"><Text color="secondary">Revenue ($ thousands)</Text><Text hasTabularNumbers>{String(payload[0].value)}</Text></HStack>
      </VStack>
    </Card>
  );
}

export function StyledRevenueChart() {
  const labelColor = colorVars['--color-text-secondary'];
  const tick = {
    fill: labelColor,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-body-size'],
  };
  return (
    <figure style={{margin: 0, padding: spacingVars['--spacing-4'], background: colorVars['--color-background-card'], color: colorVars['--color-text-primary'], fontFamily: typographyVars['--font-family-body']}}>
      <Heading level={3}>Quarterly revenue ($ thousands)</Heading>
      <Text color="secondary">Revenue is highest in Q4 at 184. The target is 150.</Text>
      <div style={{width: '100%', height: 280}}>
        <ResponsiveContainer>
          <BarChart data={quarters} accessibilityLayer title="Quarterly revenue" desc="Revenue by quarter in thousands of dollars; exact values are in the adjacent table." margin={{top: 24, right: 28, bottom: 12, left: 0}}>
            <CartesianGrid stroke={colorVars['--color-border']} vertical={false} />
            <XAxis dataKey="quarter" tick={tick} tickLine={false} axisLine={{stroke: colorVars['--color-border-emphasized']}} />
            <YAxis domain={[0, 200]} ticks={[0, 50, 100, 150, 200]} tick={tick} tickLine={false} axisLine={false} width={42} />
            <ReferenceLine y={150} stroke={dataVars['--color-data-neutral']} strokeDasharray="6 4" label={{value: 'Target 150', ...tick, position: 'insideTopRight'}} />
            <Tooltip
              isAnimationActive={false}
              cursor={{fill: colorVars['--color-overlay-hover']}}
              content={RevenueDetails}
            />
            <Bar dataKey="revenue" name="Revenue ($ thousands)" fill={dataVars['--color-data-categorical-blue']} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table>
        <caption>Revenue ($ thousands); target 150 in each quarter</caption>
        <thead><tr><th scope="col">Quarter</th><th scope="col">Revenue</th></tr></thead>
        <tbody>{quarters.map(row => <tr key={row.quarter}><th scope="row">{row.quarter}</th><td>{row.revenue}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}`,
        },
        {
          type: 'prose',
          text: 'The title and summary keep primary text. Label emphasis does not change data assignment. For several series, keep a matching legend and an extra identifying cue such as a line style, marker, or pattern.',
        },
        {
          type: 'prose',
          text: 'The [Recharts XAxis](https://recharts.github.io/en-US/api/XAxis/), [CartesianGrid](https://recharts.github.io/en-US/api/CartesianGrid/), [ReferenceLine](https://recharts.github.io/en-US/api/ReferenceLine/), and [Tooltip](https://recharts.github.io/en-US/api/Tooltip/) APIs own these renderer props. The example disables animation; connect meaningful animation to reduced-motion preferences in your product.',
        },
      ],
    },
    {
      id: 'style-other-renderers',
      title: 'Apply the same roles in other renderers',
      content: [
        {
          type: 'table',
          headers: ['Renderer', 'Apply the roles', 'On theme or mode change'],
          rows: [
            [
              'Direct D3 SVG',
              'Set fill on text and stroke on lines through colorVars or dataVars.',
              'CSS references repaint; color math still needs a concrete parseable value.',
            ],
            [
              'Canvas',
              'Resolve text, surface, grid, and data tokens with token(), then paint the background and chart.',
              'Draw the bitmap again, including labels and the background.',
            ],
            [
              'Vega-Lite',
              'Resolve axis labelColor/titleColor/domainColor/gridColor, legend labelColor/titleColor, and background in the config.',
              'Use the compile/view lifecycle shown in the renderer guide.',
            ],
          ],
        },
        {
          type: 'prose',
          text: 'Vega-Lite tooltip fields describe the data, not the HTML tooltip surface. If your integration adds an HTML tooltip, apply the same Astryx surface and text roles to it. The [Vega-Lite config reference](https://vega.github.io/vega-lite/docs/config.html) owns the config keys; a wrapper’s update and tooltip behavior belongs to that wrapper.',
        },
        {
          type: 'prose',
          text: 'A tooltip rendered in a portal must receive the chart’s theme context and stylesheet inheritance. Do not assume a different root has the same effective tokens. Concrete token reads use the theme’s root values; they do not apply its CSS-only adaptations. {@link generic:data-colors-in-renderers} describes these delivery boundaries.',
        },
      ],
    },
    {
      id: 'readable-chart-details',
      title: 'Keep labels and detail views usable',
      content: [
        {
          type: 'prose',
          text: 'Check both primary and secondary text against the actual surface at the smallest supported chart size. Existing token names do not guarantee the finished chart’s contrast or readability. Keep meaningful axis and reference lines distinguishable; decorative grids can be quieter.',
        },
        {
          type: 'prose',
          text: 'Keep key findings and exact values available without hovering. Test the renderer’s keyboard and touch paths; an accessibilityLayer prop alone is not a complete chart alternative. For content shown on hover or focus, follow [WCAG’s detail-content guidance](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html): dismissible, hoverable, and persistent as applicable.',
        },
        {
          type: 'prose',
          text: 'Do not color tooltip text with the series fill merely because the library does so by default. Use a readable text role and a separate series marker. Keep units, missing-data labels, long labels, and localized values readable in the chart and its detail view.',
        },
      ],
    },
  ],
};
