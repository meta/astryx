// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The global-mode docs say what the CLI does (spec AST-081).
 *
 * - Every command's "In global mode" note is checked against the command run
 *   in an empty folder: the error code and message it quotes, the issue code
 *   it names, or the checks it lists are the ones the run produces.
 * - Every terminal line a global-mode page shows (its `text` code blocks) is
 *   one the CLI prints, built here from the CLI's own strings, so a docs line
 *   and the code cannot drift apart.
 * - `astryx search` finds the right page for global, uninstall, and CI.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {runCli} from '../test-utils/run-cli.mjs';
import {search} from '../api/search/search.mjs';
import {
  handedToProjectLine,
  progressText,
  fallbackLine,
  whoAnsweredLine,
} from '../foundation/release/handoff.mjs';
import {
  availableLine,
  noCliHintLine,
  oldGlobalLines,
  upgradeLine,
} from '../foundation/release/notices.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = path.join(CLI, 'clients', 'cli', 'commands');
const TREE = path.join(CLI, 'assets', 'docs', 'tree');
const SLOW = 60_000;

/** @type {string[]} */
const dirs = [];
const empty = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-global-docs-'));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, {recursive: true, force: true});
});

// No run reaches the network.
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

/**
 * @param {string} file
 * @returns {Promise<any>}
 */
async function load(file) {
  const mod = await import(pathToFileURL(file).href);
  return mod.doc ?? mod.docs;
}

/**
 * A command's "In global mode" note.
 * @param {string} name the command doc's file stem
 */
async function noteOf(name) {
  const doc = await load(path.join(COMMANDS, `${name}.doc.mjs`));
  const note = (doc.notes ?? []).find(
    (/** @type {any} */ b) =>
      b.type === 'prose' && b.text.startsWith('In global mode: '),
  );
  return /** @type {string} */ (note?.text ?? '');
}

/**
 * Run a command in an empty folder with `--json`.
 * @param {string[]} args
 */
async function outside(args) {
  const r = await runCli(['--json', ...args], empty());
  return {status: r.status, envelope: JSON.parse(r.stdout)};
}

/** Error messages the commands print outside a project, for the line check. */
/** @type {Set<string>} */
const refusals = new Set();

describe('each command note says what the command does outside a project', () => {
  it.each([
    ['swizzle', ['swizzle', 'Button']],
    ['theme-use', ['theme', 'use', 'ocean']],
    ['theme-remove', ['theme', 'remove', 'ocean']],
    ['theme-add', ['theme', 'add', 'butter']],
    ['integration-add', ['integration', 'add', 'component', 'Foo']],
    ['upgrade', ['upgrade', '--from', '0.6.0', '--apply']],
  ])(
    '%s: stops with the code and message its note quotes',
    async (name, args) => {
      const {status, envelope} = await outside(args);
      expect(status).toBe(1);
      expect(envelope.code).toMatch(/^ERR_/u);
      const note = await noteOf(name);
      expect(note).toContain(`\`${envelope.code}\``);
      if (name !== 'upgrade') expect(note).toContain(`"${envelope.error}"`);
      refusals.add(`Error: ${envelope.error}`);
    },
    SLOW,
  );

  it.each([
    ['doctor-integration-validate', ['doctor', 'integration', 'validate']],
    ['integration-verify', ['integration', 'verify']],
    ['integration-pack', ['integration', 'pack', '--check']],
  ])(
    '%s: reports the one issue its note names, and exits 1',
    async (name, args) => {
      const {status, envelope} = await outside(args);
      expect(status).toBe(1);
      expect(
        envelope.data.issues.map((/** @type {any} */ i) => i.code),
      ).toEqual(['no_package']);
      expect(await noteOf(name)).toContain('`no_package`');
    },
    SLOW,
  );

  it(
    'integration check: its validate check reports no_package, and it exits 1',
    async () => {
      const {status, envelope} = await outside(['integration', 'check']);
      expect(status).toBe(1);
      const validate = envelope.data.checks.find(
        (/** @type {any} */ c) => c.check === 'validate',
      );
      expect(
        validate.response.data.issues.map((/** @type {any} */ i) => i.code),
      ).toEqual(['no_package']);
      expect(await noteOf('integration-check')).toContain('`no_package`');
    },
    SLOW,
  );

  it(
    'doctor: lists exactly the checks it runs outside a project',
    async () => {
      const {status, envelope} = await outside(['doctor']);
      expect(status).toBe(0);
      const note = await noteOf('doctor');
      const ids = envelope.data.checks.map((/** @type {any} */ c) => c.id);
      expect([...note.matchAll(/`([a-z-]+)`/gu)].map(m => m[1])).toEqual(
        expect.arrayContaining(ids),
      );
      for (const id of ids) expect(note).toContain(`\`${id}\``);
    },
    SLOW,
  );

  it(
    'init: writes AGENTS.md and no getting-started steps; theme add with no slug lists themes',
    async () => {
      const dir = empty();
      const r = await runCli(['--json', 'init'], dir);
      expect(r.status).toBe(0);
      expect(fs.existsSync(path.join(dir, 'AGENTS.md'))).toBe(true);
      expect(JSON.parse(r.stdout).data.nextSteps).toBe(false);
      expect(await noteOf('init')).toContain('AGENTS.md');
      const list = await outside(['theme', 'add']);
      expect(list.envelope.type).toBe('theme.list');
      expect(await noteOf('theme-add')).toContain(
        'with no slug lists the themes',
      );
    },
    SLOW,
  );
});

/** Every terminal line the CLI prints in global mode, built from its strings. */
function cliLines() {
  const matched = {copy: 'matched', version: '0.6.8', coreVersion: '0.6.8'};
  const carried = {copy: 'carried', version: '0.7.2', coreVersion: '0.7.2'};
  const npm = 'npm i -g @astryxdesign/cli@latest';
  return new Set([
    whoAnsweredLine(/** @type {any} */ (carried)),
    whoAnsweredLine(/** @type {any} */ (carried), true),
    whoAnsweredLine(/** @type {any} */ (matched)),
    handedToProjectLine('0.6.8', '0.7.2'),
    progressText('install', '0.6.8'),
    progressText('wait', '0.6.8'),
    availableLine('0.7.2', '0.7.3'),
    availableLine('0.7.1', '0.7.3'),
    upgradeLine(npm, null),
    upgradeLine(npm, '>=22', '20.11.0'),
    upgradeLine(
      'pnpm add @astryxdesign/core@0.7.3 @astryxdesign/cli@0.7.3, then pnpm exec astryx upgrade --from 0.7.1 --apply',
      null,
    ),
    ...oldGlobalLines({version: '0.6.4', command: npm}),
    ...[
      'the registry could not be reached',
      'the registry does not have it',
      'the release cache /home/me/.cache/astryx/releases cannot be written (EACCES)',
    ].map(reason => fallbackLine('0.6.8', reason, '0.7.2')),
    noCliHintLine('0.7.2', '0.6.8', 'npm install @astryxdesign/cli@0.6.8'),
    ...refusals,
  ]);
}

describe('global-mode pages show only lines the CLI prints', () => {
  it('every line of every text block on a global-mode page', async () => {
    const lines = cliLines();
    /** @type {string[]} */
    const unknown = [];
    let checked = 0;
    for (const name of fs.readdirSync(TREE).sort()) {
      if (!name.endsWith('.doc.mjs')) continue;
      const doc = await load(path.join(TREE, name));
      if (doc.placement?.parent !== 'namespace:global') continue;
      for (const section of doc.sections ?? []) {
        for (const block of section.content ?? []) {
          if (block.type !== 'code' || block.lang !== 'text') continue;
          for (const line of block.code.split('\n')) {
            checked++;
            if (!lines.has(line)) unknown.push(`${name}: ${line}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(unknown).toEqual([]);
  });
});

describe('search finds the global-mode pages', () => {
  it.each([
    ['global', 'global'],
    ['global mode', 'global'],
    ['uninstall', 'uninstall'],
    ['ci', 'ci-and-containers'],
    ['which setup', 'project-global-or-both'],
    ['project or global', 'project-global-or-both'],
  ])('"%s" finds %s', async (query, page) => {
    const r = await search(query);
    const names = r.data.results
      .slice(0, 3)
      .map((/** @type {any} */ m) => String(m.name).split('/').pop());
    expect(names).toContain(page);
  });
});
