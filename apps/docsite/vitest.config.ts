// Copyright (c) Meta Platforms, Inc. and affiliates.

import path from 'node:path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@astryxdesign/theme-neutral/built': path.resolve(
        __dirname,
        '../../packages/themes/neutral/src/neutralTheme.ts',
      ),
    },
  },
  test: {
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
  },
});
