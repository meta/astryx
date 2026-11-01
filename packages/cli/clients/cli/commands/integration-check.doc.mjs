// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx integration check`.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'integration check',
  displayName: 'astryx integration check',
  namespace: 'cli/commands',
  summary:
    "The CI check for an integration package's own build: every source check, run in continuous integration or a typecheck script, against the package in the current folder",
  description:
    'Takes no package argument: it runs the four `doctor integration` checks, ' +
    '`validate`, `components`, `templates`, and `docs`, against the integration ' +
    'package in the current folder, which is where its own build runs it. It prints ' +
    'each result as that check ' +
    'prints it, then a summary with the errors, warnings, and skipped work of each, ' +
    'and exits 1 when any of the four would exit 1 on its own. With `--strict` it ' +
    'also exits 1 on any warning and on any check, or comparison within a check, ' +
    'that did not run, such as a package with no `astryx.integration.*` or a ' +
    'comparison skipped because the project has no TypeScript, or prop types not ' +
    'judged because its TypeScript is older than 4.8: it adds no check, ' +
    'and lists each of those again as an error, after the checks, in their own ' +
    'issue format. That is the line ' +
    "for the package's own build, so its docs, types, and links stay in sync: run " +
    'it as a `ci` step, or add ' +
    '`"typecheck": "tsc --noEmit && astryx integration check --strict"` to the ' +
    'scripts in package.json. Its exit codes and JSON are a contract for the builds ' +
    'that run it: a new check, or a new failure code, joins only in a minor release ' +
    'that names it in the release notes. A patch can still ship a Core component, ' +
    'template, or CLI topic whose name conflicts with one of yours. Run ' +
    '`integration check` on every build; run ' +
    '`integration verify` before you publish, to check that the packed package ' +
    'works in an app. To check an installed integration by name, run the ' +
    '`doctor integration` subcommands with its package name. Outside a package, ' +
    'it writes nothing, `validate` reports one `no_package` issue, and it exits 1.',
  fn: 'integrationCheck',
  options: [
    {
      flag: '--strict',
      param: 'options.strict',
      description:
        'Also exit 1 on any warning and on any check that did not run. A new check or failure code joins only in a minor release, named in the release notes; until then, a malformed `cliCommand` is reported as a note (`invalid_cli_command`) that fails nothing.',
    },
    {
      flag: '--next',
      param: 'options.next',
      description:
        'Also count the findings the next minor release turns into warnings (the notes marked `next`) as warnings now, so `--strict --next` fails on them. Run it to fix them ahead of the release; every run says how many there are.',
    },
  ],
  examples: [
    {
      label:
        'In CI, as the typecheck script: add "typecheck": "tsc --noEmit && astryx integration check --strict" to package.json',
      cli: 'integration check --strict',
    },
    {
      label: 'Errors only, while you fix the warnings a package already has',
      cli: 'integration check',
    },
    {
      label:
        'Fix ahead: fail on the findings the next minor release will fail on',
      cli: 'integration check --strict --next',
    },
    {
      label: 'Read the result as JSON',
      cli: 'integration check --strict --json',
    },
    {
      label:
        'Before you publish: check that the packed package works in an app',
      cli: 'integration verify',
    },
  ],
  outsideProject: 'own',
  exitCodes: [
    {
      code: 0,
      when: 'no check fails on its own; with --strict, also no warning, and every check ran',
    },
    {
      code: 1,
      when: 'a check fails on its own (an error); with --strict, also any warning, or a check that did not run',
    },
  ],
  related: [
    'integration verify',
    'doctor integration validate',
    'doctor integration components',
    'doctor integration templates',
    'doctor integration docs',
  ],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a package, it writes nothing, its `validate` check reports one `no_package` issue, and it exits 1. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:global-integrations}.",
    },
  ],
};
