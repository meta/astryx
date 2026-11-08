// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx blog`. The terminal binding of the `blog()`
 * function (referenced via `fn`); its args/flags map to that function's params
 * so a converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'blog',
  displayName: 'astryx blog',
  namespace: 'cli/commands',
  summary: 'Read the Astryx blog from the published feed',
  description:
    'Reads the design-system blog over its published RSS feed (never the source ' +
    "files). With no slug it lists every post; with a slug it reads that post's " +
    'full plaintext body.',
  fn: 'blog',
  args: [{name: 'slug', param: 'slug', required: false}],
  examples: [
    {label: 'List posts', cli: 'astryx blog'},
    {label: 'Read one post', cli: 'astryx blog introducing-astryx --json'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {code: 1, when: 'unknown slug, or the feed or a post cannot be fetched'},
  ],
  related: ['docs', 'search'],
};
