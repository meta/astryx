// Copyright (c) Meta Platforms, Inc. and affiliates.

import {defineConfig} from 'tsup';

const external = ['@astryxdesign/core', 'react', 'lucide-react'];

// The package is `"type": "module"`, so CommonJS needs `.cjs`; ES modules
// keep `.mjs`, the name the export map and the built theme import.
const outExtension = ({format}: {format: string}) => ({
  js: format === 'cjs' ? '.cjs' : '.mjs',
});

export default defineConfig([
  {
    entry: ['src/source.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    clean: false, // Don't clean — astryx theme build already put theme files in dist/
    external,
    outExtension,
  },
  {
    entry: ['src/icons.tsx'],
    format: ['esm'],
    dts: false,
    clean: false,
    external,
    outExtension,
  },
]);
