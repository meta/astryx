// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pr-preview-imports.test.mjs
 * Contract: pr-preview.mjs, and every module it loads at the top level, imports
 * only Node built-ins and relative files. The PR Comment workflow's resolve
 * and spec-only jobs import it without installing dependencies, so a
 * top-level package import would fail their report.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const ENTRY = path.join(import.meta.dirname, 'pr-preview.mjs');

/** Specifiers a module loads at the top level: static imports and requires. */
function topLevelSpecifiers(source) {
  const specs = [];
  for (const match of source.matchAll(
    /^import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
  ))
    specs.push(match[1]);
  // Top-level requires only (not inside a function body): column 0 or a
  // top-level const.
  for (const match of source.matchAll(
    /^(?:const|let|var)[^\n]*?\brequire\(\s*['"]([^'"]+)['"]\s*\)/gm,
  ))
    specs.push(match[1]);
  for (const match of source.matchAll(
    /^(?:const|let|var)[^\n]*?createRequire\([^)]*\)\(\s*['"]([^'"]+)['"]\s*\)/gm,
  ))
    specs.push(match[1]);
  return specs;
}

function resolveRelative(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`])
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  throw new Error(`${spec} from ${from} does not resolve`);
}

describe('pr-preview.mjs top-level imports', () => {
  it('loads only Node built-ins and relative files, transitively', () => {
    const seen = new Set();
    const packages = [];
    const visit = file => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const spec of topLevelSpecifiers(fs.readFileSync(file, 'utf8'))) {
        if (spec.startsWith('node:')) continue;
        if (spec.startsWith('.')) visit(resolveRelative(file, spec));
        else packages.push(`${path.basename(file)} → ${spec}`);
      }
    };
    visit(ENTRY);
    expect(seen.size).toBeGreaterThan(3);
    expect(packages).toEqual([]);
  });
});
