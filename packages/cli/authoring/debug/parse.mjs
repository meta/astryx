// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Validator for a recorded run — the boundary a consumer reads through.
 *
 * The CLI hands {@link DebugEvent}s to a project's `debug` function; anything
 * reading them back later is reading data that may have been produced by a
 * different CLI version, hand-edited, or replayed from a warehouse.
 * `parseDebugEvent` turns `unknown` into the typed shape or throws a readable
 * error, exactly as the config and integration parsers do at their own
 * boundaries.
 *
 * Zod is sealed in here: the schema is module-private, never exported, and
 * never appears in a public type. A compile-time drift-lock asserts it still
 * infers exactly the published interface.
 *
 * NOTE this is deliberately NOT on the delivery path. The recorder must never
 * fail a command to satisfy a schema, so it delivers what it captured and this
 * validates on the way back in.
 */

import {z} from 'zod';
import {formatZodError} from '../_shared/errors.mjs';

/** @typedef {import('./type.js').DebugEvent} DebugEvent */

const outcomeSchema = z.enum([
  'ok',
  'error',
  'parse-error',
  'fatal',
  'rejected',
  'incomplete',
]);

const optionSourceSchema = z.enum([
  'cli',
  'default',
  'env',
  'config',
  'implied',
]);

const resultKindSchema = z.enum([
  'component',
  'hook',
  'doc',
  'template',
  'theme',
  'integration',
  'migration',
  'command',
  'mixed',
  'none',
]);

const invocationSourceSchema = z.enum(['human', 'ai', 'automation', 'unknown']);

const errorSchema = z
  .object({
    name: z.string(),
    message: z.string(),
    code: z.string().nullable(),
    stack: z.string().nullable(),
  })
  .strict();

const outputSchema = z
  .object({
    jsonMode: z.boolean(),
    envelopeTypes: z.array(z.string()),
    handled: z.boolean(),
    helpDisplayed: z.boolean(),
    resultCount: z.number().int().nonnegative().nullable().default(null),
    emptyResult: z.boolean().nullable().default(null),
    resultKind: resultKindSchema.nullable().default(null),
    directMatch: z.boolean().nullable().default(null),
    stdout: z.string(),
    stderr: z.string(),
    stdoutBytes: z.number(),
    stderrBytes: z.number(),
    truncated: z.boolean(),
  })
  .strict();

const envSchema = z
  .object({
    cliVersion: z.string().nullable(),
    nodeVersion: z.string(),
    platform: z.string(),
    arch: z.string(),
    ci: z.boolean(),
    ciName: z.string().nullable(),
    agent: z.string().nullable(),
    agentIdentity: z.string().nullable().default(null),
    // Nullable at the FIELD level so a v1 record's raw value still parses; the
    // event-level refinement then requires null from v2 onward. Nothing writes
    // a value here any more.
    agentSessionId: z.string().nullable().default(null),
    agentSessionIdHash: z.string().nullable().default(null),
    agentSessionIdSource: z.string().nullable().default(null),
    invocationSource: invocationSourceSchema.default('unknown'),
    oneOff: z.boolean(),
    packageManager: z.string().nullable(),
    tty: z.boolean(),
    locale: z.string().nullable(),
    timezone: z.string().nullable(),
  })
  .strict();

const projectSchema = z
  .object({
    inProject: z.boolean().nullable(),
    hasConfig: z.boolean().nullable(),
    initialized: z.boolean().nullable(),
    integrationCount: z.number().nullable(),
  })
  .strict();

const eventSchema = z
  .object({
    // Both versions parse: a canary or linked checkout may have written v1
    // records before the raw session id was retired, and refusing to read them
    // back would make the privacy change look like data loss. What each version
    // is ALLOWED to contain differs — see the refinement below.
    schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    id: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
    durationMs: z.number(),
    command: z.string(),
    commandPath: z.array(z.string()),
    argv: z.array(z.string()),
    args: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()),
    optionSources: z.record(z.string(), optionSourceSchema),
    globalOptions: z.record(z.string(), z.unknown()),
    outcome: outcomeSchema,
    exitCode: z.number().nullable(),
    signal: z.string().nullable(),
    error: errorSchema.nullable(),
    output: outputSchema,
    env: envSchema,
    project: projectSchema,
    redacted: z.boolean(),
  })
  .strict()
  .superRefine((event, ctx) => {
    // The privacy contract is a property of the DATA, not just of the code that
    // writes it. A v2 record carrying a raw session id did not come from this
    // CLI — it was hand-edited, replayed through the wrong pipeline, or written
    // by something claiming a version it does not honour. Accepting it would
    // let the identifier back in through the boundary that exists to keep it
    // out, and would let a v2 reader find a value the type says is never there.
    if (event.schemaVersion >= 2 && event.env.agentSessionId !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['env', 'agentSessionId'],
        message:
          'must be null from schema version 2 onward — a recorded run does ' +
          'not carry a raw agent session id; join on env.agentSessionIdHash',
      });
    }
  });

/**
 * Compile-time drift-lock: the sealed schema must infer EXACTLY the public
 * {@link DebugEvent} type. If they drift, `Equal` becomes `false` and
 * `Expect<false>` fails the `tsconfig.authoring-contract.json` typecheck —
 * so a field added to the recorder without being published here breaks CI.
 *
 * @typedef {import('../_shared/contract.js').Expect<
 *   import('../_shared/contract.js').MutuallyAssignable<z.infer<typeof eventSchema>, DebugEvent>
 * >} _DebugEventDriftLock
 */

/**
 * Validate an unknown value as a recorded run, or throw a readable error.
 *
 * Validation is VERSION-AWARE: a v1 record may carry a raw `env.agentSessionId`
 * (that is what v1 meant), and a v2 record may not — see the refinement on the
 * schema above.
 *
 * @param {unknown} input
 * @param {string} [label]
 * @returns {DebugEvent}
 */
export function parseDebugEvent(input, label = 'debug event') {
  const result = eventSchema.safeParse(input);
  if (!result.success) {
    throw new Error(formatZodError(label, result.error));
  }
  return /** @type {DebugEvent} */ (result.data);
}
