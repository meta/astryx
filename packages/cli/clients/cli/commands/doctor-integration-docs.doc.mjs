// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx doctor integration docs`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'doctor integration docs',
  displayName: 'astryx doctor integration docs',
  namespace: 'cli/commands',
  summary:
    "Check an integration's docs: the docs tree they add, every link, and overlaps with Core topics",
  description:
    'Checks the docs tree the package adds, every link in its docs, and overlaps with Core topics. ' +
    'Intentional replacements and extensions are information. ' +
    'A same-name topic without `replaces` or `extends` is an accidental conflict ' +
    'and fails until the author declares the relationship or renames it. ' +
    'It also lists each pair of topics (two of the package, or one of them and a Core topic other than the one it replaces) ' +
    'that repeat 10 or more words of prose word for word, each padding phrase and low-density topic, ' +
    'and each written `{@command docs <name>}` that should be a link, ' +
    'each as a warning (`copied_passage`, `doc_fluff`, `stray_doc_pointer`; exit 0, and `integration check --strict` fails on it). See {@link generic:check-your-docs}.',
  fn: 'integrationDocConflicts',
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
      cli: 'astryx doctor integration docs',
    },
    {
      label: 'Check an installed integration',
      cli: 'astryx doctor integration docs @acme/widgets --json',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'all Core overlaps are explicitly declared or no overlap exists',
    },
    {
      code: 1,
      when: 'an overlap is accidental, a doc is invalid, a namespace or placement fails, or a reference block cannot include what it names. A link that names no doc is a warning, and does not change the exit code',
    },
  ],
  related: ['doctor integration validate', 'docs'],
};
