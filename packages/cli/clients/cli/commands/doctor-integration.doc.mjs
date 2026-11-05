// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for the `astryx doctor integration` authoring-check group.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'doctor integration',
  displayName: 'astryx doctor integration',
  namespace: 'cli/commands',
  summary: 'Check an integration package while authoring it',
  description:
    'The integration-authoring diagnostics group. Validate a manifest and all ' +
    'contributions with `validate`, or check templates, components, and docs ' +
    'against built-in Core identities before publishing. Theme catalogs are checked by validate.',
  subcommands: ['validate', 'templates', 'components', 'docs'],
  examples: [
    {
      label: 'Validate a local integration',
      cli: 'astryx doctor integration validate',
    },
    {
      label: 'Check template ids against Core',
      cli: 'astryx doctor integration templates',
    },
    {
      label: 'Check component names against Core',
      cli: 'astryx doctor integration components',
    },
    {
      label: 'Classify doc overlaps with Core',
      cli: 'astryx doctor integration docs',
    },
  ],
  exitCodes: [
    {code: 0, when: 'help is shown or the selected check has no errors'},
    {code: 1, when: 'the selected check reports an error'},
  ],
  related: ['doctor', 'component', 'template', 'docs'],
};
