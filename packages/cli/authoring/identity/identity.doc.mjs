// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for provider, artifact, and immutable instance identity.
 * @position packages/cli/authoring/identity — identity documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'provider-identity',
  displayName: 'Provider and artifact identity',
  namespace: 'authoring',
  description:
    "Separates stable provider/artifact identity from package instances and runtime lifecycle state. Provider identity names integration manifests and settles provider conflicts. Docs-tree nodes are identified by doc identity; the tree covers the CLI's docs and each integration's. Artifact IDs for kinds outside the docs tree, provider instances, and compiler-input entries are defined for every provider-owned artifact; no command builds them.",
  appliesTo:
    'Integration manifests, provider conflicts, and docs-tree node ids.',
  fields: [
    {
      name: 'ProviderId',
      type: 'string',
      description:
        'Canonical logical provider ID. It defaults to the lowercase npm package name; Core uses the same model without publishing an integration manifest.',
      required: true,
    },
    {
      name: 'ArtifactId',
      type: 'string',
      description:
        'Versioned serialization of provider ID, contribution kind, and stable artifact name. Every segment uses RFC 3986 escaping.',
      required: true,
    },
    {
      name: 'DocId',
      type: 'ArtifactId',
      description:
        'Artifact ID restricted to one authored doc kind. Navigation changes do not change it.',
      required: true,
    },
    {
      name: 'ProviderInstance',
      type: '{ id; providerId; packageName; packageVersion; sourceDigest }',
      description:
        'One immutable package version and source/content digest. It carries no installed, configured, loaded, selected, or healthy state.',
      required: true,
    },
    {
      name: 'AuthoredDocEntry',
      type: '{ id; provider; kind; stableName; source; authored }',
      description:
        'Normalized compiler input. `stableName`, the key in its doc ID, is given separately from the authored display name; source paths remain package-relative, and provider provenance plus the authored snapshot are immutable.',
      required: true,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'Provider package renames require an explicit mapping: a ProviderInstance may retain its stable providerId while packageName changes. Silent identity changes are not inferred.',
    },
  ],
};
