// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the Astryx CLI JSON output envelope (the `astryx --json`
 * contract). Colocated with the serializer (`json.mjs`) and shared types
 * (`base.d.ts`) it documents.
 * @position packages/cli/foundation/response — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'output',
  displayName: 'Output Envelope',
  namespace: 'cli/api',
  description:
    'The single JSON envelope every command emits under --json. Success is ' +
    '{ apiVersion, type, package?, data, meta? }; failure is { apiVersion, error, code, ' +
    'suggestions? }. Discriminate by checking whether `error` is present.',
  appliesTo: 'astryx --json',
  fields: [
    {
      name: 'Success envelope',
      type: '{ apiVersion: number; type: string; package?: string; data: unknown; meta?: { answeredBy?: { cli: string; core: string | null; copy: "project" | "starting" | "matched" | "carried" | "fallback" } } & Record<string, unknown> }',
      description:
        'Emitted for every successful command in --json mode: a type ' +
        'discriminator, the package that owns what the response is about, ' +
        'its data payload, and an optional meta object beside data.',
      fields: [
        {
          name: 'apiVersion',
          type: 'number',
          description:
            'Version of the JSON envelope contract. Bump on breaking shape ' +
            'changes so consumers can negotiate. Currently 1.',
          required: true,
          example: '1',
        },
        {
          name: 'type',
          type: 'string',
          description:
            'Names the payload shape. Every value is listed in the response-types enum.',
          required: true,
        },
        {
          name: 'package',
          type: 'string',
          description:
            'The npm package that owns the one thing the response is about: ' +
            '`@astryxdesign/core` for a Core component, hook, or template, ' +
            '`@astryxdesign/cli` for a doc the CLI ships, or the integration ' +
            'package that contributed it. Absent when the response lists ' +
            'things from more than one package; each listed item then names ' +
            'its own `package`.',
          example: "'@astryxdesign/core'",
        },
        {
          name: 'data',
          type: 'unknown',
          description: "The command's payload; its shape depends on `type`.",
          required: true,
        },
        {
          name: 'meta',
          type: 'Record<string, unknown>',
          description:
            "Optional, emitted as a sibling of data (never merged in). `answeredBy` is on every successful result of a release that has it: `{cli, core, copy}`, the answering CLI version, the Core it pairs with (or null), and which copy answered: `project` (the project's own CLI), `starting` (the copy that started the run, in a project with no CLI of its own), `matched` (the release equal to the project's Core, when the project's own CLI cannot start), `carried` (outside a project), or `fallback` (the matched release could not be obtained, so the starting copy answered). A `deprecations` field is an array of `{id, replacements}` entries; each stable lifecycle id names the replacement commands without changing the command data. Other fields may be added (spec:AST-017 FR13).",
        },
      ],
    },
    {
      name: 'Error envelope',
      type: '{ apiVersion: number; error: string; code: ErrorCode; suggestions?: Suggestion[] }',
      description:
        'Emitted for every failure in --json mode, including uncaught throws ' +
        'and command-line parse errors, which are converted to this shape.',
      fields: [
        {
          name: 'apiVersion',
          type: 'number',
          description:
            'The same contract version carried on the success envelope.',
          required: true,
          example: '1',
        },
        {
          name: 'error',
          type: 'string',
          description:
            'Human-readable message. It is for people and changes freely, so ' +
            'never branch on it.',
          required: true,
        },
        {
          name: 'code',
          type: 'ErrorCode',
          description:
            'Stable, machine-readable identifier; always present, append-only, ' +
            'and never changes meaning. Branch on this.',
          required: true,
          example: "'ERR_UNKNOWN_COMPONENT'",
        },
        {
          name: 'suggestions',
          type: 'Suggestion[]',
          description:
            'Optional "did you mean..." hints, present only when candidates exist.',
          fields: [
            {
              name: 'suggestions[].name',
              type: 'string',
              description:
                'The suggested value (e.g. a candidate component name).',
              required: true,
            },
            {
              name: 'suggestions[].reason',
              type: 'string',
              description:
                'Optional per-item explanation; some call sites emit a bare ' +
                'name with no reason.',
            },
          ],
        },
      ],
    },
  ],
  examples: [
    {
      label: 'Success',
      code: `{
  "apiVersion": 1,
  "type": "component.detail",
  "package": "@astryxdesign/core",
  "data": { "name": "Button" }
}`,
    },
    {
      label: 'Error',
      code: `{
  "apiVersion": 1,
  "error": "No component named \\"Buton\\"",
  "code": "ERR_UNKNOWN_COMPONENT",
  "suggestions": [{ "name": "Button" }]
}`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text:
        'The human-readable (text) output is a deterministic projection of this ' +
        'same JSON: --json exposes the structured source of truth, and the ' +
        'default format is rendered from the same data.',
    },
    {
      type: 'prose',
      text:
        '`code` is the stable contract; see the error-codes enum (ErrorCode) ' +
        'for the full append-only list. Branch on `code`, never on the `error` ' +
        'prose, which can be reworded or localized at any time.',
    },
    {
      type: 'prose',
      text:
        'The process exit code is part of the contract too. Exit 0 means success, ' +
        'and every error envelope exits 1. Some commands also exit 1 with a success ' +
        'envelope when what they report failed: a failed check (doctor ' +
        'and its integration subcommands, integration verify, theme build ' +
        '--check), a gap report that was not delivered, an upgrade left incomplete, ' +
        'or init agent docs refused for a path outside the project. Read the ' +
        'envelope, not the exit code, to tell them apart.',
    },
  ],
};
