// Copyright (c) Meta Platforms, Inc. and affiliates.

import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/source.ts', 'src/registries.tsx'],
  format: ['cjs', 'esm'],
  dts: false,
  clean: false,
  external: ['@astryxdesign/core', 'react'],
});
