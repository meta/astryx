// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file first-load-matrix.test.mjs
 * @input scripts/first-load-matrix.mjs and a small Core-shaped fixture package
 * @output Tests for the page arguments, and a smoke run of every bundler over
 *   the fixture: the statically imported module is in first load, the module
 *   behind `import()` is out, a folder missing from Core's exports map builds,
 *   the Vite row equals `size:pages`' Rolldown figures, externals and the page
 *   entry follow `size:pages`' rules, and the report names both modules
 * @position Testing (node project)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {
  PAGES,
  appExternal,
  bundleAll,
  markdown,
  pageEntrySource,
  pageSpec,
  parseArgs,
} from './first-load-matrix.mjs';
import {
  isAppExternal,
  measurePageRolldown,
  pageSource,
} from './measure-reference-pages.mjs';

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
  let core;
  let results;

  beforeAll(async () => {
    work = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), 'first-load-matrix-test-')),
    );
    // The folder layout matches a Core build, so module names read as Core's.
    core = path.join(work, 'packages/core');
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
    // A folder Core's exports map does not list: the page imports its built
    // module directly, as size:pages does.
    fs.mkdirSync(path.join(core, 'dist/Hidden'), {recursive: true});
    fs.writeFileSync(
      path.join(core, 'dist/Hidden/index.js'),
      'export const Hidden = () => "hidden";\n',
    );
    results = await bundleAll(
      {distDir: path.join(core, 'dist'), components: ['Widget', 'Hidden']},
      path.join(work, 'out'),
      ['Widget/shared.js', 'Widget/surface.js', 'Widget/missing.js'],
    );
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

  it("gives the page the same Vite figures as size:pages' Rolldown build", async () => {
    const pages = await measurePageRolldown(path.join(core, 'dist'), [
      'Widget',
      'Hidden',
    ]);
    expect(results['Vite 8 (Rolldown)'].gzip).toBe(pages.gzip);
    expect(results['Vite 8 (Rolldown)'].chunks).toBe(pages.chunks);
  });

  it('builds a folder missing from the exports map in every row', () => {
    for (const [bundler, result] of Object.entries(results)) {
      expect(result.coreModules, bundler).toBeGreaterThanOrEqual(2);
    }
  });

  it("resolves externals and the page entry by size:pages' own rules", () => {
    for (const id of [
      'react/jsx-dev-runtime',
      'react-dom/server',
      '@stylexjs/stylex',
      'intl-messageformat',
    ]) {
      expect(appExternal(id), id).toBe(isAppExternal(id));
    }
    expect(appExternal('react-dom/server')).toBe(true);
    expect(appExternal('intl-messageformat')).toBe(false);
    const dist = path.join(core, 'dist');
    expect(pageEntrySource(dist, ['Hidden'])).toBe(
      pageSource(dist, ['Hidden']),
    );
    expect(pageEntrySource(dist, ['Hidden'])).toContain('dist/Hidden/index.js');
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
