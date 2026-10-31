// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for the `astryx.config.*` file (AstryxConfig). Colocated with
 * the schema (`type.ts` + `parse.mjs`) it documents.
 * @position packages/cli/authoring/config — schema documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'config',
  displayName: 'astryx.config',
  namespace: 'authoring',
  description:
    'The optional astryx.config.* file at your project root. Declares which ' +
    'integrations to load, where to route issue links, post-codemod hooks, local ' +
    'debug-log and gap-report handlers, a discover source, and experimental ' +
    'layout components. All optional; {} is valid.',
  appliesTo: 'astryx.config.{ts,mjs,js}',
  fields: [
    {
      name: 'integrations',
      type: 'string[]',
      description:
        'Package names of Astryx integrations to load alongside core.',
      example: "['@acme/astryx-widgets']",
    },
    {
      name: 'issuesUrl',
      type: 'string',
      description:
        "Where reports about Core go: `{@command gap-report}` routes a Core report here when no handler is loaded, gapReport handlers receive it as `report.target.issuesUrl`, and `{@command swizzle}` prints it as the feedback link for a Core component. A report or swizzle for an integration's component uses that integration's own issuesUrl, never this one. An absolute URL; a value that is not a URL makes the config invalid.",
      default: "'https://github.com/meta/astryx/issues/new'",
    },
    {
      name: 'hooks',
      type: '{ postCodemod?: PostCodemodHook[] }',
      description: 'Lifecycle hooks.',
      fields: [
        {
          name: 'hooks.postCodemod',
          type: 'PostCodemodHook[]',
          description:
            'Commands to run after `{@command upgrade}` changes files (e.g. re-run your formatter). Each hook is an object `{name?, buildCommand}`: buildCommand gets `{packageDir, files}` and returns `{command, args?, options?}` to run, or null to skip. A dry run prints each command instead of running it.',
        },
      ],
    },
    {
      name: 'debug',
      type: '(event: DebugEvent) => void',
      description:
        'Record every command run. The handler is synchronous; promises are not awaited and output goes to stderr. Declare `debug` directly in this file so early commands can discover it. An integration can supply one too, as a `debug` named export from its manifest. Every handler runs: yours first, then each integration\'s in load order (the `integrations` list, then autolinked ones). A handler that throws is skipped; the others still run and the command\'s result does not change. Set `{"astryx": {"inheritDebug": false}}` in package.json to take only your own.',
      example:
        "event => appendFileSync('runs.ndjson', JSON.stringify(event) + '\\n')",
    },
    {
      name: 'gapReport',
      type: 'GapReportHandler',
      description:
        'Handle explicit gap reports in addition to every loaded integration handler. The project handler runs first. Public handlers require caller consent; internal handlers always run.',
      example:
        "{ audience: 'internal', async handle(report, {signal}) { return sendGap(report, {signal}); } }",
    },
    {
      name: 'discover',
      type: 'DiscoverSource',
      description:
        'Tell `{@command discover}` which integrations this project could add: an async function that returns a catalog. An integration can provide one too, as a `discover` named export from its manifest. Discover calls every source, yours first, and one that fails never hides the others. Discover only reads; your package manager installs.',
      example:
        "async ({signal, package: name, version}) => fetchCatalog({signal, name, version})",
    },
    {
      name: 'experimental',
      type: '{ xle?: { components?: Record<string, XleComponent> } }',
      description: 'Unstable features; may change without a breaking bump.',
      fields: [
        {
          name: 'experimental.iconSet',
          type: 'string',
          stability: 'experimental',
          description:
            "Experimental: may change or be removed in a patch release. The project's icon set, by set name or as `<package>/<set>`. It is the opt-in: copied templates use its icons, and `astryx discover` and `astryx doctor` report icon sets, only when it is set. `astryx experimental icon` ranks its icons first; without it, the only installed set is the project's there. `astryx search` never returns icons.",
          example: "'@acme/outline-icons/outline'",
        },
        {
          name: 'experimental.xle.components',
          type: 'Record<string, XleComponent>',
          description:
            'Custom components for the removed layout expander, keyed by component name. The CLI still validates the field, so an entry without a string `from` makes `astryx.config` invalid, but nothing reads it.',
        },
      ],
    },
  ],
  examples: [
    {
      label: 'Minimal',
      code: "export default {\n  integrations: ['@acme/astryx-widgets'],\n};",
    },
    {
      label: 'Send every command run somewhere of your own',
      code:
        "import {appendFileSync} from 'node:fs';\n\n" +
        'export default {\n' +
        '  debug: event => appendFileSync("runs.ndjson", JSON.stringify(event) + "\\n"),\n' +
        '};',
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'The config is validated at load with a strict schema: an unknown key, a misspelled one included, or a value of the wrong type makes the whole file invalid. `{@command gap-report}`, `{@command discover}`, and `{@command upgrade}` stop with the error, and `{@command doctor}` fails its `config` check (exit 1). Reads such as `component`, `docs`, `search`, `template`, and `theme` carry on silently as if there were no config and no integrations, and no debug handler runs, so run `{@command doctor}` after editing the file.',
    },
  ],
};
