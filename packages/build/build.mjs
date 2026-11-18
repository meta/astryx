#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Compiles src/vite.ts → dist/vite.mjs for npm distribution.
 *
 * The vite plugin is the only TypeScript source in @astryxdesign/build.
 * Node does not support type-stripping for files inside node_modules,
 * so we must ship compiled JS.
 */
import {buildSync} from 'esbuild';
import {readFileSync, writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';

buildSync({
  entryPoints: ['src/vite.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/vite.mjs',
  // SYNC: keep aligned with the external list in src/vite.test.ts
  external: [
    'vite',
    '@stylexjs/babel-plugin',
    '@stylexjs/unplugin',
    'path',
    'url',
    'node:fs',
    'node:path',
    'node:url',
  ],
  banner: {js: '// Built from src/vite.ts — do not edit directly'},
});

// Fix babel.js path: dist/vite.mjs resolves __dirname to dist/,
// but babel.js lives in src/
let content = readFileSync('dist/vite.mjs', 'utf8');
content = content.replaceAll(
  'resolve(__dirname, "babel.js")',
  'resolve(__dirname, "../src/babel.js")',
);
// The marker reader also lives in src/, beside babel.js.
content = content.replaceAll(
  'resolve(__dirname, "swizzle-marker.js")',
  'resolve(__dirname, "../src/swizzle-marker.js")',
);
writeFileSync('dist/vite.mjs', content);

console.log('Built dist/vite.mjs');

// Emit TypeScript declarations for the ./vite export. esbuild cannot generate
// them, so run tsc (declaration-only) — the same pattern the theme packages use.
execSync('tsc --project tsconfig.build.json', {stdio: 'inherit'});
console.log('Built dist/vite.d.ts');
