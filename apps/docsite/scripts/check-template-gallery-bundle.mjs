#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Verifies that the production templates route does not eagerly ship code that
 * only live previews or the playground need.
 */

import {readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const htmlPath = join(appRoot, '.next/server/app/templates.html');
const chunksRoot = join(appRoot, '.next/static/chunks');
const html = readFileSync(htmlPath, 'utf8');
const chunkPattern = /<script[^>]+src="\/_next\/static\/chunks\/([^"?]+\.js)/g;
const chunkPaths = [
  ...new Set([...html.matchAll(chunkPattern)].map(match => match[1])),
];

if (chunkPaths.length === 0) {
  throw new Error(`No initial script chunks found in ${htmlPath}`);
}

const forbiddenMarkers = [
  ['full template source', 'activeUsersData'],
  ['live preview dialog', 'Copy Astryx command'],
  ['Recharts runtime', 'ResponsiveContainer'],
];
const violations = [];
let totalBytes = 0;

for (const relativePath of chunkPaths) {
  const chunkPath = join(chunksRoot, relativePath);
  const source = readFileSync(chunkPath, 'utf8');
  totalBytes += statSync(chunkPath).size;
  for (const [label, marker] of forbiddenMarkers) {
    if (source.includes(marker)) {
      violations.push(`${label} (${marker}) in ${relativePath}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `The templates route eagerly ships deferred preview code:\n${violations
      .map(violation => `- ${violation}`)
      .join('\n')}`,
  );
}

console.log(
  `Template gallery bundle check passed: ${chunkPaths.length} initial chunks, ${totalBytes} uncompressed bytes`,
);
