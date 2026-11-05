// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file Sandbox family root. @input Authored theme config. @output Root family member. @position Maintained consumer source. */

import {defineTheme} from '@astryxdesign/core/theme';

export const oceanTheme = defineTheme({
  name: 'sandbox-ocean',
  typography: {
    body: {family: 'Arial', fallbacks: 'sans-serif'},
    heading: {family: 'Georgia', fallbacks: 'serif'},
  },
  tokens: {
    '--color-accent': 'rgb(0 119 182)',
    '--color-background-surface': 'rgb(240 248 255)',
    '--color-text-primary': 'rgb(2 62 138)',
  },
  localTokens: {'--sandbox-family-wave-width': '2px'},
  components: {
    button: {
      base: {
        borderColor: 'rgb(0 53 84)',
        borderStyle: 'solid',
        borderWidth: 'var(--sandbox-family-wave-width)',
      },
      'variant:primary': {
        backgroundColor: 'rgb(0 119 182)',
        color: 'rgb(255 255 255)',
      },
    },
  },
  adaptations: {
    rules: [
      {
        when: {width: {from: 'md'}},
        value: {components: {button: {base: {minHeight: '42px'}}}},
      },
    ],
  },
  onDark: {
    components: {button: {base: {borderColor: 'rgb(144 224 239)'}}},
  },
});
