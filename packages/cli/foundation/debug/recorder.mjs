// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The recorder — one event per invocation, handed to your function.
 *
 * The whole feature: a project sets `debug` in `astryx.config`, and that
 * function receives every command run. No configuration beyond the function
 * itself, and nothing stored anywhere.
 *
 * ## Why the handoff happens at exit
 *
 * The CLI's failure path does not unwind. `cliError()` prints and calls
 * `process.exit()` synchronously, which means a `try/finally` around a command
 * action never runs on an error, and Commander's `postAction` hooks are
 * skipped too. Anything that reported on those paths would deliver a stream of
 * successes and almost no failures — precisely inverted from what a usage
 * record is for.
 *
 * So the recorder accumulates into a single mutable event and registers one
 * `process.on('exit')` listener, which fires for a normal return AND for every
 * `process.exit()` call. Signals bypass `exit` entirely, so those are handled
 * separately below. The listener is synchronous — Node abandons pending async
 * work once `exit` is emitted — which is why a handler cannot do network I/O.
 *
 * ## Why every entry point is guarded
 *
 * Recording must never be the reason a command fails. Every exported function
 * swallows its own errors; the worst outcome of a bug in here is a missing or
 * partial event.
 *
 * @input  lifecycle calls, result summaries, and a handler from config
 * @output one event per invocation, delivered to that handler
 * @position packages/cli/foundation/debug — runtime
 */

import {
  createEvent,
  toEventError,
  captureProject,
  captureEnv,
} from './event.mjs';
import {createRedactor, redactArgv, redactEnv} from './redact.mjs';
import {ERROR_CODES} from '../response/error-codes.mjs';

/**
 * Signals worth sealing an event for, with the exit code each conventionally
 * produces (128 + signal number).
 *
 * `process.on('exit')` does NOT run when a signal terminates the process, so
 * without these a long-running command — `theme build --watch`, anything the
 * user gives up on and Ctrl-Cs — would leave no record at all. Those are
 * exactly the invocations worth knowing about.
 */
const SIGNAL_EXIT_CODES = {SIGINT: 130, SIGTERM: 143, SIGHUP: 129};

/**
 * Per-stream cap on captured output.
 *
 * Some commands answer with a whole file — `astryx template <name>` prints
 * source, `component --list` prints the catalogue — and a record is for
 * understanding the shape of an answer, not for archiving it. The true byte
 * count is kept alongside, so a truncated capture still says how much there
 * was.
 */
export const MAX_CAPTURED_OUTPUT = 32 * 1024;

/** @type {import('./event.mjs').InFlightEvent | null} */
let _event = null;
/**
 * The project's own handler, from `debug` in `astryx.config`.
 * @type {import('../../authoring/debug/type').DebugEventHandler | null}
 */
let _projectHandler = null;
/**
 * Handlers contributed by loaded integrations, in integration load order.
 *
 * A separate list from the project's own because the two arrive from different
 * places and neither replaces the other: an app that sets `debug` for its own
 * debugging must not thereby remove itself from an integration's debug logs, and
 * an integration must not silence the app. Both are delivered to.
 * @type {import('../../authoring/debug/type').DebugEventHandler[]}
 */
let _integrationHandlers = [];
let _finished = false;
let _listenerInstalled = false;
let _signalsArmed = false;
let _configGateSkipped = false;
let _startedAt = 0;
/** @type {string | undefined} */
let _cliVersion;

/**
 * Captured stdout/stderr, and the originals to restore.
 * @type {{chunks: string[], bytes: number}}
 */
const _stdout = {chunks: [], bytes: 0};
/** @type {{chunks: string[], bytes: number}} */
const _stderr = {chunks: [], bytes: 0};
/** @type {null | {out: typeof process.stdout.write, err: typeof process.stderr.write}} */
let _originalWrites = null;

/**
 * Tee both output streams into memory.
 *
 * Patching `write` rather than `console.log` catches everything with one
 * seam: `emit()`, the JSON envelopes, `cliError`, Commander's own help and
 * error text, and any direct stream write — all of them bottom out here. The
 * tee forwards first and returns the real result, so behaviour is unchanged;
 * it only ever adds a string to an array.
 */
function captureOutput() {
  if (_originalWrites) return;
  // Keep the ORIGINAL references, unbound, so releaseOutput can put back
  // exactly what was there. Binding would restore a wrapper instead, and
  // repeated begin/finish cycles would stack wrappers on the stream.
  const out = process.stdout.write;
  const err = process.stderr.write;
  _originalWrites = {out, err};

  /**
   * @param {NodeJS.WriteStream} stream
   * @param {{chunks: string[], bytes: number}} sink
   * @param {Function} original
   */
  const tee = (stream, sink, original) =>
    /** @type {any} */ (
      function (/** @type {any} */ chunk, /** @type {any[]} */ ...rest) {
        try {
          const text = typeof chunk === 'string' ? chunk : String(chunk);
          sink.bytes += Buffer.byteLength(text);
          if (sink.bytes <= MAX_CAPTURED_OUTPUT) sink.chunks.push(text);
        } catch {
          /* a chunk we cannot stringify is simply not captured */
        }
        return original.call(stream, chunk, ...rest);
      }
    );

  process.stdout.write = tee(process.stdout, _stdout, out);
  process.stderr.write = tee(process.stderr, _stderr, err);
}

/** Put the real stream writers back, exactly as they were. */
function releaseOutput() {
  if (!_originalWrites) return;
  process.stdout.write = _originalWrites.out;
  process.stderr.write = _originalWrites.err;
  _originalWrites = null;
}

/**
 * @param {{chunks: string[], bytes: number}} sink
 * @returns {string}
 */
function collected(sink) {
  const text = sink.chunks.join('');
  return sink.bytes > MAX_CAPTURED_OUTPUT
    ? `${text.slice(0, MAX_CAPTURED_OUTPUT)}\n…[truncated, ${sink.bytes} bytes total]`
    : text;
}

/**
 * Run `fn`, swallowing anything it throws.
 * @param {() => void} fn
 */
function guard(fn) {
  try {
    fn();
  } catch {
    /* recording must never surface to the user */
  }
}

/** Is an event being collected? @returns {boolean} */
export function isRecording() {
  return _event !== null;
}

/**
 * The in-flight event, for tests.
 * @returns {import('./event.mjs').InFlightEvent | null}
 */
export function currentEvent() {
  return _event;
}

/**
 * Register the project's `debug` function.
 *
 * Called once the config has been read, which is necessarily after
 * {@link begin} — the recorder collects provisionally and only needs a
 * destination by the time the event is sealed at exit.
 *
 * This does NOT displace handlers contributed by integrations, and they do not
 * displace this one. See {@link setIntegrationEventHandlers}.
 *
 * @param {import('../../authoring/debug/type').DebugEventHandler | null | undefined} handler
 */
export function setEventHandler(handler) {
  guard(() => {
    _projectHandler = typeof handler === 'function' ? handler : null;
    afterHandlersChanged();
  });
}

/**
 * Register the handlers contributed by loaded integrations, replacing any
 * previously registered set.
 *
 * REPLACE, not append. `Project.load` is a plain factory — nothing memoizes it
 * process-wide — so a single command can load the same project more than once
 * (the pre-parse handler load, then the command's own). Appending would deliver
 * the same event to the same integration twice.
 *
 * Non-functions are dropped, and the list is deduplicated by function identity
 * so the same handler reached through two specs is still called once.
 *
 * @param {ReadonlyArray<import('../../authoring/debug/type').DebugEventHandler | null | undefined>} [handlers]
 */
export function setIntegrationEventHandlers(handlers = []) {
  guard(() => {
    const next = [];
    const seen = new Set();
    for (const handler of handlers ?? []) {
      if (typeof handler !== 'function' || seen.has(handler)) continue;
      seen.add(handler);
      next.push(handler);
    }
    _integrationHandlers = next;
    afterHandlersChanged();
  });
}

/**
 * Every handler this event will be delivered to, in delivery order: the
 * project's own first, then integrations in load order. Deduplicated by
 * identity, so a project that re-exports its integration's handler as its own
 * `debug` still gets one call.
 *
 * @returns {import('../../authoring/debug/type').DebugEventHandler[]}
 */
function effectiveHandlers() {
  /** @type {import('../../authoring/debug/type').DebugEventHandler[]} */
  const all = _projectHandler ? [_projectHandler] : [];
  for (const handler of _integrationHandlers) {
    if (!all.includes(handler)) all.push(handler);
  }
  return all;
}

/** Arm signals and report a missed config gate once a destination exists. */
function afterHandlersChanged() {
  if (!_event || effectiveHandlers().length === 0) return;
  armSignalHandlers();
  if (_configGateSkipped) reportConfigGateMiss();
}

export function noteConfigGateSkipped() {
  _configGateSkipped = true;
}

function reportConfigGateMiss() {
  _configGateSkipped = false;
  if (_event?.output.jsonMode) return;
  try {
    const write = _originalWrites?.err ?? process.stderr.write;
    write.call(
      process.stderr,
      'astryx: a debug handler was registered, but your astryx.config file ' +
        'contains neither the word `debug` nor `integrations`, so commands ' +
        'that do not otherwise read the config are not recorded. Name the key ' +
        'literally in the config file.\n',
    );
  } catch {
    /* best effort */
  }
}

/**
 * Start collecting.
 *
 * Runs before Commander parses, which is before `astryx.config` has supplied
 * the handler — so this collects provisionally and {@link finish} drops the
 * event if no destination ever appeared.
 *
 * Provisional collection is deliberately cheap: an object, and one no-op
 * `exit` listener. Probing the machine for {@link captureEnv} is deferred to
 * {@link finish}, so a run with no handler pays for none of it — that probe
 * initialises ICU on its first call and is most of what `begin` would
 * otherwise cost.
 *
 * @param {object} [options]
 * @param {string[]} [options.argv] - argv after the binary.
 * @param {string} [options.cliVersion]
 * @returns {boolean} whether collection started.
 */
export function begin({argv = process.argv.slice(2), cliVersion} = {}) {
  let started = false;
  guard(() => {
    if (_event) return;

    _startedAt = Date.now();
    _finished = false;
    _cliVersion = cliVersion;
    _event = createEvent({argv});

    if (!_listenerInstalled) {
      process.on('exit', handleExit);
      _listenerInstalled = true;
    }
    // Start teeing immediately: the answer a command gives is as much a part
    // of the record as the arguments it was given, and the earliest output
    // (the setup nudge, Commander's own errors) happens before any hook runs.
    captureOutput();
    // Normally the handler arrives after this (config is read later) and
    // setEventHandler arms the signals. Arm here too, so a caller that already
    // had one does not silently lose every signal-terminated run to lifecycle
    // ordering.
    if (effectiveHandlers().length > 0) armSignalHandlers();
    started = true;
  });
  return started;
}

/**
 * Install the signal handlers, once there is somewhere to deliver to.
 *
 * Separate from {@link begin} because adding a signal listener suppresses
 * Node's default disposition. Doing that for everyone — including the majority
 * of runs with no handler configured — would change Ctrl-C semantics
 * process-wide to no purpose.
 */
function armSignalHandlers() {
  if (_signalsArmed) return;
  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    process.on(signal, _signalHandlers[signal]);
  }
  _signalsArmed = true;
}

/** Record the fully-qualified command name, e.g. `theme build`. @param {string} name */
export function setCommand(name) {
  guard(() => {
    if (!_event) return;
    _event.command = String(name ?? '');
    _event.commandPath = _event.command ? _event.command.split(' ') : [];
  });
}

/** Record positional arguments, keyed by their declared names. @param {Record<string, unknown>} args */
export function setArgs(args) {
  guard(() => {
    if (!_event || !args) return;
    _event.args = {..._event.args, ...args};
  });
}

/**
 * Record command-level options and, where Commander can tell us, where each
 * value came from. The source is what separates "users pass --detail
 * explicitly" from "the default is full".
 *
 * @param {Record<string, unknown>} options
 * @param {Record<string, string>} [sources]
 */
export function setOptions(options, sources) {
  guard(() => {
    if (!_event) return;
    if (options) _event.options = {..._event.options, ...options};
    if (!sources) return;
    // `optionSources` is a published enum, so drop anything outside it rather
    // than letting a future Commander value widen the field silently.
    for (const [key, source] of Object.entries(sources)) {
      if (KNOWN_OPTION_SOURCES.has(source)) {
        _event.optionSources[key] = /** @type {any} */ (source);
      }
    }
  });
}

/** Values `optionSources` may carry — mirrors DebugOptionSource. */
const KNOWN_OPTION_SOURCES = new Set([
  'cli',
  'default',
  'env',
  'config',
  'implied',
]);

/** Record the root-level options (`--json`, `--detail`, …). @param {Record<string, unknown>} options */
export function setGlobalOptions(options) {
  guard(() => {
    if (!_event || !options) return;
    _event.globalOptions = {..._event.globalOptions, ...options};
    if ('json' in options) _event.output.jsonMode = Boolean(options.json);
  });
}

/** Record facts about the project. @param {Parameters<typeof captureProject>[0]} facts */
export function setProject(facts) {
  guard(() => {
    if (!_event || !facts) return;
    // Merge only what the caller actually knows. Facts arrive from two places,
    // so folding in a full captureProject() would let the second caller null
    // out the first caller's findings.
    for (const [key, value] of Object.entries(captureProject(facts))) {
      if (facts[/** @type {keyof typeof facts} */ (key)] !== undefined) {
        _event.project[/** @type {keyof typeof _event.project} */ (key)] =
          /** @type {any} */ (value);
      }
    }
  });
}

/**
 * The kinds a result SET may carry — every {@link DebugResultKind} except
 * `none`, which is the other branch of the union and never labels a set.
 *
 * A Record rather than a Set so the TYPE forces completeness: add a kind to the
 * published union and this object stops compiling until it is listed here too.
 * The vocabulary necessarily exists twice at runtime — here, and as the sealed
 * parser's schema in authoring/debug/parse.mjs — and neither copy can be
 * half-extended: that one is pinned to the same union by the drift-lock beside
 * it. Without this, adding a kind everywhere it looks obvious would leave this
 * guard silently nulling it, which is the exact failure this whole change is
 * about.
 *
 * @type {Record<Exclude<import('../../authoring/debug/type').DebugResultKind, 'none'>, true>}
 */
const RESULT_SET_KINDS = {
  component: true,
  hook: true,
  doc: true,
  template: true,
  theme: true,
  integration: true,
  migration: true,
  command: true,
  mixed: true,
};

/**
 * Stamp what the command answered with.
 *
 * The ONE place these fields are written. A command declares its result as its
 * return value — see foundation/debug/command-result.mjs — and the CommandDoc
 * converter hands it here; nothing else reports, so nothing else can drift or
 * forget. An unrecognized descriptor is ignored rather than half-recorded: a
 * partial row is worse than an obviously missing one.
 *
 * @param {import('./command-result.mjs').CommandResult} result
 */
export function recordCommandResult(result) {
  guard(() => {
    if (!_event || !result || typeof result !== 'object') return;

    // An effect, not a lookup. `none` is the whole record: leaving the counts
    // null is deliberate, and the kind is what says so.
    if (result.kind === 'none') {
      _event.output.resultKind = 'none';
      return;
    }
    if (result.kind !== 'results') return;

    // A count that is not a count records NOTHING. Falling back to 0 would
    // publish "this run found nothing" — a confident, wrong answer — where the
    // truth is that the descriptor was malformed.
    const count = result.count;
    if (!Number.isInteger(count) || count < 0) return;

    _event.output.resultCount = count;
    _event.output.emptyResult =
      typeof result.empty === 'boolean' ? result.empty : count === 0;
    _event.output.resultKind = Object.hasOwn(
      RESULT_SET_KINDS,
      result.resultKind,
    )
      ? /** @type {import('../../authoring/debug/type').DebugResultKind} */ (
          result.resultKind
        )
      : null;
    if (typeof result.directMatch === 'boolean') {
      _event.output.directMatch = result.directMatch;
    }
  });
}

/** Note a JSON envelope discriminator the command emitted. @param {string} type */
export function recordEnvelope(type) {
  guard(() => {
    if (!_event || !type) return;
    _event.output.handled = true;
    if (!_event.output.envelopeTypes.includes(type)) {
      _event.output.envelopeTypes.push(String(type));
    }
  });
}

/** Note that the run ended by printing help rather than doing work. */
export function recordHelp() {
  guard(() => {
    if (!_event) return;
    _event.output.helpDisplayed = true;
    // Printing help is not a lookup, so it has no result set — and saying so
    // keeps a null `resultKind` meaning the one thing it should: nobody
    // reported. Only if the command has not already answered: help can follow
    // real output, and that answer is the better record of the two.
    if (_event.output.resultKind === null) _event.output.resultKind = 'none';
  });
}

/**
 * Record how the invocation ended. First terminal outcome wins: `cliError`
 * sets the error and then exits, and the exit listener must not overwrite that
 * with the generic `ok` it would otherwise infer.
 *
 * @param {import('./event.mjs').Outcome} outcome
 * @param {{exitCode?: number | null, error?: unknown, code?: string | null}} [details]
 */
export function setOutcome(outcome, details = {}) {
  guard(() => {
    if (!_event || _event.outcome !== 'incomplete') return;
    _event.outcome = outcome;
    if (details.exitCode !== undefined) _event.exitCode = details.exitCode;
    if (details.error !== undefined) {
      _event.error = toEventError(details.error);
      if (_event.error && details.code) _event.error.code = details.code;
    } else if (details.code) {
      _event.error = {
        name: 'CliError',
        message: '',
        code: details.code,
        stack: null,
      };
    }
  });
}

/** The `process.on('exit')` listener. Synchronous by necessity. @param {number} code */
function handleExit(code) {
  guard(() => finish({exitCode: code}));
}

/**
 * Seal the event, then get out of the way so the signal behaves normally.
 *
 * Adding a listener suppresses Node's default disposition, so this must hand
 * termination back: remove itself, and re-raise only if nothing else is
 * listening. A command with its own handler (watch mode) keeps owning the
 * signal, and Ctrl-C keeps working either way.
 *
 * Whether anyone else is listening also decides WHAT to record. If we are the
 * last listener the process is about to die from the signal, `exit` will never
 * fire, and sealing here is the only chance to record anything. If the command
 * is still listening it is about to shut itself down on its own terms — a
 * `theme build --watch` printing "Stopped watching." and returning 0 — so
 * sealing here would file the most ordinary way to leave watch mode as a
 * failure, with an exit code the process never returned. Defer to the exit
 * listener instead; the signal is still recorded on the event either way.
 *
 * @param {keyof typeof SIGNAL_EXIT_CODES} signal
 */
function handleSignal(signal) {
  const exitCode = SIGNAL_EXIT_CODES[signal];

  // Step down FIRST: `listenerCount` only means "does the command own this
  // signal too" once we are no longer counted ourselves.
  let last = true;
  try {
    process.removeListener(signal, _signalHandlers[signal]);
    last = process.listenerCount(signal) === 0;
  } catch {
    /* if we cannot step down, behave as though we were the only listener */
  }

  guard(() => {
    if (_event) _event.signal = signal;
    if (!last) return;
    setOutcome('error', {exitCode, code: ERROR_CODES.ERR_SIGNAL_TERMINATED});
    finish({exitCode});
  });

  if (last) {
    try {
      process.kill(process.pid, signal);
    } catch {
      /* re-raising failed — let the process continue as it would have */
    }
  }
}

/** Bound handlers, kept so they can be removed by identity. */
const _signalHandlers = /** @type {Record<string, () => void>} */ (
  Object.fromEntries(
    Object.keys(SIGNAL_EXIT_CODES).map(s => [
      s,
      () => handleSignal(/** @type {any} */ (s)),
    ]),
  )
);

/**
 * Scrub a captured stream, tolerating anything odd in it.
 * @param {string} text
 * @param {import('./redact.mjs').Redactor} redact
 * @returns {string}
 */
function scrubText(text, redact) {
  if (!text) return '';
  try {
    return String(redact(text) ?? '');
  } catch {
    return '';
  }
}

/**
 * Seal the event and deliver it. Idempotent.
 *
 * @param {{exitCode?: number}} [options]
 * @returns {boolean} whether an event was delivered.
 */
export function finish({exitCode} = {}) {
  let delivered = false;
  guard(() => {
    if (!_event || _finished) return;
    _finished = true;
    // Stop teeing before doing anything else, so nothing the handler prints
    // ends up in the record it was handed.
    releaseOutput();
    // No destination — neither the project nor any loaded integration supplied
    // a handler. Nothing to do, and nothing was paid for: the environment probe
    // below never runs.
    const handlers = effectiveHandlers();
    if (handlers.length === 0) return;

    _event.env = captureEnv({cliVersion: _cliVersion});
    _event.output.stdout = collected(_stdout);
    _event.output.stderr = collected(_stderr);
    _event.output.stdoutBytes = _stdout.bytes;
    _event.output.stderrBytes = _stderr.bytes;
    _event.output.truncated =
      _stdout.bytes > MAX_CAPTURED_OUTPUT ||
      _stderr.bytes > MAX_CAPTURED_OUTPUT;

    const endedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - _startedAt);
    _event.endedAt = endedAt;
    _event.durationMs = durationMs;

    if (_event.exitCode == null) {
      // `process.exitCode` is typed string | number since Node 20 (it accepts
      // a named code), so normalize rather than carrying a string.
      const fallback = Number(process.exitCode ?? 0);
      _event.exitCode = exitCode ?? (Number.isFinite(fallback) ? fallback : 1);
    }
    if (_event.outcome === 'incomplete') {
      _event.outcome = _event.exitCode === 0 ? 'ok' : 'error';
    }
    // A non-zero exit with no error attached means something called
    // `process.exit` directly instead of going through cliError/jsonError.
    // Mark it rather than filing it alongside real classified failures.
    if (_event.outcome === 'error' && !_event.error) {
      _event.error = {
        name: 'UnclassifiedExit',
        message: '',
        code: ERROR_CODES.ERR_UNCLASSIFIED_EXIT,
        stack: null,
      };
    }

    const redact = createRedactor();
    // Same rules, but no length clamp — see the output note below.
    const settingsRedact = createRedactor({maxLength: Number.MAX_SAFE_INTEGER});
    /** @type {import('./event.mjs').DebugEvent} */
    const sealed = {
      ..._event,
      endedAt,
      durationMs,
      // Filled in just above — `env` is null only while the event is still in
      // flight, which a sealed one never is. The snapshot mixes values we
      // derive with free text the environment supplied, so it gets its own
      // classified pass rather than the generic one.
      env: /** @type {import('./event.mjs').DebugEvent['env']} */ (
        redactEnv(
          /** @type {import('./event.mjs').DebugEvent['env']} */ (_event.env),
          redact,
        )
      ),
      argv: /** @type {string[]} */ (redactArgv(_event.argv, redact)),
      args: /** @type {Record<string, unknown>} */ (redact(_event.args)),
      options: /** @type {Record<string, unknown>} */ (redact(_event.options)),
      globalOptions: /** @type {Record<string, unknown>} */ (
        redact(_event.globalOptions)
      ),
      // Captured output echoes back paths and argument values, so it gets the
      // same treatment. The per-value length clamp does not apply here —
      // MAX_CAPTURED_OUTPUT already bounds it, and clipping an answer at 2KB
      // would defeat the point of keeping it.
      output: {
        ..._event.output,
        stdout: scrubText(_event.output.stdout, settingsRedact),
        stderr: scrubText(_event.output.stderr, settingsRedact),
      },
      error: _event.error
        ? {
            ..._event.error,
            message: String(redact(_event.error.message) ?? ''),
            stack:
              _event.error.stack == null
                ? null
                : String(redact(_event.error.stack) ?? ''),
          }
        : null,
      // Every pass above has now run, so the claim is true. It is set HERE and
      // nowhere else: an in-flight event carries `redacted: false` until this
      // copy is built, so the flag can never say "scrubbed" about values that
      // are not.
      redacted: true,
    };

    // A COPY PER HANDLER. Handing over the live object would let third-party
    // code mutate the record mid-flight, and handing the same copy to two
    // handlers would let the first one edit what the second is told. Each call
    // is isolated in turn — one handler throwing, printing, or calling
    // process.exit changes nothing for the others or for the command.
    for (const handler of handlers) {
      const ran = callHandler(handler, structuredClone(sealed));
      delivered = delivered || ran;
    }
  });
  return delivered;
}

/**
 * @param {import('../../authoring/debug/type').DebugEventHandler} handler
 * @param {import('./event.mjs').DebugEvent} event
 * @returns {boolean}
 */
function callHandler(handler, event) {
  const realExit = process.exit;
  const realStdoutWrite = process.stdout.write;
  const realStderrWrite = process.stderr.write;
  const exitCodeBefore = process.exitCode;
  let exitAttempt = /** @type {number | string | null | undefined} */ (
    undefined
  );
  let ran = false;

  try {
    process.exit = /** @type {any} */ (
      (/** @type {any} */ code) => {
        exitAttempt = code;
      }
    );
    process.stdout.write = /** @type {any} */ (
      function (/** @type {any} */ chunk, /** @type {any[]} */ ...rest) {
        return realStderrWrite.call(process.stderr, chunk, ...rest);
      }
    );
    handler(event);
    ran = true;
  } catch {
    /* handler errors are isolated */
  } finally {
    process.exit = realExit;
    process.stdout.write = realStdoutWrite;
    process.exitCode = exitCodeBefore;
  }

  if (exitAttempt !== undefined) {
    try {
      realStderrWrite.call(
        process.stderr,
        `astryx: the debug handler called process.exit(${String(exitAttempt)}); ` +
          `ignored so it cannot change what the command returned.\n`,
      );
    } catch {
      /* best effort */
    }
  }

  return ran;
}

/** Reset all recorder state. Tests call this between cases. */
export function resetRecorder() {
  if (_listenerInstalled) {
    process.removeListener('exit', handleExit);
    _listenerInstalled = false;
  }
  if (_signalsArmed) {
    for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
      process.removeListener(signal, _signalHandlers[signal]);
    }
    _signalsArmed = false;
  }
  releaseOutput();
  _stdout.chunks.length = 0;
  _stdout.bytes = 0;
  _stderr.chunks.length = 0;
  _stderr.bytes = 0;
  _event = null;
  _projectHandler = null;
  _integrationHandlers = [];
  _finished = false;
  _configGateSkipped = false;
  _startedAt = 0;
}
