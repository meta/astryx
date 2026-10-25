// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `upgrade()` / `astryx upgrade`. Colocated with the API
 * function it documents; the shape source of truth stays in `upgrade.type.mjs`.
 * @position packages/cli/api/upgrade — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'upgrade',
  namespace: 'cli/api',
  displayName: 'upgrade()',
  summary:
    'After bumping @astryxdesign/core, migrate project source with codemods and update copied compositions.',
  description:
    'Runs the codemods between `from` and the installed Core version, then refreshes the ' +
    'managed agent-docs block. Dry-run by default; `apply` writes changes only after the ' +
    'selected codemods and hooks succeed. Config codemods run before astryx.config is ' +
    'loaded, so they can repair an invalid config. Also updates copied compositions from ' +
    'their install receipts: unchanged files are updated, non-overlapping edits are merged, ' +
    'and conflicts are left untouched. `list` only lists codemods; `registry` only updates ' +
    'copied compositions. Core codemods ship inside the CLI, so a CLI older than the installed ' +
    'Core has none for the releases after its own version: the result then carries ' +
    '`cliBehindCore` with the command that runs the same upgrade on the matching CLI.' +
    " In global mode: in a project, the CLI runs `upgrade` with the project's own CLI, whichever astryx command started it (in a project with no CLI of its own, the one you started); this function runs the codemods of the package it is imported from. With `cwd` outside a project, `list` lists this release's codemods, `registry` finds no copied compositions, and a migration writes nothing and fails with `ERR_VERSION_DETECT`. See {@link namespace:global} and {@link generic:who-answers}.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'upgrade(options?: UpgradeOptions, ctx?: {cwd?: string}): Promise<UpgradeListResponse | UpgradeRegistryResponse | UpgradeStatusResponse | UpgradeRunResponse>',
  keywords: [
    'upgrade',
    'migrate',
    'codemod',
    'migration',
    'version',
    'registry',
  ],
  params: [
    {
      name: 'options.from',
      type: 'string',
      description:
        'Version before the dependency bump; the target is the installed @astryxdesign/core (or legacy @xds/core). Required unless `list` or `registry` is set.',
    },
    {
      name: 'options.apply',
      type: 'boolean',
      description: 'Write changes to disk; otherwise a dry-run preview.',
      default: 'false',
    },
    {
      name: 'options.force',
      type: 'boolean',
      description:
        'Run codemods even when `from` is at/after the installed version.',
      default: 'false',
    },
    {
      name: 'options.codemod',
      type: 'string',
      description:
        'Run only this codemod. Optional codemods run only when named here. Setting it also skips copied-composition reconciliation.',
    },
    {
      name: 'options.skipCodemod',
      type: 'string[]',
      description: 'Codemod names to exclude (e.g. to re-run past a failure).',
    },
    {
      name: 'options.integration',
      type: 'string[]',
      description:
        'Explicit integration specifiers to process. Resolved beneath node_modules; absolute paths and `.` or `..` segments are rejected.',
    },
    {
      name: 'options.path',
      type: 'string',
      description:
        'Source directory to scan. A path you name, in any spelling, is relative to `ctx.cwd`. When it is omitted, the upgrade scans `./src` at the project root.',
      default: './src at the project root',
    },
    {
      name: 'options.installDeps',
      type: 'boolean',
      description:
        'Install jscodeshift when it is missing; otherwise a missing jscodeshift throws ERR_DEP_MISSING.',
      default: 'false',
    },
    {
      name: 'options.registry',
      type: 'boolean',
      description:
        'Only reconcile copied compositions from their install receipts; `from` is not required. Cannot be combined with `list`, `from`, `force`, `codemod`, `skipCodemod`, `integration` or `installDeps`.',
      default: 'false',
    },
    {
      name: 'options.list',
      type: 'boolean',
      description: 'Return the available codemods instead of running any.',
      default: 'false',
    },
    {
      name: 'ctx.cwd',
      type: 'string',
      description:
        'Any folder in the project to upgrade. The upgrade runs at the project root: the nearest folder at or above it whose package.json declares an Astryx package, or that a workspace whose root declares one lists, found without passing a repository root or counting the home folder. With no such folder, it runs in `ctx.cwd`. File paths in the result are relative to `ctx.cwd`, except that a run at the project root names copied-composition paths relative to the scanned source directory.',
      default: 'process.cwd()',
    },
  ],
  returns: [
    {
      type: 'upgrade.list',
      description:
        'Every available codemod, oldest→newest, as {name, title, version, optional}, returned when `list` is set; nothing is run.',
    },
    {
      type: 'upgrade.registry',
      description:
        'A dry-run or apply receipt for copied compositions, including safe updates, clean merges, conflicts, missing files, and invalid receipts.',
    },
    {
      type: 'upgrade.status',
      description:
        'A short-circuit outcome (no codemods executed): `up_to_date` (`from` is at/after the installed target and no `force`), `no_codemods` (none apply to the range), or `config_fixable` (dry-run preview that a pending config codemod would repair an invalid astryx.config). up_to_date and no_codemods carry the agent-docs summary and, when receipts are found, the copied-composition summary; config_fixable carries configError, configCodemods, suggestedCommand, message, note, and the agent-docs summary. When the installed Core is newer than the CLI, no_codemods and config_fixable also carry cliBehindCore ({cliVersion, command}): this CLI has no codemods for the releases after cliVersion, and command runs the same upgrade with the CLI release that matches the installed Core.',
    },
    {
      type: 'upgrade.run',
      description:
        'The terminal run receipt: from, to, codemods (count), integrations, agentDocs, agentDocsRefreshed, registryCompositions (when receipts are found), sourcePathFound (false when the resolved `path` does not exist, so nothing was scanned), filesChanged, transformsApplied, modifiedFiles, protectedFiles, declinedCandidates, errors, and complete. When a protected file still requires a change, complete is false and errorCode is ERR_CODEMOD_PROTECTED; the CLI exits nonzero while preserving the structured receipt. A run that fails after its codemods ran throws instead (see throws), and the thrown AstryxError carries the same receipt on `receipt`, with complete false and errorCode set to its code. When the installed Core is newer than the CLI, it also carries cliBehindCore ({cliVersion, command}): codemods for the releases after cliVersion did not run, and command runs the same upgrade with the matching CLI.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: '`from` is missing (and neither `list` nor `registry` is set); `list` and `registry` are both set; `list` is combined with `from`, `force`, `apply`, `path` (non-default), `codemod`, `skipCodemod`, `integration` or `installDeps`; `registry` is combined with `from`, `force`, `codemod`, `skipCodemod`, `integration` or `installDeps`; an `integration` specifier is invalid or not installed; or astryx.config fails to load or validate and no pending config codemod repairs it (when core codemods already wrote files, the error carries their receipt on `receipt`)',
    },
    {code: 'ERR_INVALID_VERSION', when: '`from` is not a valid semver string'},
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: '`path` resolves outside the project root',
    },
    {
      code: 'ERR_VERSION_DETECT',
      when: "the project has installed neither @astryxdesign/core nor legacy @xds/core in its own node_modules, nor, for a member its workspace lists, in a folder up to the workspace root (with no Astryx project, in `ctx.cwd`'s own node_modules); with `registry`, only when copied-composition receipts exist and @astryxdesign/core is not installed",
    },
    {
      code: 'ERR_DEP_MISSING',
      when: 'jscodeshift is missing and `installDeps` is not set, or installing it failed',
    },
    {
      code: 'ERR_UNKNOWN_CODEMOD',
      when: 'the version range has codemods but none remain selected: `codemod` names no codemod in the range, or `skipCodemod` excludes all of them',
    },
    {
      code: 'ERR_CODEMOD_FAILED',
      when: "one or more codemods failed, or a post-codemod hook failed, and no protected file still needs a change (otherwise an upgrade.run receipt with complete: false is returned). The error carries the run's receipt on `receipt`: the files already changed, each failure in errors, complete: false",
    },
    {
      code: 'ERR_CODEMOD_PROTECTION_SOURCE',
      when: 'a working-tree protection declaration cannot be read or parsed before writes begin, or after post-codemod hooks rewrite it (the error then carries the receipt on `receipt`)',
    },
  ],
  examples: [
    {
      label: 'List available codemods',
      code: 'const r = await upgrade({list: true});',
    },
    {label: 'Preview (dry-run)', code: "await upgrade({from: '0.0.5'});"},
    {
      label: 'Update copied compositions',
      code: 'await upgrade({registry: true, apply: true});',
    },
    {
      label: 'Apply changes',
      code: "await upgrade({from: '0.0.5', apply: true});",
    },
  ],
  command: 'upgrade',
  related: ['init', 'doctor'],
};
