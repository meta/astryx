// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx doctor integration templates`.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'doctor integration templates',
  displayName: 'astryx doctor integration templates',
  namespace: 'cli/commands',
  summary: 'Validate integration template replacements and Core id overlaps',
  description:
    'Validates one local or installed integration against the built-in Core page ' +
    'and block template ids. Intentional replacements are informational and name ' +
    'the command for selecting the Core original. Missing targets, ambiguous ' +
    'replacements, and invalid declarations are errors; undeclared same-id overlaps ' +
    'remain warnings that require package selection.',
  fn: 'integrationTemplateConflicts',
  args: [
    {
      name: 'package',
      param: 'pkg',
      required: false,
      description:
        'Installed integration package name; omit to check the package in the current directory.',
    },
  ],
  examples: [
    {
      label: 'Check the local integration',
      cli: 'astryx doctor integration templates',
    },
    {
      label: 'Check an installed integration',
      cli: 'astryx doctor integration templates @acme/widgets --json',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'replacement declarations are valid; undeclared id conflicts are warnings',
    },
    {
      code: 1,
      when: 'the integration, a template, or a replacement declaration is invalid',
    },
  ],
  related: ['doctor integration validate', 'template'],
};
