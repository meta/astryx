// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Sandbox sibling theme. @input Ocean root. @output Isolated sibling branch. @position Maintained consumer source. */

import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from './ocean';

export const oceanMidnightTheme = defineTheme({
  name: 'sandbox-ocean-midnight',
  extends: oceanTheme,
  tokens: {
    '--color-accent': 'rgb(90 79 207)',
    '--color-background-surface': 'rgb(240 238 255)',
    '--color-text-primary': 'rgb(43 36 107)',
  },
  components: {
    button: {
      'variant:primary': {backgroundColor: 'rgb(90 79 207)'},
    },
  },
});
