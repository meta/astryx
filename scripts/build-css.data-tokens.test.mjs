// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-css.data-tokens.test.mjs
 * @input Built Core CSS and the generated compatibility view of dataVars
 * @output Proves the prebuilt stylesheet owns exactly one canonical data group
 * @position Distribution regression guard for spec:AST-066 FR3/FR12
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {dataTokenDefaults} from '../packages/core/src/theme/domainTokens/dataTokens';
import {ensureCoreBuilt} from '../packages/cli/clients/cli/commands/ensure-core-built.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const normalize = value => value.replace(/\s+/g, '').toLowerCase();

describe('prebuilt Core data variables (spec:AST-066)', () => {
  let css;
  beforeAll(async () => {
    ensureCoreBuilt();
    css = await fs.readFile(
      path.join(ROOT, 'packages/core/dist/astryx.css'),
      'utf8',
    );
  }, 180_000);

  it('defines all 56 defaults exactly once with canonical values', () => {
    expect(Object.keys(dataTokenDefaults)).toHaveLength(56);
    const declarations = [...css.matchAll(/(--color-data-[\w-]+):([^;}]+)/g)];
    expect(declarations).toHaveLength(56);
    for (const [name, value] of Object.entries(dataTokenDefaults)) {
      const matches = declarations.filter(match => match[1] === name);
      expect(matches, name).toHaveLength(1);
      expect(normalize(matches[0][2]), name).toBe(normalize(value));
    }
  });

  it('uses the same layered root-plus-group-class shape as other defineVars defaults', () => {
    const layer = css.indexOf('@layer astryx-base {');
    expect(layer).toBeGreaterThan(0);
    const blocks = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
    const data = blocks.find(match =>
      match[2].includes('--color-data-categorical-blue:'),
    );
    const colors = blocks.find(match => match[2].includes('--color-accent:'));
    expect(data).toBeDefined();
    expect(colors).toBeDefined();
    expect(data.index).toBeGreaterThan(layer);
    expect(data[1].trim()).toMatch(/^:root,\s*\.\w+$/);
    expect(colors[1].trim()).toMatch(/^:root,\s*\.\w+$/);
    expect(
      css
        .slice(data.index + data[0].length)
        .trim()
        .endsWith('}'),
    ).toBe(true);
  });
});
