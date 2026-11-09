// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme build imports Core when a build runs, not when the CLI starts.
 *
 * The CLI loads the theme build module for every command, and Core's root
 * entry pulls in all of Core and React. So a command that builds no theme must
 * not ask for either, or `astryx --version` pays for them whenever a Core is
 * installed. A resolve hook in a real subprocess records every request for
 * Core or React and the module that made it, whether or not the request
 * resolves. It also records whether Core's root entry ran: a build loads the
 * root only for a theme that imports it.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const BIN = fileURLToPath(
  new URL('../../../clients/cli/bin/astryx.mjs', import.meta.url),
);

/** The key the hook records when Core's root entry runs. */
const ROOT_RAN = '(root entry ran)';

/** @type {string} */
let dir;
/** @type {string} */
let register;
/** @type {string} */
let log;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-core-on-demand-'));
  log = path.join(dir, 'requests.jsonl');
  const hooks = path.join(dir, 'hooks.mjs');
  fs.writeFileSync(
    hooks,
    [
      "import {appendFileSync} from 'node:fs';",
      `const LOG = ${JSON.stringify(log)};`,
      `const ROOT = ${JSON.stringify(import.meta.resolve('@astryxdesign/core'))};`,
      'const WATCHED = /^(?:@astryxdesign\\/core|react|react-dom)(?:\\/|$)/;',
      'export async function resolve(specifier, context, nextResolve) {',
      '  if (WATCHED.test(specifier)) {',
      '    const parent = context.parentURL ?? null;',
      "    appendFileSync(LOG, JSON.stringify({specifier, parent}) + '\\n');",
      '  }',
      "  // An import that Core's root entry makes means the root ran.",
      '  if (context.parentURL === ROOT) {',
      "    appendFileSync(LOG, JSON.stringify({specifier: ROOT_RAN, parent: ROOT}) + '\\n');",
      '  }',
      '  return nextResolve(specifier, context);',
      '}',
      `const ROOT_RAN = ${JSON.stringify(ROOT_RAN)};`,
      '',
    ].join('\n'),
  );
  register = path.join(dir, 'register.mjs');
  fs.writeFileSync(
    register,
    `import {register} from 'node:module';\nregister(${JSON.stringify(pathToFileURL(hooks).href)});\n`,
  );
  // A plain theme object: the file itself never imports Core, so a request for
  // Core can only come from the build.
  fs.writeFileSync(
    path.join(dir, 'ocean.mjs'),
    "export default {name: 'ocean', tokens: {'--color-bg': '#0a0a0a'}};\n",
  );
  // A theme that imports a component from the root, which only the root
  // exports.
  fs.writeFileSync(
    path.join(dir, 'reef.ts'),
    [
      "import {defineTheme} from '@astryxdesign/core/theme';",
      "import {Button} from '@astryxdesign/core';",
      'export const reefTheme = defineTheme({',
      "  name: 'reef',",
      "  tokens: {'--color-bg': typeof Button === 'function' ? '#0a0a0a' : 'MISSING'},",
      '});',
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * Run the CLI and return each Core or React specifier it asked for, mapped to
 * the first module that asked.
 * @param {string[]} args
 * @returns {{status: number | null, requested: Record<string, string | null>}}
 */
function run(args) {
  fs.rmSync(log, {force: true});
  const res = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(register).href, BIN, ...args],
    {cwd: dir, encoding: 'utf-8', timeout: 20_000},
  );
  /** @type {Record<string, string | null>} */
  const requested = {};
  const lines = fs.existsSync(log)
    ? fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean)
    : [];
  for (const line of lines) {
    const {specifier, parent} = JSON.parse(line);
    if (!(specifier in requested)) requested[specifier] = parent;
  }
  return {status: res.status, requested};
}

describe('theme build imports Core on demand', () => {
  it('astryx --version asks for neither Core nor React', () => {
    const {status, requested} = run(['--version']);
    expect(status).toBe(0);
    expect(requested).toEqual({});
  });

  it('theme build imports Core from the theme build module', () => {
    const {requested} = run([
      'theme',
      'build',
      'ocean.mjs',
      '--check',
      '--json',
    ]);
    expect(requested['@astryxdesign/core/theme']).toMatch(
      /\/api\/theme\/build\/build\.mjs$/,
    );
  });

  it('a theme that imports only the theme entry never runs the root', () => {
    const {requested} = run([
      'theme',
      'build',
      'ocean.mjs',
      '--check',
      '--json',
    ]);
    expect(requested['@astryxdesign/core/theme']).toBeDefined();
    expect(requested).not.toHaveProperty('@astryxdesign/core');
    expect(requested).not.toHaveProperty(ROOT_RAN);
  });

  it("a theme that imports the root gets the root's own exports", () => {
    const {status, requested} = run(['theme', 'build', 'reef.ts']);
    expect(status).toBe(0);
    expect(requested).toHaveProperty(ROOT_RAN);
    expect(fs.readFileSync(path.join(dir, 'reef.css'), 'utf-8')).toContain(
      '--color-bg: #0a0a0a',
    );
  });
});
