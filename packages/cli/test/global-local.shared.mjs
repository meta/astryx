// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fixtures, hooks and helpers the global-local tests share: one
 * test per row of AST-081's "Who answers when global and project copies
 * meet" table (spec AST-081 FR11), split over three files so the Node legs
 * can spread them. Each row runs real copies of this CLI, packed the way it
 * is published and labeled with test versions, in the install layouts the
 * row names, with a private home folder, cache, and search path.
 *
 * @input the packed CLI fixtures in test-utils
 * @output helpers, and `useGlobalLocalHooks()` for each test file
 * @position packages/cli/test; each global-local.*.test.mjs imports it
 */

import {afterAll, afterEach, beforeAll} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  packedCli,
  placeCli,
  recyclePlacedCopies,
  releasePackedCli,
} from '../test-utils/global-local-fixtures.mjs';
import {
  cleanupFixtures,
  installCore,
  project,
  tempDir,
  writeJson,
} from '../test-utils/release-fixtures.mjs';
import {npmCommand} from '../foundation/release/cache.mjs';

export const POSIX = process.platform !== 'win32';
export const ROOT =
  typeof process.getuid === 'function' && process.getuid() === 0;
export const OFFLINE = 'http://127.0.0.1:9/';

/**
 * Every private computer the running test made, settled before cleanup.
 * @type {ReturnType<typeof computer>[]}
 */
export const computers = [];

/** Registers the hooks every global-local test file needs. */
export function useGlobalLocalHooks() {
  beforeAll(() => {
    packedCli();
  }, 120_000);

  // The hook's own limit is above the wait's 60 s, so a stuck step fails with
  // the message below and its folders are still removed.
  afterEach(async () => {
    const busy = await settleBackgroundSteps(computers.splice(0));
    try {
      recyclePlacedCopies({keep: busy.length === 0});
    } finally {
      cleanupFixtures();
    }
    if (busy.length > 0) {
      throw new Error(
        `A background step was still writing into ${busy.join(', ')} 60 s after the test: it is stuck.`,
      );
    }
  }, 90_000);
  afterAll(() => {
    releasePackedCli();
  });
}

/**
 * A private computer: a home folder, a cache, and a search path.
 * @param {{path?: string[]}} [options]
 */
export function computer(options = {}) {
  const home = tempDir('home');
  const cache = path.join(home, '.cache');
  // A `node` command for scripts that start with `#!/usr/bin/env node`, and
  // the runner's npm, linked to its entry file as distributions install it,
  // so a run finds npm wherever this Node keeps it.
  const nodeBin = tempDir('node-bin');
  fs.symlinkSync(process.execPath, path.join(nodeBin, 'node'));
  const npm = npmCommand();
  if (POSIX && npm.prefix.length > 0) {
    fs.symlinkSync(npm.prefix[0], path.join(nodeBin, 'npm'));
  }
  const pc = {
    home,
    cache,
    /** The `astryx` cache folder global mode uses. */
    astryxCache: path.join(cache, 'astryx'),
    path: [...(options.path ?? []), nodeBin],
  };
  computers.push(pc);
  return pc;
}

/**
 * Wait until no background step a run started still writes into these
 * computers' home folders: one that outlived its test would put the removed
 * home folder back, left behind in the system temp directory. A step is done
 * once it has released the state file's locks and, for the computer-level
 * agent text, recorded the release it wrote. The CLI starts each step
 * detached and keeps no handle to it, so this reads what the step records.
 * @param {ReturnType<typeof computer>[]} pcs
 * @returns {Promise<string[]>} the home folders a step still writes into
 *   after 60 s
 */
export async function settleBackgroundSteps(pcs) {
  const deadline = Date.now() + 60_000;
  /** @type {string[]} */
  const busy = [];
  for (const pc of pcs) {
    const stateDir = path.join(pc.home, '.config', 'astryx');
    const writing = () => {
      if (
        fs.existsSync(path.join(stateDir, '.lock-check')) ||
        fs.existsSync(path.join(stateDir, '.lock-state'))
      ) {
        return true;
      }
      const {agentText} = readState(pc);
      return (
        agentText?.attemptFor !== undefined &&
        agentText.writtenBy !== agentText.attemptFor
      );
    };
    while (writing() && Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 50));
    }
    if (writing()) busy.push(pc.home);
  }
  return busy;
}

/**
 * The environment a run gets on a private computer.
 * @param {ReturnType<typeof computer>} pc
 * @param {Record<string, string | undefined>} [env]
 */
export function envOf(pc, env = {}) {
  const base = Object.fromEntries(
    Object.entries(process.env).filter(
      // A proxy would carry the request for the local test registry away.
      ([k]) =>
        !/^(?:npm_|XDG_|ASTRYX|CI$|NO_UPDATE_NOTIFIER$|(?:https?|all|no)_proxy$)/iu.test(
          k,
        ),
    ),
  );
  return {
    ...base,
    HOME: pc.home,
    USERPROFILE: pc.home,
    XDG_CACHE_HOME: pc.cache,
    XDG_CONFIG_HOME: path.join(pc.home, '.config'),
    PATH: pc.path.join(path.delimiter),
    npm_config_registry: OFFLINE,
    npm_config_update_notifier: 'false',
    // An unreachable registry fails at once instead of after npm's backoff.
    npm_config_fetch_retry_mintimeout: '50',
    npm_config_fetch_retry_maxtimeout: '100',
    NO_COLOR: '1',
    ...env,
  };
}

/**
 * Run an `astryx` entry file with node, on a private computer.
 * @param {string} bin
 * @param {string[]} args
 * @param {{cwd: string, pc: ReturnType<typeof computer>, env?: Record<string, string | undefined>}} options
 */
export function run(bin, args, {cwd, pc, env = {}}) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    encoding: 'utf8',
    env: envOf(pc, env),
    timeout: 60_000,
  });
  return {
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr,
    /** The stderr lines that start with `astryx: `. */
    lines: result.stderr
      .split(/\r?\n/u)
      .filter(line => line.startsWith('astryx: ')),
    /** The update notice lines (FR10). */
    notice: result.stderr
      .split(/\r?\n/u)
      .filter(line =>
        /^(?:A new release of Astryx|To upgrade|The astryx command)/u.test(
          line,
        ),
      ),
  };
}

/**
 * A project with Core installed at `core`, and its own CLI at `cli`.
 * @param {{core?: string, cli?: string, brokenCli?: string, declare?: Record<string, string>}} spec
 */
export function makeProject({core, cli, brokenCli, declare}) {
  const deps = {
    ...(core ? {'@astryxdesign/core': core} : {}),
    ...(cli ? {'@astryxdesign/cli': cli} : {}),
    ...(brokenCli ? {'@astryxdesign/cli': brokenCli} : {}),
    ...declare,
  };
  const dir = project(tempDir('project'), deps);
  if (core) installCore(dir, core);
  if (cli)
    placeCli(path.join(dir, 'node_modules', '@astryxdesign', 'cli'), cli);
  // A project CLI that cannot start: its package, with no astryx command.
  if (brokenCli) {
    writeJson(
      path.join(dir, 'node_modules', '@astryxdesign', 'cli', 'package.json'),
      {
        name: '@astryxdesign/cli',
        version: brokenCli,
      },
    );
  }
  return dir;
}

/**
 * What discover lists as available beyond the official Astryx list, which it
 * always reads.
 * @param {any} discover
 * @returns {any[]}
 */
export const notOfficial = discover =>
  (discover.meta?.available ?? []).filter(
    (/** @type {any} */ entry) => entry.source !== 'Astryx',
  );

/** doctor's fix where no install command fits (spec AST-081 FR2). */
export const DOCTOR_RUN_FROM_PROJECT =
  "Run this from the Astryx project's folder, or declare an Astryx package in this folder's package.json to make it a project of its own.";

/**
 * The hint's advice in a folder whose package.json is not the project's: the
 * same words as doctor's, naming no command (spec AST-081 FR5).
 */
export const RUN_FROM_PROJECT = DOCTOR_RUN_FROM_PROJECT;

/**
 * The once-a-day hint in a project with no CLI of its own.
 * @param {string} answered
 * @param {string} core
 */
export const noCliHint = (answered, core) =>
  `astryx: this project has no Astryx CLI installed; answered by CLI ${answered} while its Core is ${core}. To match, run: npm install @astryxdesign/cli@${core}`;

/** @param {string} version */
export const handedTo = version => (/** @type {string} */ from) =>
  `astryx: answered by this project's CLI ${version}, handed over from CLI ${from}`;
/** @param {string} version */
export const matchedLine = version =>
  `astryx: answered by CLI ${version} with Core ${version}, the release that matches this project's Core`;
/** @param {string} version */
export const outsideLine = version =>
  `astryx: answered by CLI ${version} with Core ${version}, outside a project`;

/**
 * Every file under `dir`, for before-and-after comparisons.
 * @param {string} dir
 * @returns {string[]}
 */
export function filesIn(dir) {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ d) => {
    for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Write the global copy's state.
 * @param {ReturnType<typeof computer>} pc
 * @param {Record<string, unknown>} state
 */
export function globalState(pc, state) {
  writeJson(path.join(pc.home, '.config', 'astryx', 'state.json'), state);
}

/**
 * The saved state.
 * @param {ReturnType<typeof computer>} pc
 * @returns {Record<string, any>}
 */
export function readState(pc) {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(pc.home, '.config', 'astryx', 'state.json'),
        'utf8',
      ),
    );
  } catch {
    return {};
  }
}

/**
 * An integration (by default `@acme/widgets`) installed in `root`'s
 * node_modules, with one doc topic; `manifest` replaces its manifest's text.
 * @param {string} root
 * @param {{topic: string, peers?: Record<string, string>, name?: string, manifest?: string}} options
 */
export function acmeWidgets(
  root,
  {topic, peers, name = '@acme/widgets', manifest},
) {
  const dir = path.join(root, 'node_modules', ...name.split('/'));
  writeJson(path.join(dir, 'package.json'), {
    name,
    version: '1.0.0',
    ...(peers ? {peerDependencies: peers} : {}),
  });
  fs.writeFileSync(
    path.join(dir, 'astryx.integration.mjs'),
    manifest ?? "export default {docs: './docs'};\n",
  );
  fs.mkdirSync(path.join(dir, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'docs', `${topic}.doc.mjs`),
    `export const docs = ${JSON.stringify({
      type: 'generic',
      name: topic,
      title: 'Deploying',
      description: 'How to ship an app built with Acme widgets.',
      category: 'guide',
      sections: [
        {
          title: 'Overview',
          content: [{type: 'prose', text: 'Push the button.'}],
        },
      ],
    })};\n`,
  );
  return dir;
}

/** The two lines of a newer-release notice. */
export const available = (
  /** @type {string} */ cur,
  /** @type {string} */ next,
) => `A new release of Astryx is available: ${cur} → ${next}`;
