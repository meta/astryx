// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexDeclarationsPlugin.ts
 * @input esbuild's plugin interface
 * @output `stylexDeclarations`, an esbuild plugin that loads
 *   `@stylexjs/stylex` as a stand-in whose `defineVars` returns its values
 * @position Shared by the motion browser specs that bundle a module which
 *   imports the theme's token file
 *
 * The token file declares its variables through StyleX, which the build
 * compiles away. A page needs only the plain defaults beside them.
 */

import type {Plugin} from 'esbuild';

export const stylexDeclarations: Plugin = {
  name: 'stylex-declarations',
  setup(builder) {
    builder.onResolve({filter: /^@stylexjs\/stylex$/}, () => ({
      path: 'stylex',
      namespace: 'stylex-declarations',
    }));
    builder.onLoad({filter: /.*/, namespace: 'stylex-declarations'}, () => ({
      contents: 'export const defineVars = values => values;',
      loader: 'js',
    }));
  },
};
