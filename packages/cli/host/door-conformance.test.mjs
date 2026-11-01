// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Door conformance (spec AST-081 FR1): every command example, run
 * through the bin and through the host entry, gives the same exit status,
 * output, and file changes, in an empty folder, a project on the current
 * minor, and a project on the previous minor.
 *
 * Each run is a child process with its own copy of the folder, its own home
 * folder, and its own per-user cache. The package registry is unreachable and
 * notices are off, so no run reaches the network. Output is compared once each
 * run's own folders read as placeholders. Neither door is given a command
 * name, so FR5's command names are the same through both, and no line FR5 or
 * FR6 lets differ prints.
 */

import {spawn} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(HERE, '..');
const CORE_ROOT = path.resolve(CLI_ROOT, '../core');
const BIN = path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');
const HOST_URL = pathToFileURL(path.join(HERE, 'index.mjs')).href;
const COMMANDS = path.join(CLI_ROOT, 'clients', 'cli', 'commands');
const VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;
const [MAJOR, MINOR] = VERSION.split('.').map(Number);
const PREVIOUS_MINOR = `${MAJOR}.${Math.max(MINOR - 1, 0)}.0`;
/** How long one run may take before it counts as hung. */
const RUN_TIMEOUT_MS = 90_000;

/** Split an example's command line the way a shell would, quotes included. */
function splitArgs(line) {
  const out = [];
  let current = '';
  let quote = null;
  let started = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (current || started) out.push(current);
      current = '';
      started = false;
    } else {
      current += ch;
    }
  }
  if (current || started) out.push(current);
  return out;
}

/** @returns {Promise<Array<{cli: string, argv: string[]}>>} every distinct command example */
async function commandExamples() {
  /** @type {Map<string, string[]>} */
  const byLine = new Map();
  for (const name of fs.readdirSync(COMMANDS).sort()) {
    if (!name.endsWith('.doc.mjs')) continue;
    const {doc} = await import(pathToFileURL(path.join(COMMANDS, name)).href);
    if (doc?.type !== 'command') continue;
    for (const example of doc.examples ?? []) {
      const words = splitArgs(example.cli);
      byLine.set(example.cli, words[0] === 'astryx' ? words.slice(1) : words);
    }
  }
  return [...byLine].map(([cli, argv]) => ({cli, argv}));
}

/**
 * @param {string} file
 * @param {unknown} value
 */
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/** The folders every example runs in, each set up fresh for each run. */
const FOLDERS = {
  'an empty folder': () => {},
  /** @param {string} dir */
  'a project on the current minor': dir => {
    writeJson(path.join(dir, 'package.json'), {
      name: 'app',
      private: true,
      dependencies: {'@astryxdesign/core': VERSION},
    });
    const scope = path.join(dir, 'node_modules', '@astryxdesign');
    fs.mkdirSync(scope, {recursive: true});
    fs.symlinkSync(CORE_ROOT, path.join(scope, 'core'), 'dir');
  },
  /** @param {string} dir */
  'a project on the previous minor': dir => {
    writeJson(path.join(dir, 'package.json'), {
      name: 'app',
      private: true,
      dependencies: {'@astryxdesign/core': PREVIOUS_MINOR},
    });
    writeJson(
      path.join(dir, 'node_modules', '@astryxdesign', 'core', 'package.json'),
      {name: '@astryxdesign/core', version: PREVIOUS_MINOR},
    );
  },
};

/** @type {string[]} */
const bases = [];

/**
 * Every file under `root`, skipping node_modules, by path relative to `base`.
 * @param {string} root
 * @param {string} base
 * @param {Map<string, string>} into
 */
function readTree(root, base, into = new Map()) {
  if (!fs.existsSync(root)) return into;
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      readTree(file, base, into);
    } else if (entry.isFile()) {
      into.set(path.relative(base, file), fs.readFileSync(file, 'utf8'));
    }
  }
  return into;
}

/**
 * Run one example through one door in a fresh copy of a folder.
 * @param {'bin' | 'host entry'} door
 * @param {string[]} argv
 * @param {(dir: string) => void} setUp
 * @returns {Promise<{status: number | null, stdout: string, stderr: string, changes: Record<string, string | null>}>}
 */
async function runThrough(door, argv, setUp) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-door-'));
  bases.push(base);
  const dir = path.join(base, 'app');
  const home = path.join(base, 'home');
  fs.mkdirSync(dir);
  fs.mkdirSync(home);
  setUp(dir);
  const read = () => readTree(home, base, readTree(dir, base));
  const before = read();
  const args =
    door === 'bin'
      ? [BIN, ...argv]
      : [
          '--input-type=module',
          '-e',
          `import {runHostedCli} from ${JSON.stringify(HOST_URL)};\n` +
            `const result = await runHostedCli({argv: ${JSON.stringify(argv)}, cwd: process.cwd()});\n` +
            'process.exitCode = result.status;\n',
        ];
  const env = {...process.env};
  for (const key of Object.keys(env)) {
    if (key.startsWith('VITEST') || key === 'NODE_OPTIONS') delete env[key];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    XDG_CACHE_HOME: path.join(base, 'cache'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    // Other tools' own state, such as the device id the gh tool writes when
    // swizzle asks it whether it is signed in, and npm's cache and logs,
    // stays outside the folders the runs compare.
    XDG_STATE_HOME: path.join(base, 'state'),
    npm_config_cache: path.join(base, 'npm-cache'),
    CI: '1',
    NO_UPDATE_NOTIFIER: '1',
    NO_COLOR: '1',
    npm_config_registry: 'http://127.0.0.1:9/',
    npm_config_fetch_retries: '0',
    npm_config_fetch_timeout: '2000',
  });
  const child = spawn(process.execPath, args, {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => (stdout += chunk));
  child.stderr.on('data', chunk => (stderr += chunk));
  const timer = setTimeout(() => child.kill('SIGKILL'), RUN_TIMEOUT_MS);
  const status = await new Promise(resolve => child.on('close', resolve));
  clearTimeout(timer);
  // Each run's own folders read as placeholders.
  const real = fs.realpathSync(base);
  /** @param {string} text */
  const placeholders = text =>
    text.split(real).join('<run>').split(base).join('<run>');
  const after = read();
  /** @type {Record<string, string | null>} */
  const changes = {};
  for (const [file, text] of after) {
    if (before.get(file) !== text) changes[file] = placeholders(text);
  }
  for (const file of before.keys()) {
    if (!after.has(file)) changes[file] = null;
  }
  return {
    status,
    stdout: placeholders(stdout),
    stderr: placeholders(stderr),
    changes,
  };
}

/**
 * Run `tasks` with at most `limit` at a time.
 * @template T
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<T[]>}
 */
async function inBatches(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({length: limit}, worker));
  return results;
}

const examples = await commandExamples();

afterAll(() => {
  for (const base of bases) fs.rmSync(base, {recursive: true, force: true});
});

describe.each(Object.entries(FOLDERS))('in %s', (_folder, setUp) => {
  /** @type {Map<string, {bin: Awaited<ReturnType<typeof runThrough>>, host: Awaited<ReturnType<typeof runThrough>>}>} */
  const runs = new Map();

  beforeAll(async () => {
    const limit = Math.max(2, Math.min(16, os.availableParallelism()));
    const results = await inBatches(
      examples.flatMap(({argv}) => [
        () => runThrough('bin', argv, setUp),
        () => runThrough('host entry', argv, setUp),
      ]),
      limit,
    );
    examples.forEach(({cli}, index) => {
      runs.set(cli, {bin: results[2 * index], host: results[2 * index + 1]});
    });
  }, 15 * 60_000);

  it('runs every example', () => {
    expect(examples.length).toBeGreaterThan(100);
  });

  it.each(examples.map(({cli}) => [cli]))('%s', cli => {
    const {bin, host} = runs.get(cli) ?? {};
    expect(bin?.status, `${cli} finished through the bin`).not.toBeNull();
    expect(host).toEqual(bin);
  });
});
