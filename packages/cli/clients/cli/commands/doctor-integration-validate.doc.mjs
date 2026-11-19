// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx doctor integration validate`.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'doctor integration validate',
  displayName: 'astryx doctor integration validate',
  namespace: 'cli/commands',
  summary: 'Validate an integration manifest and its contributions',
  description:
    'Validates one integration at a time: the local package rooted at cwd, or an ' +
    'installed package resolved by name. It schema-checks the manifest, verifies ' +
    'every declared contribution root, and reports every finding. Safe as a CI gate. ' +
    'It then checks every doc the package ships under its roots against the ' +
    "published authoring type for its kind, with the project's own `typescript` (or, " +
    'where `typescript` is missing or has no JavaScript compiler API, as TypeScript 7 ' +
    'does, the `@typescript/typescript6` it installs), and ' +
    'warns about each field that does not match, naming the field and a fix. A doc ' +
    'it cannot fully check is listed with the reason, and test fixtures under ' +
    '`__tests__` in the components or docs root are counted, not checked. Without ' +
    'TypeScript it prints one line saying the docs were not type-checked. ' +
    'Outside a package, with no package name it writes nothing and reports one no_package issue (exit 1); ' +
    'a package name is looked up as it is in a project.',
  fn: 'validateIntegration',
  args: [
    {
      name: 'package',
      param: 'pkg',
      required: false,
      description:
        'Installed integration package name; omit to validate the package in the current directory.',
    },
  ],
  examples: [
    {
      label: 'Validate the local package',
      cli: 'astryx doctor integration validate',
    },
    {
      label: 'Validate an installed package',
      cli: 'astryx doctor integration validate @acme/widgets --json',
    },
  ],
  outsideProject: 'own',
  exitCodes: [
    {
      code: 0,
      when: 'no error-severity issues (warnings, including doc type findings, are allowed)',
    },
    {code: 1, when: 'one or more error-severity issues'},
  ],
  related: ['doctor integration templates', 'template'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a package, with no package named, it writes nothing, reports one `no_package` issue, and exits 1; a package name is looked up as it is in a project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:global-integrations}.",
    },
  ],
};
