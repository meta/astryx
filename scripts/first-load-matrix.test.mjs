// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file first-load-matrix.test.mjs
 * @input scripts/first-load-matrix.mjs and a small Core-shaped fixture package
 * @output Tests for the page arguments, and a smoke run of every bundler over
 *   the fixture: the statically imported module is in first load, the module
 *   behind `import()` is out, and the report names both
 * @position Testing (node project)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  PAGES,
  bundleAll,
  markdown,
  pageSpec,
  parseArgs,
  writeFixture,
} from './first-load-matrix.mjs';

describe('pageSpec', () => {
  it("reads INV10's pages from the record and adds the single-component pages", () => {
    expect(PAGES.table).toEqual(['Table', 'Text', 'Button']);
    expect(pageSpec('button')).toEqual(['button', ['Button']]);
  });

  it('takes a custom page with a subpath', () => {
    expect(pageSpec('resize=ResizeHandle@Resizable+Text')).toEqual([
      'resize',
      ['ResizeHandle@Resizable', 'Text'],
    ]);
  });

  it('refuses an unknown page name', () => {
    expect(() => pageSpec('nope')).toThrow('Unknown page nope');
  });
});

describe('parseArgs', () => {
  it('needs a ref or a pull request, and pages', () => {
    expect(() => parseArgs(['--pages', 'button'])).toThrow(/Usage/);
    expect(() => parseArgs(['--ref', 'HEAD'])).toThrow(/Usage/);
  });

  it('prints the usage line for a flag without its value', () => {
    expect(() => parseArgs(['--ref', 'HEAD', '--pages'])).toThrow(/Usage/);
    expect(() => parseArgs(['--pages', '--ref', 'HEAD'])).toThrow(/Usage/);
  });

  it('reads the flags', () => {
    const args = parseArgs([
      '--pr',
      '123',
      '--pages',
      'menu,table',
      '--defer',
      'a/b.js',
      '--chunks',
    ]);
    expect(args).toMatchObject({
      pr: '123',
      pages: ['menu', 'table'],
      defer: ['a/b.js'],
      chunks: true,
    });
  });
});

describe('bundleAll on a fixture package', () => {
  let work;
  let results;

  beforeAll(async () => {
    work = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'first-load-matrix-test-')),
    );
    // The folder layout matches a Core build, so module names read as Core's.
    const core = path.join(work, 'packages/core');
    const dist = path.join(core, 'dist/Widget');
    fs.mkdirSync(dist, {recursive: true});
    fs.writeFileSync(
      path.join(core, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/core',
        type: 'module',
        sideEffects: false,
        exports: {'./Widget': './dist/Widget/index.js'},
      }),
    );
    fs.writeFileSync(
      path.join(dist, 'index.js'),
      "export {Widget} from './Widget.js';\n",
    );
    fs.writeFileSync(
      path.join(dist, 'Widget.js'),
      [
        "import {label} from './shared.js';",
        'export function Widget() {',
        "  return [label('widget'), () => import('./surface.js')];",
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(dist, 'shared.js'),
      'export const label = text => `[${text}]`;\n',
    );
    fs.writeFileSync(
      path.join(dist, 'surface.js'),
      [
        "import {label} from './shared.js';",
        'export const surface = () => label("surface").repeat(40);',
      ].join('\n'),
    );
    const app = path.join(work, 'app');
    const entries = writeFixture(app, core, [['widget', ['Widget']]]);
    results = await bundleAll(app, entries.widget, path.join(work, 'out'), [
      'Widget/shared.js',
      'Widget/surface.js',
      'Widget/missing.js',
    ]);
  }, 120_000);

  afterAll(() => {
    if (work) fs.rmSync(work, {recursive: true, force: true});
  });

  it('runs every bundler', () => {
    expect(Object.keys(results)).toEqual([
      'Vite 8 (Rolldown)',
      'Rolldown, inline common chunks off',
      'Rolldown, inline common chunks 64 KiB (preserveEntrySignatures false)',
      'webpack 5',
    ]);
  });

  it('puts the static import in first load and the import() target out of it', () => {
    for (const [bundler, result] of Object.entries(results)) {
      expect(result.gzip, bundler).toBeGreaterThan(0);
      expect(result.chunks, bundler).toBeGreaterThanOrEqual(1);
      expect(result.deferred['Widget/shared.js'], bundler).toMatch(/^IN \(/);
      expect(result.deferred['Widget/surface.js'], bundler).toBe('out (lazy)');
      expect(result.deferred['Widget/missing.js'], bundler).toBe('absent');
    }
  });

  it('reports the page as a Markdown table', () => {
    const data = {base: {widget: results}, head: {widget: results}};
    const report = markdown(
      'fixture',
      {base: 'a'.repeat(40), head: 'b'.repeat(40)},
      [['widget', ['Widget']]],
      data,
      ['Widget/surface.js', 'Widget/missing.js'],
      false,
    );
    expect(report).toContain('**widget** (Widget)');
    expect(report).toContain('`Widget/surface` base → head');
    expect(report).not.toContain('Widget/missing');
    expect(report).toContain('| webpack 5 |');
  });

  it('keeps every row the same width when no listed module appears', () => {
    const data = {base: {widget: results}, head: {widget: results}};
    const report = markdown(
      'fixture',
      {base: 'a'.repeat(40), head: 'b'.repeat(40)},
      [['widget', ['Widget']]],
      data,
      ['Widget/missing.js'],
      false,
    );
    const rows = report.split('\n').filter(line => line.startsWith('|'));
    const widths = new Set(rows.map(line => line.split('|').length));
    expect(rows.length).toBe(6);
    expect([...widths]).toEqual([6]);
  });
});
