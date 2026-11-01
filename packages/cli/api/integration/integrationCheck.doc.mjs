// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `integrationCheck()` / `astryx integration check`.
 * Colocated with the API function it documents; the shape source of truth stays
 * in `integration-check.type.mjs`.
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationCheck',
  namespace: 'cli/api',
  displayName: 'integrationCheck()',
  summary:
    'Run every source check against the integration package in the current folder, as its build does: validate, components, templates, and docs.',
  description:
    'Runs `validateIntegration`, `integrationComponentConflicts`, ' +
    '`integrationTemplateConflicts`, and `integrationDocConflicts` against the ' +
    'integration package in `options.cwd`, and counts each result the way that ' +
    "check's own subcommand exits. The run fails when any of the four would fail on " +
    'its own. With `strict` it also fails on any warning and on any check that did ' +
    'not run: a package with no integration manifest, or a comparison a check ' +
    "carries that was skipped, such as one that needs the project's TypeScript. " +
    '`strict` adds no check: it reports those warnings and skipped work again, as ' +
    "errors in the checks' own issue format. " +
    'A new check, or a new failure code, joins only in a minor release, named in the release notes.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationCheck(options?: IntegrationCheckOptions): Promise<IntegrationCheckCommandResponse>',
  keywords: ['integration', 'check', 'build', 'strict', 'validate', 'doctor'],
  params: [
    {
      name: 'options.cwd',
      type: 'string',
      default: 'process.cwd()',
      description: 'The integration package folder to check.',
    },
    {
      name: 'options.strict',
      type: 'boolean',
      default: 'false',
      description:
        'Also fail on any warning and on any check that did not run, not only on errors. A malformed `cliCommand` is reported as a note (`invalid_cli_command`) in `data.notes` of the validate check, which fails nothing until a minor release names it.',
    },
    {
      name: 'options.next',
      type: 'boolean',
      default: 'false',
      description:
        "Also count the findings the next minor release turns into warnings, validate's notes marked `next`, as warnings now, so `strict` fails on them.",
    },
  ],
  returns: [
    {
      type: 'integration.check',
      description:
        "`data.validated` (false when no integration manifest was found, so nothing was checked), `data.name` and `data.version` of the package, `data.strict`, `data.next`, and `data.checks`, one entry per check in the order they run (`validate`, `components`, `templates`, `docs`), each with `check`, `errors` (what makes that check's own subcommand exit 1), `warnings`, `skipped` (why work did not run), `failed` (whether that subcommand exits 1), and `response`, the envelope the check returns on its own. The totals are `data.errors`, `data.warnings`, and `data.skipped` (each reason prefixed with its check); an issue every check starts from, such as one about the manifest, counts once, and every other finding counts on its own. `data.unchecked` counts the items the checks list as not compared, which never fail it. `data.upcoming` counts the findings the next minor release turns into warnings (validate's notes marked `next`), and `data.next` says whether this run counted them as warnings now. With `strict`, `data.failures` lists each warning and each piece of skipped work once again as an error in the checks' own issue format ({check, severity: `error`, code, message, component, prop, fix, file, line}, each where it applies); it is empty without `strict`. `data.failed` decides the exit code.",
    },
  ],
  examples: [
    {
      label: 'Check the local package',
      code: 'const r = await integrationCheck();',
    },
    {
      label: 'Fail on warnings too',
      code: 'const {data} = await integrationCheck({strict: true});\nif (data.failed) process.exitCode = 1;',
    },
  ],
  command: 'integration check',
  related: [
    'validateIntegration',
    'integrationComponentConflicts',
    'integrationTemplateConflicts',
    'integrationDocConflicts',
    'integrationPackCheck',
  ],
};
