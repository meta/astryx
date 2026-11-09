// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs styling-libraries/non-css-processing`: resolve token
 * values outside the DOM for charts, canvas, SVG, and config objects.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */

export const docs = {
  type: 'generic',
  name: 'non-css-processing',
  title: 'Non-CSS Processing',
  placement: {parent: 'namespace:styling-libraries', slot: 'guides', order: 40},
  category: 'guide',
  description:
    'Resolve token values outside the DOM for charts, canvas, SVG, and config objects using resolveThemeTokens() and useTheme().',
  keywords: [
    'resolveThemeTokens',
    'resolveThemeToken',
    'useTheme',
    'chart',
    'canvas',
    'SVG',
    'non-CSS',
  ],

  sections: [
    {
      title: 'Non-CSS Processing',
      content: [
        {
          type: 'prose',
          text: 'Use `resolveThemeTokens()` or `resolveThemeToken()` when code outside React needs token values for a known theme and mode. Use `useTheme()` inside client components when the values should come from the nearest Theme and active mode.',
        },
        {
          type: 'code',
          lang: 'ts',
          label: 'Resolve tokens without React context',
          code: `import {resolveThemeTokens} from '@astryxdesign/core/theme/tokens';
import {neutralTheme} from '@astryxdesign/theme-neutral/built';

const tokens = resolveThemeTokens(neutralTheme, {mode: 'light'});

const chartOptions = {
  textColor: tokens['--color-text-primary'],
  mutedTextColor: tokens['--color-text-secondary'],
  gridColor: tokens['--color-border'],
  seriesColors: [
    tokens['--color-data-categorical-blue'],
    tokens['--color-data-categorical-orange'],
    tokens['--color-data-categorical-purple'],
  ],
};`,
        },
        {
          type: 'code',
          lang: 'tsx',
          label: 'Resolve tokens from the nearest Theme',
          code: `'use client';

import {useMemo} from 'react';
import {useTheme} from '@astryxdesign/core/theme';

function RevenueChart({data}: {data: Array<{x: string; y: number}>}) {
  const {mode, tokens} = useTheme();

  const chartOptions = useMemo(
    () => ({
      mode,
      textColor: tokens['--color-text-primary'],
      mutedTextColor: tokens['--color-text-secondary'],
      gridColor: tokens['--color-border'],
      seriesColors: [
        tokens['--color-data-categorical-blue'],
        tokens['--color-data-categorical-orange'],
        tokens['--color-data-categorical-purple'],
      ],
    }),
    [mode, tokens],
  );

  return <ThirdPartyChart data={data} options={chartOptions} />;
}`,
        },
      ],
    },
    {
      id: 'non-css-best-practices',
      title: 'Non-CSS Processing Best Practices',
      content: [
        {
          type: 'list',
          style: 'do',
          items: [
            'Use the returned `tokens` object as a memo dependency; it is stable until the active theme or mode changes.',
            'Use data visualization tokens such as `--color-data-categorical-blue` for chart series instead of reusing arbitrary UI colors.',
            'Prefer CSS variables for SVG elements when possible (`fill="var(--color-accent)"`); use token resolver APIs when an API requires a string value in JavaScript.',
          ],
        },
        {
          type: 'list',
          style: 'dont',
          items: [
            'Use token resolver APIs for ordinary DOM styling. Use CSS variables, StyleX tokens, xstyle, or library aliases instead.',
            'Assume the returned values reflect every CSS cascade override. They resolve tokens for the current theme and mode; local media-surface overrides and arbitrary CSS overrides may not be represented in the returned map.',
          ],
        },
      ],
    },
  ],
};
