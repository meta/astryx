// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-css.layers.test.mjs
 * spec:AST-080 FR3: every package stylesheet registers the Astryx layer order
 * and keeps every rule inside its one layer, `astryx-base`; Core's also carries
 * one `reset` block that holds only the root color-scheme rule.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {ensureCoreBuilt} from '../packages/cli/clients/cli/commands/ensure-core-built.mjs';
import {createRequire} from 'node:module';
import {ASTRYX_LAYER_ORDER, composePackageStylesheet} from './build-css.mjs';

const {CORE_ROOT_BLOCK} = createRequire(import.meta.url)(
  '../packages/build/src/source-stylesheet.js',
);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Split a stylesheet into its top-level statements, comments removed: each is
 * either an at-rule statement ending in `;` or a block (`prelude { … }`).
 */
function topLevelStatements(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const statements = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        statements.push(text.slice(start, i + 1).trim());
        start = i + 1;
      }
    } else if (ch === ';' && depth === 0) {
      statements.push(text.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  expect(depth).toBe(0);
  expect(text.slice(start).trim()).toBe('');
  return statements.filter(Boolean);
}

/** Assert FR3's shape: the order line first, then exactly one block in `layer`. */
function expectOneAstryxLayer(css, layer) {
  const statements = topLevelStatements(css);
  expect(statements[0]).toBe(ASTRYX_LAYER_ORDER);
  expect(statements).toHaveLength(2);
  expect(statements[1].startsWith(`@layer ${layer} {`)).toBe(true);
}

/** Text with its whitespace collapsed, to compare CSS blocks. */
const squeezed = text => text.replace(/\s+/g, ' ').trim();

/**
 * Assert Core's shape: the order line, the root block that holds only
 * `:where(html:not([data-theme])) { color-scheme: light dark }` in `reset`,
 * then one `astryx-base` block.
 */
function expectCoreLayers(css) {
  const statements = topLevelStatements(css);
  expect(statements[0]).toBe(ASTRYX_LAYER_ORDER);
  expect(statements).toHaveLength(3);
  expect(squeezed(statements[1])).toBe(
    '@layer reset { :where(html:not([data-theme])) { color-scheme: light dark; } }',
  );
  expect(statements[2].startsWith('@layer astryx-base {')).toBe(true);
}

describe('package stylesheets register the Astryx layer order (spec:AST-080 FR3)', () => {
  it('names the same order theme output registers', () => {
    expect(ASTRYX_LAYER_ORDER).toBe('@layer reset, astryx-base, astryx-theme;');
  });

  it('wraps compiled rules after the order line, inside astryx-base only', () => {
    const css = composePackageStylesheet(
      'Probe',
      '.x1{color:red}\n@media (hover: hover){.x2:hover{color:blue}}',
    );
    expectOneAstryxLayer(css, 'astryx-base');
    expect(css).toContain('.x1{color:red}');
    expect(css).toContain('@media (hover: hover){.x2:hover{color:blue}}');
  });

  it("puts Core's root block, and only it, before Core's rules", () => {
    const css = composePackageStylesheet('Probe', '.x1{color:red}', {
      core: true,
    });
    expectCoreLayers(css);
    expect(squeezed(CORE_ROOT_BLOCK)).toBe(
      '@layer reset { :where(html:not([data-theme])) { color-scheme: light dark; } }',
    );
  });

  it('fails the shape check for an unlayered rule', () => {
    const css = `${composePackageStylesheet('Probe', '.x1{color:red}')}.x9{color:red}\n`;
    expect(() => expectOneAstryxLayer(css, 'astryx-base')).toThrow();
  });

  it('fails the shape check without the order line', () => {
    const css = composePackageStylesheet('Probe', '.x1{color:red}').replace(
      `${ASTRYX_LAYER_ORDER}\n`,
      '',
    );
    expect(() => expectOneAstryxLayer(css, 'astryx-base')).toThrow();
  });

  describe('the built Core stylesheet', () => {
    let astryxCss;
    beforeAll(async () => {
      ensureCoreBuilt();
      astryxCss = await fs.readFile(
        path.join(ROOT, 'packages/core/dist/astryx.css'),
        'utf8',
      );
    }, 180_000);

    it("astryx.css is the order line, Core's root block, and one astryx-base block", () => {
      expectCoreLayers(astryxCss);
    });
  });

  it('reset.css is the order line plus one reset block', async () => {
    const resetCss = await fs.readFile(
      path.join(ROOT, 'packages/core/src/reset.css'),
      'utf8',
    );
    expectOneAstryxLayer(resetCss, 'reset');
  });
});
