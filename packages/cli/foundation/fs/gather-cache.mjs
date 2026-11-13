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
 *   discovery (foundation/discovery/template-adapter.mjs) for its records,
 *   and by `doctor` (api/doctor/_adapter.mjs) for its file-only docs checks,
 *   in a run that records modules and variables to its end. Gathers are kept only once the folder exists: the first such run
 *   on a machine just makes it, so a one-off run pays nothing to store one. Only a published CLI stores anything:
 *   its build id (clients/cli/build-id.generated.json, written at `prepack`)
 *   names its exact code, so a checkout, whose code may change between runs
 *   under the same version, always gathers.
 *
 *   The folder is `catalogs` in the user's cache folder (userCacheDir):
 *   created 0700, used only while it is a real folder owned by the user and
 *   closed to others (isPrivateDir; never on a system with no user ids), each file written 0600 by a rename, oldest first evicted past
 *   CACHE_LIMIT_BYTES. Any failure to read, check, parse or write is silent
 *   and the run gathers fresh, as it would with no cache.
 */

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as nodeModule from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {CLI_ROOT} from './paths.mjs';
import {mayHaveIntegrations} from '../integrations/may-have-integrations.mjs';
import {currentUid, isPrivateDir} from '../env/private-dir.mjs';
import {userCacheDir} from '../env/user-dirs.mjs';
import {jitiCacheDir} from './jiti-cache.mjs';
import {
  fileStamp,
  recordReads,
  recordStates,
  stillInState,
  withoutRecording,
} from './read-record.mjs';

/**
 * The kept commands whose kept gathers are worth recording only where an
 * integration can load (its check results, and template discovery, whose
 * records hold Core's templates too but which costs little without one): a
 * project with no integration records none of them.
 */
const INTEGRATION_COMMANDS = new Set([
  'component',
  'template',
  'theme',
  'discover',
]);

/** The run's commands whose gathers are kept. */
const KEPT_COMMANDS = new Set([
  'search',
  'build',
  'component',
  'template',
  'theme',
  'discover',
  // The project check alone (no subcommand): its docs checks are kept.
  'doctor',
]);

/** Where `prepack` writes the id of the package's exact contents. */
export const BUILD_ID_FILE = path.join(
  CLI_ROOT,
  'clients',
  'cli',
  'build-id.generated.json',
);

/** The most the folder holds; the oldest entries go first past it. */
export const CACHE_LIMIT_BYTES = 64 * 1024 * 1024;

/** The stored format; a different one is a miss. */
const FORMAT = 1;

/** A variable the run read that was unset, as stored. */
const UNSET = null;

/**
 * What the running command has read since it started: files and folders with
 * their states, modules it loaded with theirs, and environment variables with
 * their values. Files and folders are recorded for the whole run; modules and
 * variables only while the run is armed: from its start to the end of its
 * first gather, and during each later gather, or, in a run armed throughout
 * (`doctor`), to its end. Null outside a recorded run.
 * @type {{reads: Map<string, string>, env: Map<string, string | null>, arm: () => boolean, disarm: () => void, armedThroughout: boolean, realEnv: NodeJS.ProcessEnv} | null}
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
 * derived value too. Null before any kept gather in the run.
 * @type {[string, string][] | null}
 */
let gatherCode = null;

/** How many persistedGather calls are running, nested inside one another. */
let gatherDepth = 0;

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
 * Where jiti may keep transpiled code: the system temp folder's `jiti`, the
 * per-user folder (jiti-cache.mjs), and a set JITI_FS_CACHE.
 * @returns {string[]}
 */
function jitiCacheRoots() {
  const env = process.env.JITI_FS_CACHE;
  const roots = [path.join(os.tmpdir(), 'jiti'), jitiCacheDir()];
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
    (command === 'doctor' &&
      argv.filter(arg => !arg.startsWith('-')).length > 1) ||
    runsUnderPnp() ||
    currentUid() == null ||
    withoutRecording(buildId) == null ||
    // Last, being a few file checks: those commands keep what is worth
    // keeping only where an integration can load, so a project with none
    // records nothing.
    (INTEGRATION_COMMANDS.has(command) &&
      !withoutRecording(() => mayHaveIntegrations(process.cwd())))
  ) {
    return fn();
  }
  // Gathers are kept only once the folder exists: the first recorded run on a
  // machine (search, build, component, template, theme or discover) just makes
  // it, so a one-off run never pays to store one.
  const dir = cacheDirPath();
  if (!withoutRecording(() => fs.existsSync(dir))) {
    // Once the per-user cache folder exists doctor uses it; it never makes
    // it, so a doctor alone changes nothing on the machine (nor its own
    // cache row).
    if (command === 'doctor') return fn();
    try {
      withoutRecording(() => fs.mkdirSync(dir, {recursive: true, mode: 0o700}));
    } catch {
      // A folder that cannot be made keeps no catalogs; nothing more.
    }
    return fn();
  }
  // A folder the cache would refuse (not the user's own, open to others, a
  // link) leaves the run exactly as without the cache: no hook is installed.
  if (withoutRecording(gatherCacheDir) == null) return fn();
  // doctor's kept checks read docs modules that load between its gathers, so
  // its run records modules and variables to the end, not only during each
  // gather.
  return recordRun(fn, {armedThroughout: command === 'doctor'});
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
    try {
      hooks?.deregister();
    } catch {
      // A hook that cannot be removed is inert: it only notes modules.
    }
    hooks = null;
    if (process.env === proxy) process.env = realEnv;
  };
  const arm = () => {
    if (hooks) return true;
    try {
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
              if (!reads.has(file)) reads.set(file, fileStamp(file));
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
  run = {reads, env, arm, disarm, armedThroughout, realEnv};
  try {
    return await recordReads(reads, fn, {exact: true});
  } finally {
    disarm();
    run = null;
  }
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
        if (!reads.has(candidate)) reads.set(candidate, lookupStamp(candidate));
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
    id,
    process.version,
    process.platform,
    process.arch,
    ...key,
  ]);
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
    if (!stillInState(file, state)) return 'a file or folder it read changed';
  }
  return null;
}

/**
 * The gather `load` returns, or the one a run with the same key stored while
 * every input it read is unchanged (see the file header).
 * @template T, E
 * @param {unknown[]} key - What else decides the gather: its folder (a real
 *   path) and options.
 * @param {() => Promise<T>} load
 * @param {{encode: (value: T) => E, decode: (stored: E) => T}} codec - A
 *   plain-JSON form of the value and back.
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
 * @param {{encode: (value: T) => E, decode: (stored: E) => T}} codec
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
    const stored = JSON.parse(
      withoutRecording(() => fs.readFileSync(file, 'utf-8')),
    );
    if (stored?.format !== FORMAT) {
      reason = 'another format';
    } else if (stored.key !== entryKey(key, id)) {
      reason = 'an entry for other inputs';
    } else {
      const stale = staleReason(stored.stamps, stored.env);
      if (stale == null) {
        const value = codec.decode(stored.value);
        recordStates(stored.stamps);
        // A gather around this one depends on what this one read, the
        // environment included: a hit hands its variables on, as a fresh
        // gather's reads would be.
        if (run) {
          for (const [name, value] of stored.env) {
            if (!run.env.has(name)) run.env.set(name, value);
          }
        }
        gatherCode = cliStates(stored.stamps);
        lastOutcome = {hit: true, reason: 'unchanged'};
        try {
          const now = new Date();
          withoutRecording(() => fs.utimesSync(file, now, now));
        } catch {
          // An entry that cannot be touched is evicted sooner; nothing more.
        }
        return value;
      }
      reason = stale;
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
 * @param {{encode: (value: T) => E, decode: (stored: E) => T}} codec
 * @param {string[]} [inputs] - Files the computation reads, by path.
 * @returns {T}
 */
export function persistedDerived(key, compute, codec, inputs = []) {
  if (!run || gatherCode == null) return compute();
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
    if (
      stored?.format === FORMAT &&
      stored.derived === true &&
      stored.key === entry
    ) {
      const value = codec.decode(stored.value);
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
      const encoded = codec.encode(value);
      const text = JSON.stringify({
        format: FORMAT,
        derived: true,
        key: entry,
        value: encoded,
      });
      if (!isDeepStrictEqual(JSON.parse(text).value, encoded)) return;
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, text, {mode: 0o600, flag: 'wx'});
      fs.renameSync(temp, file);
      evict(dir);
    } catch {
      // A value that cannot be stored is computed again next time.
    }
  });
  return value;
}

/**
 * Store a fresh gather with what the run read, unless its plain form does not
 * read back as the same value. Silent on any failure.
 * @template T, E
 * @param {string} dir
 * @param {string} file
 * @param {string} entry - The entry's key (entryKey).
 * @param {T} value
 * @param {{encode: (value: T) => E, decode: (stored: E) => T}} codec
 */
function store(dir, file, entry, value, codec) {
  if (!run) return;
  try {
    const encoded = codec.encode(value);
    const stamps = [...run.reads].filter(([file]) => !inJitiCache(file));
    gatherCode = cliStates(stamps);
    const text = JSON.stringify({
      format: FORMAT,
      key: entry,
      stamps,
      env: [...run.env],
      value: encoded,
    });
    if (!isDeepStrictEqual(JSON.parse(text).value, encoded)) return;
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, text, {mode: 0o600, flag: 'wx'});
    fs.renameSync(temp, file);
    evict(dir);
  } catch {
    // A gather that cannot be stored is gathered again next time.
  }
}

/**
 * Delete the oldest entries until the folder holds at most CACHE_LIMIT_BYTES.
 * @param {string} dir
 */
function evict(dir) {
  const entries = fs
    .readdirSync(dir)
    .filter(name => name.startsWith('gather-'))
    .map(name => {
      const entry = path.join(dir, name);
      try {
        const {size, mtimeMs} = fs.statSync(entry);
        return {entry, size, mtimeMs};
      } catch {
        return null;
      }
    })
    .filter(e => e != null)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  let total = entries.reduce((sum, e) => sum + e.size, 0);
  for (const {entry, size} of entries) {
    if (total <= CACHE_LIMIT_BYTES) break;
    try {
      fs.unlinkSync(entry);
      total -= size;
    } catch {
      // Another run removed it.
    }
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
 * @returns {{dir: string, bytes: number, entries: number, pnp: boolean} | null}
 *   `pnp`: whether this run is under Yarn Plug'n'Play's loader (runsUnderPnp)
 */
export function gatherCacheSummary() {
  // The cache's own bookkeeping, never an input of what it keeps.
  return withoutRecording(summarize);
}

/** @returns {{dir: string, bytes: number, entries: number, pnp: boolean} | null} */
function summarize() {
  if (buildId() == null) return null;
  const dir = gatherCacheDir();
  if (dir == null) return null;
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
  return {dir, bytes, entries, pnp: runsUnderPnp()};
}
