// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `@astryxdesign/cli/host`, the programmatic host entry (spec AST-081
 * FR1). A tool that carries this CLI starts one run of it with explicit
 * inputs: the arguments, the working folder, the command name its users type,
 * and, when it found the project's own CLI and did not run it, the reason.
 *
 * Its package sets, the integrations it approves, and its own discover sources
 * are matched, loaded, and recorded as architecture:cli-surface INV30 says; a
 * hosted run installs nothing. When another package set's release answers
 * through its own host entry, that entry runs in this process with the same
 * inputs, and the call settles with its result.
 *
 * @input `runHostedCli` options (see host/index.d.ts for the contract).
 * @output The run's exit status and the packages it resolved, each with its
 *   source. The run owns the process's working folder, arguments, standard
 *   streams, and exit, exactly as a run of the `astryx` bin does: every path
 *   on which the bin exits the process exits it here too (host/index.d.ts
 *   lists them).
 * @position host — the package's `./host` export; calls clients/cli/run.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const BIN = path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');

/**
 * The process, seen as the holder of one mark: whether a hosted run started in
 * it, whichever copy of the CLI started it.
 */
const processMarks = /** @type {{__astryxHostRunStarted?: boolean}} */ (
  /** @type {unknown} */ (process)
);

/** The longest reason a host may give for not running the project's CLI. */
const MAX_REASON_LENGTH = 120;

const OPTION_NAMES = new Set([
  'argv',
  'cwd',
  'cliCommand',
  'declinedProjectCli',
  'roots',
  'integrations',
  'discoverSources',
]);

/** A bare npm package name, scoped or not. */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;

/**
 * @param {string} message
 * @returns {TypeError}
 */
function invalid(message) {
  return new TypeError(`runHostedCli: ${message}`);
}

/**
 * Check every input before anything runs.
 * @param {unknown} options
 * @returns {Promise<{argv: string[], cwd: string, cliCommand: string | undefined, declinedProjectCli: string | undefined, roots: string[], integrations: string[], discoverSources: Function[]}>}
 */
async function readOptions(options) {
  if (options === undefined) options = {};
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    throw invalid('options must be an object');
  }
  const record = /** @type {Record<string, unknown>} */ (options);
  for (const key of Object.keys(record)) {
    if (!OPTION_NAMES.has(key)) {
      throw invalid(
        `unknown option "${key}"; the options are ${[...OPTION_NAMES].join(', ')}`,
      );
    }
  }

  const argv = record.argv ?? [];
  if (!Array.isArray(argv) || !argv.every(arg => typeof arg === 'string')) {
    throw invalid('argv must be an array of strings');
  }

  const cwdInput = record.cwd ?? process.cwd();
  if (typeof cwdInput !== 'string' || cwdInput === '') {
    throw invalid('cwd must be a folder path');
  }
  const cwd = path.resolve(cwdInput);
  let isFolder = false;
  try {
    isFolder = fs.statSync(cwd).isDirectory();
  } catch {
    isFolder = false;
  }
  if (!isFolder) throw invalid(`cwd is not a folder: ${cwd}`);

  let cliCommand;
  if (record.cliCommand !== undefined) {
    const {parseCliCommandField} =
      await import('../authoring/integration/schema.mjs');
    try {
      cliCommand = parseCliCommandField(record.cliCommand, 'cliCommand');
    } catch (err) {
      throw invalid(err instanceof Error ? err.message : String(err));
    }
  }

  const declinedProjectCli = record.declinedProjectCli;
  if (
    declinedProjectCli !== undefined &&
    (typeof declinedProjectCli !== 'string' ||
      declinedProjectCli === '' ||
      declinedProjectCli !== declinedProjectCli.trim() ||
      /[\r\n]/u.test(declinedProjectCli) ||
      declinedProjectCli.length > MAX_REASON_LENGTH)
  ) {
    throw invalid(
      `declinedProjectCli must be a non-blank single line of at most ${MAX_REASON_LENGTH} characters, with no surrounding spaces`,
    );
  }

  const rootsInput = record.roots ?? [];
  if (
    !Array.isArray(rootsInput) ||
    !rootsInput.every(root => typeof root === 'string' && root !== '')
  ) {
    throw invalid('roots must be an array of folder paths');
  }
  /** @type {string[]} */
  const roots = [];
  for (const root of rootsInput) {
    const folder = path.resolve(root);
    let isRoot = false;
    try {
      isRoot = fs.statSync(folder).isDirectory();
    } catch {
      isRoot = false;
    }
    if (!isRoot) {
      throw invalid(`roots names a path that is not a folder: ${folder}`);
    }
    if (!roots.includes(folder)) roots.push(folder);
  }

  const integrations = record.integrations ?? [];
  if (
    !Array.isArray(integrations) ||
    !integrations.every(
      name => typeof name === 'string' && PACKAGE_NAME.test(name),
    )
  ) {
    throw invalid('integrations must be an array of package names');
  }

  const discoverSources = record.discoverSources ?? [];
  if (
    !Array.isArray(discoverSources) ||
    !discoverSources.every(source => typeof source === 'function')
  ) {
    throw invalid('discoverSources must be an array of functions');
  }

  return {
    argv: [...argv],
    cwd,
    cliCommand,
    declinedProjectCli: /** @type {string | undefined} */ (declinedProjectCli),
    roots,
    integrations: [...new Set(/** @type {string[]} */ (integrations))],
    discoverSources: [...discoverSources],
  };
}

/**
 * The bin's Node version gate, for a host process: same message, same exit
 * status, same JSON envelope.
 * @param {string[]} argv
 * @returns {Promise<boolean>} whether the run may go on
 */
async function nodeVersionGate(argv) {
  const {isNodeVersionSupported, unsupportedNodeMessage} =
    await import('../foundation/env/node-version.mjs');
  if (isNodeVersionSupported(process.versions.node)) return true;
  const msg = unsupportedNodeMessage(process.versions.node);
  if (argv.includes('--json')) {
    process.stdout.write(
      `${JSON.stringify({apiVersion: 1, error: msg, code: 'ERR_NODE_VERSION'}, null, 2)}\n`,
    );
  } else {
    process.stderr.write(`${msg}\n`);
  }
  process.exitCode = 1;
  return false;
}

/**
 * Load another release's host entry, from one of the host's package sets, to
 * hand this run over to in this process (architecture:cli-surface INV30). The
 * run stays one call of the host's: the one-call mark passes to the entry that
 * answers, and the call settles with that entry's result.
 * @param {string} hostEntry the package set's `host/index.mjs`
 * @returns {Promise<(options: import('./index.js').HostedCliOptions) => Promise<import('./index.js').HostedCliResult>>}
 */
async function loadHostEntry(hostEntry) {
  const entry = await import(pathToFileURL(hostEntry).href);
  if (typeof entry.runHostedCli !== 'function') {
    throw new Error(`${hostEntry} exports no runHostedCli`);
  }
  return options => {
    processMarks.__astryxHostRunStarted = false;
    return entry.runHostedCli(options);
  };
}

/**
 * Run the CLI once in this process, as the `astryx` bin would run with the
 * same arguments in the same folder, for a tool that carries this CLI.
 *
 * @param {import('./index.js').HostedCliOptions} [options]
 * @returns {Promise<import('./index.js').HostedCliResult>}
 */
export async function runHostedCli(options) {
  const input = await readOptions(options);
  if (processMarks.__astryxHostRunStarted) {
    throw new Error(
      'runHostedCli: a run already started in this process; start each run in a new process',
    );
  }
  processMarks.__astryxHostRunStarted = true;

  process.chdir(input.cwd);
  process.argv = [process.argv[0] ?? process.execPath, BIN, ...input.argv];
  if (!(await nodeVersionGate(input.argv))) return {status: 1, packages: []};

  const {installPlaceOf, projectRootOf} =
    await import('../foundation/release/choose.mjs');
  const {readReleaseFacts} = await import('../foundation/release/project.mjs');
  const {activateHostedRun, recordResolved, resolvedPackages} =
    await import('../foundation/runtime/package-root.mjs');
  const real = fs.realpathSync(CLI_ROOT);
  let projectRoot = null;
  try {
    projectRoot = projectRootOf(readReleaseFacts(input.cwd));
  } catch {
    projectRoot = null;
  }
  activateHostedRun({
    roots: input.roots,
    integrations: input.integrations,
    discoverSources: input.discoverSources,
    // The root that holds this CLI, or, for a CLI that is not installed in a
    // node_modules folder, the folder beside it that holds its Core.
    startingRoot: installPlaceOf(real).owner ?? path.dirname(real),
    projectRoot,
    loadHostEntry,
  });
  recordResolved(
    '@astryxdesign/cli',
    JSON.parse(fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'))
      .version,
    CLI_ROOT,
  );

  const {runCli} = await import('../clients/cli/run.mjs');
  const run = () =>
    runCli({
      cliRoot: CLI_ROOT,
      argv: [...input.argv],
      declinedProjectCli: input.declinedProjectCli,
    });
  let answered;
  if (input.cliCommand === undefined) {
    answered = await run();
  } else {
    const {runWithCliDoor} = await import('../foundation/env/cli-command.mjs');
    answered = await runWithCliDoor(input.cliCommand, run);
  }
  // Another package set's host entry answered the run (INV30).
  if (answered) return answered;
  const code = process.exitCode;
  return {
    status: typeof code === 'number' ? code : Number(code ?? 0) || 0,
    packages: resolvedPackages(),
  };
}
