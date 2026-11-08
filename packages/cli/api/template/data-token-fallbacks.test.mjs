// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Asserts every `var(--color-data-*, <hex>)` fallback in the dashboard
 * templates equals the token's own default.
 *
 * The fallback is what paints when the token does not resolve, so a fallback
 * that differs from its token makes the same chart series two different colours
 * depending on whether a theme is present. Three of them had drifted
 * (`#22c55e`, `#E5484D`, `#008E80`), which is also why "the defaults are
 * byte-identical to the template fallbacks" was not true.
 */

import {describe, it, expect} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dataTokenDefaults} from '@astryxdesign/core/theme';

const TEMPLATES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../assets/templates',
);
const CALL_SITE = /var\(\s*(--color-data-[a-z0-9-]+)\s*,\s*([^)]+?)\s*\)/g;

/** The light side of a `light-dark(a, b)` pair — what a template falls back to. */
function lightSide(value) {
  const match = /^light-dark\(\s*([^,]+?)\s*,/.exec(value);
  return match ? match[1] : value;
}

function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function callSites() {
  const sites = [];
  for (const file of walk(TEMPLATES_DIR)) {
    if (!/\.(tsx|ts|jsx|js|mjs|css)$/.test(file)) {
      continue;
    }
    fs.readFileSync(file, 'utf-8')
      .split('\n')
      .forEach((line, index) => {
        for (const match of line.matchAll(CALL_SITE)) {
          sites.push({
            where: `${path.relative(TEMPLATES_DIR, file)}:${index + 1}`,
            token: match[1],
            fallback: match[2],
          });
        }
      });
  }
  return sites;
}

describe('template --color-data-* fallbacks', () => {
  const sites = callSites();

  it('finds the call sites at all', () => {
    expect(sites.length).toBeGreaterThan(40);
  });

  it('names a real token at every call site', () => {
    const unknown = sites.filter(site => !dataTokenDefaults[site.token]);
    expect(unknown.map(site => `${site.where} ${site.token}`)).toEqual([]);
  });

  it('matches each token default exactly', () => {
    const drifted = sites
      .filter(site => dataTokenDefaults[site.token])
      .filter(
        site => site.fallback !== lightSide(dataTokenDefaults[site.token]),
      )
      .map(
        site =>
          `${site.where} ${site.token}: ${site.fallback} != ${lightSide(dataTokenDefaults[site.token])}`,
      );

    expect(drifted).toEqual([]);
  });
});
