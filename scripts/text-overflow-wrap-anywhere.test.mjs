// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file text-overflow-wrap-anywhere.test.mjs
 * @input Every component source under packages/<package>/src
 * @output Fails when a style sets `overflowWrap: 'anywhere'` without also
 *   setting the private `--_astryx-text-overflow-wrap` to `anywhere`
 * @position Guardrail for Text and Heading FR3: untruncated Text and Heading
 *   set `overflow-wrap: var(--_astryx-text-overflow-wrap, break-word)`, so a
 *   container that wraps its content with `anywhere` must pass that down
 *   through the variable, or a `<Text>` it holds stops wrapping long tokens
 *   the container's way (a centered or flex message is then cut off at 320 px)
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const VAR_LINE = "'--_astryx-text-overflow-wrap': 'anywhere'";

function sources(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '__tests__'].includes(entry.name)) continue;
      out.push(...sources(full));
    } else if (
      /\.(tsx?|mts)$/.test(entry.name) &&
      !/\.(test|spec|stories)\./.test(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Each `overflowWrap: 'anywhere'` and whether the style object holding it
 * also sets the variable (scanned to the object's closing brace).
 */
export function anywhereWithoutVar(source) {
  const misses = [];
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    if (!/overflowWrap:\s*['"]anywhere['"]/.test(line)) return;
    let depth = 0;
    let start = index;
    // Back to the opening brace of the enclosing object.
    for (; start >= 0; start--) {
      depth += (lines[start].match(/}/g) ?? []).length;
      depth -= (lines[start].match(/{/g) ?? []).length;
      if (depth < 0) break;
    }
    depth = 0;
    let end = index;
    for (; end < lines.length; end++) {
      depth += (lines[end].match(/{/g) ?? []).length;
      depth -= (lines[end].match(/}/g) ?? []).length;
      if (depth < 0) break;
    }
    const block = lines.slice(Math.max(start, 0), end + 1).join('\n');
    if (!block.includes(VAR_LINE)) misses.push(index + 1);
  });
  return misses;
}

describe('overflow-wrap: anywhere reaches Text through the private variable', () => {
  it('flags a style that sets anywhere without the variable, and passes one that sets both', () => {
    expect(
      anywhereWithoutVar(
        "const s = {\n  message: {\n    overflowWrap: 'anywhere',\n  },\n};",
      ),
    ).toEqual([3]);
    expect(
      anywhereWithoutVar(
        `const s = {\n  message: {\n    overflowWrap: 'anywhere',\n    ${VAR_LINE},\n  },\n};`,
      ),
    ).toEqual([]);
  });

  it('holds for every package source', () => {
    const packages = path.join(ROOT, 'packages');
    const offenders = [];
    for (const pkg of fs.readdirSync(packages)) {
      const src = path.join(packages, pkg, 'src');
      if (!fs.existsSync(src)) continue;
      for (const file of sources(src)) {
        for (const line of anywhereWithoutVar(fs.readFileSync(file, 'utf8'))) {
          offenders.push(`${path.relative(ROOT, file)}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
