// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Wiring tests for the component detail page.
 *
 * The `component-detail/` directory holds the internal building blocks of a
 * single page. Unlike `app/`, it contains no Next.js route entry points and no
 * script-consumed modules, so every module in it must be reachable from the
 * router — a renderer nothing on the page reaches is dead code, and the data it
 * was written to display silently never reaches the page.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {components} from '../generated/componentRegistry';

const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const DETAIL_DIR = path.join(SRC_DIR, 'components/component-detail');
const APP_DIR = path.join(SRC_DIR, 'app');
const EXTENSIONS = ['.ts', '.tsx'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (EXTENSIONS.includes(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Resolve a relative import specifier the way the bundler does, so a match is
 * an actual module reference rather than a name that happens to appear in the
 * source. Package specifiers are skipped — `@astryxdesign/core/Section` must
 * not count as an import of a local `Section.tsx`.
 */
function resolveRelative(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...EXTENSIONS.map(ext => base + ext),
    ...EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

const SPECIFIER_RE = /(?:from\s*|import\(\s*|require\(\s*)['"]([^'"]+)['"]/g;

/**
 * Walk the relative-import graph out from `entries`, returning every file
 * reachable from one of them.
 *
 * Reachability, not "somebody imports it": a renderer imported only by its own
 * unit test — or only by another module the page never reaches — is still dark
 * on the page, and a guard that counted those importers would pass on it.
 */
function collectReachable(entries: string[]): Set<string> {
  const reachable = new Set<string>(entries);
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER_RE)) {
      const resolved = resolveRelative(file, match[1]);
      if (resolved !== null && !reachable.has(resolved)) {
        reachable.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return reachable;
}

describe('component detail wiring', () => {
  it('reaches every module in component-detail/ from a page', () => {
    const detailModules = walk(DETAIL_DIR).filter(
      file => !file.includes('.test.'),
    );
    // Guard against a vacuous pass if the directory is ever moved or renamed.
    expect(detailModules.length).toBeGreaterThan(5);

    // The Next.js router loads `app/`; everything else in `src/` is only code
    // that something under `app/` pulls in.
    const entries = walk(APP_DIR);
    expect(entries.length).toBeGreaterThan(5);

    const reachable = collectReachable(entries);
    const orphans = detailModules
      .filter(file => !reachable.has(file))
      .map(file => path.relative(SRC_DIR, file))
      .sort();

    expect(orphans).toEqual([]);
  });

  it('carries anatomy data for components that author it', () => {
    const withAnatomy = Object.values(components)
      .flat()
      .filter(entry => (entry.usage?.anatomy?.length ?? 0) > 0);

    // The renderer is only worth wiring if the generated registry actually
    // carries the data; this fails if generate-data.mjs ever drops `anatomy`
    // from the `usage` block it passes through.
    expect(withAnatomy.length).toBeGreaterThan(0);

    for (const entry of withAnatomy) {
      for (const element of entry.usage!.anatomy!) {
        expect(typeof element.name).toBe('string');
        expect(element.name.length).toBeGreaterThan(0);
        expect(typeof element.description).toBe('string');
      }
    }
  });
  it('carries component accessibility requirements into the registry', () => {
    const button = Object.values(components)
      .flat()
      .find(entry => entry.name === 'Button');

    expect(button?.usage?.accessibility?.length).toBeGreaterThan(0);
    expect(button?.usage?.accessibility?.[0]).toMatchObject({
      category: 'Color contrast',
      requirement: '4.5:1',
    });
    expect(button?.usage?.accessibility).toContainEqual(
      expect.objectContaining({
        name: 'Badge text',
        requirement: '4.5:1',
      }),
    );
  });

  it('renders accessibility metadata in a dedicated tab', () => {
    const source = fs.readFileSync(
      path.join(DETAIL_DIR, 'ComponentDetailClient.tsx'),
      'utf8',
    );

    expect(source).toContain(
      '<Tab value="accessibility" label="Accessibility" />',
    );
    expect(source).toContain('themeCoverage={accessibilityThemeCoverage}');
    expect(source).toContain('componentName={comp.name}');

    const accessibilitySource = fs.readFileSync(
      path.join(DETAIL_DIR, 'Accessibility.tsx'),
      'utf8',
    );
    expect(accessibilitySource).toContain(
      '`${componentName} ${themeName} theme ${mode.mode} mode contrast results`',
    );
    expect(accessibilitySource).not.toContain(
      'Neutral Button contrast results',
    );
  });

  it('supports accessibility guidance across button-like components', () => {
    const entries = Object.values(components).flat();
    for (const name of [
      'IconButton',
      'ToggleButton',
      'ButtonGroup',
      'SegmentedControl',
    ]) {
      const component = entries.find(entry => entry.name === name);
      expect(component?.usage?.accessibility?.length).toBeGreaterThan(0);
      expect(component?.usage?.accessibility).toContainEqual(
        expect.objectContaining({category: 'Color contrast'}),
      );
    }
  });

  it('uses clear button-family contrast terminology', () => {
    const entries = Object.values(components).flat();
    for (const name of [
      'Button',
      'IconButton',
      'ToggleButton',
      'ButtonGroup',
    ]) {
      const component = entries.find(entry => entry.name === name);
      expect(component?.usage?.accessibility).toContainEqual(
        expect.objectContaining({name: 'Essential icon or spinner arc'}),
      );
    }
  });
});
