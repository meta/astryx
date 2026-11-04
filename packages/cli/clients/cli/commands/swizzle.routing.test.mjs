// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration-routing tests for `astryx swizzle`.
 *
 * `rewriteImports` is unit-tested in swizzle.test.mjs. These tests exercise the
 * end-to-end command behavior by running the CLI in-process against hermetic
 * fixtures: a fake @astryxdesign/core under node_modules plus, for the
 * integration cases, a configured integration package (astryx.config.mjs +
 * astryx.integration.mjs + a `components` dir) — all under node_modules so the
 * config/manifest loaders resolve normally.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';

/** The StyleX runtime that Core ships with, resolved the way Core resolves it. */
const CORE_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../core/package.json',
);

/**
 * Build a fake @astryxdesign/core under <project>/node_modules with a single
 * swizzleable Button component (bare `Button.tsx`, no doc).
 */
function buildFakeCore(project) {
  const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
  const buttonDir = path.join(core, 'src', 'Button');
  fs.mkdirSync(buttonDir, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    '{"name":"@astryxdesign/core","version":"0.0.13"}',
  );
  fs.writeFileSync(
    path.join(buttonDir, 'Button.tsx'),
    [
      `import {tokens} from '../theme/tokens.stylex';`,
      `import {helper} from './helper';`,
      `export const Button = () => null;`,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(buttonDir, 'helper.ts'),
    `export const helper = 1;\n`,
  );
  return core;
}

/**
 * Build a configured integration package `@test/meta` under
 * <project>/node_modules with a same-stem component (source + doc) and an
 * escaping import, plus a colocated test file. Writes astryx.config.mjs at the
 * project root listing the integration.
 *
 * @param {string} project
 * @param {{issuesUrl?: string|null, componentName?: string}} [opts]
 */
function buildIntegration(project, {issuesUrl, componentName = 'MetaAppShell'} = {}) {
  const intDir = path.join(project, 'node_modules', '@test', 'meta');
  const compRoot = path.join(intDir, 'components');
  const compDir = path.join(compRoot, componentName);
  fs.mkdirSync(compDir, {recursive: true});
  fs.writeFileSync(
    path.join(intDir, 'package.json'),
    JSON.stringify({name: '@test/meta', version: '1.2.3'}),
  );
  const manifest = {components: './components'};
  if (issuesUrl) manifest.issuesUrl = issuesUrl;
  fs.writeFileSync(
    path.join(intDir, 'astryx.integration.mjs'),
    `export default ${JSON.stringify(manifest)};\n`,
  );
  fs.writeFileSync(
    path.join(compDir, `${componentName}.tsx`),
    [
      `import x from '../utils/foo';`,
      `import {sib} from './sibling';`,
      `export function ${componentName}() { return x; }`,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(compDir, 'sibling.ts'),
    `export const sib = 1;\n`,
  );
  fs.writeFileSync(
    path.join(compDir, `${componentName}.doc.mjs`),
    `export const docs = {name: '${componentName}', usage: {description: 'x'}};\n`,
  );
  fs.writeFileSync(
    path.join(compDir, `${componentName}.test.tsx`),
    `it('noop', () => {});\n`,
  );
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    `export default {integrations: ['@test/meta']};\n`,
  );
  return {intDir, compDir};
}

function writeProjectPackageJson(project, extra = {}) {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'consumer', version: '1.0.0', ...extra}),
  );
}

let tmpDir;
let project;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-routing-'));
  project = path.join(tmpDir, 'project');
  fs.mkdirSync(project, {recursive: true});
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('swizzle — core feedback routing via config', () => {
  it('routes core feedback to config.issuesUrl when set', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    fs.writeFileSync(
      path.join(project, 'astryx.config.mjs'),
      `export default {issuesUrl: 'https://github.com/acme/ds/issues'};\n`,
    );

    const result = await runCli(['--json', 'swizzle', 'Button', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.type).toBe('swizzle.copy');
    expect(env.data.package).toBe('@astryxdesign/core');
    expect(env.data.feedback.issuesUrl).toBe('https://github.com/acme/ds/issues');
    // Escaping import rewritten to core; sibling import preserved.
    const out = fs.readFileSync(
      path.join(project, 'components', 'astryx', 'Button', 'Button.tsx'),
      'utf-8',
    );
    expect(out).toContain(`from '@astryxdesign/core/theme/tokens.stylex'`);
    expect(out).toContain(`from './helper'`);
  });

  it('falls back to the default issues URL when config has none', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);

    const result = await runCli(['--json', 'swizzle', 'Button', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.data.feedback.issuesUrl).toBe(
      'https://github.com/meta/astryx/issues/new',
    );
  });
});

describe('swizzle — integration-owned components', () => {
  it('copies the component dir (excluding test/doc), rewrites escaping imports to the owner package, routes feedback to the integration issuesUrl', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {issuesUrl: 'https://example.com/meta/issues'});

    const result = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.type).toBe('swizzle.copy');
    expect(env.data.package).toBe('@test/meta');
    // Doc + test excluded from the copy.
    expect(env.data.files).toContain('MetaAppShell.tsx');
    expect(env.data.files).toContain('sibling.ts');
    expect(env.data.files).not.toContain('MetaAppShell.doc.mjs');
    expect(env.data.files.some(f => f.includes('.test.'))).toBe(false);
    // Feedback routed to the integration's issues URL.
    expect(env.data.feedback.issuesUrl).toBe('https://example.com/meta/issues');

    const outDir = path.join(project, 'components', 'astryx', 'MetaAppShell');
    expect(fs.existsSync(path.join(outDir, 'MetaAppShell.doc.mjs'))).toBe(false);
    const out = fs.readFileSync(path.join(outDir, 'MetaAppShell.tsx'), 'utf-8');
    expect(out).toContain(`from '@test/meta/utils'`);
    expect(out).toContain(`from './sibling'`);
  });

  it('omits the feedback note when the integration ships no issuesUrl', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {issuesUrl: null});

    const result = await runCli(['--json', 'swizzle', 'MetaAppShell', '-f'], project);
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.type).toBe('swizzle.copy');
    expect(env.data.package).toBe('@test/meta');
    expect(env.data.feedback).toBeUndefined();
  });
});

describe('swizzle — ambiguous ownership', () => {
  it('errors when a name is owned by core + an integration and no --package is given', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    // Integration also provides "Button" (collides with core).
    buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
      componentName: 'Button',
    });

    const result = await runCli(['--json', 'swizzle', 'Button', '-f'], project);
    expect(result.code).not.toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.code).toBe('ERR_AMBIGUOUS_COMPONENT');
    const pkgs = (env.suggestions ?? []).map(s => s.name);
    expect(pkgs).toContain('@astryxdesign/core');
    expect(pkgs).toContain('@test/meta');
  });

  it('--package resolves an ambiguous name to the integration', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
      componentName: 'Button',
    });

    const result = await runCli(
      ['--json', 'swizzle', 'Button', '--package', '@test/meta', '-f'],
      project,
    );
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.data.package).toBe('@test/meta');
    const out = fs.readFileSync(
      path.join(project, 'components', 'astryx', 'Button', 'Button.tsx'),
      'utf-8',
    );
    expect(out).toContain(`from '@test/meta/utils'`);
  });

  it('--package resolves an ambiguous name to core', async () => {
    buildFakeCore(project);
    writeProjectPackageJson(project);
    buildIntegration(project, {
      issuesUrl: 'https://example.com/meta/issues',
      componentName: 'Button',
    });

    const result = await runCli(
      ['--json', 'swizzle', 'Button', '--package', '@astryxdesign/core', '-f'],
      project,
    );
    expect(result.code).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env.data.package).toBe('@astryxdesign/core');
    const out = fs.readFileSync(
      path.join(project, 'components', 'astryx', 'Button', 'Button.tsx'),
      'utf-8',
    );
    expect(out).toContain(`from '@astryxdesign/core/theme/tokens.stylex'`);
  });
});

/**
 * Build a fake @astryxdesign/core with a component that imports StyleX directly
 * (so the swizzle StyleX-build note should fire) and one that doesn't.
 */
function buildStyleXCore(project) {
  const core = path.join(project, 'node_modules', '@astryxdesign', 'core');
  // StyleX component.
  const styledDir = path.join(core, 'src', 'Styled');
  fs.mkdirSync(styledDir, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    '{"name":"@astryxdesign/core","version":"0.0.13"}',
  );
  fs.writeFileSync(
    path.join(styledDir, 'Styled.tsx'),
    [
      `import * as stylex from '@stylexjs/stylex';`,
      `const styles = stylex.create({base: {color: 'red'}});`,
      `export const Styled = () => null;`,
      '',
    ].join('\n'),
  );
  // Plain component (no StyleX).
  const plainDir = path.join(core, 'src', 'Plain');
  fs.mkdirSync(plainDir, {recursive: true});
  fs.writeFileSync(
    path.join(plainDir, 'Plain.tsx'),
    `export const Plain = () => null;\n`,
  );
  return core;
}

describe('swizzle — StyleX build setup note (#3373)', () => {
  it('reports usesStyleX and prints a setup note for StyleX components', async () => {
    buildStyleXCore(project);
    writeProjectPackageJson(project);

    // JSON payload carries the machine-readable flag.
    const jsonResult = await runCli(['--json', 'swizzle', 'Styled', '-f'], project);
    expect(jsonResult.code).toBe(0);
    const env = JSON.parse(jsonResult.stdout);
    expect(env.data.usesStyleX).toBe(true);

    // Human output surfaces the compiler requirement + Next.js caveat.
    const humanResult = await runCli(['swizzle', 'Styled', '-f'], project);
    expect(humanResult.code).toBe(0);
    expect(humanResult.stdout).toMatch(/StyleX compiler/i);
    expect(humanResult.stdout).toMatch(/importing them throws "Unexpected 'stylex\.create' call at runtime"/);
    expect(humanResult.stdout).not.toMatch(/unstyled/i);
    expect(humanResult.stdout).toMatch(/next\/font/i);
    // The fixture has no `astryx` bin installed, so the note names the scoped package.
    expect(humanResult.stdout).toMatch(/@astryxdesign\/cli@\S+ docs styling/);
  });

  // The note quotes what StyleX does without a compiler; this keeps it true.
  it('matches what the StyleX runtime does when styles are not compiled', () => {
    const stylex = createRequire(CORE_PACKAGE)('@stylexjs/stylex');
    expect(() => stylex.create({root: {color: 'red'}})).toThrow(
      /Unexpected 'stylex\.create' call at runtime/,
    );
  });

  it('does not print the StyleX note for components without StyleX', async () => {
    buildStyleXCore(project);
    writeProjectPackageJson(project);

    const jsonResult = await runCli(['--json', 'swizzle', 'Plain', '-f'], project);
    expect(jsonResult.code).toBe(0);
    const env = JSON.parse(jsonResult.stdout);
    expect(env.data.usesStyleX).toBe(false);

    const humanResult = await runCli(['swizzle', 'Plain', '-f'], project);
    expect(humanResult.code).toBe(0);
    expect(humanResult.stdout).not.toMatch(/StyleX compiler/i);
  });
});
