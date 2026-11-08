// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression shapes for PR #6265 — syntax-invalid component metadata.
 *
 * These tests pin the FR9 contract for component discovery when an
 * integration contributes a doc file that cannot be imported (syntax error,
 * runtime error, or missing export). They cover every surface that reads
 * component records: Project.components(), Project.issues(), the component
 * CLI (list, detail, source), search, build, and Doctor.
 *
 * Fixture: @acme/widgets with two components:
 *   - FooWidget: valid source (.tsx), INVALID doc (.doc.mjs has syntax error)
 *   - BarWidget: valid source (.tsx), valid doc (.doc.mjs)
 *   - Button: valid Core component plus invalid integration owner
 *
 * Expected behavior per FR9 (AST-035):
 *   - FooWidget is OMITTED from every component result
 *   - FooWidget's invalidity is REPORTED as an issue
 *   - BarWidget (valid sibling) REMAINS in every result
 *   - Other contribution kinds (templates, themes) REMAIN unaffected
 *   - Doctor reports integration-issues as a warning (a project that passed
 *     keeps passing); `astryx doctor integration` fails on it
 *   - component detail for FooWidget throws a coded error, not a raw SyntaxError
 *
 * @position packages/cli/test (regression — cross-surface FR9 pin)
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Test subjects ──────────────────────────────────────────────────
import {Project} from '../foundation/config/project.mjs';
import {component} from '../api/component/component.mjs';
import {search} from '../api/search/search.mjs';
import {build} from '../api/build/build.mjs';
import {doctor} from '../api/doctor/doctor.mjs';

// ── Fixture ────────────────────────────────────────────────────────

let tmpDir;
let originalCwd;

/**
 * Scaffold a consumer with @acme/widgets contributing:
 *   - FooWidget: valid source, broken doc (syntax error)
 *   - BarWidget: valid source, valid doc
 *   - One valid template (hero block)
 *
 * @returns {string} pkgDir — the integration package directory
 */
function scaffoldInvalidDoc() {
  // Consumer
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    `export default { integrations: ['@acme/widgets'] };\n`,
  );

  // Integration package
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default { components: './components', templates: './templates' };\n`,
  );

  // ── Components ────────────────────────────────────────────────────

  const compDir = path.join(pkgDir, 'components');

  // FooWidget: valid source, BROKEN doc
  const fooDir = path.join(compDir, 'FooWidget');
  fs.mkdirSync(fooDir, {recursive: true});
  fs.writeFileSync(
    path.join(fooDir, 'FooWidget.tsx'),
    `export const FooWidget = () => null;\n`,
  );
  // Syntax-invalid: missing commas, unclosed brace
  fs.writeFileSync(
    path.join(fooDir, 'FooWidget.doc.mjs'),
    [
      `export const docs = {`,
      `  type: 'component',`,
      `  name: 'FooWidget',`,
      `  category: 'Data'`, // ← missing comma
      `  group: 'Widgets'`, // ← SyntaxError: Unexpected identifier 'group'
      `  keywords: ['foo' 'widget'],`,
      `  usage: { description: 'A foo widget.' }`,
      ``, // ← unclosed brace
    ].join('\n'),
  );

  // Button: valid integration source, broken doc, colliding with valid Core.
  const buttonDir = path.join(compDir, 'Button');
  fs.mkdirSync(buttonDir, {recursive: true});
  fs.writeFileSync(
    path.join(buttonDir, 'Button.tsx'),
    `export function Button() { return 'BrokenIntegrationButton'; }\n`,
  );
  fs.writeFileSync(
    path.join(buttonDir, 'Button.doc.mjs'),
    `export default {type: 'component', name: 'Button', props: [};\n`,
  );

  // BarWidget: valid source, valid doc
  const barDir = path.join(compDir, 'BarWidget');
  fs.mkdirSync(barDir, {recursive: true});
  fs.writeFileSync(
    path.join(barDir, 'BarWidget.tsx'),
    `export const BarWidget = () => null;\n`,
  );
  fs.writeFileSync(
    path.join(barDir, 'BarWidget.doc.mjs'),
    `export const docs = {
      type: 'component',
      name: 'BarWidget',
      category: 'Data',
      group: 'Widgets',
      keywords: ['bar', 'widget'],
      usage: { description: 'A valid bar widget.' },
      props: [{ name: 'value', type: 'number', description: 'The value.' }],
    };\n`,
  );

  // ── Templates (valid, other contribution kind) ────────────────────

  const tDir = path.join(pkgDir, 'templates');
  fs.mkdirSync(tDir, {recursive: true});
  fs.writeFileSync(
    path.join(tDir, 'hero.doc.mjs'),
    `export default { type: 'block', name: 'Hero', description: 'A hero section' };\n`,
  );
  fs.writeFileSync(
    path.join(tDir, 'hero.tsx'),
    `export default function Hero() { return null; }\n`,
  );

  return pkgDir;
}

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-fr9-invalid-doc-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

// ── A. Project ─────────────────────────────────────────────────────

describe('Project — invalid component metadata (FR9)', () => {
  it('omits a component whose doc.mjs has a syntax error', async () => {
    scaffoldInvalidDoc();
    const project = await Project.load(tmpDir);
    const comps = await project.components();

    expect(comps.find(c => c.name === 'FooWidget')).toBeUndefined();
  });

  it('retains a valid sibling in the same integration', async () => {
    scaffoldInvalidDoc();
    const project = await Project.load(tmpDir);
    const comps = await project.components();

    expect(
      comps.find(c => c.name === 'BarWidget' && c.package === '@acme/widgets'),
    ).toBeDefined();
  });

  it('reports the invalid doc as an invalid_component issue', async () => {
    scaffoldInvalidDoc();
    const project = await Project.load(tmpDir);
    await project.components(); // trigger discovery
    const issues = await project.issues();

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: '@acme/widgets',
          code: 'invalid_component',
          severity: 'error',
        }),
      ]),
    );
  });

  it('preserves other contribution kinds from the same integration', async () => {
    scaffoldInvalidDoc();
    const project = await Project.load(tmpDir);

    const templates = await project.templates();
    expect(templates.find(t => t.package === '@acme/widgets')).toBeDefined();

    const comps = await project.components();
    expect(comps.find(c => c.name === 'FooWidget')).toBeUndefined();
    expect(
      comps.find(c => c.name === 'BarWidget' && c.package === '@acme/widgets'),
    ).toBeDefined();
  });
});

// ── B. CLI component --list ────────────────────────────────────────

describe('component --list — invalid component metadata (FR9)', () => {
  it('does not list a component whose doc.mjs has a syntax error', async () => {
    scaffoldInvalidDoc();
    const r = await component(undefined, {cwd: tmpDir, list: true});
    const allNames = Object.values(r.data.components)
      .flat()
      .map(c => c.name);

    expect(allNames).not.toContain('FooWidget');
  });

  it('lists the valid sibling', async () => {
    scaffoldInvalidDoc();
    const r = await component(undefined, {cwd: tmpDir, list: true});
    const allNames = Object.values(r.data.components)
      .flat()
      .map(c => c.name);

    expect(allNames).toContain('BarWidget');
  });
});

// ── C. Search ──────────────────────────────────────────────────────

describe('search — invalid component metadata (FR9)', () => {
  it('does not return a component with invalid metadata', async () => {
    scaffoldInvalidDoc();
    const r = await search('FooWidget', {cwd: tmpDir, type: 'component'});

    expect(r.data.results.find(x => x.name === 'FooWidget')).toBeUndefined();
  });

  it('returns the valid sibling', async () => {
    scaffoldInvalidDoc();
    const r = await search('BarWidget', {cwd: tmpDir, type: 'component'});

    expect(r.data.results.find(x => x.name === 'BarWidget')).toBeDefined();
  });
});

describe('build — invalid component metadata (FR9)', () => {
  it('omits the invalid component and retains its valid sibling', async () => {
    scaffoldInvalidDoc();
    const invalid = await build('FooWidget', {
      cwd: tmpDir,
      type: 'component',
    });
    const valid = await build('BarWidget', {
      cwd: tmpDir,
      type: 'component',
    });
    if (invalid.type !== 'build.kit' || valid.type !== 'build.kit') {
      throw new Error('expected build.kit');
    }

    expect(invalid.data.domain.some(entry => entry.name === 'FooWidget')).toBe(
      false,
    );
    expect(valid.data.domain.some(entry => entry.name === 'BarWidget')).toBe(
      true,
    );
  });
});

// ── D. Doctor ──────────────────────────────────────────────────────

describe('doctor — invalid component metadata (FR9)', () => {
  it('reports integration-issues as a warning when a component doc is invalid', async () => {
    scaffoldInvalidDoc();
    const report = await doctor({cwd: tmpDir});
    const check = report.data.checks.find(c => c.id === 'integration-issues');

    expect(check.status).toBe('warn');
    expect(check.message).toMatch(
      /invalid_component|FooWidget|invalid metadata/i,
    );
  });
});

// ── E. Detail ──────────────────────────────────────────────────────

describe('component detail — invalid component metadata (FR9)', () => {
  it('throws a descriptive error for a component with invalid metadata', async () => {
    scaffoldInvalidDoc();

    await expect(component('FooWidget', {cwd: tmpDir})).rejects.toThrow(
      /Cannot load|invalid metadata|FooWidget/i,
    );
  });

  it('does not throw a raw SyntaxError (must be wrapped)', async () => {
    scaffoldInvalidDoc();

    try {
      await component('FooWidget', {cwd: tmpDir});
      expect.unreachable('should have thrown');
    } catch (e) {
      // A raw SyntaxError from import() is the current broken behavior.
      // The fix wraps it with context.
      expect(e.constructor.name).not.toBe('SyntaxError');
    }
  });

  it('ignores an invalid integration owner when Core has a valid component', async () => {
    scaffoldInvalidDoc();

    const detail = await component('Button', {cwd: tmpDir});
    expect(detail.type).toBe('component.detail');
    expect(detail.data.package).toBe('@astryxdesign/core');

    const source = await component('Button', {cwd: tmpDir, source: true});
    expect(source.type).toBe('component.detail.source');
    expect(source.data.source).not.toContain('BrokenIntegrationButton');
  });

  it('keeps explicit access to an invalid integration owner diagnostic and source', async () => {
    scaffoldInvalidDoc();

    await expect(
      component('Button', {cwd: tmpDir, package: '@acme/widgets'}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_DOC'});

    const source = await component('Button', {
      cwd: tmpDir,
      package: '@acme/widgets',
      source: true,
    });
    expect(source.type).toBe('component.detail.source');
    expect(source.data.source).toContain('BrokenIntegrationButton');
  });

  it('loads a valid sibling without error', async () => {
    scaffoldInvalidDoc();
    const r = await component('BarWidget', {cwd: tmpDir});

    expect(r.type).toBe('component.detail');
    expect(r.data.name).toBe('BarWidget');
    expect(r.data.package).toBe('@acme/widgets');
  });

  it('returns source for a component with invalid metadata (source is valid)', async () => {
    scaffoldInvalidDoc();
    const r = await component('FooWidget', {cwd: tmpDir, source: true});

    expect(r.type).toBe('component.detail.source');
    expect(r.data.source).toContain('FooWidget');
  });
});
