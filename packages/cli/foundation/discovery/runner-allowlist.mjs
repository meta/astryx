// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Where a runner may stand in front of an Astryx command in Astryx's own
 * docs. Docs write commands bare (`astryx <command>`): the CLI prefixes each
 * one with the reader's command when it prints a doc, and the docsite with
 * `npx @astryxdesign/cli`. A few files show a runner on purpose, and some files
 * are not docs at all. The rules, checked by test/runner-commands.test.mjs:
 *
 * - npx (or another download runner) with the unscoped name `astryx` is never
 *   written outside `skip`: it fetches an unrelated npm package.
 * - In a doc (`*.doc.mjs`, and Core's docs.mjs), no runner precedes an Astryx
 *   command, except in `runnerExamples`, where `npx @astryxdesign/cli …` and a
 *   project's runner may (still never the unscoped name through npx).
 *
 * The matcher is runnerCommandsIn (foundation/discovery/runner-commands.mjs),
 * the rule `doctor integration validate` holds integrations to.
 *
 * @input  nothing
 * @output the allowlist
 * @position packages/cli/foundation/discovery — data shared by the repo test
 *   and the Doctor runner check
 */

export const RUNNER_COMMAND_ALLOWLIST = Object.freeze({
  /** Files never scanned: release notes, tests, and the helpers that build runner forms. */
  skip: Object.freeze([
    /(^|\/)CHANGELOG\.md$/u,
    /\.test\.[cm]?[jt]sx?$/u,
    /(^|\/)__tests__\//u,
    /^packages\/cli\/test\//u,
    /^packages\/cli\/foundation\/env\/package-manager\.mjs$/u,
  ]),
  /** Docs that show a runner on purpose, and why. */
  runnerExamples: Object.freeze({
    'packages/core/docs.mjs':
      "Core's setup banner, for a project that has no CLI installed yet",
    'packages/cli/assets/docs/tree/updates.doc.mjs':
      "quotes the CLI's own update notice, which names the project's runner",
    'packages/cli/assets/docs/tree/cli-command.doc.mjs':
      'explains how printed commands start, the pinned `npx @astryxdesign/cli@<version>` among them',
    'packages/cli/assets/docs/tree/who-answers.doc.mjs':
      'explains how printed commands start, the pinned `npx @astryxdesign/cli@<version>` among them',
    'packages/cli/assets/docs/tree/project-global-or-both.doc.mjs':
      'compares running the CLI with npx to installing it, and is found by searching for that command',
    'packages/cli/assets/docs/tree/install-once.doc.mjs':
      'names a pinned release, `npx @astryxdesign/cli@<version>`, which answers as that version',
    'packages/cli/assets/docs/tree/doc-syntax.doc.mjs':
      'shows what each doc token renders as, in every package manager',
    'packages/cli/assets/docs/tree/add-a-topic.doc.mjs':
      'shows what a reader sees for a command token, with their runner',
    'packages/cli/clients/cli/commands/upgrade.doc.mjs':
      'quotes the command upgrade prints when the CLI is older than Core, pinned to the matching release',
  }),
});
