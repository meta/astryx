// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Astryx CLI integrations the docsite documents. The canary site documents
 * every package here from the workspace. Production documents the ones that
 * are stable releases, from their published tarballs, and never loads a
 * canary-only package (src/lib/integrationTargets.mjs).
 */
export default {
  integrations: [
    '@astryxdesign/lab',
    '@astryxdesign/charts',
    '@astryxdesign/richtext',
    '@astryxdesign/vega',
  ],
};
