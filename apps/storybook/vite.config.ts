// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file vite.config.ts
 * @input Uses vite, @vitejs/plugin-react, @stylexjs/unplugin
 * @output Vite configuration with React and StyleX via unplugin
 * @position Build config; used by Storybook's Vite integration
 *
 * SYNC: When modified, update this header and /apps/storybook/README.md
 */

import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';
import path from 'node:path';
import stylexResolution from '../../scripts/stylex-module-resolution.cjs';

const rootDir = path.resolve(__dirname, '../..');
const coreRoot = path.resolve(__dirname, '../../packages/core/src');

export default defineConfig({
  plugins: [
    stylex.vite({
      // Use production mode with CSS extraction
      dev: false,
      useCSSLayers: true,
      styleResolution: 'application-order',
      aliases: {
        '@astryxdesign/core/*': [path.join(rootDir, 'packages/core/src/*')],
        '@astryxdesign/core': [path.join(rootDir, 'packages/core/src')],
      },
      unstable_moduleResolution: stylexResolution.stylexModuleResolution,
    }),
    react(),
  ],
  resolve: {
    alias: {
      // Map @astryxdesign/core to source for StyleX compilation
      '@astryxdesign/core': coreRoot,
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
