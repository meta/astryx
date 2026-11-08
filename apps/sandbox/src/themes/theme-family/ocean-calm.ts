// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Sandbox family child. @input Ocean root. @output Child deltas. @position Maintained consumer source. */

import {defineTheme} from '@astryxdesign/core/theme';
import {oceanTheme} from './ocean';

export const oceanCalmTheme = defineTheme({
  name: 'sandbox-ocean-calm',
  extends: oceanTheme,
  localTokens: {'--sandbox-family-wave-width': '4px'},
  tokens: {
    '--color-accent': 'rgb(0 109 119)',
    '--color-background-surface': 'rgb(230 255 251)',
    '--color-text-primary': 'rgb(0 75 80)',
  },
  components: {
    button: {
      base: {borderColor: 'rgb(0 75 80)'},
      'variant:primary': {backgroundColor: 'rgb(0 109 119)'},
    },
  },
});
