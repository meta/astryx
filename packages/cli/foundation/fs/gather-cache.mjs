// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A gathered catalog kept between runs, so a run whose inputs are
 * unchanged skips gathering.
 *
 * @input `recordRunFor(argv, run)` around a whole run; `persistedGather(key,
 *   load, codec)` around one gather inside it.
 * @output The value the gather returns. A run that asks again with the same
 *   key gets the stored value only when every file and folder the first run
 *   read (from its start to the end of its gather), every module it loaded,
 *   and every environment variable it read are as they were; otherwise it
 *   gathers fresh and stores that.
 * @position Used by search's adapter (api/search/_adapter.mjs) for the
 *   catalog `search` and `build` rank, and by the project
 *   (foundation/config/project.mjs) for its integration issues: each
 *   integration's contribution-check results and the whole list (with the
 *   template and component replacement passes), which `component`,
 *   `template`, `theme`, `discover` and `search` report, by template
 *   discovery (foundation/discovery/template-adapter.mjs) for its records, by
 *   the component list (api/component/list/list.mjs) and component
 *   replacement (foundation/discovery/component-replacement.mjs), by theme
 *   discovery (foundation/discovery/theme-discovery.mjs) for each
 *   integration's themes, by theme build
 *   (foundation/discovery/core-theme-facts.mjs) for what it checks a theme
 *   against in Core's component docs,
 *   by `doctor` (api/doctor/_adapter.mjs) for its file-only docs checks and
 *   its theme-wiring scan, by the docs adapter (api/docs/_adapter.mjs) for
 *   the CLI's own docs tree, which `docs` and `search` read, by the discover
 *   adapter (api/discover/_adapter.mjs) for the integrations a project loads
 *   and what each adds, which `discover` lists, and for what discover
 *   searches in its sources' saved copies, which `search` reads for its
 *   discover line,
 *   in a run that records modules and variables to its end, and, through
 *   `persistedSummary`, by kept-tree.mjs for summaries of folder trees, the
 *   lookup commands' not-found hint's name index among them
 *   (foundation/suggest/name-index.mjs), by css-tree.mjs for what
 *   `theme build` finds when it checks a theme's pseudo-class keys and token
 *   names (foundation/runtime/css-tree.mjs keptCssTreeAnswer), and by
 *   `theme build` for the JavaScript it compiles from a theme's local
 *   modules (api/theme/build/self-contained.mjs), each kept while every
 *   path it stamped but the CLI's own files (which its build id and the
 *   folder it runs from, both in every entry's key, stand for) is
 *   unchanged, in any command. Through `persistedValue`, the stored docs
 *   (foundation/doc-compiler/stored-docs.mjs keptParse) keep each stored
 *   doc's parse by the doc's text and the zod release the parsers load,
 *   which with the build id are all the parse depends on, in a run that
 *   keeps catalogs. The commands whose runs keep the other
 *   entries are `search`, `build`, `component`, `template`, `theme`,
 *   `discover`, `docs` and `doctor`. The first such run on a machine makes the
 *   folder and keeps its gathers at once, so the next run (most often the same
 *   session's next command) uses them. doctor never makes it, nor do
 *   `component` and `template` in a project with no integration: they keep
 *   their gathers only once it exists. A run through
 *   the host entry keeps them too, keyed on what the host passed
 *   (hostInputs). Only a published CLI stores anything:
 *   its build id (clients/cli/build-id.generated.json, written at `prepack`)
 *   names its exact code, so a checkout, whose code may change between runs
 *   under the same version, always gathers.
 *
 *   An entry stores only the states that the kept entries it builds on do
 *   not hold: it names each of them, at the version it read, and is used
 *   only while each is still there at that version and holds. A run checks
 *   each kept entry once, so entries that read the same files (the component
 *   list, its replacements, the project's issues) check those files once. An
 *   entry built on is marked as used after the entries built on it, so
 *   eviction removes it after them. A gather's entry file holds two lines:
 *   what the entry is and stands for (its format, key, version, the entries
 *   it builds on, its states and variables), then its value. Checking an
 *   entry, or one an entry builds on, parses only the first line.
 *
 *   The folder is `catalogs` in the user's cache folder (userCacheDir):
 *   created 0700, used only while it is a real folder owned by the user and
 *   closed to others (isPrivateDir; never on a system with no user ids), each file written 0600 by a rename, oldest first evicted past
 *   CACHE_LIMIT_BYTES (cache-eviction.mjs) once a run that wrote ends, or by
 *   doctor's summary when it finds the folder over that. Any failure to read, check, parse or write is silent
 *   and the run gathers fresh, as it would with no cache.
 */

import {createHash, randomBytes} from 'node:crypto';
import * as fs from 'node:fs';
import * as nodeModule from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {CLI_ROOT, isCliBuildFile, realDir} from './paths.mjs';
import {mayHaveIntegrations} from '../integrations/may-have-integrations.mjs';
import {currentUid, isPrivateDir} from '../env/private-dir.mjs';
import {transpiledCacheDir, userCacheDir} from '../env/user-dirs.mjs';
import {hostedRun} from '../runtime/package-root.mjs';
import {cliDoor} from '../env/cli-command.mjs';
import {CACHE_LIMIT_BYTES, evictOldest} from './cache-eviction.mjs';
import {ownModuleHooks} from './own-modules.mjs';
import {
  LISTED,
  PRESENT,
  RESOLVED,
  lookedUp,
  fileStamp,
  keepState,
  listingStamp,
  resolvedNow,
  recordReads,
  recordStates,
  stillInState,
  withoutRecording,
} from './read-record.mjs';

/**
 * The kept commands whose kept gathers are worth recording only where an
 * integration can load (its check results): a project with no integration
 * records none of them.
 */
const INTEGRATION_COMMANDS = new Set(['theme', 'discover', 'docs']);

/**
 * The kept commands that run template discovery, which reads each of the
 * CLI's template docs with or without an integration. In a project with no
 * integration they record only into a catalogs folder that exists already,
 * and never make it.
 */
const TEMPLATE_COMMANDS = new Set(['component', 'template']);

/** The run's commands whose gathers are kept. */
const KEPT_COMMANDS = new Set([
  'search',
  'build',
  'component',
  'template',
  'theme',
  'discover',
  'docs',
  // Its project check, with or without `--built`, keeps its docs checks and
  // theme-wiring scan; its `integration` checks run neither, and keep only
  // the project gathers they load, as the commands above do.
  'doctor',
]);

/** Where `prepack` writes the id of the package's exact contents. */
export const BUILD_ID_FILE = path.join(
  CLI_ROOT,
  'clients',
  'cli',
  'build-id.generated.json',
);

/**
 * Whether a file in the folder is a kept entry, which eviction counts.
 * @param {string} name
 * @returns {boolean}
 */
const isEntry = name => name.startsWith('gather-');

/** The stored format; a different one is a miss. */
const FORMAT = 2;

/** A variable the run read that was unset, as stored. */
const UNSET = null;

/**
 * What the running command has read since it started: files and folders with
 * their states, modules it loaded with theirs, and environment variables with
 * their values. Files and folders are recorded for the whole run; modules and
 * variables only while the run is armed: from its start to the end of its
 * first gather, and during each later gather, or, in a run armed throughout
 * (`doctor`), to its end. Null outside a recorded run.
 * @type {{reads: Map<string, string>, env: Map<string, string | null>, arm: () => boolean, disarm: () => void, armedThroughout: boolean, realEnv: NodeJS.ProcessEnv, confirmed: Confirmed, trims: Set<string>, trimNoted: () => void} | null}
 */
let run = null;

/**
 * The running recorded run's reads and variables, or null outside one: for
 * tests, and for a caller that keeps a value only in a recorded run (doctor's
 * kept checks).
 * @returns {{reads: Map<string, string>, env: Map<string, string | null>} | null}
 */
export function recordedRun() {
  return run && {reads: run.reads, env: run.env};
}

/** Why the last persisted gather in this process hit or missed. */
/** @type {{hit: boolean, reason: string} | null} */
let lastOutcome = null;

/**
 * The states of the CLI's own files that the run's kept gather depends on:
 * those it was stored with and that a hit has just found unchanged, or those
 * a fresh gather was stored with. A derived value keys on them, so an edit to
 * the CLI's code in an installed copy, which misses the gather, misses the
 * derived value too. Null before any kept gather in the run. A hit leaves
 * how to work them out, since only a derived value after it reads them.
 * @type {[string, string][] | (() => [string, string][]) | null}
 */
let gatherCode = null;

/** How many persistedGather calls are running, nested inside one another. */
let gatherDepth = 0;

/**
 * The kept entries a recorded run has read back or stored, by file: the
 * version each holds, every state it stands for (its own and those of the
 * entries it builds on, as the lists each stores, once each), and every entry
 * it builds on, directly or not. A later entry stores only the states none of
 * them holds and names the ones it builds on, so a run checks each state
 * once. A kept entry is checked before the run's command writes anything; the
 * record ends with the run.
 * @typedef {{version: string, lists: [string, string][][], under: Set<string>, deps: string[], merged?: [string, string][]}} ConfirmedEntry
 * @typedef {Map<string, ConfirmedEntry>} Confirmed
 */

/**
 * The outcome of the last kept gather in this process: whether it was a hit,
 * and why it missed. Null when no kept gather ran.
 * @returns {{hit: boolean, reason: string} | null}
 */
export function gatherCacheOutcome() {
  return lastOutcome;
}

/**
 * Whether a path is in jiti's transpile cache, where the first load of each
 * TypeScript integration file writes its compiled copy. That copy follows its
 * source, whose content is a stamp of its own, so the cache never decides an
 * answer; stamping it would only make the run after a cache fill miss.
 * @param {string} file
 * @returns {boolean}
 */
function inJitiCache(file) {
  jitiRoots ??= jitiCacheRoots();
  return jitiRoots.some(
    root => file === root || file.startsWith(root + path.sep),
  );
}

/** jiti's cache folders, worked out once per process (inJitiCache). */
/** @type {string[] | undefined} */
let jitiRoots;

/**
 * Where transpiled code may be kept: the system temp folder's `jiti`, the
 * per-user folder (jiti-cache.mjs), and a set JITI_FS_CACHE.
 * @returns {string[]}
 */
function jitiCacheRoots() {
  const env = process.env.JITI_FS_CACHE;
  const roots = [path.join(os.tmpdir(), 'jiti'), transpiledCacheDir()];
  if (env && env !== 'false' && env !== 'true' && env !== '0' && env !== '1') {
    roots.push(path.resolve(env));
  }
  return roots;
}

/**
 * The published package's build id, or null in a checkout.
 * @returns {string | null}
 */
function buildId() {
  // Only an installed package keeps catalogs: one in a node_modules folder,
  // where its files stay as published. A checkout's code changes as it is
  // edited, and a build id a local pack left there would not follow.
  if (!CLI_ROOT.split(path.sep).includes('node_modules')) return null;
  try {
    const id = JSON.parse(fs.readFileSync(BUILD_ID_FILE, 'utf-8')).id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Where the kept catalogs live: a folder of their own in the user's cache
 * folder.
 * @returns {string}
 */
function cacheDirPath() {
  return path.join(userCacheDir(), 'catalogs');
}

/**
 * The kept catalogs' folder, or null when it is missing or cannot be used:
 * not a real folder, owned by someone else, open to others, or on a system
 * with no user ids, where ownership cannot be checked (see isPrivateDir).
 * @returns {string | null}
 */
export function gatherCacheDir() {
  const dir = cacheDirPath();
  return isPrivateDir(dir) ? dir : null;
}

/**
 * The run's first operand: the command a run of these arguments asks for.
 * @param {string[]} argv
 * @returns {string | undefined}
 */
function commandOf(argv) {
  return argv.find(arg => !arg.startsWith('-'));
}

/**
 * Run `fn`, recording what it reads, when the arguments ask for a command
 * whose gather is kept and the CLI can keep one. Otherwise run it as is.
 * @template T
 * @param {string[]} argv
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function recordRunFor(argv, fn) {
  const command = commandOf(argv);
  // Under Yarn Plug'n'Play, Node's module hooks hand PnP's resolver options
  // it refuses, so the run keeps no catalogs and installs no hook; nor where
  // the system has no user ids, as the folder's owner cannot be checked.
  if (
    !command ||
    !KEPT_COMMANDS.has(command) ||
    runsUnderPnp() ||
    currentUid() == null ||
    withoutRecording(buildId) == null
  ) {
    return fn();
  }
  // Last, being a few file checks: whether an integration can load.
  const bare =
    (INTEGRATION_COMMANDS.has(command) || TEMPLATE_COMMANDS.has(command)) &&
    !withoutRecording(() => mayHaveIntegrations(process.cwd()));
  if (bare && !TEMPLATE_COMMANDS.has(command)) return fn();
  // The first recorded run on a machine (search, build, or component,
  // template, theme, discover or docs where an integration can load) makes
  // the folder and keeps its gathers at once. Once the per-user cache folder
  // exists doctor uses it, and so do component and template in a project
  // with no integration; they never make it, so such a run alone changes
  // nothing on the machine (nor doctor's own cache row).
  if (command !== 'doctor' && !bare) makeGatherCacheDir();
  // A folder the cache would refuse (not the user's own, open to others, a
  // link) leaves the run exactly as without the cache: no hook is installed.
  if (withoutRecording(gatherCacheDir) == null) return fn();
  // doctor's kept checks read docs modules that load between its gathers, so
  // its run records modules and variables to the end, not only during each
  // gather.
  return recordRun(fn, {armedThroughout: command === 'doctor'});
}

/**
 * Make the kept catalogs' folder where this run could keep entries in it and
 * it does not exist yet: an installed CLI with a build id, outside Yarn
 * Plug'n'Play, on a system with user ids. Recorded runs make it at their
 * start; the lookup commands' not-found hint makes it before it keeps its
 * name index, so a project's first miss keeps what later misses read. A
 * folder that cannot be made keeps nothing; nothing more.
 * @returns {boolean} whether this run keeps summaries there
 */
export function makeGatherCacheDir() {
  if (
    runsUnderPnp() ||
    currentUid() == null ||
    withoutRecording(buildId) == null
  ) {
    return false;
  }
  const dir = cacheDirPath();
  try {
    withoutRecording(() => {
      if (!fs.existsSync(dir))
        fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    });
  } catch {
    // A folder that cannot be made keeps no catalogs.
  }
  return withoutRecording(gatherCacheDir) != null;
}

/**
 * Run `fn` as a recorded run (see `run`), armed from its start. Exported for
 * tests; `recordRunFor` decides which runs are recorded.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{armedThroughout?: boolean}} [options] - `armedThroughout`: record
 *   modules and variables until the run ends, not only until each gather
 *   ends, for a run whose later gathers read modules loaded in between.
 * @returns {Promise<T>}
 */
export async function recordRun(fn, {armedThroughout = false} = {}) {
  const registerHooks = /** @type {any} */ (nodeModule).registerHooks;
  if (typeof registerHooks !== 'function' || run != null) return fn();
  /** @type {Map<string, string>} */
  const reads = new Map();
  /** @type {Map<string, string | null>} */
  const env = new Map();
  const realEnv = process.env;
  /** @type {{deregister: () => void} | null} */
  let hooks = null;
  // An installed CLI resolves imports between its own modules by path while
  // the recorder is armed (own-modules.mjs). Registered just before the
  // recorder's hooks, so the recorder still sees each import and each load.
  const own =
    withoutRecording(buildId) == null
      ? null
      : ownModuleHooks(`${pathToFileURL(CLI_ROOT).href}/`);
  /** @type {{deregister: () => void} | null} */
  let ownHooks = null;
  /** @param {string | symbol} name */
  const noteEnv = name => {
    if (typeof name === 'string' && !env.has(name)) {
      env.set(name, envState(realEnv[name]));
    }
  };
  // Asking whether a variable is set, as `in` does and as `Object.keys` does
  // for every name it lists, reads no value: only whether it is set counts.
  // Every read of a value goes through `get` (spread, Object.entries,
  // Object.assign, JSON.stringify included). Known gap: a descriptor's
  // `value` (Object.getOwnPropertyDescriptor(s) on process.env) is a value
  // read with no `get`, so it counts only as set. Nothing the CLI, Core, its
  // dependencies, jiti's bundled babel or the integrations we test reads the
  // environment that way.
  /** @param {string | symbol} name */
  const notePresence = name => {
    if (typeof name === 'string' && !env.has(PRESENCE + name)) {
      env.set(PRESENCE + name, presenceState(realEnv, name));
    }
  };
  const proxy = new Proxy(realEnv, {
    get(target, name) {
      noteEnv(name);
      return Reflect.get(target, name);
    },
    has(target, name) {
      notePresence(name);
      return Reflect.has(target, name);
    },
    getOwnPropertyDescriptor(target, name) {
      notePresence(name);
      return Reflect.getOwnPropertyDescriptor(target, name);
    },
    ownKeys(target) {
      if (!env.has('\0names')) env.set('\0names', envState(namesOf(target)));
      return Reflect.ownKeys(target);
    },
  });
  const disarm = () => {
    for (const handle of [hooks, ownHooks]) {
      try {
        handle?.deregister();
      } catch {
        // A hook that cannot be removed is inert: it notes modules, or
        // resolves the CLI's own as Node would.
      }
    }
    hooks = null;
    ownHooks = null;
    if (process.env === proxy) process.env = realEnv;
  };
  const arm = () => {
    if (hooks) return true;
    try {
      if (own) ownHooks = registerHooks(own);
      hooks = registerHooks({
        /**
         * @param {string} url
         * @param {any} context
         * @param {(url: string, context: any) => any} next
         */
        /**
         * @param {string} specifier
         * @param {any} context
         * @param {(specifier: string, context: any) => any} next
         */
        resolve(specifier, context, next) {
          if (hooks) noteLookups(specifier, context?.parentURL, reads);
          return next(specifier, context);
        },
        /**
         * @param {string} url
         * @param {any} context
         * @param {(url: string, context: any) => any} next
         */
        load(url, context, next) {
          if (hooks && url.startsWith('file:')) {
            try {
              const file = fileURLToPath(url);
              // The load reads the module's content: its stamp.
              keepState(reads, file, fileStamp, 'stamp');
            } catch {
              // A URL with no file path holds nothing to check.
            }
          }
          return next(url, context);
        },
      });
      process.env = proxy;
      return true;
    } catch {
      disarm();
      return false;
    }
  };
  if (!arm()) return fn();
  // The catalogs folders this run wrote to, each trimmed once when it ends.
  /** @type {Set<string>} */
  const trims = new Set();
  const trimNoted = () => {
    for (const dir of trims) trimNow(dir);
  };
  run = {
    reads,
    env,
    arm,
    disarm,
    armedThroughout,
    realEnv,
    confirmed: new Map(),
    trims,
    trimNoted,
  };
  try {
    return await recordReads(reads, fn, {exact: true});
  } finally {
    disarm();
    run = null;
    process.removeListener('exit', trimNoted);
    trimNoted();
  }
}

/**
 * Keep a catalogs folder within its size limit after a write to it. In a
 * recorded run the folder is trimmed once, when the run ends, so a run that
 * keeps many values (a first `theme build` keeps one per Core component doc)
 * reads the folder once, not once per value. Outside a run it is trimmed at
 * once.
 * @param {string} dir
 */
function trimAfterWrite(dir) {
  if (!run) {
    trimNow(dir);
    return;
  }
  // A command that fails ends through process.exit, which skips the run's
  // finally: the folders it noted are trimmed as the process exits.
  if (run.trims.size === 0) process.once('exit', run.trimNoted);
  run.trims.add(dir);
}

/**
 * Trim a catalogs folder to its size limit now, the oldest entries first.
 * @param {string} dir
 */
function trimNow(dir) {
  // The cache's own upkeep, never an input of what it keeps.
  withoutRecording(() => {
    try {
      evictOldest(dir, isEntry);
    } catch {
      // A folder that cannot be read is trimmed by a later run.
    }
  });
}

/**
 * Note where Node looks for a bare import, as it looks: `node_modules/<name>`
 * in the importing file's folder and in each folder above it, each with its
 * state now (absent included), so a package added to or removed from any of
 * them later is a change.
 * @param {string} specifier
 * @param {string | undefined} parentURL
 * @param {Map<string, string>} reads
 */
function noteLookups(specifier, parentURL, reads) {
  if (
    !parentURL?.startsWith('file:') ||
    /^(?:\.|\/|[a-z][a-z0-9+.-]*:)/i.test(specifier) ||
    nodeModule.isBuiltin(specifier)
  ) {
    return;
  }
  const parts = specifier.split('/');
  const name = specifier.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : parts[0];
  try {
    let dir = path.dirname(fileURLToPath(parentURL));
    for (;;) {
      if (path.basename(dir) !== 'node_modules') {
        const candidate = path.join(dir, 'node_modules', name);
        keepState(reads, candidate, lookupStamp);
      }
      const up = path.dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  } catch {
    // A parent with no file path has nothing to look up.
  }
}

/**
 * A looked-up package folder's state: its identity when it is there, as a
 * probe records it (see read-record.mjs), or absent.
 * @param {string} folder
 * @returns {string}
 */
function lookupStamp(folder) {
  try {
    const stat = fs.statSync(folder, {throwIfNoEntry: false});
    return stat ? `dir:${stat.ino}` : '-';
  } catch {
    return '-';
  }
}

/** The stamp name prefix for whether a variable is set, not its value. */
const PRESENCE = '\0set:';

/**
 * Whether `name` is set in `env`, as stored.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @returns {string | null}
 */
function presenceState(env, name) {
  return typeof env[name] === 'string' ? 'set' : UNSET;
}

/**
 * How an environment variable the run read is kept: a digest of its value,
 * never the value (it can be a token), or UNSET when it was not set.
 * @param {unknown} value
 * @returns {string | null}
 */
function envState(value) {
  // Only a set variable has a value; a name such as `toString` reads a
  // function from Object.prototype, which is no variable.
  if (typeof value !== 'string') return UNSET;
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/**
 * Every environment variable's name, sorted and joined, standing for a read of
 * the whole environment.
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
function namesOf(env) {
  return Object.keys(env).sort().join('\0');
}

/**
 * The entry's file in the folder, for a key.
 * @param {string} dir
 * @param {unknown[]} key
 * @param {string} id
 * @returns {string}
 */
function entryFile(dir, key, id) {
  const hash = createHash('sha256')
    .update(entryKey(key, id))
    .digest('hex')
    .slice(0, 40);
  return path.join(dir, `gather-${hash}.json`);
}

/** @type {string | undefined} */
let cliFolderAnswer;

/**
 * The real path of the folder this CLI runs from, once per process: a copy
 * installed in another folder (a patched one) keeps its own entries.
 * @returns {string}
 */
function cliFolder() {
  return (cliFolderAnswer ??= withoutRecording(() => realDir(CLI_ROOT)));
}

/**
 * Everything an entry is for, as text: stored in the entry and compared on
 * every read, so an entry copied under another entry's name is not used.
 * @param {unknown[]} key
 * @param {string} id
 * @returns {string}
 */
function entryKey(key, id) {
  return JSON.stringify([
    FORMAT,
    // The build and the folder it runs from stand for the CLI's own files.
    [id, cliFolder()],
    process.version,
    process.platform,
    process.arch,
    ...key,
    hostInputs(),
  ]);
}

/**
 * What a host passed that decides a gather, or null outside a hosted run: its
 * package sets, by real path and in its order, the integrations it approves,
 * and the command it runs the CLI as, which kept findings print. A run reads
 * only some of a package set's files, so their stamps cannot tell a hosted
 * run from a run of the bin in the same folder, and no file holds the
 * command. The run's folder is in each gather's own key.
 * @returns {{roots: string[], integrations: string[], door: string | null} | null}
 */
function hostInputs() {
  const hosted = hostedRun();
  if (hosted == null) return null;
  return {
    roots: hosted.roots.map(root => withoutRecording(() => realDir(root))),
    integrations: [...hosted.integrations],
    door: cliDoor() ?? null,
  };
}

/**
 * Whether every stored state still holds: files, folders and modules, and the
 * environment.
 * @param {[string, string][]} stamps
 * @param {[string, string | null][]} env
 * @returns {string | null} why not, or null when all hold
 */
function staleReason(stamps, env) {
  // The environment as it is, never through the run's recording proxy:
  // checking an entry is no read the run's own gathers depend on.
  const real = run?.realEnv ?? process.env;
  for (const [name, value] of env) {
    const current = name.startsWith(PRESENCE)
      ? presenceState(real, name.slice(PRESENCE.length))
      : envState(name === '\0names' ? namesOf(real) : real[name]);
    if (current !== value) {
      return name === '\0names'
        ? 'the environment has other variables'
        : 'an environment variable it read changed';
    }
  }
  for (const [file, state] of stamps) {
    // The CLI's own files are the build id's and the CLI's folder's to stand
    // for (both are in the entry's key), as for a summary (inCliBuild): they
    // are kept for the code a derived value depends on, never checked one by
    // one. A package in the node_modules folder inside the CLI's is not part
    // of the build, and is checked as any other file.
    if (inCliBuild(file)) continue;
    if (!stillInState(file, state)) {
      return 'a file or folder it read changed';
    }
  }
  return null;
}

/**
 * The states of the kept entries an entry builds on, each found unchanged
 * once per run, with every entry under them and the files of the ones it
 * names; or null when one is gone, holds another version, or changed.
 * @param {string} dir
 * @param {unknown} deps - [entry file name, version] pairs, as stored
 * @param {Confirmed} confirmed - the entries already found unchanged
 * @param {Set<string>} [reading] - entries being checked, so a loop of
 *   entries that name each other is a miss
 * @returns {{lists: [string, string][][], under: Set<string>, direct: string[]} | null}
 */
function builtOn(dir, deps, confirmed, reading = new Set()) {
  if (!Array.isArray(deps)) return null;
  /** @type {[string, string][][]} */
  const lists = [];
  // Two entries this one names may build on one entry: its list counts once.
  /** @type {Set<[string, string][]>} */
  const listed = new Set();
  /** @type {Set<string>} */
  const under = new Set();
  /** @type {string[]} */
  const direct = [];
  for (const dep of deps) {
    if (!Array.isArray(dep) || typeof dep[0] !== 'string') return null;
    const file = path.join(dir, path.basename(dep[0]));
    const entry = confirmedEntry(file, dep[1], confirmed, reading);
    if (entry == null) return null;
    for (const list of entry.lists) {
      if (listed.has(list)) continue;
      listed.add(list);
      lists.push(list);
    }
    direct.push(file);
    under.add(file);
    for (const below of entry.under) under.add(below);
  }
  return {lists, under, direct};
}

/**
 * Every state a confirmed entry stands for, one per path: its lists, merged
 * the first time something needs them as one (choosing what a new entry
 * builds on).
 * @param {ConfirmedEntry} entry
 * @returns {[string, string][]}
 */
function statesOf(entry) {
  entry.merged ??= mergeStates(...entry.lists);
  return entry.merged;
}

/**
 * States from several lists, one per path, as a run's record keeps them
 * (keepState).
 * @param {...[string, string][]} lists
 * @returns {[string, string][]}
 */
function mergeStates(...lists) {
  /** @type {Map<string, string>} */
  const merged = new Map();
  for (const list of lists) {
    for (const [at, state] of list) {
      const had = merged.get(at);
      if (had === undefined) merged.set(at, state);
      else if (had !== state) keepState(merged, at, state);
    }
  }
  return [...merged];
}

/**
 * Mark an entry as used now, and each kept entry it builds on as used a
 * millisecond (the finest step of a file time set from a Date) after the
 * latest entry built on it, so eviction, which removes the least recently
 * used entries first, never removes an entry before one built on it.
 * @param {string} file
 * @param {Confirmed} confirmed
 */
function markUsed(file, confirmed) {
  /** @type {Map<string, number>} */
  const times = new Map();
  /** @type {Set<string>} */
  const onPath = new Set();
  /**
   * @param {string} at
   * @param {number} time
   */
  const visit = (at, time) => {
    if (onPath.has(at) || (times.get(at) ?? -Infinity) >= time) return;
    times.set(at, time);
    onPath.add(at);
    for (const dep of confirmed.get(at)?.deps ?? []) visit(dep, time + 1);
    onPath.delete(at);
  };
  visit(file, Date.now());
  for (const [at, time] of times) {
    try {
      const when = new Date(time);
      withoutRecording(() => fs.utimesSync(at, when, when));
    } catch {
      // An entry that cannot be touched is evicted sooner; nothing more.
    }
  }
}

/**
 * A kept entry at `version`, found unchanged as a hit finds it: read and
 * checked the first time the run meets it, after that from `confirmed`.
 * @param {string} file
 * @param {unknown} version
 * @param {Confirmed} confirmed
 * @param {Set<string>} reading
 * @returns {ConfirmedEntry | null}
 */
function confirmedEntry(file, version, confirmed, reading) {
  const known = confirmed.get(file);
  if (known) return known.version === version ? known : null;
  if (reading.has(file)) return null;
  reading.add(file);
  try {
    const stored = readHead(file);
    if (
      stored?.format !== FORMAT ||
      typeof stored.version !== 'string' ||
      stored.version !== version ||
      staleReason(stored.stamps, stored.env) != null
    ) {
      return null;
    }
    const base = builtOn(path.dirname(file), stored.deps, confirmed, reading);
    if (base == null) return null;
    /** @type {ConfirmedEntry} */
    const entry = {
      version: stored.version,
      lists: [...base.lists, stored.stamps],
      under: base.under,
      deps: base.direct,
    };
    confirmed.set(file, entry);
    return entry;
  } catch {
    return null;
  } finally {
    reading.delete(file);
  }
}

/**
 * The kept entries a new entry builds on: those the run has read back or
 * stored whose every state the run read too, as it holds them, largest
 * first, each only when it holds a state the others do not. Never one that
 * builds on the new entry's own file. An entry that only checked whether a
 * path is there still holds where the run read more of that path (holdsIn);
 * the new entry stores that fuller state, and the rest of its states,
 * itself.
 * @param {string} file - the new entry's file
 * @param {[string, string][]} stamps - every state the run read
 * @param {Confirmed} confirmed
 * @returns {{deps: [string, string][], own: [string, string][], under: Set<string>}}
 */
function chooseBase(file, stamps, confirmed) {
  const states = new Map(stamps);
  /** @type {Set<string>} */
  const covered = new Set();
  /** @type {[string, string][]} */
  const deps = [];
  /** @type {Set<string>} */
  const under = new Set();
  const candidates = [...confirmed]
    .filter(([other, entry]) => other !== file && !entry.under.has(file))
    .map(([other, entry]) => ({other, entry, held: statesOf(entry)}))
    .sort((a, b) => b.held.length - a.held.length);
  for (const {other, entry, held} of candidates) {
    if (held.length === 0) continue;
    if (!held.every(([at, state]) => holdsIn(states.get(at), state))) continue;
    const same = held.filter(([at, state]) => states.get(at) === state);
    if (same.every(([at]) => covered.has(at))) continue;
    deps.push([path.basename(other), entry.version]);
    under.add(other);
    for (const below of entry.under) under.add(below);
    for (const [at] of same) covered.add(at);
  }
  return {deps, own: stamps.filter(([at]) => !covered.has(at)), under};
}

/**
 * Whether a state an entry holds agrees with the state the run read of the
 * same path: the same state, or the entry holds only that the path is there,
 * or what a real-path lookup of it gave (confirmed this run), and the run
 * read it there.
 * @param {string | undefined} read - the run's state of the path
 * @param {string} held - the entry's state of it
 * @returns {boolean}
 */
function holdsIn(read, held) {
  return (
    read === held ||
    ((held === PRESENT || lookedUp(held)) && read !== undefined && read !== '-')
  );
}

/**
 * The gather `load` returns, or the one a run with the same key stored while
 * every input it read is unchanged (see the file header).
 * @template T, E
 * @param {unknown[]} key - What else decides the gather: its folder (a real
 *   path) and options.
 * @param {() => Promise<T>} load
 * @param {{encode: (value: T) => E, decode: (stored: E) => T, valid?: (value: T) => boolean}} codec - A
 *   plain-JSON form of the value and back, and optionally the shape a decoded
 *   value must have to be used (anything else is a miss).
 * @param {(value: T) => boolean} [keep] whether a fresh gather may be
 *   stored: one that depends on something its stamps cannot see (a retry
 *   that waits on time) is used for this run only
 * @returns {Promise<T>}
 */
export async function persistedGather(key, load, codec, keep = () => true) {
  // A gather inside another (an integration's checks inside search's catalog
  // gather) leaves the run's recording to the outermost: only it disarms, so
  // what the outer gather reads after the inner one is still stamped.
  gatherDepth++;
  try {
    return await gatherAt(key, load, codec, keep);
  } finally {
    if (--gatherDepth === 0 && !run?.armedThroughout) run?.disarm();
  }
}

/**
 * persistedGather's body; the caller disarms the run's recording once the
 * outermost gather is done.
 * @template T, E
 * @param {unknown[]} key
 * @param {() => Promise<T>} load
 * @param {{encode: (value: T) => E, decode: (stored: E) => T, valid?: (value: T) => boolean}} codec
 * @param {(value: T) => boolean} keep
 * @returns {Promise<T>}
 */
async function gatherAt(key, load, codec, keep) {
  const id = withoutRecording(buildId);
  // A run under Yarn Plug'n'Play's loader neither keeps nor reads catalogs:
  // its modules resolve through PnP, which a catalog's stamps do not follow.
  const dir =
    id == null || runsUnderPnp() ? null : withoutRecording(gatherCacheDir);
  if (id == null || dir == null) {
    lastOutcome = {
      hit: false,
      reason:
        id == null
          ? 'this CLI has no build id'
          : runsUnderPnp()
            ? "a run under Yarn Plug'n'Play's loader"
            : 'no usable cache folder',
    };
    return await load();
  }
  const file = entryFile(dir, key, id);
  let reason = 'no entry';
  try {
    const {head: stored, value: storedValue} = readEntry(file);
    if (stored?.format !== FORMAT) {
      reason = 'another format';
    } else if (stored.key !== entryKey(key, id)) {
      reason = 'an entry for other inputs';
    } else {
      // An entry the run already found unchanged, as one an earlier entry
      // builds on, is not checked again. Outside a recorded run nothing is
      // remembered from one gather to the next.
      const confirmed = run?.confirmed ?? new Map();
      const known = confirmed.get(file);
      const seen =
        typeof stored.version === 'string' && known?.version === stored.version
          ? known
          : null;
      const own = seen ? null : staleReason(stored.stamps, stored.env);
      const base =
        seen || own != null ? null : builtOn(dir, stored.deps, confirmed);
      const stale =
        own ??
        (seen == null && base == null
          ? 'a kept entry it builds on changed'
          : null);
      const value = stale == null ? readBack(storedValue, codec) : undefined;
      if (stale == null && value === undefined) {
        // Gathered again below, and stored over the bad entry.
        reason = 'a malformed value';
      } else if (stale == null) {
        /** @type {ConfirmedEntry} */
        const entry = seen ?? {
          version: stored.version,
          lists: [...(base?.lists ?? []), stored.stamps],
          under: base?.under ?? new Set(),
          deps: base?.direct ?? [],
        };
        confirmed.set(file, entry);
        // Recorded list by list, which keeps one state per path as a merge
        // would (recordStates).
        for (const list of entry.lists) recordStates(list);
        // A gather around this one depends on what this one read, the
        // environment included: a hit hands its variables on, as a fresh
        // gather's reads would be.
        if (run) {
          for (const [name, value] of stored.env) {
            if (!run.env.has(name)) run.env.set(name, value);
          }
        }
        // The CLI's own files, one state per path, in the order a fresh
        // gather reads them: merging only those is merging all, then picking
        // them out.
        const {lists} = entry;
        gatherCode = () => mergeStates(...lists.map(cliStates));
        lastOutcome = {hit: true, reason: 'unchanged'};
        markUsed(file, confirmed);
        return value;
      } else if (stale != null) {
        reason = stale;
      }
    }
  } catch (error) {
    if (/** @type {any} */ (error)?.code !== 'ENOENT')
      reason = 'unreadable entry';
  }
  lastOutcome = {hit: false, reason};
  // A later gather in the run records its modules and variables again.
  const armed = run?.arm() ?? false;
  const value = await load();
  if (run && armed && keep(value)) {
    withoutRecording(() => store(dir, file, entryKey(key, id), value, codec));
  } else {
    // A value worked out from a gather that is not kept is not kept either.
    // The code a gather inside this one recorded did not build this one.
    gatherCode = null;
  }
  return value;
}

/**
 * The CLI's own files among a gather's stamps: the modules it loaded and the
 * files it read under the CLI's folder.
 * @param {[string, string][]} stamps
 * @returns {[string, string][]}
 */
function cliStates(stamps) {
  const root = CLI_ROOT + path.sep;
  return stamps.filter(([file]) => file.startsWith(root));
}

/**
 * The state of the code a derived value depends on: the CLI's own files the
 * kept gather depends on (gatherCode), and each of `inputs` by its stamp now,
 * in one digest.
 * @param {[string, string][]} code
 * @param {string[]} inputs
 * @returns {string}
 */
function codeStamp(code, inputs) {
  const states = [...code];
  for (const file of inputs) {
    states.push([file, withoutRecording(() => fileStamp(file))]);
  }
  states.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash('sha256').update(JSON.stringify(states)).digest('hex');
}

/**
 * A value derived from what a kept gather holds, kept beside the gather: it
 * is a function of `key`, of the CLI's code and of `inputs` (with this CLI
 * build), so a stored value is used as it is. The code is the CLI's own files
 * the run's kept gather depends on (each by its stamp, so an edit misses the
 * gather and the value alike), with `inputs`: the files the computation reads
 * that the gather may not have, such as its own module and its weights. An
 * edit to any of them in an installed copy, where the build id stays the
 * same, is a new key. Kept only after a kept gather in the run (a search or
 * build of an installed CLI whose cache folder exists); anywhere else, or on
 * any read or write error, `compute` runs as before.
 * @template T, E
 * @param {unknown[]} key - Everything the value is computed from.
 * @param {() => T} compute
 * @param {{encode: (value: T) => E, decode: (stored: E) => T, valid?: (value: T) => boolean}} codec
 * @param {string[]} [inputs] - Files the computation reads, by path.
 * @returns {T}
 */
export function persistedDerived(key, compute, codec, inputs = []) {
  if (!run || gatherCode == null) return compute();
  if (typeof gatherCode === 'function') gatherCode = gatherCode();
  const id = withoutRecording(buildId);
  const dir = id == null ? null : withoutRecording(gatherCacheDir);
  if (id == null || dir == null) return compute();
  const derivedKey = ['derived', ...key, codeStamp(gatherCode, inputs)];
  const file = entryFile(dir, derivedKey, id);
  const entry = entryKey(derivedKey, id);
  try {
    const stored = JSON.parse(
      withoutRecording(() => fs.readFileSync(file, 'utf-8')),
    );
    const value =
      stored?.format === FORMAT &&
      stored.derived === true &&
      stored.key === entry
        ? readBack(() => stored.value, codec)
        : undefined;
    if (value !== undefined) {
      try {
        const now = new Date();
        withoutRecording(() => fs.utimesSync(file, now, now));
      } catch {
        // An entry that cannot be touched is evicted sooner; nothing more.
      }
      return value;
    }
  } catch {
    // No usable entry: computed below.
  }
  const value = compute();
  withoutRecording(() => {
    try {
      const body = storedText(codec, value);
      if (body === undefined) return;
      const head = JSON.stringify({format: FORMAT, derived: true, key: entry});
      // The value's text goes in as checked, as the head's last field.
      const text = `${head.slice(0, -1)},"value":${body}}`;
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, text, {mode: 0o600, flag: 'wx'});
      fs.renameSync(temp, file);
      trimAfterWrite(dir);
    } catch {
      // A value that cannot be stored is computed again next time.
    }
  });
  return value;
}

/**
 * A value that is a function of `key` and of this CLI build alone, kept in
 * the catalogs folder: the parse of a doc the CLI reads from the stored docs,
 * by the doc's text. The build and the folder it runs from stand for the
 * CLI's own code, as in every kept entry, so nothing else is stamped. Kept
 * only in a run that keeps catalogs (recordRunFor), by an installed CLI whose
 * cache folder exists, and only when `codec` stores the value as text that
 * reads back exactly. The entry holds a digest of that text, so a value that
 * was changed after it was written is a miss. Anywhere else, or on any read
 * or write error, `compute` runs as before. A `compute` that throws keeps
 * nothing, so it throws the same way on every run.
 * @template T, E
 * @param {unknown[]} key - Everything the value is a function of, besides
 *   the CLI build; its first item names the kind of value.
 * @param {() => T} compute
 * @param {{encode: (value: T) => E, decode: (stored: E) => T, valid?: (value: T) => boolean}} codec
 * @returns {T}
 */
export function persistedValue(key, compute, codec) {
  if (!run) return compute();
  const id = withoutRecording(buildId);
  const dir = id == null ? null : withoutRecording(gatherCacheDir);
  if (id == null || dir == null) return compute();
  const file = entryFile(dir, key, id);
  const entry = entryKey(key, id);
  try {
    const stored = JSON.parse(
      withoutRecording(() => fs.readFileSync(file, 'utf-8')),
    );
    const value =
      stored?.format === FORMAT &&
      stored.pure === true &&
      stored.key === entry &&
      stored.sum === textSum(JSON.stringify(stored.value))
        ? readBack(() => stored.value, codec)
        : undefined;
    if (value !== undefined) {
      try {
        const now = new Date();
        withoutRecording(() => fs.utimesSync(file, now, now));
      } catch {
        // An entry that cannot be touched is evicted sooner; nothing more.
      }
      return value;
    }
  } catch {
    // No usable entry: computed below.
  }
  const value = compute();
  withoutRecording(() => {
    try {
      const body = storedText(codec, value);
      if (body === undefined) return;
      const head = JSON.stringify({
        format: FORMAT,
        pure: true,
        key: entry,
        sum: textSum(body),
      });
      // The value's text goes in as checked, as the head's last field.
      const text = `${head.slice(0, -1)},"value":${body}}`;
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, text, {mode: 0o600, flag: 'wx'});
      fs.renameSync(temp, file);
      trimAfterWrite(dir);
    } catch {
      // A value that cannot be stored is computed again next time.
    }
  });
  return value;
}

/**
 * The digest a value kept by persistedValue is checked against: its JSON
 * text, as written and as the value read back writes it again.
 * @param {string | undefined} text
 * @returns {string | null}
 */
function textSum(text) {
  return text === undefined
    ? null
    : createHash('sha256').update(text).digest('hex').slice(0, 32);
}

/**
 * How old every stamped time must be before a summary is stored. A file
 * system can store times as coarsely as 2 s, so a change within one tick of
 * the last can leave a stamp as it was.
 */
export const SUMMARY_SETTLE_MS = 2000;

/**
 * Whether every stamp in `stamps` was taken longer than
 * {@link SUMMARY_SETTLE_MS} ago, by its modification and change times.
 * @param {[string, string][]} stamps
 * @returns {boolean}
 */
function settled(stamps) {
  const limit = Date.now() - SUMMARY_SETTLE_MS;
  return stamps.every(([, stamp]) => {
    // A folder's listing and a resolved path hold no time.
    if (stamp === '-' || stamp.startsWith(LISTED) || stamp.startsWith(RESOLVED))
      return true;
    const [, mtime, ctime] = stamp.split(':').map(Number);
    return mtime < limit && ctime < limit;
  });
}

/**
 * A summary of files and folders, made at once, kept as an entry beside the
 * gathers, in or out of a recorded run: the stored value while every path
 * `make` stamped has the stamp it was stored with, a folder's listing
 * (read-record.mjs listingStamp) by its entries' names and types (the CLI's own files are
 * covered by the build id instead: inCliBuild), else the one
 * `make` gives now, which is stored unless a stamp is younger than
 * {@link SUMMARY_SETTLE_MS}. The folder, the build id, the Yarn Plug'n'Play
 * rule, the 0600 rename write and the eviction are those of a kept gather;
 * anywhere a gather is not kept, or on any read or write error, `make` runs
 * as before.
 * @template T
 * @param {unknown[]} key - Everything else the summary depends on.
 * @param {() => {value: T, stamps: [string, string][]}} make - The summary,
 *   with the stamp ({@link fileStamp}) of each path it depends on, each taken
 *   before the path was read.
 * @param {{accept?: (value: T) => boolean, keep?: (value: T) => boolean}} [options] - `accept`: whether a
 *   stored value serves this call, else it is made again and stored over (a
 *   summary that holds more only once a caller asks for it); `keep`: whether
 *   a value just made is stored at all (a failed or partial answer is not).
 * @returns {T}
 */
export function persistedSummary(
  key,
  make,
  {accept = () => true, keep = () => true} = {},
) {
  const at = summaryAt(key);
  if (!at) return make().value;
  const stored = storedSummary(at);
  if (stored && accept(stored.value)) return stored.value;
  const {value, stamps} = make();
  if (keep(value)) storeSummary(at, value, stamps);
  return value;
}

/**
 * {@link persistedSummary} for a summary that `make` works out
 * asynchronously.
 * @template T
 * @param {unknown[]} key
 * @param {() => Promise<{value: T, stamps: [string, string][]}>} make
 * @param {{accept?: (value: T) => boolean, keep?: (value: T) => boolean}} [options] - As for
 *   {@link persistedSummary}.
 * @returns {Promise<T>}
 */
export async function persistedSummaryAsync(
  key,
  make,
  {accept = () => true, keep = () => true} = {},
) {
  const at = summaryAt(key);
  if (!at) return (await make()).value;
  const stored = storedSummary(at);
  if (stored && accept(stored.value)) return stored.value;
  const {value, stamps} = await make();
  if (keep(value)) storeSummary(at, value, stamps);
  return value;
}

/**
 * Where the summary for `key` is kept, or null where none is kept.
 * @param {unknown[]} key
 * @returns {{dir: string, file: string, entry: string} | null}
 */
function summaryAt(key) {
  const id = withoutRecording(buildId);
  const dir =
    id == null || runsUnderPnp() ? null : withoutRecording(gatherCacheDir);
  if (id == null || dir == null) return null;
  const summaryKey = ['summary', ...key];
  return {
    dir,
    file: entryFile(dir, summaryKey, id),
    entry: entryKey(summaryKey, id),
  };
}

/**
 * The kept summary at `at`, while every path it stamped has its stamp, else
 * undefined.
 * @param {{file: string, entry: string}} at
 * @returns {{value: any} | undefined}
 */
function storedSummary({file, entry}) {
  try {
    const stored = JSON.parse(
      withoutRecording(() => fs.readFileSync(file, 'utf-8')),
    );
    if (
      stored?.format === FORMAT &&
      stored.summary === true &&
      stored.key === entry &&
      Object.hasOwn(stored, 'value') &&
      Array.isArray(stored.stamps) &&
      stored.stamps.every(
        (/** @type {[string, string]} */ [at, stamp]) =>
          typeof at === 'string' && summaryStampNow(at, stamp) === stamp,
      )
    ) {
      try {
        const now = new Date();
        withoutRecording(() => fs.utimesSync(file, now, now));
      } catch {
        // An entry that cannot be touched is evicted sooner; nothing more.
      }
      return {value: stored.value};
    }
  } catch {
    // No usable entry: made again.
  }
  return undefined;
}

/**
 * What `at` gives now for a stamp of the kind `stamp` is: a folder's listing
 * (read-record.mjs listingStamp), where a path resolves (resolvedNow), or a
 * path's full stamp.
 * @param {string} at
 * @param {string} stamp
 * @returns {string}
 */
function summaryStampNow(at, stamp) {
  if (stamp.startsWith(LISTED)) return listingStamp(at);
  if (stamp.startsWith(RESOLVED)) return resolvedNow(at);
  return fileStamp(at);
}

/**
 * Whether `file` is one of the installed CLI's own files: under its folder,
 * outside the node_modules folder inside it. A summary is kept only by an
 * installed CLI, under its build id (summaryAt), which names the exact code
 * of that build, so the build id covers its files; a package placed in that
 * node_modules folder is not part of the build.
 * @param {string} file
 * @returns {boolean}
 */
function inCliBuild(file) {
  return isCliBuildFile(file, CLI_ROOT + path.sep, path.sep);
}

/**
 * Keep `value` at `at` with its stamps, unless a stamp is too young or the
 * value does not read back the same. Silent on any failure. A file in jiti's
 * cache is not kept as a stamp, as for a kept gather (inJitiCache), nor is
 * one of the CLI's own files: the build id in the summary's key covers them
 * (inCliBuild), so a new build makes the summary again. Every other file,
 * an installed package's included, keeps its own stamp: an edit in place
 * makes the summary again.
 * @param {{dir: string, file: string, entry: string}} at
 * @param {unknown} value
 * @param {[string, string][]} made the stamps the summary was made with
 */
function storeSummary({dir, file, entry}, value, made) {
  const stamps = made.filter(([at]) => !inJitiCache(at) && !inCliBuild(at));
  if (!settled(stamps)) return;
  withoutRecording(() => {
    try {
      const text = JSON.stringify({
        format: FORMAT,
        summary: true,
        key: entry,
        stamps,
        value,
      });
      if (!isDeepStrictEqual(JSON.parse(text).value, value)) return;
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, text, {mode: 0o600, flag: 'wx'});
      fs.renameSync(temp, file);
      trimAfterWrite(dir);
    } catch {
      // A summary that cannot be stored is made again next time.
    }
  });
}

/**
 * A gather's entry file: its first line, parsed, and a reader of its value,
 * the second line, parsed only when called. A file of one line, as an entry
 * of another format, is all head and has no value.
 * @param {string} file
 * @returns {{head: any, value: () => unknown}}
 */
function readEntry(file) {
  const text = withoutRecording(() => fs.readFileSync(file, 'utf-8'));
  const cut = text.indexOf('\n');
  return {
    head: JSON.parse(cut < 0 ? text : text.slice(0, cut)),
    value: () => (cut < 0 ? undefined : JSON.parse(text.slice(cut + 1))),
  };
}

/** How much of an entry file one read takes while looking for its first line. */
const HEAD_READ_BYTES = 64 * 1024;

/**
 * A gather's entry file's first line, parsed, read without the value after
 * it: an entry another builds on is checked, never read back. A newline byte
 * is never part of a longer UTF-8 character, so the bytes before the first
 * one are the whole line.
 * @param {string} file
 * @returns {any}
 */
function readHead(file) {
  return withoutRecording(() => {
    const fd = fs.openSync(file, 'r');
    try {
      /** @type {Buffer[]} */
      const chunks = [];
      const chunk = Buffer.allocUnsafe(HEAD_READ_BYTES);
      for (let at = 0; ;) {
        const read = fs.readSync(fd, chunk, 0, chunk.length, at);
        if (read === 0) break;
        const piece = chunk.subarray(0, read);
        const end = piece.indexOf(0x0a);
        chunks.push(Buffer.from(end < 0 ? piece : piece.subarray(0, end)));
        if (end >= 0) break;
        at += read;
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } finally {
      fs.closeSync(fd);
    }
  });
}

/**
 * A stored entry's value, decoded, or undefined when it has none, its decode
 * throws, or the decoded value fails the codec's shape check (`valid`): such
 * an entry is a miss, worked out again and stored over.
 * @param {() => unknown} read - reads the entry's value
 * @param {{decode: (stored: any) => any, valid?: (value: any) => boolean}} codec
 * @returns {any}
 */
function readBack(read, codec) {
  try {
    const stored = read();
    if (stored == null) return undefined;
    const value = codec.decode(stored);
    if (value == null) return undefined;
    return !codec.valid || codec.valid(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The JSON text a kept value is stored as, checked once to read back as what
 * the codec meant: the codec's own checked text when it gives one
 * (`encodeText`, as EXACT_CODEC does), else its plain form, written and
 * checked to read back as that form. Undefined for a value that does not
 * read back exactly, which is never kept; a codec's refusal throws.
 * @template T
 * @param {{encode: (value: T) => unknown, encodeText?: (value: T) => string}} codec
 * @param {T} value
 * @returns {string | undefined}
 */
function storedText(codec, value) {
  if (codec.encodeText) return codec.encodeText(value);
  const encoded = codec.encode(value);
  const text = JSON.stringify(encoded);
  return text !== undefined && isDeepStrictEqual(JSON.parse(text), encoded)
    ? text
    : undefined;
}

/**
 * Store a fresh gather with what the run read, unless its plain form does not
 * read back as the same value. Silent on any failure.
 * @template T, E
 * @param {string} dir
 * @param {string} file
 * @param {string} entry - The entry's key (entryKey).
 * @param {T} value
 * @param {{encode: (value: T) => E, decode: (stored: E) => T, valid?: (value: T) => boolean}} codec
 */
function store(dir, file, entry, value, codec) {
  if (!run) return;
  try {
    const body = storedText(codec, value);
    if (body === undefined) return;
    const stamps = [...run.reads].filter(([file]) => !inJitiCache(file));
    gatherCode = cliStates(stamps);
    const {deps, own, under} = chooseBase(file, stamps, run.confirmed);
    const version = randomBytes(12).toString('hex');
    const head = JSON.stringify({
      format: FORMAT,
      key: entry,
      version,
      deps,
      stamps: own,
      env: [...run.env],
    });
    // JSON text holds no line break, so the first one ends the head.
    const text = `${head}\n${body}`;
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, text, {mode: 0o600, flag: 'wx'});
    fs.renameSync(temp, file);
    run.confirmed.set(file, {
      version,
      lists: [stamps],
      under,
      deps: deps.map(([name]) => path.join(dir, name)),
    });
    markUsed(file, run.confirmed);
    trimAfterWrite(dir);
  } catch {
    // A gather that cannot be stored is gathered again next time.
  }
}

/**
 * Whether this run is under Yarn Plug'n'Play's loader (`yarn astryx` in a PnP
 * project): Node's module hooks hand PnP's resolver options it refuses, so
 * such a run keeps and uses no catalogs. The plain `astryx` command in the
 * same project keeps them.
 * @returns {boolean}
 */
export function runsUnderPnp() {
  return Boolean(process.versions.pnp);
}

/**
 * The cache folder and how much it holds, for `doctor`: null when the CLI
 * keeps no gathers (a checkout) or has no usable folder.
 * @returns {{dir: string, bytes: number, entries: number, pnp: boolean, limitBytes: number, transpiledDir: string} | null}
 *   `pnp`: whether this run is under Yarn Plug'n'Play's loader (runsUnderPnp);
 *   `limitBytes`: the most the folder holds, and the copies of transpiled
 *   code in `transpiledDir` (jiti-cache.mjs) share
 */
export function gatherCacheSummary() {
  // The cache's own bookkeeping, never an input of what it keeps.
  return withoutRecording(summarize);
}

/**
 * The entries a catalogs folder holds and their bytes, or null when the
 * folder cannot be read.
 * @param {string} dir
 * @returns {{bytes: number, entries: number} | null}
 */
function heldIn(dir) {
  let bytes = 0;
  let entries = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith('gather-') || name.endsWith('.tmp')) continue;
      try {
        bytes += fs.statSync(path.join(dir, name)).size;
        entries++;
      } catch {
        // Removed meanwhile.
      }
    }
  } catch {
    return null;
  }
  return {bytes, entries};
}

/** @returns {{dir: string, bytes: number, entries: number, pnp: boolean, limitBytes: number, transpiledDir: string} | null} */
function summarize() {
  if (buildId() == null) return null;
  const dir = gatherCacheDir();
  if (dir == null) return null;
  let held = heldIn(dir);
  // A folder over its limit is trimmed first: this run's own writes are
  // trimmed only when it ends, and a run that stopped early never trimmed.
  if (held != null && held.bytes > CACHE_LIMIT_BYTES) {
    trimNow(dir);
    held = heldIn(dir);
  }
  if (held == null) return null;
  const {bytes, entries} = held;
  return {
    dir,
    bytes,
    entries,
    pnp: runsUnderPnp(),
    limitBytes: CACHE_LIMIT_BYTES,
    transpiledDir: transpiledCacheDir(),
  };
}
