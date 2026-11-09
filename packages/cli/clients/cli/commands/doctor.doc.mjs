// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx doctor`. The terminal binding of the `doctor()`
 * function (referenced via `fn`); it carries only CLI-surface facts so a
 * converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'doctor',
  displayName: 'astryx doctor',
  namespace: 'cli/commands',
  summary: 'Diagnose Astryx projects and integration packages',
  description:
    'Runs read-only project health diagnostics by default: Node version, @astryxdesign/core ' +
    'install and version alignment, theme packages, generated app themes when present, earlier copied-theme migration, config, integrations (every one astryx.config names must load, linked without a config entry, ' +
    'provider identity, contribution issues), agent docs, core peer dependencies, package manager, ' +
    "the docs the CLI reads, the newest release the computer knows of, with the install and upgrade commands when the project's release is older, and every `astryx` command on the search path, warning when the first one is not the Astryx CLI or predates the hand-off. It writes nothing, but loading astryx.config runs that file's code. " +
    'The `integration` subcommands provide authoring checks for one integration package. ' +
    'Outside a project it checks the computer instead: the Node version, the release that answered, ' +
    "the newest release this computer knows of, with the command that upgrades the CLI installed for the computer when it is older, the astryx commands on the search path, the integrations installed for the computer (warning about one it skips), and whether the computer-level agent text (`{@command init --user}`) is present, matches this release, was edited, or is turned off (info only); when that text names `astryx` and no `astryx` command is on the search path, apart from a package runner's own copy, it says so and names the install step the text records, or npm's when it records none. " +
    'It never fails a check because the folder has no project.',
  fn: 'doctor',
  subcommands: ['integration'],
  options: [
    {
      flag: '--built <path>',
      param: 'options.built',
      description:
        'Also check a finished build before you deliver it: a project folder, a build output folder, or one built HTML file. Fails when it does not use Astryx at all, and warns with each raw element, icon or custom style in its source.',
    },
  ],
  examples: [
    {label: 'Run project diagnostics', cli: 'astryx doctor'},
    {label: 'Machine-readable project report', cli: 'astryx doctor --json'},
    {
      label: 'Before you deliver a build: check that it uses Astryx',
      cli: 'astryx doctor --built dist',
    },
    {
      label: 'Validate an integration',
      cli: 'astryx doctor integration validate @acme/widgets',
    },
    {
      label: 'Check template ids against Core',
      cli: 'astryx doctor integration templates @acme/widgets',
    },
    {
      label: 'Check component names against Core',
      cli: 'astryx doctor integration components @acme/widgets',
    },
    {
      label: 'Classify doc overlaps with Core',
      cli: 'astryx doctor integration docs @acme/widgets',
    },
  ],
  outsideProject: 'own',
  exitCodes: [
    {code: 0, when: 'no checks failed (warnings are allowed)'},
    {code: 1, when: 'one or more checks failed'},
  ],
  related: ['init', 'upgrade'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, doctor checks your computer instead of a folder: `node-version`, `answering-release` (the version that answered), `newest-release`, `cli-on-path` (every astryx command on your PATH), `computer-integrations` (integrations installed globally), and `computer-agent-text` (the agent guide). It never fails a check because the folder has no project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:who-answers}.",
    },
  ],
};
