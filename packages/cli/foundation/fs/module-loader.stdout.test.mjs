// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A project module that prints while it loads must not reach stdout.
 * Every `astryx.config.*` and integration manifest runs through
 * `importUserModule`, so one stray `console.log` there used to corrupt every
 * `--json` envelope. The loader cases run in a real Node process (vitest
 * replaces `console`); the CLI cases spawn the real binary.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {CLI_VERSION} from '../../test-utils/release-fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOADER_URL = pathToFileURL(path.join(HERE, 'module-loader.mjs')).href;
const CLI = path.resolve(HERE, '..', '..', 'clients', 'cli', 'bin', 'astryx.mjs');

const PRINTS =
  "console.log('module log');\nprocess.stdout.write('module write\\n');\n";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-module-stdout-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** @param {string} rel @param {string} body @returns {string} */
function write(rel, body) {
  const file = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
  return file;
}

/**
 * Run `body` as an ES module in a real Node process with `importUserModule`
 * in scope.
 * @param {string} body
 */
function runWithLoader(body) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {importUserModule} from ${JSON.stringify(LOADER_URL)};\n${body}`,
    ],
    {encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe']},
  );
}

describe('importUserModule keeps module output off stdout', () => {
  it.each([
    ['.mjs', 'mod.mjs', false, `${PRINTS}export default {answer: 42};\n`],
    ['ESM .js', 'esm/mod.js', false, `${PRINTS}export default {answer: 42};\n`],
    [
      '.ts',
      'mod.ts',
      false,
      `${PRINTS}const answer: number = 42;\nexport default {answer};\n`,
    ],
    ['fresh .mjs', 'mod.mjs', true, `${PRINTS}export default {answer: 42};\n`],
    [
      'fresh .ts',
      'mod.ts',
      true,
      `${PRINTS}const answer: number = 42;\nexport default {answer};\n`,
    ],
    [
      'fresh CommonJS .js',
      'cjs/mod.js',
      true,
      `${PRINTS}module.exports = {answer: 42};\n`,
    ],
  ])('sends a printing %s module to stderr', (_label, rel, fresh, source) => {
    write('esm/package.json', JSON.stringify({type: 'module'}));
    write('cjs/package.json', JSON.stringify({type: 'commonjs'}));
    const file = write(rel, source);

    const r = runWithLoader(
      `const before = process.stdout.write;
const mod = await importUserModule(${JSON.stringify(file)}, {fresh: ${fresh}});
process.stdout.write(JSON.stringify({answer: mod.default?.answer, restored: process.stdout.write === before}));`,
    );

    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({answer: 42, restored: true});
    expect(r.stderr).toContain('module log');
    expect(r.stderr).toContain('module write');
  });

  it('keeps stdout redirected until the last overlapping load settles', () => {
    const first = write(
      'first.mjs',
      "await new Promise(resolve => setTimeout(resolve, 20));\nprocess.stdout.write('first write\\n');\nexport default 'first';\n",
    );
    const second = write(
      'second.mjs',
      "await new Promise(resolve => setTimeout(resolve, 150));\nprocess.stdout.write('second write\\n');\nexport default 'second';\n",
    );

    const r = runWithLoader(
      `const before = process.stdout.write;
const mods = await Promise.all([
  importUserModule(${JSON.stringify(first)}),
  importUserModule(${JSON.stringify(second)}),
]);
process.stdout.write(JSON.stringify({loaded: mods.map(mod => mod.default), restored: process.stdout.write === before}));`,
    );

    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      loaded: ['first', 'second'],
      restored: true,
    });
    expect(r.stderr).toContain('first write');
    expect(r.stderr).toContain('second write');
  });

  it('leaves the caller on stdout while an abandoned load is still in flight', () => {
    const slow = write(
      'slow.mjs',
      "await new Promise(resolve => setTimeout(resolve, 150));\nprocess.stdout.write('slow write\\n');\nexport default 'slow';\n",
    );

    const r = runWithLoader(
      `const before = process.stdout.write;
const slow = importUserModule(${JSON.stringify(slow)});
const sibling = new Promise((_, reject) => setTimeout(() => reject(new Error('sibling failed')), 10));
try {
  await Promise.all([slow, sibling]);
} catch (error) {
  process.stdout.write('caught: ' + error.message + '\\n');
}
await slow;
process.stdout.write('restored: ' + (process.stdout.write === before) + '\\n');`,
    );

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('caught: sibling failed\nrestored: true\n');
    expect(r.stderr).toContain('slow write');
  });

  it('restores stdout when the module throws', () => {
    const file = write(
      'boom.mjs',
      "process.stdout.write('boom write\\n');\nthrow new Error('boom');\n",
    );

    const r = runWithLoader(
      `const before = process.stdout.write;
let message = null;
try {
  await importUserModule(${JSON.stringify(file)});
} catch (error) {
  message = error.message;
}
process.stdout.write(JSON.stringify({message, restored: process.stdout.write === before}));`,
    );

    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({message: 'boom', restored: true});
    expect(r.stderr).toContain('boom write');
  });
});

/** @param {string[]} args */
function runCli(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: tmpDir,
    encoding: 'utf8',
    timeout: 60_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, FORCE_COLOR: '0', CI: ''},
  });
}

/**
 * Stdout must be exactly one envelope and the module's output must be on
 * stderr.
 * @param {ReturnType<typeof runCli>} r
 * @param {string} printed
 */
function expectOneEnvelope(r, printed) {
  expect(r.signal).toBeNull();
  const envelope = JSON.parse(r.stdout);
  expect(envelope.apiVersion).toBe(1);
  expect(r.stdout).not.toContain(printed);
  expect(r.stderr).toContain(printed);
  return envelope;
}

/** A declared dependency that ships a printing manifest and one component. */
function installNoisyIntegration() {
  write(
    'package.json',
    JSON.stringify({
      name: 'consumer',
      private: true,
      type: 'module',
      dependencies: {'@acme/noisy': '1.0.0'},
    }),
  );
  write(
    'node_modules/@acme/noisy/package.json',
    JSON.stringify({name: '@acme/noisy', version: '1.0.0'}),
  );
  write(
    'node_modules/@acme/noisy/astryx.integration.mjs',
    "console.log('manifest log');\nexport default {components: './components'};\n",
  );
  write(
    'node_modules/@acme/noisy/components/Widget.doc.mjs',
    "export const docs = {name: 'Widget', usage: {description: 'A widget'}};\n",
  );
  write(
    'node_modules/@acme/noisy/components/Widget.tsx',
    'export function Widget() { return null; }\n',
  );
}

describe('--json stdout stays one envelope when project modules print', () => {
  it.each([
    [['--json', 'docs'], 'docs.list'],
    [['--json', 'template', '--list'], 'template.list'],
    [['--json', 'doctor'], 'doctor'],
  ])('astryx.config.mjs: %j', (args, type) => {
    write(
      'package.json',
      JSON.stringify({name: 'consumer', private: true, type: 'module'}),
    );
    write(
      'astryx.config.mjs',
      "console.log('config log');\nprocess.stdout.write('config write\\n');\nexport default {integrations: []};\n",
    );

    const r = runCli(args);

    expect(expectOneEnvelope(r, 'config log').type).toBe(type);
    expect(r.stderr).toContain('config write');
  });

  it('astryx.config.ts through jiti', () => {
    write(
      'package.json',
      JSON.stringify({name: 'consumer', private: true, type: 'module'}),
    );
    write(
      'astryx.config.ts',
      "console.log('config log');\nconst config: {integrations: string[]} = {integrations: []};\nexport default config;\n",
    );

    const r = runCli(['--json', 'template', '--list']);

    expect(r.status, r.stderr).toBe(0);
    expect(expectOneEnvelope(r, 'config log').type).toBe('template.list');
  });

  it('CommonJS astryx.config.js reloaded fresh by upgrade', () => {
    write('package.json', JSON.stringify({name: 'consumer', private: true}));
    write(
      'node_modules/@astryxdesign/core/package.json',
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    write(
      'astryx.config.js',
      "console.log('config log');\nmodule.exports = {integrations: []};\n",
    );

    const r = runCli(['--json', 'upgrade', '--from', '0.5.0']);

    expect(r.status, r.stderr).toBe(0);
    expect(expectOneEnvelope(r, 'config log').type).toBe('upgrade.run');
  });

  it('an error envelope while sibling project loads are still in flight', () => {
    // search rejects on a Core without sources before its parallel loads settle.
    write(
      'package.json',
      JSON.stringify({name: 'consumer', private: true, type: 'module'}),
    );
    write(
      'node_modules/@astryxdesign/core/package.json',
      JSON.stringify({name: '@astryxdesign/core', version: CLI_VERSION}),
    );
    write(
      'astryx.config.mjs',
      "console.log('config log');\nexport default {integrations: []};\n",
    );

    const r = runCli(['--json', 'search', 'button']);

    expect(r.status).toBe(1);
    expect(typeof expectOneEnvelope(r, 'config log').code).toBe('string');
  });

  it('an autolinked integration manifest', () => {
    installNoisyIntegration();

    const r = runCli(['--json', 'docs']);

    expect(r.status, r.stderr).toBe(0);
    expect(expectOneEnvelope(r, 'manifest log').type).toBe('docs.list');
  });

  it.each([
    [['--json', 'integration', 'add', 'doc', 'deploying'], 'integration.add'],
    [['--json', 'doctor', 'integration', 'validate'], 'integration.validate'],
  ])('the local package manifest: %j', (args, type) => {
    write(
      'package.json',
      JSON.stringify({name: 'acme-kit', version: '1.0.0', type: 'module'}),
    );
    write(
      'astryx.integration.mjs',
      "console.log('manifest log');\nexport default {};\n",
    );

    const r = runCli(args);

    expect(r.status, r.stderr).toBe(0);
    expect(expectOneEnvelope(r, 'manifest log').type).toBe(type);
  });
});
