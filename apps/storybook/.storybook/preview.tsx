// Copyright (c) Meta Platforms, Inc. and affiliates.

import type {Preview, Decorator} from '@storybook/react';
import * as React from 'react';
import {
  Theme,
  LayerProvider,
  InternationalizationProvider,
} from '@astryxdesign/core';
import {butterTheme} from '@astryxdesign/theme-butter';
import {chocolateTheme} from '@astryxdesign/theme-chocolate';
import {gothicTheme} from '@astryxdesign/theme-gothic';
import {matchaTheme} from '@astryxdesign/theme-matcha';
import {neutralTheme} from '@astryxdesign/theme-neutral';
import {probeTheme} from '@astryxdesign/theme-probe';
import {stoneTheme} from '@astryxdesign/theme-stone';
import {y2kTheme} from '@astryxdesign/theme-y2k';
// Import the base reset stylesheet
import '@astryxdesign/core/reset.css';

import {storyPadding} from './storyFrame';

/**
 * Every shipped theme, so the toolbar can reach them and the visual gate can
 * photograph a component under each theme that overrides it. A theme missing
 * here is a theme nothing renders and nothing verifies.
 */
const themes = {
  butter: butterTheme,
  chocolate: chocolateTheme,
  gothic: gothicTheme,
  matcha: matchaTheme,
  neutral: neutralTheme,
  // A generated test fixture, not a design: it styles every declared theming
  // target so the visual gate can prove each one still paints. See
  // packages/themes/probe/README.md.
  probe: probeTheme,
  stone: stoneTheme,
  y2k: y2kTheme,
};

/**
 * Decorator that wraps all stories in the Astryx Theme provider.
 *
 * Sets `color-scheme` on the document root so that CSS `light-dark()`
 * resolves correctly at every level of the page — not just inside the
 * Theme wrapper div.  Without this, the iframe's `<html>` and
 * `<body>` keep the browser-default `color-scheme` (typically "light")
 * and toggling the toolbar has no visible effect.
 *
 * Wraps every story in a 16 px gutter, except stories with the `pageFrame`
 * parameter, which render page frames edge to edge (see `storyPadding`).
 */
const withTheme: Decorator = (Story, context) => {
  // Get theme selection from toolbar
  const themeKey = (context.globals?.astryxTheme || 'neutral') as string;
  const mode = context.globals?.colorMode === 'dark' ? 'dark' : 'light';
  const direction = context.globals?.direction === 'rtl' ? 'rtl' : 'ltr';
  const padding = storyPadding(context.parameters);

  // Sync color-scheme to the document root so light-dark() works
  // everywhere, including on <html>/<body> backgrounds and any
  // elements rendered outside the Theme wrapper.
  React.useEffect(() => {
    document.documentElement.style.setProperty('color-scheme', mode);
  }, [mode]);

  // No theme — render with just base defineVars defaults
  if (themeKey === 'none') {
    return (
      <InternationalizationProvider locale="en" dir={direction}>
        <div
          dir={direction}
          style={{
            colorScheme: mode,
            padding,
          }}>
          <Story />
        </div>
      </InternationalizationProvider>
    );
  }

  const theme = themes[themeKey as keyof typeof themes] || neutralTheme;

  return (
    <Theme theme={theme} mode={mode}>
      <LayerProvider>
        <InternationalizationProvider locale="en" dir={direction}>
          <div
            dir={direction}
            style={{
              backgroundColor: 'var(--color-background-surface)',
              padding,
            }}>
            <Story />
          </div>
        </InternationalizationProvider>
      </LayerProvider>
    </Theme>
  );
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true, // Disable backgrounds addon, use theme instead
    },
    layout: 'fullscreen',
  },
  globalTypes: {
    astryxTheme: {
      description: 'Astryx Theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          {value: 'none', title: 'None (base tokens)', icon: 'close'},
          {value: 'neutral', title: 'Neutral', icon: 'circle'},
          {value: 'stone', title: 'Stone', icon: 'circlehollow'},
          {value: 'butter', title: 'Butter', icon: 'sun'},
          {value: 'chocolate', title: 'Chocolate', icon: 'circle'},
          {value: 'gothic', title: 'Gothic', icon: 'moon'},
          {value: 'matcha', title: 'Matcha', icon: 'circlehollow'},
          {value: 'probe', title: 'Probe (test fixture)', icon: 'beaker'},
          {value: 'y2k', title: 'Y2K', icon: 'lightning'},
        ],
        dynamicTitle: true,
      },
    },
    colorMode: {
      description: 'Color mode',
      toolbar: {
        title: 'Mode',
        icon: 'contrast',
        items: [
          {value: 'light', title: 'Light', icon: 'sun'},
          {value: 'dark', title: 'Dark', icon: 'moon'},
        ],
        dynamicTitle: true,
      },
    },
    direction: {
      description: 'Text direction',
      toolbar: {
        title: 'Direction',
        icon: 'transfer',
        items: [
          {value: 'ltr', title: 'LTR'},
          {value: 'rtl', title: 'RTL'},
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    astryxTheme: 'neutral',
    colorMode: 'light',
    direction: 'ltr',
  },
  decorators: [withTheme],
};

export default preview;
