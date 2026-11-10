// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'integration add',
  displayName: 'astryx integration add',
  namespace: 'cli/commands',
  summary: 'Add one working contribution to an integration package',
  description:
    'Writes the files one contribution needs, creates the integration manifest on first use, and declares a root only after a contribution the CLI can read exists behind it. A component or template import also needs an `exports` entry: add writes one only when package.json already has an `exports` map, so start a new package with `"exports": {}`. See {@link generic:quick-start}.',
  fn: 'integrationAdd',
  args: [
    {
      name: 'kind',
      param: 'kind',
      required: true,
      description: 'component, doc, template, codemod, agent-doc, or theme',
    },
    {
      name: 'name',
      param: 'name',
      required: true,
      description:
        'Contribution name: PascalCase for component (AcmeWidget); lowercase kebab-case for template, codemod, and theme (account-card); letters, digits, _ and - for doc; the literal guidance line for agent-doc',
    },
  ],
  options: [
    {
      flag: '--dry-run',
      param: 'options.dryRun',
      description: 'Validate and show planned writes without changing files',
    },
    {
      flag: '--type <type>',
      param: 'options.templateType',
      choices: ['page', 'block'],
      description:
        'Template type: page (default) or block; only valid for template',
    },
    {
      flag: '--replaces <topic>',
      param: 'options.replaces',
      description:
        'Existing doc topic this one replaces (letters, digits, _ and -); only valid for doc and not with --extends',
    },
    {
      flag: '--extends <topic>',
      param: 'options.extends',
      description:
        'Existing doc topic this one extends (letters, digits, _ and -); only valid for doc and not with --replaces',
    },
    {
      flag: '--parent <namespace>',
      param: 'options.parent',
      description:
        "Namespace of this package to place the doc in, as a guide in its `guides` slot; writes the namespace doc when it is missing, and declares the CLI that reads it as an optional `@astryxdesign/cli` peer. Only valid for doc, and not with --replaces or --extends",
    },
    {
      flag: '--from <theme>',
      param: 'options.from',
      description:
        'Existing theme slug to fork as a starting point instead of a blank scaffold; the new theme copies the base and has no link back, and package.json `dependencies` gains the npm packages the copied files import (other than Core and React). Only valid for theme',
    },
    {
      flag: '--to <version>',
      param: 'options.to',
      description:
        'Exact semver of the @astryxdesign/core version whose upgrade runs the codemod (e.g. 0.7.0); required for codemod and only valid there',
    },
  ],
  examples: [
    {
      label: 'Preview',
      cli: 'astryx integration add component AcmeWidget --dry-run --json',
    },
    {
      label: 'Add a component',
      cli: 'astryx integration add component AcmeWidget',
    },
    {label: 'Add a doc topic', cli: 'astryx integration add doc deploying'},
    {
      label: 'Add a page template',
      cli: 'astryx integration add template acme-dashboard',
    },
    {
      label: 'Add a block template',
      cli: 'astryx integration add template account-card --type block',
    },
    {
      label: 'Replace a doc topic',
      cli: 'astryx integration add doc acme-getting-started --replaces getting-started',
    },
    {
      label: 'Extend a doc topic',
      cli: 'astryx integration add doc acme-theming --extends theme',
    },
    {
      label: 'Add a guide to the package\'s own docs section',
      cli: 'astryx integration add doc releasing --parent acme',
    },
    {
      label: 'Add a codemod',
      cli: 'astryx integration add codemod rename-widget --to 1.2.0',
    },
    {
      label: 'Add agent guidance',
      cli: "astryx integration add agent-doc 'Run acme verify before finishing.'",
    },
    {label: 'Add a source theme', cli: 'astryx integration add theme ocean'},
    {
      label: 'Fork an existing theme',
      cli: 'astryx integration add theme ocean --from neutral',
    },
  ],
  outsideProject: 'refuse',
  exitCodes: [
    {code: 0, when: 'the contribution is written or the dry run succeeds'},
    {
      code: 1,
      when: 'the kind, name, options, package, or target files are invalid or conflict',
    },
  ],
  related: ['integration verify', 'doctor integration validate', 'theme add'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a package, integration add writes nothing and stops with `ERR_FILE_NOT_FOUND`: \"No package.json found. Run this command inside an integration package.\" In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:global-integrations}.",
    },
  ],
};
