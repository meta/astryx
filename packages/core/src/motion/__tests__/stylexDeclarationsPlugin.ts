// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexDeclarationsPlugin.ts
 * @input esbuild's plugin interface
 * @output `stylexDeclarations`, an esbuild plugin that loads
 *   `@stylexjs/stylex` as a stand-in. Its `defineVars`, `defineConsts` and
 *   `create` return their values; `defineMarker` and `props` give empty
 *   objects
 * @position Shared by the motion browser specs that bundle a module which
 *   imports the theme's token file or declares styles
 *
 * The modules declare their variables and styles through StyleX, which the
 * build compiles away. A page needs only the plain values beside them.
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
      contents: [
        'const same = value => value;',
        'export const defineVars = same;',
        'export const defineConsts = same;',
        'export const create = same;',
        'export const defineMarker = () => ({});',
        'export const props = () => ({});',
      ].join('\n'),
      loader: 'js',
    }));
  },
};
