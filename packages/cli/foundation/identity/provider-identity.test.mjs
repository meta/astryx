// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {
  createArtifactId,
  createArtifactIdentity,
  createAuthoredDocEntry,
  createDocId,
  createProviderInstance,
  normalizeContentDigest,
  normalizeProviderId,
  parseArtifactId,
} from './provider-identity.mjs';
import {CLI_PROVIDER_ID, CORE_PROVIDER_ID} from './providers.mjs';

const DIGEST_A = `sha256:${'a'.repeat(64)}`;
const DIGEST_B = `sha256:${'b'.repeat(64)}`;

describe('provider identity', () => {
  it('uses the same canonical model for built-in providers', () => {
    expect(CORE_PROVIDER_ID).toBe('@astryxdesign/core');
    expect(CLI_PROVIDER_ID).toBe('@astryxdesign/cli');
  });

  it('normalizes npm package identity once', () => {
    expect(normalizeProviderId(' @AstryxDesign/CLI ')).toBe(
      '@astryxdesign/cli',
    );
    expect(() => normalizeProviderId('../cli')).toThrow(
      /bare npm package name/u,
    );
  });

  it('normalizes content digests', () => {
    expect(normalizeContentDigest(DIGEST_A.toUpperCase())).toBe(DIGEST_A);
    expect(() => normalizeContentDigest('sha256:nope')).toThrow(/sha256/u);
  });

  it('keeps provider, kind, and case-sensitive artifact name in the ID', () => {
    const component = createArtifactId('@acme/ui', 'component', 'Button');
    expect(component).not.toBe(
      createArtifactId('@acme/ui', 'component', 'button'),
    );
    expect(component).not.toBe(
      createArtifactId('@acme/ui', 'schema', 'Button'),
    );
    expect(component).not.toBe(
      createArtifactId('@other/ui', 'component', 'Button'),
    );
  });

  it('escapes segments canonically and round-trips without collisions', () => {
    const identity = createArtifactIdentity(
      '@acme/ui',
      'generic',
      'Deploy / 100%',
    );
    expect(identity.id).toContain('Deploy%20%2F%20100%25');
    expect(parseArtifactId(identity.id)).toEqual(identity);
    expect(() => parseArtifactId(identity.id.replace('%2F', '%2f'))).toThrow(
      /canonical/u,
    );
  });

  it('uses the same stable ID across immutable provider instances', () => {
    const docId = createDocId('@acme/ui', 'schema', 'integration');
    const first = createProviderInstance({
      providerId: '@acme/ui',
      packageName: '@acme/ui',
      packageVersion: '1.0.0',
      sourceDigest: DIGEST_A,
    });
    const second = createProviderInstance({
      providerId: '@acme/ui',
      packageName: '@acme/ui',
      packageVersion: '1.0.1',
      sourceDigest: DIGEST_B,
    });
    expect(first.id).not.toBe(second.id);
    expect(createDocId(first.providerId, 'schema', 'integration')).toBe(docId);
    expect(createDocId(second.providerId, 'schema', 'integration')).toBe(docId);
  });

  it('supports an explicit stable provider ID across a package rename', () => {
    const instance = createProviderInstance({
      providerId: '@acme/ui',
      packageName: '@acme/design-system',
      packageVersion: '2.0.0',
      sourceDigest: DIGEST_A,
    });
    expect(instance.providerId).toBe('@acme/ui');
    expect(instance.packageName).toBe('@acme/design-system');
  });

  it('binds a doc to stable identity and immutable source provenance', () => {
    const provider = createProviderInstance({
      providerId: '@acme/ui',
      packageName: '@acme/ui',
      packageVersion: '1.0.0',
      sourceDigest: DIGEST_A,
    });
    const authored = {
      type: 'schema',
      name: 'integration',
      displayName: 'Integration',
      description: 'The integration manifest.',
      fields: [],
    };

    const entry = createAuthoredDocEntry({
      provider,
      kind: 'schema',
      stableName: 'integration',
      source: {
        group: 'cli-api',
        path: 'authoring/integration/integration.doc.mjs',
        digest: DIGEST_B,
      },
      authored,
    });

    expect(entry.id).toBe(createDocId('@acme/ui', 'schema', 'integration'));
    expect(entry.provider).toEqual(provider);
    expect(entry.stableName).toBe('integration');
    expect(entry.source.digest).toBe(DIGEST_B);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.provider)).toBe(true);
    expect(Object.isFrozen(entry.source)).toBe(true);
    expect(Object.isFrozen(entry.authored)).toBe(true);

    authored.name = 'mutated';
    expect(entry.authored.name).toBe('integration');
  });

  it('uses a discovery-owned stable name when authored display names collide', () => {
    const provider = createProviderInstance({
      providerId: '@astryxdesign/core',
      packageName: '@astryxdesign/core',
      packageVersion: '1.0.0',
      sourceDigest: DIGEST_A,
    });
    const authored = {
      type: 'block',
      name: 'Banner — Statuses',
      description: 'A template.',
    };
    const makeEntry = stableName =>
      createAuthoredDocEntry({
        provider,
        kind: 'block',
        stableName,
        source: {
          group: 'templates',
          path: `templates/${stableName}.doc.mjs`,
          digest: DIGEST_B,
        },
        authored,
      });

    expect(makeEntry('BannerShowcase').id).not.toBe(
      makeEntry('BannerStatuses').id,
    );
  });

  it('correlates an unstamped legacy reference doc with generic identity', () => {
    const provider = createProviderInstance({
      providerId: '@acme/ui',
      packageName: '@acme/ui',
      packageVersion: '1.0.0',
      sourceDigest: DIGEST_A,
    });
    const entry = createAuthoredDocEntry({
      provider,
      kind: 'generic',
      stableName: 'theming',
      source: {group: 'guides', path: 'docs/theming.doc.mjs', digest: DIGEST_B},
      authored: {
        name: 'theming',
        title: 'Theming',
        description: 'How theming works.',
        sections: [],
      },
    });
    expect(entry.kind).toBe('generic');
  });

  it('rejects doc-entry identity that disagrees with stamped or legacy content', () => {
    const provider = createProviderInstance({
      providerId: '@acme/ui',
      packageName: '@acme/ui',
      packageVersion: '1.0.0',
      sourceDigest: DIGEST_A,
    });
    const source = {
      group: 'cli-api',
      path: 'integration.doc.mjs',
      digest: DIGEST_B,
    };

    expect(() =>
      createAuthoredDocEntry({
        provider,
        kind: 'command',
        stableName: 'integration',
        source,
        authored: {
          type: 'schema',
          name: 'integration',
          displayName: 'Integration',
          description: 'The integration manifest.',
          fields: [],
        },
      }),
    ).toThrow(/does not match authored type/u);

    expect(() =>
      createAuthoredDocEntry({
        provider,
        kind: 'enum',
        stableName: 'Button',
        source,
        authored: {name: 'Button', props: []},
      }),
    ).toThrow(/does not match authored type "component"/u);
  });

  it('rejects source paths that escape the provider package', () => {
    const provider = createProviderInstance({
      providerId: '@acme/ui',
      packageName: '@acme/ui',
      packageVersion: '1.0.0',
      sourceDigest: DIGEST_A,
    });
    expect(() =>
      createAuthoredDocEntry({
        provider,
        kind: 'schema',
        stableName: 'integration',
        source: {
          group: 'cli-api',
          path: '../outside.doc.mjs',
          digest: DIGEST_B,
        },
        authored: {
          type: 'schema',
          name: 'integration',
          displayName: 'Integration',
          description: 'The integration manifest.',
          fields: [],
        },
      }),
    ).toThrow(/package-relative path/u);
  });
});
