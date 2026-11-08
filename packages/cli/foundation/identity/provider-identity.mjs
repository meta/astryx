// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Canonical provider, artifact, and immutable-instance identity helpers.
 *
 * IDs use versioned, RFC 3986-escaped path segments. Provider package names are
 * case-insensitive and normalize to lowercase. Artifact names preserve case and
 * normalize Unicode to NFC.
 */

/** @typedef {import('../../authoring/identity/type').ArtifactId} ArtifactId */
/** @typedef {import('../../authoring/identity/type').ArtifactIdentity} ArtifactIdentity */
/** @typedef {import('../../authoring/identity/type').AuthoredDoc} AuthoredDoc */
/** @typedef {import('../../authoring/identity/type').AuthoredDocEntry} AuthoredDocEntry */
/** @typedef {import('../../authoring/doctypes/base/type').AuthoredDocKind} AuthoredDocKind */
/** @typedef {import('../../authoring/identity/type').ContentDigest} ContentDigest */
/** @typedef {import('../../authoring/identity/type').ContributionKind} ContributionKind */
/** @typedef {import('../../authoring/identity/type').DocId} DocId */
/** @typedef {import('../../authoring/identity/type').ProviderId} ProviderId */
/** @typedef {import('../../authoring/identity/type').ProviderInstance} ProviderInstance */
/** @typedef {import('../../authoring/identity/type').ProviderInstanceId} ProviderInstanceId */

const ARTIFACT_PREFIX = 'astryx:artifact:v1/';
const PROVIDER_INSTANCE_PREFIX = 'astryx:provider-instance:v1/';
const PACKAGE_NAME_RE =
  /^(?:@[a-z0-9][a-z0-9._~!*'()-]*\/)?[a-z0-9][a-z0-9._~!*'()-]*$/u;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/u;

/** @type {ReadonlySet<ContributionKind>} */
const CONTRIBUTION_KINDS = new Set([
  'component',
  'function',
  'generic',
  'page',
  'block',
  'schema',
  'command',
  'enum',
  'namespace',
  'icon-definition',
  'theme',
  'codemod',
  'agent-doc',
]);

/** @type {ReadonlySet<AuthoredDocKind>} */
const DOC_KINDS = new Set([
  'component',
  'function',
  'generic',
  'page',
  'block',
  'schema',
  'command',
  'enum',
  'namespace',
  'icon-definition',
]);

/** RFC 3986 path-segment encoding with uppercase escapes. */
/** @param {string} value @returns {string} */
function encodeSegment(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Decode one identity segment or throw a stable, readable error. */
/** @param {string} value @param {string} label @returns {string} */
function decodeSegment(value, label) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`${label} contains invalid percent escaping.`);
  }
}

/** Normalize a required identity string without changing meaningful case. */
/** @param {unknown} value @param {string} label @returns {string} */
function normalizeName(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim().normalize('NFC');
}

/**
 * Normalize an npm package name into a ProviderId.
 * @param {string} packageName
 * @returns {ProviderId}
 */
export function normalizeProviderId(packageName) {
  const normalized = normalizeName(packageName, 'Provider ID').toLowerCase();
  if (!PACKAGE_NAME_RE.test(normalized)) {
    throw new Error(
      `Provider ID "${packageName}" must be a bare npm package name.`,
    );
  }
  return /** @type {ProviderId} */ (normalized);
}

/**
 * Normalize a SHA-256 digest.
 * @param {string} digest
 * @returns {ContentDigest}
 */
export function normalizeContentDigest(digest) {
  const normalized = normalizeName(digest, 'Content digest').toLowerCase();
  if (!SHA256_RE.test(normalized)) {
    throw new Error(
      'Content digest must use sha256:<64 lowercase hex characters>.',
    );
  }
  return /** @type {ContentDigest} */ (normalized);
}

/**
 * Build a stable provider + contribution kind + artifact-name ID.
 * @param {string} provider
 * @param {ContributionKind} kind
 * @param {string} name
 * @returns {ArtifactId}
 */
export function createArtifactId(provider, kind, name) {
  const providerId = normalizeProviderId(provider);
  if (!CONTRIBUTION_KINDS.has(kind)) {
    throw new Error(`Unknown contribution kind "${String(kind)}".`);
  }
  const stableName = normalizeName(name, 'Artifact name');
  return /** @type {ArtifactId} */ (
    `${ARTIFACT_PREFIX}${encodeSegment(providerId)}/${kind}/${encodeSegment(stableName)}`
  );
}

/**
 * Build a stable document ID from provider + authored kind + stable name.
 * @param {string} provider
 * @param {AuthoredDocKind} kind
 * @param {string} name
 * @returns {DocId}
 */
export function createDocId(provider, kind, name) {
  if (!DOC_KINDS.has(kind)) {
    throw new Error(`Unknown authored doc kind "${String(kind)}".`);
  }
  return /** @type {DocId} */ (createArtifactId(provider, kind, name));
}

/**
 * Build a normalized logical artifact record.
 * @param {string} provider
 * @param {ContributionKind} kind
 * @param {string} name
 * @returns {ArtifactIdentity}
 */
export function createArtifactIdentity(provider, kind, name) {
  const providerId = normalizeProviderId(provider);
  const stableName = normalizeName(name, 'Artifact name');
  return Object.freeze({
    id: createArtifactId(providerId, kind, stableName),
    providerId,
    kind,
    name: stableName,
  });
}

/**
 * Parse and canonicalize an ArtifactId.
 * @param {string} value
 * @returns {ArtifactIdentity}
 */
export function parseArtifactId(value) {
  if (typeof value !== 'string' || !value.startsWith(ARTIFACT_PREFIX)) {
    throw new Error(`Artifact ID must start with "${ARTIFACT_PREFIX}".`);
  }
  const segments = value.slice(ARTIFACT_PREFIX.length).split('/');
  if (segments.length !== 3) {
    throw new Error(
      'Artifact ID must contain provider, kind, and name segments.',
    );
  }
  const provider = decodeSegment(segments[0], 'Artifact provider');
  const kind = decodeSegment(segments[1], 'Artifact kind');
  const name = decodeSegment(segments[2], 'Artifact name');
  if (!CONTRIBUTION_KINDS.has(/** @type {ContributionKind} */ (kind))) {
    throw new Error(`Unknown contribution kind "${kind}".`);
  }
  const identity = createArtifactIdentity(
    provider,
    /** @type {ContributionKind} */ (kind),
    name,
  );
  if (identity.id !== value) {
    throw new Error('Artifact ID is not in canonical serialized form.');
  }
  return identity;
}

/**
 * Build one immutable provider instance.
 * @param {{providerId: string, packageName: string, packageVersion: string, sourceDigest: string}} input
 * @returns {ProviderInstance}
 */
export function createProviderInstance(input) {
  const providerId = normalizeProviderId(input.providerId);
  const packageName = normalizeProviderId(input.packageName);
  const packageVersion = normalizeName(input.packageVersion, 'Package version');
  const sourceDigest = normalizeContentDigest(input.sourceDigest);
  const id = /** @type {ProviderInstanceId} */ (
    `${PROVIDER_INSTANCE_PREFIX}${encodeSegment(providerId)}/${encodeSegment(packageName)}/${encodeSegment(packageVersion)}/${encodeSegment(sourceDigest)}`
  );
  return Object.freeze({
    id,
    providerId,
    packageName,
    packageVersion,
    sourceDigest,
  });
}

/** Normalize a package-relative source path to forward slashes. */
/** @param {unknown} value @returns {string} */
function normalizeSourcePath(value) {
  const normalized = normalizeName(value, 'Source path').replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//u.test(normalized) ||
    segments.some(
      segment => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('Source path must be a normalized package-relative path.');
  }
  return normalized;
}

/** Infer an unstamped legacy document's kind from its required shape. */
/** @param {AuthoredDoc} authored @returns {AuthoredDocKind} */
function authoredKindOf(authored) {
  if (authored.type != null) return authored.type;
  if ('params' in authored && 'returns' in authored) return 'function';
  if (
    'props' in authored ||
    'components' in authored ||
    'subComponentOf' in authored
  ) {
    return 'component';
  }
  if ('sections' in authored && 'title' in authored) return 'generic';
  throw new Error('Cannot infer the kind of an unstamped authored document.');
}

/** Clone and recursively freeze plain authored data. */
/** @template T @param {T} value @returns {T} */
function frozenClone(value) {
  const clone = structuredClone(value);
  const seen = new WeakSet();
  /** @param {unknown} current */
  const freeze = current => {
    if (
      current == null ||
      typeof current !== 'object' ||
      Object.isFrozen(current) ||
      seen.has(current)
    ) {
      return;
    }
    seen.add(current);
    for (const nested of Object.values(current)) freeze(nested);
    Object.freeze(current);
  };
  freeze(clone);
  return clone;
}

/**
 * Bind one validated authored document to immutable provider and source
 * provenance. Runtime lifecycle state is intentionally absent.
 * @param {{
 *   provider: ProviderInstance,
 *   kind: AuthoredDocKind,
 *   stableName: string,
 *   source: {group: string, path: string, digest: string},
 *   authored: AuthoredDoc,
 * }} input
 * @returns {AuthoredDocEntry}
 */
export function createAuthoredDocEntry(input) {
  const stableName = normalizeName(input.stableName, 'Stable document name');
  const group = normalizeName(input.source.group, 'Source group');
  const sourcePath = normalizeSourcePath(input.source.path);
  const digest = normalizeContentDigest(input.source.digest);
  const authoredKind = authoredKindOf(input.authored);
  if (authoredKind !== input.kind) {
    throw new Error(
      `Document kind "${input.kind}" does not match authored type "${authoredKind}".`,
    );
  }

  const provider = createProviderInstance({
    providerId: input.provider.providerId,
    packageName: input.provider.packageName,
    packageVersion: input.provider.packageVersion,
    sourceDigest: input.provider.sourceDigest,
  });
  if (provider.id !== input.provider.id) {
    throw new Error(
      'Provider instance ID does not match its immutable fields.',
    );
  }

  return Object.freeze({
    id: createDocId(provider.providerId, input.kind, stableName),
    provider,
    kind: input.kind,
    stableName,
    source: Object.freeze({group, path: sourcePath, digest}),
    authored: frozenClone(input.authored),
  });
}
