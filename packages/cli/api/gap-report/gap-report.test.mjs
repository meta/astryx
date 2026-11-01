// Copyright (c) Meta Platforms, Inc. and affiliates.

import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Project} from '../../foundation/config/project.mjs';
import {
  ASK_DESTINATION_MESSAGE,
  GAP_REPORT_CATEGORIES,
  PUBLIC_CONFIRMATION_MESSAGE,
  collectGapReportHandlers,
  deliverGapReportHandlers,
  gapReport,
} from './gap-report.mjs';

let projectDir;

function configure(integrations = [], opts = {}) {
  const config = {integrations, ...opts};
  fs.writeFileSync(
    path.join(projectDir, 'astryx.config.mjs'),
    `export default ${JSON.stringify(config)};\n`,
  );
}

function packageDir(packageName) {
  return path.join(projectDir, 'node_modules', ...packageName.split('/'));
}

function addCoreComponent(component = 'Button') {
  const coreDir = packageDir('@astryxdesign/core');
  const componentDir = path.join(coreDir, 'src', component);
  fs.mkdirSync(componentDir, {recursive: true});
  fs.writeFileSync(
    path.join(coreDir, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version: '0.5.4'}),
  );
  fs.writeFileSync(
    path.join(componentDir, `${component}.doc.mjs`),
    `export default {name: ${JSON.stringify(component)}, usage: {description: 'Core fixture'}, props: []};\n`,
  );
  fs.writeFileSync(
    path.join(componentDir, `${component}.tsx`),
    `export const ${component} = null;\n`,
  );
}

/**
 * Add an integration with a handler (function-based, not executable).
 * @param {object} opts
 * @param {string} opts.name
 * @param {'internal'|'public'} [opts.audience]
 * @param {string} [opts.issuesUrl]
 * @param {string} [opts.component]
 * @param {boolean} [opts.handler] whether to export a gapReport handler
 * @param {string} [opts.handleBody] JS code for the handle function body
 * @param {string} [opts.malformedExport] raw JS to export instead of a proper handler
 */
function addIntegration({
  name,
  audience = 'public',
  issuesUrl,
  component,
  handler = true,
  handleBody = "return {status: 'filed', message: 'Handled by ' + " +
    JSON.stringify(name) +
    '};',
  malformedExport,
}) {
  const dir = packageDir(name);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version: '1.2.3'}),
  );

  const manifest = {};
  if (issuesUrl) manifest.issuesUrl = issuesUrl;
  if (component) {
    manifest.components = './components';
    const components = path.join(dir, 'components');
    fs.mkdirSync(components, {recursive: true});
    fs.writeFileSync(
      path.join(components, `${component}.doc.mjs`),
      `export default {name: ${JSON.stringify(component)}, usage: {description: 'Fixture'}, props: []};\n`,
    );
    fs.writeFileSync(
      path.join(components, `${component}.tsx`),
      `export const ${component} = null;\n`,
    );
  }

  let namedExport = '';
  if (malformedExport != null) {
    namedExport = malformedExport;
  } else if (handler) {
    namedExport = `export const gapReport = {\n  audience: ${JSON.stringify(audience)},\n  handle: async (report, {signal}) => { ${handleBody} },\n};\n`;
  }

  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    `${namedExport}export default ${JSON.stringify(manifest)};\n`,
  );
  return {dir};
}

/**
 * Add an integration whose module throws on import, so it never loads.
 * @param {string} name
 */
function addBrokenIntegration(name) {
  const dir = packageDir(name);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version: '1.0.0', type: 'module'}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    "throw new Error('intentional integration load failure');\n",
  );
}

/**
 * Put a fake `gh` first on PATH that records its arguments if it is called.
 * @returns {string} the file the fake writes when invoked
 */
function stubGh() {
  const binDir = path.join(projectDir, 'bin');
  const argsFile = path.join(projectDir, 'gh-args.json');
  fs.mkdirSync(binDir, {recursive: true});
  fs.writeFileSync(
    path.join(binDir, 'gh'),
    `#!/usr/bin/env node
import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
console.log('https://github.com/acme/core/issues/42');
`,
    {mode: 0o755},
  );
  fs.chmodSync(path.join(binDir, 'gh'), 0o755);
  vi.stubEnv('PATH', `${binDir}${path.delimiter}${process.env.PATH ?? ''}`);
  return argsFile;
}

const reportOptions = {
  category: 'missing_variant',
  reason: 'Need a compact size',
  detail: 'The current size does not fit the toolbar.',
};

beforeEach(() => {
  projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-gap-report-'));
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({name: 'fixture-app'}),
  );
  configure();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(projectDir, {recursive: true, force: true});
});

describe('gapReport categories and validation', () => {
  it('preserves the legacy category vocabulary', async () => {
    const result = await gapReport(undefined, {listCategories: true});
    expect(result).toEqual({
      type: 'gap-report.categories',
      data: GAP_REPORT_CATEGORIES,
    });
    expect(result.data.map(item => item.value)).toEqual([
      'missing_component',
      'missing_variant',
      'layout_gap',
      'styling_gap',
      'a11y_gap',
      'api_friction',
      'docs_gap',
      'other',
    ]);
  });

  it('rejects missing, unknown, and oversized report fields', async () => {
    await expect(
      gapReport(undefined, {...reportOptions, cwd: projectDir}),
    ).rejects.toMatchObject({code: 'ERR_MISSING_ARGUMENT'});
    await expect(
      gapReport('Button', {
        ...reportOptions,
        category: 'not_real',
        cwd: projectDir,
      }),
    ).rejects.toMatchObject({code: 'ERR_UNKNOWN_CATEGORY'});
    await expect(
      gapReport('Button', {
        ...reportOptions,
        detail: 'x'.repeat(8001),
        cwd: projectDir,
      }),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });
});

describe('gapReport fan-out composition', () => {
  it('project handler and integration handler both run in order', async () => {
    const name = '@test/integration-one';
    addIntegration({
      name,
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'from integration'};",
    });

    // Write config with project handler + integration
    fs.writeFileSync(
      path.join(projectDir, 'astryx.config.mjs'),
      `
export default {
  integrations: [${JSON.stringify(name)}],
  gapReport: {
    audience: 'internal',
    handle: (report) => ({status: 'filed', message: 'from project'}),
  },
};
`,
    );

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.status).toBe('filed');
    expect(result.data.deliveries).toHaveLength(2);
    expect(
      result.data.deliveries.map(({handlerType, handler, audience}) => ({
        handlerType,
        handler,
        audience,
      })),
    ).toEqual([
      {handlerType: 'project', handler: 'project', audience: 'internal'},
      {
        handlerType: 'integration',
        handler: name,
        audience: 'internal',
      },
    ]);
    expect(result.data.deliveries[0].message).toBe('from project');
    expect(result.data.deliveries[1].message).toBe('from integration');
    expect(result.data.filedCount).toBe(2);
  });

  it('runs the self-resolved local package handler', async () => {
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({name: '@test/local', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(projectDir, 'astryx.integration.mjs'),
      `export const gapReport = {
  audience: 'internal',
  handle(report) { return {status: 'filed', message: report.component}; },
};
export default {};
`,
    );

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toEqual([
      expect.objectContaining({
        handlerType: 'integration',
        handler: '@test/local',
        audience: 'internal',
        status: 'filed',
        message: 'General',
      }),
    ]);
  });

  it('all integration handlers run in config order', async () => {
    addIntegration({
      name: '@test/first',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'first'};",
    });
    addIntegration({
      name: '@test/second',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'second'};",
    });
    addIntegration({
      name: '@test/third',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'third'};",
    });
    configure(['@test/first', '@test/second', '@test/third']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(3);
    expect(result.data.deliveries.map(d => d.handler)).toEqual([
      '@test/first',
      '@test/second',
      '@test/third',
    ]);
    expect(result.data.deliveries.map(d => d.message)).toEqual([
      'first',
      'second',
      'third',
    ]);
    expect(result.data.filedCount).toBe(3);
    expect(result.data.status).toBe('filed');
  });

  it('deduplicates handlers by handle function identity', async () => {
    // Create two integrations that share the same handle function
    const sharedDir = path.join(projectDir, 'shared-handler');
    fs.mkdirSync(sharedDir, {recursive: true});
    fs.writeFileSync(
      path.join(sharedDir, 'handler.mjs'),
      "export const handle = async (report) => ({status: 'filed', message: 'shared'});\n",
    );

    const dir1 = packageDir('@test/first');
    fs.mkdirSync(dir1, {recursive: true});
    fs.writeFileSync(
      path.join(dir1, 'package.json'),
      JSON.stringify({name: '@test/first', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(dir1, 'astryx.integration.mjs'),
      `import {handle} from ${JSON.stringify(path.join(sharedDir, 'handler.mjs'))};\nexport const gapReport = {audience: 'internal', handle};\nexport default {};\n`,
    );

    const dir2 = packageDir('@test/second');
    fs.mkdirSync(dir2, {recursive: true});
    fs.writeFileSync(
      path.join(dir2, 'package.json'),
      JSON.stringify({name: '@test/second', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(dir2, 'astryx.integration.mjs'),
      `import {handle} from ${JSON.stringify(path.join(sharedDir, 'handler.mjs'))};\nexport const gapReport = {audience: 'internal', handle};\nexport default {};\n`,
    );

    configure(['@test/first', '@test/second']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(1);
    expect(result.data.deliveries[0].message).toBe('shared');
  });

  it('deduplicates the same handle across project and integration', () => {
    const handle = async () => ({status: 'filed', message: 'shared'});
    const entries = collectGapReportHandlers(
      /** @type {any} */ ({
        config: {gapReport: {audience: 'internal', handle}},
        configPath: '/tmp/astryx.config.mjs',
        loadedIntegrations: [
          {
            name: '@test/shared',
            __manifestFile: '/tmp/astryx.integration.mjs',
            __gapReport: {audience: 'internal', handle},
          },
        ],
      }),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'handler',
      handlerType: 'project',
      handlerName: 'project',
    });
  });

  it('each handler receives a fresh structuredClone', async () => {
    addIntegration({
      name: '@test/mutator',
      audience: 'internal',
      handleBody:
        "report.component = 'MUTATED'; return {status: 'filed', message: report.component};",
    });
    addIntegration({
      name: '@test/reader',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: report.component};",
    });
    configure(['@test/mutator', '@test/reader']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries[0].message).toBe('MUTATED');
    expect(result.data.deliveries[1].message).toBe('General');
  });

  it('repeated Project.load does not duplicate handlers', async () => {
    addIntegration({
      name: '@test/only',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'once'};",
    });
    configure(['@test/only']);

    // Call twice — second load should not add duplicates
    const result1 = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });
    const result2 = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result1.data.deliveries).toHaveLength(1);
    expect(result2.data.deliveries).toHaveLength(1);
  });

  it('does not treat inheritDebug as a gap-report opt-out', async () => {
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({name: 'fixture-app', astryx: {inheritDebug: false}}),
    );
    addIntegration({
      name: '@test/always',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'still ran'};",
    });
    configure(['@test/always']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(1);
    expect(result.data.deliveries[0]).toMatchObject({
      handler: '@test/always',
      status: 'filed',
    });
  });
});

describe('gapReport handler isolation', () => {
  it('terminates one timed-out handler and then runs the next handler', async () => {
    addIntegration({
      name: '@test/slow',
      audience: 'internal',
      handleBody: 'return new Promise(() => {});',
    });
    addIntegration({
      name: '@test/after',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'after'};",
    });
    configure(['@test/slow', '@test/after']);
    const project = await Project.load(projectDir);

    const deliveries = await deliverGapReportHandlers(
      collectGapReportHandlers(project),
      /** @type {any} */ ({component: 'Button'}),
      {timeoutMs: 200},
    );

    expect(deliveries).toEqual([
      {
        handlerType: 'integration',
        handler: '@test/slow',
        audience: 'internal',
        status: 'failed',
        url: null,
        message: 'Gap report handler timed out.',
      },
      {
        handlerType: 'integration',
        handler: '@test/after',
        audience: 'internal',
        status: 'filed',
        url: null,
        message: 'after',
      },
    ]);
  });

  it('a timed-out late process.exit cannot terminate the caller', () => {
    addIntegration({
      name: '@test/late-exit',
      audience: 'internal',
      handleBody:
        'await new Promise(resolve => setTimeout(resolve, 210)); process.exit(42);',
    });
    addIntegration({
      name: '@test/after-late-exit',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'survived'};",
    });
    configure(['@test/late-exit', '@test/after-late-exit']);

    const projectModule = path.resolve(
      import.meta.dirname,
      '../../foundation/config/project.mjs',
    );
    const gapModule = path.resolve(import.meta.dirname, 'gap-report.mjs');
    const source = `
      const {Project} = await import(${JSON.stringify(projectModule)});
      const {collectGapReportHandlers, deliverGapReportHandlers} = await import(${JSON.stringify(gapModule)});
      const project = await Project.load(${JSON.stringify(projectDir)});
      const deliveries = await deliverGapReportHandlers(
        collectGapReportHandlers(project),
        {component: 'Button'},
        {timeoutMs: 200},
      );
      await new Promise(resolve => setTimeout(resolve, 300));
      process.stdout.write(JSON.stringify(deliveries));
    `;
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', source],
      {encoding: 'utf8', timeout: 5000},
    );

    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toMatchObject([
      {handler: '@test/late-exit', status: 'failed'},
      {handler: '@test/after-late-exit', status: 'filed'},
    ]);
  });

  it('redirects handler stdout and restores the parent stream method', async () => {
    fs.writeFileSync(
      path.join(projectDir, 'astryx.config.mjs'),
      `export default {
  gapReport: {
    audience: 'internal',
    handle() {
      process.stdout.write('handler-noise');
      return {status: 'skipped'};
    },
  },
};\n`,
    );
    const project = await Project.load(projectDir);
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
    const stdoutBefore = process.stdout.write;
    try {
      const deliveries = await deliverGapReportHandlers(
        collectGapReportHandlers(project),
        /** @type {any} */ ({component: 'Button'}),
      );

      expect(deliveries[0].status).toBe('skipped');
      expect(
        stderrWrite.mock.calls.map(call => String(call[0])).join(''),
      ).toContain('handler-noise');
      expect(process.stdout.write).toBe(stdoutBefore);
    } finally {
      stderrWrite.mockRestore();
    }
  });

  it('later handlers run after one throws', async () => {
    addIntegration({
      name: '@test/thrower',
      audience: 'internal',
      handleBody: "throw new Error('handler exploded');",
    });
    addIntegration({
      name: '@test/survivor',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'survived'};",
    });
    configure(['@test/thrower', '@test/survivor']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries[0].status).toBe('failed');
    expect(result.data.deliveries[0].message).toContain('handler exploded');
    expect(result.data.deliveries[1].status).toBe('filed');
    expect(result.data.deliveries[1].message).toBe('survived');
    expect(result.data.status).toBe('partial');
  });

  it('later handlers run after one tries process.exit', async () => {
    addIntegration({
      name: '@test/exiter',
      audience: 'internal',
      handleBody: 'process.exit(42);',
    });
    addIntegration({
      name: '@test/survivor',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'still here'};",
    });
    configure(['@test/exiter', '@test/survivor']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries[0].status).toBe('failed');
    expect(result.data.deliveries[0].message).toContain('process.exit');
    expect(result.data.deliveries[1].status).toBe('filed');
    expect(result.data.filedCount).toBe(1);
  });

  it('later handlers run after one changes process.exitCode', async () => {
    addIntegration({
      name: '@test/exit-code',
      audience: 'internal',
      handleBody:
        "process.exitCode = 42; return {status: 'filed', message: 'wrong'};",
    });
    addIntegration({
      name: '@test/survivor',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'still here'};",
    });
    configure(['@test/exit-code', '@test/survivor']);
    const before = process.exitCode;

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(process.exitCode).toBe(before);
    expect(result.data.deliveries[0]).toMatchObject({
      handler: '@test/exit-code',
      status: 'failed',
      message: 'Handler changed process.exitCode.',
    });
    expect(result.data.deliveries[1]).toMatchObject({
      handler: '@test/survivor',
      status: 'filed',
    });
  });

  it('handler that returns non-receipt is a failed delivery', async () => {
    addIntegration({
      name: '@test/non-receipt',
      audience: 'internal',
      handleBody: "return 'not an object';",
    });
    addIntegration({
      name: '@test/after',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'still ok'};",
    });
    configure(['@test/non-receipt', '@test/after']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries[0].status).toBe('failed');
    expect(result.data.deliveries[1].status).toBe('filed');
  });

  it('malformed integration handler is isolated as a failed delivery', async () => {
    const dir = packageDir('@test/malformed');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: '@test/malformed', version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(dir, 'astryx.integration.mjs'),
      "export const gapReport = {audience: 'internal', command: './writer.mjs'};\nexport default {};\n",
    );

    addIntegration({
      name: '@test/valid',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'ok'};",
    });
    configure(['@test/malformed', '@test/valid']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries.map(d => d.handler)).toEqual([
      '@test/malformed',
      '@test/valid',
    ]);
    expect(result.data.deliveries[0].status).toBe('failed');
    expect(result.data.deliveries[1]).toMatchObject({
      status: 'filed',
      message: 'ok',
    });
  });

  it('an integration that fails to load is a failed delivery, not a missing handler', async () => {
    addBrokenIntegration('@test/broken');
    configure(['@test/broken'], {
      issuesUrl: 'https://github.com/acme/core/issues/new',
    });

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.status).toBe('failed');
    expect(result.data.deliveries).toEqual([
      {
        handlerType: 'integration',
        handler: '@test/broken',
        audience: null,
        status: 'failed',
        url: null,
        message: expect.stringContaining(
          'intentional integration load failure',
        ),
      },
    ]);
  });

  it('an integration that fails to load keeps the public fallback off, even with consent', async () => {
    addBrokenIntegration('@test/broken');
    configure(['@test/broken'], {
      issuesUrl: 'https://github.com/acme/core/issues/new',
    });
    const argsFile = stubGh();

    const result = await gapReport('General', {
      ...reportOptions,
      confirmPublic: true,
      cwd: projectDir,
    });

    expect(result.data.status).toBe('failed');
    expect(result.data.deliveries.map(d => d.handlerType)).toEqual([
      'integration',
    ]);
    expect(fs.existsSync(argsFile)).toBe(false);
  });

  it('an integration that fails to load keeps its place beside working handlers', async () => {
    addBrokenIntegration('@test/broken');
    addIntegration({
      name: '@test/valid',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'ok'};",
    });
    configure(['@test/broken', '@test/valid']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.status).toBe('partial');
    expect(result.data.deliveries.map(d => [d.handler, d.status])).toEqual([
      ['@test/broken', 'failed'],
      ['@test/valid', 'filed'],
    ]);
  });

  it('invalid handler receipt is recorded as failed delivery', async () => {
    addIntegration({
      name: '@test/bad-receipt',
      audience: 'internal',
      handleBody: "return {status: 'invalid_status'};",
    });
    addIntegration({
      name: '@test/good',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'good'};",
    });
    configure(['@test/bad-receipt', '@test/good']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries[0].status).toBe('failed');
    expect(result.data.deliveries[0].message).toContain('invalid receipt');
    expect(result.data.deliveries[1].status).toBe('filed');
  });
});

describe('gapReport per-handler consent', () => {
  it('gates a public project handler until consent is explicit', async () => {
    const marker = path.join(projectDir, 'project-handler-ran');
    fs.writeFileSync(
      path.join(projectDir, 'astryx.config.mjs'),
      `import * as fs from 'node:fs';
export default {
  gapReport: {
    audience: 'public',
    handle() {
      fs.writeFileSync(${JSON.stringify(marker)}, 'yes');
      return {status: 'filed', message: 'project filed'};
    },
  },
};\n`,
    );

    const pending = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });
    expect(pending.data.deliveries[0]).toMatchObject({
      handlerType: 'project',
      handler: 'project',
      audience: 'public',
      status: 'consent_required',
    });
    expect(fs.existsSync(marker)).toBe(false);

    const filed = await gapReport('General', {
      ...reportOptions,
      confirmPublic: true,
      cwd: projectDir,
    });
    expect(filed.data.deliveries[0]).toMatchObject({
      handlerType: 'project',
      handler: 'project',
      audience: 'public',
      status: 'filed',
    });
    expect(fs.readFileSync(marker, 'utf8')).toBe('yes');
  });

  it('public handler is skipped while internal handler runs', async () => {
    addIntegration({
      name: '@test/public-one',
      audience: 'public',
      handleBody: "return {status: 'filed', message: 'public filed'};",
    });
    addIntegration({
      name: '@test/internal-one',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'internal filed'};",
    });
    configure(['@test/public-one', '@test/internal-one']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries[0].status).toBe('consent_required');
    expect(result.data.deliveries[0].message).toBe(PUBLIC_CONFIRMATION_MESSAGE);
    expect(result.data.deliveries[1].status).toBe('filed');
    expect(result.data.deliveries[1].message).toBe('internal filed');
    expect(result.data.filedCount).toBe(1);
  });

  it('multiple internal handlers all run without consent', async () => {
    addIntegration({
      name: '@test/internal-a',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'a'};",
    });
    addIntegration({
      name: '@test/internal-b',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'b'};",
    });
    configure(['@test/internal-a', '@test/internal-b']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(2);
    expect(result.data.deliveries.every(d => d.status === 'filed')).toBe(true);
    expect(result.data.filedCount).toBe(2);
    expect(result.data.status).toBe('filed');
  });

  it('public handler runs when confirmPublic is true', async () => {
    addIntegration({
      name: '@test/public-ok',
      audience: 'public',
      handleBody: "return {status: 'filed', message: 'public worked'};",
    });
    configure(['@test/public-ok']);

    const result = await gapReport('General', {
      ...reportOptions,
      confirmPublic: true,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(1);
    expect(result.data.deliveries[0].status).toBe('filed');
    expect(result.data.deliveries[0].message).toBe('public worked');
  });
});

describe('gapReport fallback behavior', () => {
  it('handlers suppress the built-in fallback', async () => {
    addIntegration({
      name: '@test/has-handler',
      audience: 'internal',
      issuesUrl: 'https://github.com/acme/widgets/issues',
      handleBody: "return {status: 'filed', message: 'handler took it'};",
    });
    configure(['@test/has-handler'], {
      issuesUrl: 'https://github.com/acme/core/issues',
    });

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    // Should use handler, not GitHub fallback
    expect(result.data.deliveries).toHaveLength(1);
    expect(result.data.deliveries[0].message).toBe('handler took it');
  });

  it('no-handler GitHub consent-gated fallback works', async () => {
    configure([], {issuesUrl: 'https://github.com/acme/widgets/issues/new'});
    const binDir = path.join(projectDir, 'bin');
    const argsFile = path.join(projectDir, 'gh-args.json');
    fs.mkdirSync(binDir, {recursive: true});
    fs.writeFileSync(
      path.join(binDir, 'gh'),
      `#!/usr/bin/env node
import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
console.log('https://github.com/acme/widgets/issues/42');
`,
      {mode: 0o755},
    );
    fs.chmodSync(path.join(binDir, 'gh'), 0o755);
    vi.stubEnv('PATH', `${binDir}${path.delimiter}${process.env.PATH ?? ''}`);

    // Without consent
    const pending = await gapReport('Button', {
      ...reportOptions,
      cwd: projectDir,
    });
    expect(pending.data.deliveries[0].status).toBe('consent_required');
    expect(fs.existsSync(argsFile)).toBe(false);

    // With consent
    const filed = await gapReport('Button', {
      ...reportOptions,
      confirmPublic: true,
      cwd: projectDir,
    });
    expect(filed.data.deliveries[0].status).toBe('filed');
    expect(filed.data.status).toBe('filed');
  });

  it('no-handler non-GitHub route returns routed_only', async () => {
    configure([], {issuesUrl: 'https://tracker.example/new'});

    const result = await gapReport('Button', {
      ...reportOptions,
      confirmPublic: true,
      cwd: projectDir,
    });

    expect(result.data.deliveries[0].status).toBe('routed_only');
    expect(result.data.deliveries[0].url).toBe('https://tracker.example/new');
    expect(result.data.status).toBe('routed_only');
  });

  it('no handler and no issues URL throws ERR_NOT_FOUND', async () => {
    // Create a project with an integration that has no handler, no issuesUrl,
    // and target an unknown package explicitly
    const name = '@test/bare';
    const dir = packageDir(name);
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name, version: '1.0.0'}),
    );
    fs.writeFileSync(
      path.join(dir, 'astryx.integration.mjs'),
      'export default {};\n',
    );
    configure([name]);

    await expect(
      gapReport('Button', {
        ...reportOptions,
        package: name,
        cwd: projectDir,
      }),
    ).rejects.toMatchObject({code: 'ERR_NOT_FOUND'});
  });
});

describe('gapReport destinations and --to', () => {
  /** A shared internal handler that records each call in a marker file. */
  function addSharedHandler() {
    const marker = path.join(projectDir, 'shared-called');
    addIntegration({
      name: '@test/shared',
      audience: 'internal',
      handleBody: `(await import('node:fs')).writeFileSync(${JSON.stringify(marker)}, 'x'); return {status: 'filed', message: 'shared'};`,
    });
    return marker;
  }

  function addWidgets(issuesUrl = 'https://github.com/acme/widgets/issues') {
    addIntegration({name: '@test/widgets', handler: false, issuesUrl});
  }

  it('keeps the default route and lists the destinations with the ask line', async () => {
    const marker = addSharedHandler();
    addWidgets();
    configure(['@test/shared', '@test/widgets']);
    const argsFile = stubGh();

    const result = await gapReport('General', {
      ...reportOptions,
      confirmPublic: true,
      cwd: projectDir,
    });

    expect(result.data.deliveries).toEqual([
      expect.objectContaining({handler: '@test/shared', status: 'filed'}),
    ]);
    expect(fs.existsSync(marker)).toBe(true);
    expect(fs.existsSync(argsFile)).toBe(false);
    expect(result.data.destinations).toEqual([
      {to: null, default: true, issuesUrl: null},
      {
        to: '@test/widgets',
        default: false,
        issuesUrl: 'https://github.com/acme/widgets/issues',
      },
    ]);
    expect(result.data.ask).toBe(ASK_DESTINATION_MESSAGE);
    expect(ASK_DESTINATION_MESSAGE).toMatch(/ask the person/i);
  });

  it('lists no destinations when no integration names an issuesUrl', async () => {
    addSharedHandler();
    configure(['@test/shared']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data).not.toHaveProperty('destinations');
    expect(result.data).not.toHaveProperty('ask');
  });

  it('files with the chosen integration GitHub issuesUrl only with consent, and runs no handler', async () => {
    const marker = addSharedHandler();
    addWidgets();
    configure(['@test/shared', '@test/widgets']);
    const argsFile = stubGh();

    const pending = await gapReport('General', {
      ...reportOptions,
      to: '@test/widgets',
      cwd: projectDir,
    });
    expect(pending.data.deliveries).toEqual([
      {
        handlerType: 'fallback',
        handler: 'github',
        audience: 'public',
        status: 'consent_required',
        url: null,
        message: PUBLIC_CONFIRMATION_MESSAGE,
      },
    ]);
    expect(pending.data.issuesUrl).toBe(
      'https://github.com/acme/widgets/issues',
    );
    expect(pending.data).not.toHaveProperty('destinations');
    expect(fs.existsSync(argsFile)).toBe(false);

    const filed = await gapReport('General', {
      ...reportOptions,
      to: '@test/widgets',
      confirmPublic: true,
      cwd: projectDir,
    });
    expect(filed.data.deliveries).toHaveLength(1);
    expect(filed.data.deliveries[0]).toMatchObject({
      handlerType: 'fallback',
      handler: 'github',
      status: 'filed',
    });
    const args = JSON.parse(fs.readFileSync(argsFile, 'utf8'));
    expect(args.slice(0, 4)).toEqual([
      'issue',
      'create',
      '--repo',
      'acme/widgets',
    ]);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('routes a chosen non-GitHub issuesUrl as routed_only', async () => {
    addSharedHandler();
    addWidgets('https://tracker.example/widgets');
    configure(['@test/shared', '@test/widgets']);

    const result = await gapReport('General', {
      ...reportOptions,
      to: '@test/widgets',
      cwd: projectDir,
    });

    expect(result.data.deliveries).toEqual([
      expect.objectContaining({
        handlerType: 'fallback',
        handler: 'issuesUrl',
        status: 'routed_only',
        url: 'https://tracker.example/widgets',
      }),
    ]);
    expect(result.data.status).toBe('routed_only');
  });

  it.each([
    ['a package that is not loaded', '@test/nope'],
    ['a loaded integration without an issuesUrl', '@test/shared'],
  ])(
    'refuses --to naming %s, lists the choices, and sends nothing',
    async (_label, to) => {
      const marker = addSharedHandler();
      addWidgets();
      configure(['@test/shared', '@test/widgets']);

      await expect(
        gapReport('General', {...reportOptions, to, cwd: projectDir}),
      ).rejects.toMatchObject({
        code: 'ERR_UNKNOWN_PACKAGE',
        suggestions: [
          {
            name: '@test/widgets',
            reason: 'https://github.com/acme/widgets/issues',
          },
        ],
      });
      expect(fs.existsSync(marker)).toBe(false);
    },
  );

  it.each([
    ['an empty value', ''],
    ['a blank value', '   '],
    ['an over-long value', `@test/${'a'.repeat(300)}`],
  ])('refuses %s for --to with the destination list', async (_label, to) => {
    const marker = addSharedHandler();
    addWidgets();
    configure(['@test/shared', '@test/widgets']);

    await expect(
      gapReport('General', {...reportOptions, to, cwd: projectDir}),
    ).rejects.toMatchObject({
      code: 'ERR_UNKNOWN_PACKAGE',
      suggestions: [{name: '@test/widgets'}],
    });
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('treats to: null as absent', async () => {
    const marker = addSharedHandler();
    addWidgets();
    configure(['@test/shared', '@test/widgets']);

    const result = await gapReport('General', {
      ...reportOptions,
      to: /** @type {any} */ (null),
      cwd: projectDir,
    });

    expect(result.data.deliveries).toHaveLength(1);
    expect(fs.existsSync(marker)).toBe(true);
    expect(result.data.destinations).toHaveLength(2);
  });

  it('lists the destinations with the categories', async () => {
    addSharedHandler();
    addWidgets();
    configure(['@test/shared', '@test/widgets']);

    const listed = await gapReport(undefined, {
      listCategories: true,
      cwd: projectDir,
    });

    expect(listed.data).toEqual(GAP_REPORT_CATEGORIES);
    expect(listed.meta).toEqual({
      destinations: [
        {to: null, default: true, issuesUrl: null},
        {
          to: '@test/widgets',
          default: false,
          issuesUrl: 'https://github.com/acme/widgets/issues',
        },
      ],
      ask: ASK_DESTINATION_MESSAGE,
    });
  });

  it('adds no meta to the categories when there is only the default', async () => {
    configure([]);
    const listed = await gapReport(undefined, {
      listCategories: true,
      cwd: projectDir,
    });
    expect(listed).not.toHaveProperty('meta');
  });

  it('refuses --to with --list-categories', async () => {
    await expect(
      gapReport(undefined, {
        listCategories: true,
        to: '@test/widgets',
        cwd: projectDir,
      }),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });
});

describe('gapReport target selection', () => {
  it('routes to the unique component owner', async () => {
    addIntegration({
      name: '@test/owner',
      audience: 'internal',
      component: 'TargetWidget',
      handleBody: "return {status: 'filed', message: report.target.package};",
    });
    configure(['@test/owner']);

    const result = await gapReport('XDSTargetWidget', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.package).toBe('@test/owner');
    expect(result.data.deliveries[0].message).toBe('@test/owner');
  });

  it('uses explicit package', async () => {
    addIntegration({
      name: '@test/first',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'first'};",
    });
    addIntegration({
      name: '@test/second',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'second'};",
    });
    configure(['@test/first', '@test/second']);

    const result = await gapReport('General', {
      ...reportOptions,
      package: '@test/second',
      cwd: projectDir,
    });

    expect(result.data.package).toBe('@test/second');
    // Both handlers still run (fan-out)
    expect(result.data.deliveries).toHaveLength(2);
  });

  it('falls back to Core when no component owner found', async () => {
    addIntegration({
      name: '@test/no-match',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: report.target.package};",
    });
    configure(['@test/no-match']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.package).toBe('@astryxdesign/core');
  });

  it('requires --package when multiple packages own the component', async () => {
    addIntegration({
      name: '@test/first',
      component: 'SharedWidget',
      audience: 'internal',
    });
    addIntegration({
      name: '@test/second',
      component: 'SharedWidget',
      audience: 'internal',
    });
    configure(['@test/first', '@test/second']);

    await expect(
      gapReport('SharedWidget', {...reportOptions, cwd: projectDir}),
    ).rejects.toMatchObject({code: 'ERR_AMBIGUOUS_COMPONENT'});
  });
});

describe('gapReport aggregate status and CLI exit', () => {
  it('all filed → status filed', async () => {
    addIntegration({
      name: '@test/a',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'a'};",
    });
    configure(['@test/a']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });
    expect(result.data.status).toBe('filed');
  });

  it('mix of filed and failed → status partial', async () => {
    addIntegration({
      name: '@test/fail',
      audience: 'internal',
      handleBody: "throw new Error('boom');",
    });
    addIntegration({
      name: '@test/ok',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'ok'};",
    });
    configure(['@test/fail', '@test/ok']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });
    expect(result.data.status).toBe('partial');
  });

  it('mix of failed and consent-required → status partial', async () => {
    addIntegration({
      name: '@test/fail',
      audience: 'internal',
      handleBody: "throw new Error('boom');",
    });
    addIntegration({
      name: '@test/public',
      audience: 'public',
      handleBody: "return {status: 'filed', message: 'public'};",
    });
    configure(['@test/fail', '@test/public']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.status).toBe('partial');
    expect(result.data.deliveries.map(d => d.status)).toEqual([
      'failed',
      'consent_required',
    ]);
  });

  it('all failed → status failed', async () => {
    addIntegration({
      name: '@test/fail1',
      audience: 'internal',
      handleBody: "throw new Error('boom');",
    });
    configure(['@test/fail1']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });
    expect(result.data.status).toBe('failed');
  });

  it('report event shape is plain camelCase with no internal context', async () => {
    addIntegration({
      name: '@test/inspector',
      audience: 'internal',
      handleBody: `
        const keys = Object.keys(report).sort();
        const targetKeys = Object.keys(report.target).sort();
        return {
          status: 'filed',
          message: JSON.stringify({
            keys,
            targetKeys,
            source: report.source,
            sv: report.schemaVersion,
          }),
        };
      `,
    });
    configure(['@test/inspector']);
    vi.stubEnv('AGENT', 'secret-agent');

    const result = await gapReport('Button', {
      ...reportOptions,
      cwd: projectDir,
    });

    const info = JSON.parse(result.data.deliveries[0].message);
    expect(info.sv).toBe(1);
    expect(info.source).toBe('ai');
    expect(info.keys).toEqual([
      'category',
      'categoryLabel',
      'component',
      'detail',
      'intention',
      'schemaVersion',
      'source',
      'target',
      'timestamp',
    ]);
    expect(info.targetKeys).toEqual(['issuesUrl', 'package', 'version']);
    // No handler-private context fields or raw agent identifiers
    expect(result.data.deliveries[0].message).not.toContain('debug');
    expect(result.data.deliveries[0].message).not.toContain('context');
    expect(result.data.deliveries[0].message).not.toContain('secret-agent');
  });

  it('receipt type is gap-report.file for the aggregate response', async () => {
    addIntegration({
      name: '@test/basic',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'ok'};",
    });
    configure(['@test/basic']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.type).toBe('gap-report.file');
    expect(result.data).toHaveProperty('deliveries');
    expect(result.data).toHaveProperty('filedCount');
    expect(result.data).toHaveProperty('routedOnlyCount');
    expect(result.data).toHaveProperty('status');
    expect(result.data).toHaveProperty('package');
    expect(result.data).toHaveProperty('issuesUrl');
  });
});

describe('gapReport strict receipt validation', () => {
  it('rejects receipt with unknown fields', async () => {
    addIntegration({
      name: '@test/extra-fields',
      audience: 'internal',
      handleBody: "return {status: 'filed', message: 'ok', extra: true};",
    });
    configure(['@test/extra-fields']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries[0].status).toBe('failed');
  });

  it('rejects routed_only without url', async () => {
    addIntegration({
      name: '@test/no-url',
      audience: 'internal',
      handleBody: "return {status: 'routed_only', message: 'but no url'};",
    });
    configure(['@test/no-url']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries[0].status).toBe('failed');
  });

  it('accepts valid routed_only with url', async () => {
    addIntegration({
      name: '@test/routed',
      audience: 'internal',
      handleBody:
        "return {status: 'routed_only', url: 'https://example.com/issue/1'};",
    });
    configure(['@test/routed']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries[0].status).toBe('routed_only');
    expect(result.data.routedOnlyCount).toBe(1);
  });

  it('accepts skipped without url or message', async () => {
    addIntegration({
      name: '@test/skipper',
      audience: 'internal',
      handleBody: "return {status: 'skipped'};",
    });
    configure(['@test/skipper']);

    const result = await gapReport('General', {
      ...reportOptions,
      cwd: projectDir,
    });

    expect(result.data.deliveries[0].status).toBe('skipped');
    expect(result.data.status).toBe('skipped');
  });
});
