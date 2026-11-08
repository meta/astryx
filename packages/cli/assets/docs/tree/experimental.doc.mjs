// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/experimental`: the one docs route for experimental
 * features (spec:AST-017 FR27). Each experimental feature's docs place
 * themselves here, so nothing under this route reads as stable.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'experimental',
  placement: {parent: 'namespace:cli', slot: 'guides', order: 90},
  stability: 'experimental',
  title: 'Experimental features',
  summary:
    'Features you can try now that may change or be removed in a patch release.',
  keywords: ['experimental', 'experiment', 'preview', 'unstable'],
  slots: {
    guides: {
      title: 'Experimental features',
      accepts: {kinds: ['generic', 'namespace']},
    },
  },
  blocks: [
    {
      type: 'prose',
      text: 'Everything here is experimental: its commands (under `astryx experimental`), configuration (under `experimental` in astryx.config and in an integration manifest), output, and docs may change or be removed in any patch release, with no deprecation period. Nothing here changes what the rest of Astryx does unless you use it. A feature leaves this section when it becomes stable.',
    },
  ],
};
