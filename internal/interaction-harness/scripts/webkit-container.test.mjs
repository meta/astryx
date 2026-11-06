// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input webkit-container.mjs, run with a fake `podman` first on PATH that
 * records the arguments of its `run`.
 * @output The CPU limits and the project flag the script gives the container.
 * @position The script's own test, in the node project.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'webkit-container.mjs',
);
const SPEC = 'some.interaction.browser.spec.ts';

/**
 * A preload that gives the script another host: its platform, and the CPU
 * lists it reads. Without lists, /proc and /sys cannot be read, as on macOS.
 * @param {{platform: string, allowed?: string, online?: string}} host
 */
const hostHook = ({platform, allowed, online}) =>
  `data:text/javascript,${encodeURIComponent(`
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
Object.defineProperty(process, 'platform', {value: ${JSON.stringify(platform)}});
const lists = ${JSON.stringify(
    allowed == null
      ? null
      : {
          '/proc/self/status': `Cpus_allowed_list:\t${allowed}\n`,
          '/sys/devices/system/cpu/online': `${online}\n`,
        },
  )};
const read = fs.readFileSync;
fs.readFileSync = (file, ...rest) => {
  if (/^\\/(proc|sys)\\//.test(String(file))) {
    if (lists != null && String(file) in lists) return lists[String(file)];
    throw Object.assign(new Error('ENOENT: ' + file), {code: 'ENOENT'});
  }
  return read(file, ...rest);
};
syncBuiltinESMExports();
`)}`;

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webkit-container-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * Runs the script once; `args` is the fake engine's `run` line, if any.
 * @param {{env?: Record<string, string>, nodeArgs?: string[]}} [options]
 */
function run({env = {}, nodeArgs = []} = {}) {
  const bin = path.join(dir, 'bin');
  const argsFile = path.join(dir, 'run-args.json');
  fs.mkdirSync(bin, {recursive: true});
  fs.writeFileSync(
    path.join(bin, 'podman'),
    `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] !== '--version') {
  fs.writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
}
`,
    {mode: 0o755},
  );
  const childEnv = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    ASTRYX_WEBKIT_SHADER_CACHE: path.join(dir, 'shaders'),
  };
  delete childEnv.CI;
  delete childEnv.ASTRYX_WEBKIT_CPUS;
  Object.assign(childEnv, env);
  const [command, ...rest] = [process.execPath, ...nodeArgs, script, SPEC];
  const result = spawnSync(command, rest, {env: childEnv, encoding: 'utf8'});
  /** @type {string[] | null} */
  const args = fs.existsSync(argsFile)
    ? JSON.parse(fs.readFileSync(argsFile, 'utf8'))
    : null;
  return {status: result.status, stderr: result.stderr, args};
}

/** @param {string[] | null} args */
const cpuFlags = args =>
  (args ?? []).filter(
    (arg, i, all) =>
      arg.startsWith('--cpus') ||
      arg.startsWith('--cpuset-cpus') ||
      (all[i - 1] === '-e' && arg.startsWith('LP_NUM_THREADS=')),
  );

describe('webkit-container.mjs', () => {
  it("gives the container CI's four CPUs, and llvmpipe four threads, when CI is set", () => {
    const {status, args} = run({env: {CI: '1'}});
    expect(status).toBe(0);
    expect(args).toContain('--cpus=4');
    expect(args).toContain('LP_NUM_THREADS=4');
  });

  it('takes another count from ASTRYX_WEBKIT_CPUS', () => {
    const {status, args} = run({env: {ASTRYX_WEBKIT_CPUS: '2'}});
    expect(status).toBe(0);
    expect(args).toContain('--cpus=2');
    expect(args).toContain('LP_NUM_THREADS=2');
  });

  it('sets no CPU count without CI or ASTRYX_WEBKIT_CPUS', () => {
    const {status, args} = run();
    expect(status).toBe(0);
    expect(
      cpuFlags(args).filter(flag => !flag.startsWith('--cpuset-cpus')),
    ).toEqual([]);
  });

  it('refuses a count that is not a positive integer, and starts no container', () => {
    for (const value of ['0', '1.5', 'four']) {
      const {status, stderr, args} = run({env: {ASTRYX_WEBKIT_CPUS: value}});
      expect(status).toBe(1);
      expect(stderr).toContain(
        `ASTRYX_WEBKIT_CPUS must be a positive integer, got "${value}"`,
      );
      expect(args).toBeNull();
    }
  });

  it('passes the spec paths right after the project', () => {
    const {args} = run();
    const at = args?.indexOf('--project=webkit') ?? -1;
    expect(at).toBeGreaterThan(-1);
    expect(args?.[at + 1]).toBe(SPEC);
  });

  it('keeps the CPUs the script may run on, on Linux', () => {
    const {status, args} = run({
      nodeArgs: [
        '--import',
        hostHook({platform: 'linux', allowed: '0', online: '0-3'}),
      ],
    });
    expect(status).toBe(0);
    expect(args).toContain('--cpuset-cpus=0');
  });

  it('adds no CPU set when the script may run on every CPU', () => {
    const {status, args} = run({
      nodeArgs: [
        '--import',
        hostHook({platform: 'linux', allowed: '0-3', online: '0-3'}),
      ],
    });
    expect(status).toBe(0);
    expect(cpuFlags(args)).toEqual([]);
  });

  it('skips the CPU set where there is no /proc, as on macOS', () => {
    const {status, args} = run({
      nodeArgs: ['--import', hostHook({platform: 'darwin'})],
    });
    expect(status).toBe(0);
    expect(cpuFlags(args)).toEqual([]);
  });
});
