// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `assertResponse()`. Colocated with the consumer helper it
 * documents; the response shapes it asserts are re-exported from `index.ts`.
 * @position packages/cli/api/json — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'assertResponse',
  namespace: 'cli/api',
  displayName: 'assertResponse()',
  summary:
    'Parse and assert one expected response type, throwing on an error or a mismatch.',
  description:
    'The strict alternative to parseResponse + manual narrowing: it parses, rethrows a ' +
    'CLIError as an Error carrying the CLI message, and rejects any envelope whose `type` ' +
    'is not the one you asked for. Use it when a call site expects exactly one response ' +
    'type and any other outcome is a bug worth failing on.',
  importPath: '@astryxdesign/cli/json',
  signature: 'assertResponse(raw: unknown, expectedType: string): any',
  keywords: ['json', 'assert', 'narrow', 'subprocess', 'envelope'],
  params: [
    {
      name: 'raw',
      type: 'unknown',
      description:
        'The CLI stdout to parse: a JSON string, or an object that was already parsed.',
      required: true,
    },
    {
      name: 'expectedType',
      type: 'string',
      description:
        "The response discriminant the caller requires (e.g. 'component.detail').",
      required: true,
    },
  ],
  returns: [
    {
      type: 'any',
      description:
        'The parsed envelope, guaranteed at runtime to carry the requested `type`. The published signature is untyped; cast to the matching *Response type for typed access.',
    },
  ],
  throws: [
    {
      code: 'Error',
      when: 'a plain Error with no code: the CLI returned an error envelope (its message is rethrown; code and suggestions are dropped), or the response `type` is not expectedType',
    },
  ],
  examples: [
    {
      label: 'Require one type',
      code:
        "const r = assertResponse(stdout, 'component.detail');\nr.data.name; // safe: any other outcome threw",
    },
  ],
  related: ['parseResponse', 'isError'],
};
