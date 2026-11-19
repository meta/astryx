#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Fails the build when a server function's traced files grow past a safe
 * margin under the host's function size limit.
 *
 * Next traces every file a server route may read at run time
 * (`*.nft.json`), and each route deploys with those files. A path the tracer
 * cannot resolve (for example one built from a template string) can make it
 * include a whole folder, so a function can grow by gigabytes from one
 * unrelated change, and the deploy then fails with no local error. This reads
 * every route's trace after `next build` and fails when one passes the budget.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = join(appRoot, '.next', 'server');

/** The host's limit for one function's files, uncompressed, is 250 MB. */
export const FUNCTION_BUDGET_BYTES = 150 * 1000 * 1000;

/**
 * Every `*.nft.json` under a folder.
 * @param {string} dir
 * @returns {string[]}
 */
function traces(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return traces(full);
    return entry.name.endsWith('.nft.json') ? [full] : [];
  });
}

/**
 * The bytes of the distinct files one trace lists.
 * @param {string} trace
 * @returns {{bytes: number, files: number}}
 */
export function tracedSize(trace) {
  const {files} = JSON.parse(readFileSync(trace, 'utf8'));
  const seen = new Set();
  let bytes = 0;
  for (const file of files) {
    const full = join(dirname(trace), file);
    if (!existsSync(full)) continue;
    const real = realpathSync(full);
    if (seen.has(real)) continue;
    const stat = statSync(real);
    if (!stat.isFile()) continue;
    seen.add(real);
    bytes += stat.size;
  }
  return {bytes, files: seen.size};
}

const mb = bytes => `${(bytes / 1e6).toFixed(1)} MB`;

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(serverRoot)) {
    throw new Error(`${serverRoot} is missing: run next build first.`);
  }
  const sizes = traces(join(serverRoot, 'app'))
    .map(trace => ({trace: relative(serverRoot, trace), ...tracedSize(trace)}))
    .sort((a, b) => b.bytes - a.bytes);
  const over = sizes.filter(size => size.bytes > FUNCTION_BUDGET_BYTES);
  for (const size of over) {
    console.error(
      `${size.trace}: ${mb(size.bytes)} in ${size.files} files, over the ${mb(FUNCTION_BUDGET_BYTES)} budget`,
    );
  }
  if (over.length > 0) {
    throw new Error(
      'A server function traces too many files. Find the import or file read the tracer cannot resolve, or add an outputFileTracingExcludes entry in next.config.mjs.',
    );
  }
  const largest = sizes[0];
  console.log(
    `Server functions: largest is ${largest.trace} at ${mb(largest.bytes)} (budget ${mb(FUNCTION_BUDGET_BYTES)}).`,
  );
}
