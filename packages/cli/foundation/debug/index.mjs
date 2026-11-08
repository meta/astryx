// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Public surface of the debug subsystem — the one module the CLI layer
 * imports.
 *
 * The whole feature is: capture everything about an invocation, and hand it to
 * a function the project supplied via `debug` in `astryx.config`. Nothing is
 * stored; the handler decides what happens to the data.
 *
 * The instrumentation contract is small on purpose:
 *
 *   begin()                  once, before Commander parses
 *   setCommand/setArgs/…     as facts become known
 *   recordCommandResult()    what the command answered with, from its return
 *   setOutcome()             from every terminal path (error, fatal, gate)
 *   finish()                 automatic, via the exit listener begin() installs
 *
 * Nothing here throws. See recorder.mjs for why every call is guarded.
 *
 * @input  lifecycle calls from the CLI layer
 * @output one event per invocation, delivered to the project's handler
 * @position packages/cli/foundation/debug — public surface
 */

export {
  begin,
  finish,
  isRecording,
  currentEvent,
  setCommand,
  setArgs,
  setOptions,
  setGlobalOptions,
  setProject,
  recordCommandResult,
  setEventHandler,
  setIntegrationEventHandlers,
  noteConfigGateSkipped,
  setOutcome,
  recordEnvelope,
  recordHelp,
  resetRecorder,
} from './recorder.mjs';

export {
  NO_RESULT_SET,
  resultSet,
  resultSetOf,
} from './command-result.mjs';

export {
  SCHEMA_VERSION,
  createEvent,
  captureEnv,
  captureProject,
  toEventError,
} from './event.mjs';

export {
  createRedactor,
  isSensitiveKey,
  redactArgv,
  REDACTED,
} from './redact.mjs';
