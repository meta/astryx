// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Printing the version loads none of the CLI's documentation or project
 * machinery.
 *
 * `astryx --version` answers with one line, but its run used to load the doc
 * schemas, discovery and the project loader through the release choice, the
 * debug preload and the setup nudge. A load hook in a real subprocess records
 * every module the run loads, in an empty folder.
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const BIN = fileURLToPath(new URL('./bin/astryx.mjs', import.meta.url));
const {version} = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
);

/** Modules a version run never needs: each pulls in a large graph. */
const HEAVY = [
  /\/node_modules\/zod\//,
  /\/node_modules\/jiti\//,
  /\/packages\/cli\/authoring\//,
  /\/packages\/cli\/foundation\/discovery\/component-discovery\.mjs$/,
  /\/packages\/cli\/foundation\/doc-compiler\/compile\.mjs$/,
  /\/packages\/cli\/foundation\/config\/project\.mjs$/,
  /\/packages\/cli\/foundation\/integrations\/integrations\.mjs$/,
  /\/packages\/cli\/foundation\/agent-docs\/agent-docs\.mjs$/,
];

/** @type {string} */
let dir;
/** @type {string} */
let register;
/** @type {string} */
let log;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-version-loads-'));
  log = path.join(dir, 'loads.txt');
  const hooks = path.join(dir, 'hooks.mjs');
  fs.writeFileSync(
    hooks,
    [
      "import {appendFileSync} from 'node:fs';",
      `const LOG = ${JSON.stringify(log)};`,
      'export async function load(url, context, nextLoad) {',
      "  appendFileSync(LOG, url + '\\n');",
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
  fs.mkdirSync(path.join(dir, 'empty'));
});

afterAll(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * Run the bin in an empty folder and return its output and the modules it
 * loaded.
 * @param {string[]} args
 */
function run(args) {
  fs.rmSync(log, {force: true});
  const res = spawnSync(
    process.execPath,
    ['--import', pathToFileURL(register).href, BIN, ...args],
    {cwd: path.join(dir, 'empty'), encoding: 'utf-8', timeout: 20_000},
  );
  const loaded = fs.existsSync(log)
    ? fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean)
    : [];
  return {status: res.status, stdout: res.stdout, loaded};
}

describe('astryx --version', () => {
  it.each([['--version'], ['-V']])(
    '%s prints the version and loads no doc, discovery or project module',
    flag => {
      const {status, stdout, loaded} = run([flag]);
      expect(status).toBe(0);
      expect(stdout).toBe(`${version}\n`);
      expect(loaded.length).toBeGreaterThan(0);
      expect(
        loaded.filter(url => HEAVY.some(heavy => heavy.test(url))),
      ).toEqual([]);
    },
  );

  it('--version --json prints its envelope and loads none of them either', () => {
    const {status, stdout, loaded} = run(['--version', '--json']);
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      type: 'version',
      data: {version},
    });
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.filter(url => HEAVY.some(heavy => heavy.test(url)))).toEqual(
      [],
    );
  });
});
