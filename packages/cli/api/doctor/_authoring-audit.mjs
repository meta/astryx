// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What Doctor's authoring-docs check reads, kept apart from the public
 *   doctor API: api/doctor/doctor.mjs reports it, and
 *   scripts/generate-self-audit.mjs stores it at publish.
 */

import {DocsCatalog} from '../../foundation/discovery/docs-discovery.mjs';
import {storedSelfAudit} from '../../foundation/discovery/stored-self-audit.mjs';
import {indexView} from '../../foundation/doc-compiler/lenses.mjs';
import {guideEntry, lowerTopic, projectTree} from '../docs/_adapter.mjs';

/**
 * @typedef {object} AuthoringAuditData
 * @property {Awaited<ReturnType<typeof import('../../foundation/discovery/authoring-self-docs.mjs').auditAuthoringSelfDocs>>} audit
 * @property {{keys: Set<string> | null, error?: string}} topic - The field
 *   reference's section keys, or why they could not be read.
 * @property {Awaited<ReturnType<typeof import('../../foundation/discovery/authoring-surface.mjs').auditAuthoringSurface>>} surface
 */

/**
 * The section keys the field reference lists (`astryx docs
 * authoring/field-reference --index`), read the way that command reads them.
 * @returns {Promise<{keys: Set<string>} | {keys: null, error: string}>}
 */
async function authoringTopicKeys() {
  try {
    const {AUTHORING_REFERENCE_ROUTE} =
      await import('../../foundation/discovery/authoring-self-docs.mjs');
    const catalog = DocsCatalog.fromBuiltins();
    const node = (await projectTree(catalog)).get(AUTHORING_REFERENCE_ROUTE);
    if (!node?.ref?.topicFile) {
      return {keys: null, error: 'the docs tree has no field reference'};
    }
    const index = indexView(await lowerTopic(catalog, guideEntry(node)));
    return {keys: new Set(index.sections.map(section => section.id))};
  } catch (err) {
    return {
      keys: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * What the authoring-docs check reads: the self-docs audit, the field
 * reference's section keys, and the authoring-surface audit. They read only
 * the CLI's own files, so `prepack` stores them for the published package
 * (scripts/generate-self-audit.mjs).
 * @param {{root?: string, sources?: string[], topicKeys?: Set<string> | null}} [options]
 * @returns {Promise<AuthoringAuditData>}
 */
export async function authoringAuditData(options = {}) {
  const {auditAuthoringSelfDocs} =
    await import('../../foundation/discovery/authoring-self-docs.mjs');
  const {auditAuthoringSurface} =
    await import('../../foundation/discovery/authoring-surface.mjs');
  const {root, sources} = options;
  const audit = await auditAuthoringSelfDocs({root, sources});
  const topic =
    options.topicKeys === undefined
      ? await authoringTopicKeys()
      : {keys: options.topicKeys};
  const surface = await auditAuthoringSurface({
    root,
    sources,
    topicKeys: topic.keys,
  });
  return {audit, topic, surface};
}

/** The name the authoring-docs check's data is stored under. */
export const AUTHORING_AUDIT = 'authoring-docs';

/**
 * The authoring-docs check's data as stored at publish, while the files it
 * read are unchanged, else undefined.
 * @returns {AuthoringAuditData | undefined}
 */
function storedAuthoringAudit() {
  const value = /** @type {any} */ (storedSelfAudit(AUTHORING_AUDIT));
  if (!value) return undefined;
  const {keys, ...rest} = value.topic;
  return {
    ...value,
    topic: keys === null ? {keys: null, ...rest} : {keys: new Set(keys)},
  };
}

/**
 * The authoring-docs check's data: as stored at publish while what it read is
 * unchanged, else read now. Another tree, list or topic index (tests) is
 * always read now.
 * @param {{root?: string, sources?: string[], topicKeys?: Set<string> | null}} [options]
 * @returns {Promise<AuthoringAuditData>}
 */
export async function authoringAudit(options = {}) {
  const fresh =
    options.root !== undefined ||
    options.sources !== undefined ||
    options.topicKeys !== undefined;
  return (
    (fresh ? undefined : storedAuthoringAudit()) ?? authoringAuditData(options)
  );
}
