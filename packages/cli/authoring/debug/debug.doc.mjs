// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for DebugEvent, the record of one CLI run.
 * @input The DebugEvent type beside it (`type.ts`), which `parse.mjs` reads.
 * @output The `debug-event` section of `astryx docs authoring`.
 * @position packages/cli/authoring/debug — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'debug-event',
  displayName: 'DebugEvent',
  namespace: 'authoring',
  description:
    'One recorded CLI run: what a `debug` handler receives, whether it is set in astryx.config or exported by an integration manifest. There is exactly one event per run, and every field is present by the time a handler sees it.',
  appliesTo: 'The argument of a `debug` handler',
  fields: [
    {
      name: 'schemaVersion',
      type: 'DebugSchemaVersion',
      description:
        'Version of the recorded shape: 1, 2, or 3. A field that changes meaning gets a new version, so switch on this.',
      required: true,
    },
    {
      name: 'id',
      type: 'string',
      description: 'Unique per run. Deduplicate on it.',
      required: true,
    },
    {
      name: 'startedAt',
      type: 'string',
      description: 'When the run started, as ISO 8601.',
      required: true,
    },
    {
      name: 'endedAt',
      type: 'string',
      description: 'When the run ended, as ISO 8601.',
      required: true,
    },
    {
      name: 'durationMs',
      type: 'number',
      description: 'How long the run took, in milliseconds.',
      required: true,
    },
    {
      name: 'command',
      type: 'string',
      description:
        'The full command name. Empty when astryx ran without a command.',
      required: true,
      example: "'theme build'",
    },
    {
      name: 'commandPath',
      type: 'string[]',
      description: 'The command name split into segments.',
      required: true,
      example: "['theme', 'build']",
    },
    {
      name: 'argv',
      type: 'string[]',
      description: 'The arguments after the binary, scrubbed.',
      required: true,
    },
    {
      name: 'args',
      type: 'Record<string, unknown>',
      description: 'Positional arguments, keyed by their declared names.',
      required: true,
    },
    {
      name: 'options',
      type: 'Record<string, unknown>',
      description: 'The command options, as the CLI resolved them.',
      required: true,
    },
    {
      name: 'optionSources',
      type: 'Record<string, DebugOptionSource>',
      description:
        "Where each option value came from: 'cli', 'default', 'env', 'config', or 'implied'. The keys match `options`.",
      required: true,
    },
    {
      name: 'globalOptions',
      type: 'Record<string, unknown>',
      description: 'The root flags, such as --json, --detail, and --lang.',
      required: true,
    },
    {
      name: 'outcome',
      type: 'DebugOutcome',
      description:
        "How the run ended: 'ok', 'error', 'parse-error', 'fatal', 'rejected', or 'incomplete'.",
      required: true,
    },
    {
      name: 'exitCode',
      type: 'number',
      description:
        'The process exit code. When a signal ended the run, 128 plus the signal number.',
      required: true,
    },
    {
      name: 'signal',
      type: 'string',
      description:
        "The signal that ended the run, such as 'SIGINT'. Null otherwise.",
      required: true,
    },
    {
      name: 'error',
      type: 'DebugEventError',
      description:
        'The failure: `name`, `message`, `code`, and `stack`. Branch on `code`, never on `message`. Null when nothing failed.',
      required: true,
    },
    {
      name: 'output',
      type: 'DebugEventOutput',
      description:
        'What the run answered with: JSON mode, the envelope types, the result count and kind, and the stdout and stderr it printed, scrubbed and cut at the capture limit.',
      required: true,
    },
    {
      name: 'env',
      type: 'DebugEventEnv',
      description:
        'Runtime facts: the CLI and Node versions, platform, CI, package manager, and whether a person, an AI agent, or automation ran the command. It never holds a hostname, a user name, or a raw session ID.',
      required: true,
    },
    {
      name: 'project',
      type: 'DebugEventProject',
      description:
        'The project the command ran in, as flags and counts. It never holds package names.',
      required: true,
    },
    {
      name: 'redacted',
      type: 'boolean',
      description:
        'Whether the values in the record were scrubbed. It is true on every event a handler receives. When it is false, treat the log as sensitive.',
      required: true,
    },
  ],
  examples: [
    {
      label: 'Keep a local log of the runs that failed',
      code:
        "import {appendFileSync} from 'node:fs';\n\n" +
        'export default {\n' +
        '  debug: event => {\n' +
        "    if (event.outcome !== 'ok') {\n" +
        "      appendFileSync('failed-runs.ndjson', JSON.stringify(event) + '\\n');\n" +
        '    }\n' +
        '  },\n' +
        '};',
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'The shape only grows: fields are added, never removed or given a new meaning. When a meaning must change, `schemaVersion` gets a new value. In version 3, a null `output.resultKind` means the run never reached an answer, so do not count it together with a version 1 or 2 null.',
    },
    {
      type: 'prose',
      text: 'The handler runs synchronously as the process exits, so a promise it returns is never awaited. It gets a copy of the event, and anything it throws is ignored.',
    },
    {
      type: 'prose',
      text: 'Import DebugEventOutput, DebugEventEnv, DebugEventProject, and DebugEventError from @astryxdesign/cli/authoring for the fields of `output`, `env`, `project`, and `error`.',
    },
  ],
};
