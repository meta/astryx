// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The recorded event shape, and the environment snapshot attached to it.
 *
 * One invocation produces exactly one event. That keeps the log trivially
 * queryable — `SELECT command, outcome, count(*) FROM events GROUP BY 1, 2`
 * works with no joins — and keeps the write path to a single append.
 *
 * The shape is versioned by {@link SCHEMA_VERSION}. Treat it as an append-only
 * contract: add fields freely, never repurpose or remove one, and bump the
 * version when an existing field changes meaning, so a consumer reading a
 * mixed-version table can branch on it.
 *
 * @input  command identity, argv/options, an outcome, and process context
 * @output a flat, JSON-serializable record ready for a sink
 * @position packages/cli/foundation/debug — event shape
 */

import * as crypto from 'node:crypto';
import {isCliOneOff, detectPackageManager} from '../env/package-manager.mjs';

/**
 * Version of the recorded event shape. Bump on any breaking field change,
 * widening {@link DebugSchemaVersion} in the published type at the same time.
 *
 * v2 retired the raw `env.agentSessionId`: it is always null now, and
 * `agentSessionIdHash` is the join key. A consumer that grouped runs by the
 * raw value would otherwise have started grouping every run under `null`
 * without a single compile error, which is exactly what the version exists to
 * prevent.
 *
 * v3 made every command report its result, which changed what an ABSENT one
 * means: `output.resultKind` is null only when the run never reached an
 * answer, and a command with no result set now says `none`. The values did not
 * move, but the null did — a consumer counting nulls as "commands with nothing
 * to report" would silently start counting failures instead, and no widened
 * union catches a branch on null.
 *
 * @type {import('../../authoring/debug/type').DebugSchemaVersion}
 */
export const SCHEMA_VERSION = 3;

/**
 * The recorded shape is PUBLISHED — a project sets `debug` in `astryx.config`
 * to a function, and that function receives these. So the definition lives in
 * `authoring/debug/type.ts` alongside the other public contracts, and this
 * module re-uses it rather than keeping a second copy that could drift. A
 * sealed zod schema in `authoring/debug/parse.mjs` is drift-locked to it.
 *
 * @typedef {import('../../authoring/debug/type').DebugEvent} DebugEvent
 * @typedef {import('../../authoring/debug/type').DebugOutcome} Outcome
 * @typedef {import('../../authoring/debug/type').DebugEventError} DebugEventError
 */

/**
 * An event still being filled in. Timing is only knowable once the run ends
 * and the environment probe is deferred until there is a handler to deliver
 * to, so those fields are absent or null until {@link finish} seals the
 * record — every PERSISTED event has them.
 *
 * @typedef {Omit<DebugEvent, 'endedAt' | 'durationMs' | 'env'> &
 *   {endedAt?: string, durationMs?: number,
 *    env: DebugEvent['env'] | null}} InFlightEvent
 */

/**
 * CI providers worth naming, matched by a single env var each. Order matters
 * only for the name we report; `ci` is true if any of them (or the generic
 * `CI` flag) is present.
 */
const CI_PROVIDERS = [
  ['GITHUB_ACTIONS', 'github-actions'],
  ['GITLAB_CI', 'gitlab-ci'],
  ['CIRCLECI', 'circleci'],
  ['BUILDKITE', 'buildkite'],
  ['TRAVIS', 'travis'],
  ['JENKINS_URL', 'jenkins'],
  ['TEAMCITY_VERSION', 'teamcity'],
  ['TF_BUILD', 'azure-pipelines'],
  ['BITBUCKET_BUILD_NUMBER', 'bitbucket'],
  ['CODEBUILD_BUILD_ID', 'aws-codebuild'],
  ['DRONE', 'drone'],
  ['VERCEL', 'vercel'],
  ['NETLIFY', 'netlify'],
];

/**
 * Coding-agent signals. The first six are positive evidence of an AI agent.
 * The final two are retained only by the legacy `agent` field because they can
 * also describe a human development environment.
 */
const AGENT_SIGNALS = [
  ['CURSOR_TRACE_ID', 'cursor'],
  ['CURSOR_AGENT', 'cursor'],
  ['CLAUDECODE', 'claude-code'],
  ['CLAUDE_CODE', 'claude-code'],
  ['AIDER_MODEL', 'aider'],
  ['GITHUB_COPILOT_AGENT', 'copilot'],
  ['REPLIT_USER', 'replit'],
  ['CODESPACES', 'codespaces'],
];
const POSITIVE_AGENT_SIGNAL_COUNT = 6;

/** @returns {{ci: boolean, ciName: string | null}} */
function detectCi() {
  for (const [key, name] of CI_PROVIDERS) {
    if (process.env[key]) return {ci: true, ciName: name};
  }
  const generic =
    process.env.CI != null &&
    process.env.CI !== '' &&
    process.env.CI !== '0' &&
    process.env.CI !== 'false';
  return {ci: generic, ciName: generic ? 'unknown' : null};
}

/** @param {unknown} value @returns {string | null} */
function nonEmptyString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Agent identity: the generic AGENT variable, else the first positive
 * coding-agent signal. ASTRYX_AGENT_ID and ASTRYX_AGENT_METADATA are not read
 * (spec:AST-017 FR14), and no replacement metadata variable is introduced.
 * @returns {string | null}
 */
function detectAgentIdentity() {
  const genericAgent = nonEmptyString(process.env.AGENT);
  if (genericAgent) return genericAgent.toLowerCase();

  for (const [key, name] of AGENT_SIGNALS.slice(
    0,
    POSITIVE_AGENT_SIGNAL_COUNT,
  )) {
    if (process.env[key]) return name;
  }
  return null;
}

/** @param {string | null} identity @returns {string | null} */
function detectAgent(identity) {
  if (identity) return identity;
  for (const [key, name] of AGENT_SIGNALS) {
    if (process.env[key]) return name;
  }
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram === 'vscode') return 'vscode';
  return null;
}

/**
 * Agent session: the generic AGENT_SESSION_ID variable. ASTRYX_AGENT_SESSION_ID
 * and ASTRYX_AGENT_METADATA are not read (spec:AST-017 FR14).
 * @returns {{id: string | null, source: string | null}}
 */
function detectAgentSession() {
  const id = nonEmptyString(process.env.AGENT_SESSION_ID);
  return id ? {id, source: 'AGENT_SESSION_ID'} : {id: null, source: null};
}

/** @param {string | null} id @returns {string | null} */
function hashAgentSessionId(id) {
  return id == null
    ? null
    : crypto.createHash('sha256').update(id, 'utf8').digest('hex');
}

/**
 * @param {{agentIdentity: string | null, agentSessionId: string | null, ci: boolean}} facts
 * @returns {import('../../authoring/debug/type').DebugInvocationSource}
 */
function detectInvocationSource({agentIdentity, agentSessionId, ci}) {
  if (agentIdentity || agentSessionId) return 'ai';
  if (ci) return 'automation';
  if (process.stdout.isTTY) return 'human';
  return 'unknown';
}

/**
 * Snapshot the machine, runtime, and invocation attribution. There is no
 * hostname, username, or network identity, and no raw agent session id — the
 * privacy contract is on `DebugEventEnv` in `authoring/debug/type.ts`. Agent
 * session values come only from explicit environment signals supplied by the
 * invoking tool.
 *
 * @param {{cliVersion?: string}} [options]
 * @returns {import('../../authoring/debug/type').DebugEventEnv}
 */
export function captureEnv({cliVersion} = {}) {
  const {ci, ciName} = detectCi();
  const agentIdentity = detectAgentIdentity();
  const agentSession = detectAgentSession();
  return {
    cliVersion: cliVersion ?? null,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    ci,
    ciName,
    agent: detectAgent(agentIdentity),
    agentIdentity,
    // Never the raw value. A session id is a stable identifier that follows a
    // person across every run they make, and nothing here needs it: the hash
    // joins those runs just as well, and a handler that forwards the record
    // somewhere less private cannot un-forward an identifier we handed it.
    // Kept as an always-null field rather than dropped, so a consumer reading
    // schema-v1 records alongside these sees one stable shape.
    agentSessionId: null,
    agentSessionIdHash: hashAgentSessionId(agentSession.id),
    agentSessionIdSource: agentSession.source,
    invocationSource: detectInvocationSource({
      agentIdentity,
      agentSessionId: agentSession.id,
      ci,
    }),
    oneOff: safe(() => isCliOneOff(), false),
    packageManager: safe(() => detectPackageManager(), null),
    tty: Boolean(process.stdout.isTTY),
    locale: safe(() => Intl.DateTimeFormat().resolvedOptions().locale, null),
    timezone: safe(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      null,
    ),
  };
}

/**
 * Snapshot the project the command ran against. Names of a user's private
 * packages are identifying, so this records only shape: whether a project is
 * present, whether it is configured, and how many integrations it loads.
 *
 * @param {{hasConfig?: boolean, initialized?: boolean, integrationCount?: number, inProject?: boolean}} [facts]
 * @returns {import('../../authoring/debug/type').DebugEventProject}
 */
export function captureProject(facts = {}) {
  return {
    inProject: facts.inProject ?? null,
    hasConfig: facts.hasConfig ?? null,
    initialized: facts.initialized ?? null,
    integrationCount: facts.integrationCount ?? null,
  };
}

/**
 * A blank event, ready to accumulate into.
 *
 * Deliberately cheap: allocation only. `env` is left null and filled in by
 * {@link finish} once there is a handler to deliver to — probing it here would
 * charge every run for something most runs never use. It is not a small
 * charge: the first `Intl.DateTimeFormat().resolvedOptions()` initialises ICU,
 * and with `detectPackageManager` and `isCliOneOff` alongside it the probe
 * dominated `begin()` and put ~9% on the CLI's startup for everyone.
 *
 * @param {object} [init]
 * @param {string} [init.command]
 * @param {string[]} [init.argv]
 * @returns {InFlightEvent}
 */
export function createEvent({command = '', argv = []} = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    command,
    commandPath: command ? command.split(' ') : [],
    argv,
    args: {},
    options: {},
    optionSources: {},
    globalOptions: {},
    outcome: 'incomplete',
    exitCode: null,
    signal: null,
    error: null,
    output: {
      jsonMode: false,
      envelopeTypes: [],
      handled: false,
      helpDisplayed: false,
      resultCount: null,
      emptyResult: null,
      resultKind: null,
      directMatch: null,
      stdout: '',
      stderr: '',
      stdoutBytes: 0,
      stderrBytes: 0,
      truncated: false,
    },
    env: null,
    project: captureProject(),
    // FALSE, and true only on the sealed copy `finish()` delivers. Nothing has
    // been through the scrubbing pass yet, and a record that claims otherwise
    // while still holding verbatim values is worse than one that admits it.
    redacted: false,
  };
}

/**
 * Normalize a thrown value into the event's error shape.
 * @param {unknown} err
 * @returns {DebugEventError | null}
 */
export function toEventError(err) {
  if (err == null) return null;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      code:
        typeof (/** @type {any} */ (err).code) === 'string'
          ? /** @type {any} */ (err).code
          : null,
      stack: err.stack ?? null,
    };
  }
  return {
    name: typeof err,
    message: typeof err === 'string' ? err : safeStringify(err),
    code: null,
    stack: null,
  };
}

/**
 * Run `fn`, returning `fallback` if it throws. Environment probes touch the
 * filesystem and Intl, both of which can fail in a locked-down sandbox.
 * @template T
 * @param {() => T} fn
 * @param {T} fallback
 * @returns {T}
 */
function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** @param {unknown} value @returns {string} */
function safeStringify(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
