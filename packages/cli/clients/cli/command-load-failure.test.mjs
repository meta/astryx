// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A command whose module fails to import still answers: with --json, one
 * error envelope on stdout; without it, the error on stderr. Exit 1 either way.
 *
 * The failure is injected with a module-load hook in a real subprocess, so the
 * lazy command registry in index.mjs sees what a broken install would give it.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const BIN = fileURLToPath(new URL('./bin/astryx.mjs', import.meta.url));

/** @type {string} */
let dir;
/** @type {string} */
let register;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-load-failure-'));
  const hooks = path.join(dir, 'hooks.mjs');
  fs.writeFileSync(
    hooks,
    [
      'export async function load(url, context, nextLoad) {',
      "  if (url.endsWith('/clients/cli/commands/blog.mjs')) {",
      "    throw new Error('simulated load failure');",
      '  }',
      '  return nextLoad(url, context);',
      '}',
      '',
    ].join('\n'),
  );
  register = path.join(dir, 'register.mjs');
  fs.writeFileSync(
    register,
    `import {register} from 'node:module';\nregister(${JSON.stringify(pathToFileURL(hooks).href)});\n`,
  );
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string[]} args */
function run(args) {
  const res = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(register).href, BIN, ...args],
    {cwd: dir, encoding: 'utf-8', timeout: 20_000},
  );
  return {status: res.status, stdout: res.stdout, stderr: res.stderr};
}

describe('a command that fails to load', () => {
  it('answers --json with one error envelope, exit 1', () => {
    const {status, stdout, stderr} = run(['blog', '--json']);
    expect(status).toBe(1);
    expect(stderr).toBe('');
    const envelope = JSON.parse(stdout);
    expect(envelope).toMatchObject({apiVersion: 1, code: 'ERR_UNKNOWN'});
    expect(envelope.error).toMatch(/blog.*simulated load failure/);
  });

  it('reports the failure on stderr without --json, exit 1', () => {
    const {status, stdout, stderr} = run(['blog']);
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(/blog.*failed to load.*simulated load failure/s);
  });

  it('leaves the other commands working', () => {
    const {status, stdout} = run(['docs', '--json']);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).type).toMatch(/^docs\./);
  });

  it("is listed in a checkout's help, which loads every command, beside the others", () => {
    const {status, stdout} = run(['--help']);
    expect(status).toBe(0);
    expect(stdout).toMatch(/blog\s+\(failed to load: simulated load failure\)/);
    expect(stdout).toMatch(/\bdocs\b/);
  });
});
