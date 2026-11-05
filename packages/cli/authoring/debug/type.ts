// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Public shape of one recorded CLI run.
 *
 * This is a CONTRACT, not an internal detail. A project attaches a function
 * in `astryx.config` (`debug: event => {}`) and receives one of these per
 * command run. Whatever that function feeds — a warehouse table, a file, a
 * one-off script — codes against {@link DebugEvent}.
 *
 * Treat it as append-only. Add fields freely; never repurpose or remove one.
 * When an existing field changes meaning, widen {@link DebugSchemaVersion} so
 * every consumer gets a compile error at the branch points instead of quietly
 * reading a field that no longer means what it did.
 */

/**
 * Version of the recorded shape. A literal union on purpose: code that
 * switches on it stops compiling until it handles every version.
 *
 * - `1` — the original shape. `env.agentSessionId` carried the RAW session id.
 * - `2` — `env.agentSessionId` is always null; `env.agentSessionIdHash` is the
 *   join key, and the environment snapshot is scrubbed like every other
 *   recorded value.
 * - `3` — every command reports its result. `output.resultKind` gained `none`
 *   (a command whose work is an effect) and a null now means the run never
 *   reached an answer, where before it meant "nothing was surfaced" — so a v1
 *   or v2 null and a v3 null are not the same fact and must not be counted
 *   together.
 */
export type DebugSchemaVersion = 1 | 2 | 3;

/**
 * How an invocation ended.
 *
 * - `ok`          — completed; exit 0. Includes runs that only printed help.
 * - `error`       — a handled failure (the CLI's error path), or a signal.
 * - `parse-error` — the input was rejected before any command body ran.
 * - `fatal`       — an uncaught throw or unhandled rejection.
 * - `rejected`    — refused by a gate, e.g. `--json` on an unsupported command.
 * - `incomplete`  — the process died without reaching any terminal path.
 */
export type DebugOutcome =
  'ok' | 'error' | 'parse-error' | 'fatal' | 'rejected' | 'incomplete';

/**
 * Where an option's value came from. `cli` means a person or script typed it;
 * `default` means nobody did. Without this you cannot tell a deliberate choice
 * from a default that happens to be recorded.
 */
export type DebugOptionSource =
  'cli' | 'default' | 'env' | 'config' | 'implied';

/**
 * The kind of content represented by a command's result set.
 *
 * `mixed` is a set spanning several kinds. `none` is the other thing entirely:
 * the command answered with an EFFECT — it built, wrote, upgraded, validated,
 * or diagnosed something — and has no set to count. Reading it as "found
 * nothing" would be wrong; `emptyResult` is where that lives.
 */
export type DebugResultKind =
  | 'component'
  | 'hook'
  | 'doc'
  | 'template'
  | 'theme'
  | 'integration'
  | 'migration'
  | 'command'
  | 'mixed'
  | 'none';

/** What initiated the CLI invocation, based only on positive evidence. */
export type DebugInvocationSource = 'human' | 'ai' | 'automation' | 'unknown';

/** The failure, when there was one. */
export interface DebugEventError {
  name: string;
  /** Human-readable and free to change. Do not branch on it. */
  message: string;
  /**
   * Stable machine-readable code (see the CLI's error-codes reference).
   * This is the field to branch on. Null when nothing supplied one.
   */
  code: string | null;
  stack: string | null;
}

/** What the run put on its output streams. */
export interface DebugEventOutput {
  /** Whether `--json` was active. */
  jsonMode: boolean;
  /** Response `type` discriminants emitted, e.g. `['component.list']`. */
  envelopeTypes: string[];
  /** Whether a JSON envelope was emitted. */
  handled: boolean;
  /** Whether the run ended by printing help rather than doing work. */
  helpDisplayed: boolean;
  /**
   * How many results the command MATCHED, counted before any `--limit`, score
   * floor, or presentation grouping was applied. A command that answers with a
   * bounded slice still reports the size of the set it sliced, so a capped
   * answer and an exactly-cap-sized one are distinguishable. Null when the
   * command has no result set — `resultKind` says which case that is.
   */
  resultCount: number | null;
  /** Whether the command's underlying match set was empty. Null when it has none. */
  emptyResult: boolean | null;
  /**
   * What this run answered with: one result kind, `mixed`, or `none` for a
   * command whose work is an effect rather than a lookup.
   *
   * `none` says nothing about SUCCESS — a command that failed on its way to an
   * effect still reports it. Read `outcome` for that; filter to `ok` before
   * treating a run as an effect that happened.
   *
   * Null means the run never reported one. On a completed run that is a bug in
   * the CLI, not a property of the command — every command declares its result
   * shape as its return type, and the recorder stamps it centrally. Expect null
   * only where a run ended before its command could answer: a parse error, a
   * rejected `--json`, `--help`, or a failure.
   */
  resultKind: DebugResultKind | null;
  /**
   * Whether the command resolved the exact thing that was asked for, rather
   * than listing or suggesting. Null for the commands that define no such
   * notion (a bare list has nothing to match).
   */
  directMatch: boolean | null;
  /**
   * Everything the command printed to stdout — the answer the user actually
   * got. Scrubbed like every other captured value, and truncated past
   * `stdoutBytes` when the run printed more than the capture limit.
   */
  stdout: string;
  /** Everything the command printed to stderr: errors, warnings, hints. */
  stderr: string;
  /** Bytes written to stdout, before any truncation. */
  stdoutBytes: number;
  /** Bytes written to stderr, before any truncation. */
  stderrBytes: number;
  /** Whether either stream exceeded the capture limit and was cut short. */
  truncated: boolean;
}

/**
 * Machine, runtime, and invocation-attribution facts.
 *
 * ## Privacy contract
 *
 * A recorded run may be forwarded anywhere the project's handler chooses, so
 * this snapshot is bounded by three rules:
 *
 * 1. **No identity.** No hostname, username, network identity, or raw agent
 *    session id. Runs are joined on `agentSessionIdHash`, never on a value
 *    that identifies who made them.
 * 2. **Attribution needs positive evidence.** Agent fields come only from
 *    explicit public environment signals the invoking tool set, never from
 *    guessing at the shell.
 * 3. **Free text is scrubbed.** Anything the environment supplied as text
 *    (`agent`, `agentIdentity`) goes through the same content rules as argv.
 *    The rest is derived from a fixed vocabulary this CLI controls and is kept
 *    verbatim, which is what makes it worth recording.
 */
export interface DebugEventEnv {
  cliVersion: string | null;
  nodeVersion: string;
  /** Node's `process.platform`, e.g. 'darwin' | 'linux' | 'win32'. */
  platform: string;
  /** Node's `process.arch`, e.g. 'arm64' | 'x64'. */
  arch: string;
  ci: boolean;
  /** Detected CI provider, e.g. 'github-actions'. Null outside CI. */
  ciName: string | null;
  /** Legacy broad detector, retained for compatibility with existing consumers. */
  agent: string | null;
  /**
   * Coding-agent identity from `AGENT` or a known public agent signal.
   * Scrubbed.
   */
  agentIdentity: string | null;
  /**
   * ALWAYS NULL from schema version 2 onward — a raw session id is a stable
   * identifier for the person running the CLI, and nothing here needs one.
   * Join runs on `agentSessionIdHash` instead. Only schema-v1 records carry a
   * value, and the field is kept so those parse against one shape.
   */
  agentSessionId: string | null;
  /**
   * SHA-256 of the session id supplied by the environment. The join key for
   * "these runs were one session", and the only form of it that is recorded.
   */
  agentSessionIdHash: string | null;
  /** Which public environment signal supplied the session id. */
  agentSessionIdSource: string | null;
  /** Whether a human, AI agent, or automation invoked the CLI. */
  invocationSource: DebugInvocationSource;
  /** Run one-off via npx/dlx rather than an installed binary. */
  oneOff: boolean;
  packageManager: string | null;
  tty: boolean;
  locale: string | null;
  timezone: string | null;
}

/**
 * Shape of the project the command ran against. Names of a user's private
 * packages are identifying, so this records counts and flags, never names.
 */
export interface DebugEventProject {
  /** Whether a package.json was found at or above the working directory. */
  inProject: boolean | null;
  /** Whether an astryx.config file was loaded. */
  hasConfig: boolean | null;
  /** Whether `astryx init` has been run (the agent-docs marker is present). */
  initialized: boolean | null;
  integrationCount: number | null;
}

/**
 * One CLI invocation — exactly one per run, one JSON line on disk.
 *
 * Every field is present on a persisted event. Timing and outcome fields are
 * filled in as the run ends, so nothing here is optional by the time a
 * consumer sees it.
 */
export interface DebugEvent {
  schemaVersion: DebugSchemaVersion;
  /** Unique per invocation. Collectors should dedupe on this. */
  id: string;

  /** ISO 8601. */
  startedAt: string;
  /** ISO 8601. */
  endedAt: string;
  durationMs: number;

  /** Fully qualified, e.g. `'theme build'`. Empty for a bare invocation. */
  command: string;
  /** The same name split into segments, e.g. `['theme', 'build']`. */
  commandPath: string[];
  /** Arguments after the binary, scrubbed. */
  argv: string[];
  /** Positional arguments keyed by their declared names. */
  args: Record<string, unknown>;
  /** Command-level options as Commander resolved them. */
  options: Record<string, unknown>;
  /** Per-option provenance; keys mirror `options`. */
  optionSources: Record<string, DebugOptionSource>;
  /** Root-level flags (`--json`, `--detail`, `--lang`, …). */
  globalOptions: Record<string, unknown>;

  outcome: DebugOutcome;
  exitCode: number | null;
  /** Signal that ended the process, e.g. `'SIGINT'`. Null otherwise. */
  signal: string | null;
  error: DebugEventError | null;

  output: DebugEventOutput;
  env: DebugEventEnv;
  project: DebugEventProject;

  /**
   * Whether the scrubbing pass ran over this record. True on every event a
   * handler receives: it is set only on the sealed copy, after argv, args,
   * options, captured output, the error, and the environment snapshot have all
   * been through it. When false, values are verbatim — treat such a log as
   * sensitive.
   */
  redacted: boolean;
}

/**
 * A function that receives each recorded run. Set it as `debug` in
 * `astryx.config`:
 *
 * ```
 * export default {
 *   debug: event => appendFileSync('runs.ndjson', JSON.stringify(event) + '\n'),
 * };
 * ```
 *
 * IMPORTANT — this is called synchronously as the process exits, so a promise
 * it returns will never be awaited and pending I/O will not complete. Use it
 * for synchronous work only: appending to a file, pushing to an in-memory
 * buffer, `spawn`ing a detached child that does the slow part. Sending a run
 * over the network from here will not work.
 *
 * The event is a copy, so mutating it is harmless and changes nothing that
 * reaches the log. Anything the handler throws is swallowed; recording must
 * never fail a command.
 *
 * `process.exit` is ignored and synchronous stdout writes go to stderr.
 * Saved writers, deferred writes, and inherited child stdio are not contained.
 */
export type DebugEventHandler = (event: DebugEvent) => void;
