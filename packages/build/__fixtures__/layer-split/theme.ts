// Copyright (c) Meta Platforms, Inc. and affiliates.

import {defineTheme} from '@astryxdesign/core/theme';

/**
 * Overrides the same declaration Button's own StyleX rule sets, so the built
 * stylesheet answers "does @layer astryx-theme outrank the library layer?"
 * rather than only "did the rule get emitted?".
 *
 * It also overrides one `--color-data-*` token, whose defaults are declared
 * once at `:root`: an override that loses to that block, or a nested theme
 * that re-declares the default over it, are both cascade facts and neither is
 * visible in the generated CSS text.
 */
export const fixtureTheme = defineTheme({
  name: 'layersplitfixture',
  tokens: {
    '--color-data-categorical-blue': ['rgb(1, 2, 3)', 'rgb(4, 5, 6)'],
  },
  components: {
    button: {
      'variant:destructive': {backgroundColor: 'rgb(0, 120, 255)'},
    },
  },
});

/** A nested theme that names no data token — it must inherit the parent's. */
export const nestedTheme = defineTheme({
  name: 'layersplitnested',
  tokens: {'--color-accent': '#123456'},
});

/** Nested and dark, so `light-dark()` has to resolve on the dark side. */
export const nestedDarkTheme = defineTheme({
  name: 'layersplitnesteddark',
  tokens: {'--color-accent': '#654321'},
});
