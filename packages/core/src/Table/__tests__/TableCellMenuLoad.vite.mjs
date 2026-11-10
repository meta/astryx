// Copyright (c) Meta Platforms, Inc. and affiliates.
/** Test-only build of the cell-menu load fixture, compiled from source. */
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import {astryxStylex} from '../../../../build/src/vite';
import resolution from '../../../../../scripts/stylex-module-resolution.cjs';
const root = process.cwd();
// The server build emits no stylesheet, so it skips the CSS layer split; its
// class names come from the same StyleX compile as the client build's.
export default defineConfig(({isSsrBuild}) => ({
  root: path.join(root, 'packages/core/src/Table/__tests__'),
  plugins: [
    ...astryxStylex({
      libraryPattern: 'packages/',
      stylexOptions: {
        dev: false,
        styleResolution: 'application-order',
        unstable_moduleResolution: resolution.stylexModuleResolution,
      },
    }).filter(
      plugin => !isSsrBuild || plugin.name !== 'astryx-build-layer-split',
    ),
    react(),
  ],
  // The server build lands outside Core's folder, where only React resolves,
  // so it bundles every other dependency.
  ssr: {noExternal: true},
  build: {
    target: 'chrome123',
    manifest: true,
    rollupOptions: {
      input: path.join(
        root,
        'packages/core/src/Table/__tests__/TableCellMenuLoad.html',
      ),
    },
  },
}));
