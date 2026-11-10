// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Test-only build: same source compiler and resolution as Storybook. */
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {astryxStylex} from '../../../../build/src/vite';
import resolution from '../../../../../scripts/stylex-module-resolution.cjs';
const root = process.cwd();
export default defineConfig({
  root: path.join(root, 'packages/core/src/Table/__tests__'),
  plugins: [
    ...astryxStylex({
      libraryPattern: 'packages/',
      stylexOptions: {
        dev: false,
        styleResolution: 'application-order',
        unstable_moduleResolution: resolution.stylexModuleResolution,
      },
    }),
    react(),
  ],
  build: {
    outDir: path.join(root, 'test-results/table-row-fixture'),
    emptyOutDir: true,
    target: 'chrome123',
    rollupOptions: {
      input: path.join(
        root,
        'packages/core/src/Table/__tests__/TableVirtualization.release.html',
      ),
    },
  },
});
