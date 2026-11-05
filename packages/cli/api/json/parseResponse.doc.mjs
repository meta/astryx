// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `parseResponse()`. Colocated with the consumer helper it
 * documents; the response shapes it yields are re-exported from `index.ts`.
 * @position packages/cli/api/json — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'parseResponse',
  namespace: 'cli/api',
  displayName: 'parseResponse()',
  summary: 'Parse `astryx --json` stdout into the structural response envelope.',
  description:
    'The entry point for consuming the CLI as a subprocess. A JSON string is parsed; ' +
    'an already-parsed object is passed through unchanged, so it is safe to call on ' +
    'either. It returns the structural { apiVersion, type, data, meta? } envelope without narrowing: ' +
    '`data` stays unknown until you discriminate on `type` (or use assertResponse).',
  importPath: '@astryxdesign/cli/json',
  signature: 'parseResponse(raw: unknown): any',
  keywords: ['json', 'parse', 'subprocess', 'envelope', 'stdout'],
  params: [
    {
      name: 'raw',
      type: 'unknown',
      description:
        'The CLI stdout to parse: a JSON string, or an object that was already parsed.',
      required: true,
    },
  ],
  returns: [
    {
      type: 'any',
      description:
        'The { apiVersion, type, data, meta? } envelope, or a CLIError envelope ({ apiVersion, error, code, suggestions? }). The published signature is intentionally untyped; narrow it by casting to the matching *Response type exported from @astryxdesign/cli/json.',
    },
  ],
  throws: [
    {
      code: 'SyntaxError',
      when: 'raw is a string that is not valid JSON (surfaced from JSON.parse)',
    },
  ],
  examples: [
    {
      label: 'Parse then narrow',
      code:
        "const result = parseResponse(stdout);\nif (isError(result)) throw new Error(result.error);",
    },
  ],
  related: ['isError', 'assertResponse'],
};
