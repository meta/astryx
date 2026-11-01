// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Upgrade integration error-policy + --skip-codemod tests.
 *
 * These scaffold a real consumer project (astryx.config.mjs + an installed
 * integration package with codemods) under a REPO-LOCAL temp dir so Vite
 * permits dynamic import of the config/integration modules (it blocks /tmp).
 * They assert:
 *   - a broken integration codemod definition is SKIPPED (warned), not a hard
 *     fail of the upgrade (reverses the previous policy);
 *   - --skip-codemod excludes a named integration codemod.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {Command} from 'commander';
import {registerUpgrade} from './upgrade.mjs';
import {isError} from '../../../api/json/parse.mjs';
import {Project} from '../../../foundation/config/project.mjs';
import {
  generateCompressedIndex,
  renderAgentDocsBlock,
} from '../../../foundation/agent-docs/agent-docs.mjs';

let tmpDir;
let originalCwd;
let logCalls;
let errCalls;
let exitCode;

beforeEach(() => {
  originalCwd = process.cwd();
  // Repo-local temp dir: under cwd so Vite allows config/integration imports.
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-upgrade-policy-'));
  process.chdir(tmpDir);
  logCalls = [];
  errCalls = [];
  exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation((...a) => logCalls.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => errCalls.push(a.join(' ')));
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process, 'exit').mockImplementation(code => {
    exitCode = code;
    throw new Error(`__exit ${code}`);
  });
});

afterEach(() => {
  process.exitCode = undefined;
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
  vi.restoreAllMocks();
});

function writeInstalledCore(version) {
  const dir = path.join(tmpDir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: '@astryxdesign/core', version}),
  );
}

function writeSource() {
  fs.mkdirSync(path.join(tmpDir, 'src'), {recursive: true});
  fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'const foo = 1;\n');
}

/**
 * Scaffold a consumer + an installed integration package with codemods.
 * @param {Object<string,string>} codemodFiles "<version>/<id>.mjs" -> body
 * @param {{agentDocs?: {append?: string[]}, failingPostCodemodHook?: boolean}} [options]
 */
function scaffoldIntegration(
  codemodFiles,
  {agentDocs, failingPostCodemodHook = false} = {},
) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    failingPostCodemodHook
      ? `export default {integrations: ['@acme/widgets'], hooks: {postCodemod: [{name: 'fail', buildCommand: () => ({command: process.execPath, args: ['-e', 'process.exit(1)']})}]}};\n`
      : `export default {integrations: ['@acme/widgets']};\n`,
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  const hasCodemods = Object.keys(codemodFiles).length > 0;
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    `export default ${JSON.stringify({
      ...(hasCodemods ? {codemods: './codemods'} : {}),
      ...(agentDocs ? {agentDocs} : {}),
    })};\n`,
  );
  for (const [rel, body] of Object.entries(codemodFiles)) {
    const full = path.join(pkgDir, 'codemods', rel);
    fs.mkdirSync(path.dirname(full), {recursive: true});
    fs.writeFileSync(full, body);
  }
}

function createProgram() {
  const program = new Command();
  program.exitOverride();
  program.option('--json', 'Output as typed JSON');
  registerUpgrade(program);
  return program;
}

async function runJson(args) {
  const program = createProgram();
  try {
    await program.parseAsync(['node', 'astryx', ...args]);
  } catch (err) {
    if (!String(err?.message || '').startsWith('__exit')) throw err;
  }
  for (let i = logCalls.length - 1; i >= 0; i--) {
    const line = logCalls[i];
    if (line.startsWith('{')) {
      try {
        return JSON.parse(line);
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

async function writePreviousAgentBlock(currentLine, previousLine) {
  const expected = await renderAgentDocsBlock(tmpDir, {
    installedVersion: '0.2.0',
  });
  expect(expected).toContain(currentLine);
  const previous = expected.replace(currentLine, previousLine);
  fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), `# Agents\n\n${previous}\n`);
  return fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
}

describe('upgrade integration error policy (skip + warn)', () => {
  it('leaves the existing block untouched when project config is invalid', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default {integrations: [42]};\n`,
    );
    writeInstalledCore('0.2.0');
    const before = `# Agents\n\n${generateCompressedIndex('0.2.0', {
      agentDocs: [
        {
          package: '@acme/widgets',
          append: ['existing integration line'],
        },
      ],
    })}\n`;
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), before);

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.2.0',
      '--apply',
    ]);

    expect(result.data.agentDocs.action).toBe('error');
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(before);
  });

  it('leaves the existing block untouched when integration agentDocs is invalid', async () => {
    scaffoldIntegration({}, {
      agentDocs: {append: ['Use the current widget workflow.']},
    });
    writeInstalledCore('0.2.0');
    const before = `# Agents\n\n${generateCompressedIndex('0.2.0', {
      agentDocs: [
        {
          package: '@acme/widgets',
          append: ['Use the previous widget workflow.'],
        },
      ],
    })}\n`;
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), before);
    fs.writeFileSync(
      path.join(
        tmpDir,
        'node_modules',
        '@acme',
        'widgets',
        'astryx.integration.mjs',
      ),
      `export default {agentDocs: {append: [' invalid']}};\n`,
    );

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.2.0',
      '--apply',
    ]);

    expect(result.data.agentDocs.action).toBe('error');
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(
      before,
    );
  });

  it('detects and applies a same-Core manifest guidance change without a codemod', async () => {
    const currentLine = 'Use the current widget workflow.';
    const previousLine = 'Use the previous widget workflow.';
    scaffoldIntegration({}, {agentDocs: {append: [currentLine]}});
    writeInstalledCore('0.2.0');
    const before = await writePreviousAgentBlock(currentLine, previousLine);

    const dryRun = await runJson(['--json', 'upgrade', '--from', '0.2.0']);
    expect(dryRun.data.agentDocs.action).toBe('would-refresh');
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(
      before,
    );

    const applied = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.2.0',
      '--apply',
    ]);
    expect(applied.data.agentDocs.action).toBe('refreshed');
    const after = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8');
    expect(after).toContain(currentLine);
    expect(after).not.toContain(previousLine);
  });

  it('preserves the prior block when an integration codemod fails', async () => {
    const currentLine = 'Use the migrated widget workflow.';
    const previousLine = 'Use the pre-migration widget workflow.';
    scaffoldIntegration(
      {
        '0.2.0/fail.mjs': `export default {type: 'code', title: 'Fail', transform: () => {throw new Error('codemod boom')}};\n`,
      },
      {agentDocs: {append: [currentLine]}},
    );
    writeInstalledCore('0.2.0');
    writeSource();
    const before = await writePreviousAgentBlock(currentLine, previousLine);

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.1.0',
      '--path',
      'src',
      '--apply',
    ]);

    expect(result.code).toBe('ERR_CODEMOD_FAILED');
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(
      before,
    );
  });

  it('preserves the prior block when a post-codemod hook fails', async () => {
    const currentLine = 'Use the post-migration widget workflow.';
    const previousLine = 'Use the old widget workflow.';
    scaffoldIntegration(
      {
        '0.2.0/drop-foo.mjs': `export default {type: 'code', title: 'Drop foo', transform: file => file.source.replace(/foo/g, 'bar')};\n`,
      },
      {
        agentDocs: {append: [currentLine]},
        failingPostCodemodHook: true,
      },
    );
    writeInstalledCore('0.2.0');
    writeSource();
    const before = await writePreviousAgentBlock(currentLine, previousLine);

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.1.0',
      '--path',
      'src',
      '--apply',
    ]);

    expect(result.code).toBe('ERR_CODEMOD_FAILED');
    expect(result.receipt).toMatchObject({
      complete: false,
      errorCode: 'ERR_CODEMOD_FAILED',
      agentDocsRefreshed: false,
      modifiedFiles: ['src/index.ts'],
      errors: [expect.objectContaining({codemod: 'post-codemod-hook'})],
    });
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf-8')).toBe(
      before,
    );
  });

  it('renders post-codemod integration membership and order from the rewritten config', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'consumer'}),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      `export default {integrations: ['@acme/migrator', '@acme/old']};\n`,
    );

    const writeIntegration = (name, line, codemod) => {
      const packageDir = path.join(tmpDir, 'node_modules', ...name.split('/'));
      fs.mkdirSync(packageDir, {recursive: true});
      fs.writeFileSync(
        path.join(packageDir, 'package.json'),
        JSON.stringify({name, version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(packageDir, 'astryx.integration.mjs'),
        `export default ${JSON.stringify({
          ...(codemod ? {codemods: './codemods'} : {}),
          agentDocs: {append: [line]},
        })};\n`,
      );
      if (codemod) {
        const codemodPath = path.join(
          packageDir,
          'codemods',
          '0.2.0',
          'replace-integrations.mjs',
        );
        fs.mkdirSync(path.dirname(codemodPath), {recursive: true});
        fs.writeFileSync(codemodPath, codemod);
      }
    };

    writeIntegration(
      '@acme/migrator',
      'Migrator guidance.',
      `export default {
  type: 'config',
  title: 'Replace integration order',
  transform: file => file.source.replace(
    "['@acme/migrator', '@acme/old']",
    "['@acme/second', '@acme/first']",
  ),
};\n`,
    );
    writeIntegration('@acme/old', 'Old guidance.');
    writeIntegration('@acme/second', 'Second guidance.');
    writeIntegration('@acme/first', 'First guidance.');

    writeInstalledCore('0.2.0');
    writeSource();
    fs.writeFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      `# Agents\n\n${generateCompressedIndex('0.2.0', {
        agentDocs: [{package: '@acme/old', append: ['Old guidance.']}],
      })}\n`,
    );

    // The real CLI debug preflight loads Project before dispatch. Cache the old
    // config here so the upgrade must explicitly reload after the CONFIG codemod.
    await Project.load(tmpDir);

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.1.0',
      '--path',
      'src',
      '--apply',
    ]);

    expect(result.error).toBeUndefined();
    expect(result.data.agentDocs.action).toBe('refreshed');
    const config = fs.readFileSync(
      path.join(tmpDir, 'astryx.config.mjs'),
      'utf-8',
    );
    expect(config.indexOf('@acme/second')).toBeLessThan(
      config.indexOf('@acme/first'),
    );
    expect(config).not.toContain('@acme/migrator');
    expect(config).not.toContain('@acme/old');

    const agentDocs = fs.readFileSync(
      path.join(tmpDir, 'AGENTS.md'),
      'utf-8',
    );
    expect(agentDocs.indexOf('Second guidance.')).toBeLessThan(
      agentDocs.indexOf('First guidance.'),
    );
    expect(agentDocs).not.toContain('Migrator guidance.');
    expect(agentDocs).not.toContain('Old guidance.');
  });

  it('SKIPS a broken integration codemod instead of hard-failing the upgrade', async () => {
    // A codemod module whose default export is not a valid codemod result —
    // a DEFINITION error. The upgrade must NOT abort; it skips the broken
    // integration's codemods and completes.
    scaffoldIntegration({
      '0.2.0/bad.mjs': `export default { not: 'a codemod' };\n`,
    });
    writeInstalledCore('0.2.0');
    writeSource();

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.1.0',
      '--path',
      'src',
    ]);

    // Did NOT hard-fail: no error envelope, and it ran to a status/run result.
    expect(result).not.toBeNull();
    expect(result.error).toBeUndefined();
    expect(exitCode).not.toBe(1);
  });

  it('runs a healthy integration codemod for an applicable range', async () => {
    scaffoldIntegration({
      '0.2.0/drop-foo.mjs':
        `export default { type: 'code', title: 'Drop foo', transform: (file) => file.source.replace(/foo/g, 'bar') };\n`,
    });
    writeInstalledCore('0.2.0');
    writeSource();

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.1.0',
      '--path',
      'src',
      '--apply',
    ]);
    expect(result).not.toBeNull();
    expect(result.error).toBeUndefined();
    // The codemod rewrote foo -> bar.
    const out = fs.readFileSync(path.join(tmpDir, 'src', 'index.ts'), 'utf-8');
    expect(out).toContain('bar');
  });

  it('--skip-codemod excludes a named integration codemod', async () => {
    scaffoldIntegration({
      '0.2.0/drop-foo.mjs':
        `export default { type: 'code', title: 'Drop foo', transform: (file) => file.source.replace(/foo/g, 'bar') };\n`,
    });
    writeInstalledCore('0.2.0');
    writeSource();

    const result = await runJson([
      '--json',
      'upgrade',
      '--from',
      '0.1.0',
      '--path',
      'src',
      '--apply',
      '--skip-codemod',
      'drop-foo',
    ]);
    expect(result).not.toBeNull();
    // Skipped: the source is unchanged (foo not rewritten to bar).
    const out = fs.readFileSync(path.join(tmpDir, 'src', 'index.ts'), 'utf-8');
    expect(out).toContain('foo');
    expect(out).not.toContain('bar');
  });
});

describe('upgrade failure receipt when a codemod fails', () => {
  const codemods = {
    '0.2.0/drop-foo.mjs': `export default {type: 'code', title: 'Drop foo', transform: file => file.source.replace(/foo/g, 'bar')};\n`,
    '0.2.0/fail.mjs': `export default {type: 'code', title: 'Fail on boom', transform: file => { if (file.source.includes('boom')) throw new Error('codemod boom'); return undefined; }};\n`,
  };

  function scaffold() {
    scaffoldIntegration(codemods);
    writeInstalledCore('0.2.0');
    writeSource();
    fs.writeFileSync(path.join(tmpDir, 'src', 'broken.ts'), 'const boom = 1;\n');
  }

  const ARGS = ['upgrade', '--from', '0.1.0', '--path', 'src'];

  it('keeps the error envelope and adds the receipt of what was written', async () => {
    scaffold();

    const result = await runJson(['--json', ...ARGS, '--apply']);

    expect(exitCode).toBe(1);
    expect(isError(result)).toBe(true);
    expect(result).not.toHaveProperty('type');
    expect(result).toMatchObject({
      apiVersion: 1,
      code: 'ERR_CODEMOD_FAILED',
      error: 'Upgrade completed with 1 codemod error.',
      receipt: {
        complete: false,
        errorCode: 'ERR_CODEMOD_FAILED',
        filesChanged: 1,
        modifiedFiles: ['src/index.ts'],
        protectedFiles: [],
        errors: [
          {
            file: 'src/broken.ts',
            codemod: '@acme/widgets:fail',
            error: 'codemod boom',
          },
        ],
      },
    });
    expect(fs.readFileSync(path.join(tmpDir, 'src', 'index.ts'), 'utf-8')).toBe(
      'const bar = 1;\n',
    );
  });

  it('previews the same receipt in a dry run without writing', async () => {
    scaffold();

    const result = await runJson(['--json', ...ARGS]);

    expect(result.code).toBe('ERR_CODEMOD_FAILED');
    expect(result.receipt).toMatchObject({
      complete: false,
      modifiedFiles: ['src/index.ts'],
      errors: [expect.objectContaining({file: 'src/broken.ts'})],
    });
    expect(fs.readFileSync(path.join(tmpDir, 'src', 'index.ts'), 'utf-8')).toBe(
      'const foo = 1;\n',
    );
  });

  it('still returns the protected-file receipt when a protected file remains', async () => {
    scaffold();
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'gen.ts'),
      '// @generated\nconst foo = 2;\n',
    );

    const result = await runJson(['--json', ...ARGS, '--apply']);

    expect(result).toMatchObject({
      type: 'upgrade.run',
      data: {
        complete: false,
        errorCode: 'ERR_CODEMOD_PROTECTED',
        protectedFiles: [expect.objectContaining({file: 'src/gen.ts'})],
        errors: [expect.objectContaining({file: 'src/broken.ts'})],
      },
    });
  });

  it('keeps the human output and exit status in text mode', async () => {
    scaffold();

    await runJson([...ARGS, '--apply']);

    expect(process.exitCode).toBe(1);
    expect(logCalls.join('\n')).toMatch(/Upgrade failed/);
    expect(logCalls.join('\n')).not.toMatch(/"receipt"/);
  });
});
