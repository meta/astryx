// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'integration',
  displayName: 'astryx integration',
  namespace: 'cli/commands',
  summary: 'Author and verify an Astryx integration package',
  description:
    'Add contributions to your package, check them on every build with `integration check --strict`, then check the packed package the way an app receives it. The guides start at {@link namespace:authoring}.',
  subcommands: ['add', 'check', 'verify', 'pack'],
  examples: [
    {
      label: 'Add a component',
      cli: 'astryx integration add component AcmeWidget',
    },
    {
      label: 'Check the package in CI, as part of its build',
      cli: 'astryx integration check --strict',
    },
    {
      label: 'Check the package before publishing',
      cli: 'astryx integration verify',
    },
  ],
  exitCodes: [
    {code: 0, when: 'help is shown or a subcommand succeeds'},
    {code: 1, when: 'an unknown subcommand is provided'},
  ],
  related: ['doctor integration', 'theme add'],
};
