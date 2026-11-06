// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The authoring self-docs, and the `authoring` topic built from them.
 *
 * @input The SchemaDoc each authoring module colocates as `*.doc.mjs` under
 *   packages/cli/authoring.
 * @output {@link AUTHORING_SELF_DOCS} (every self-doc, in reading order), the
 *   `authoring` reference topic with one section per self-doc, and an audit
 *   naming any self-doc the topic cannot reach, any that fails to load, and any
 *   section over the docs output budget.
 * @position Read by assets/docs/tree/field-reference.doc.mjs (the guide) and by Doctor
 *   (the audit). Lives in foundation because authoring/ holds only contracts.
 *   A new `*.doc.mjs` under authoring/ must be added to the list, or Doctor and
 *   the self-doc tests fail.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';
import {readDocView} from '../doc-compiler/read.mjs';
import {
  DOC_OUTPUT_BUDGET_BYTES,
  oversizedDocSections,
} from './docs-output-budget.mjs';

/** The directory the self-docs live under. */
export const AUTHORING_ROOT = path.join(CLI_ROOT, 'authoring');

/** The guide that holds every authoring schema, one section each. */
export const AUTHORING_REFERENCE_NAME = 'field-reference';

/**
 * Its route. `astryx docs authoring <name>` reads one of its sections through
 * the authoring namespace (spec:AST-046 FR6).
 */
export const AUTHORING_REFERENCE_ROUTE = `authoring/${AUTHORING_REFERENCE_NAME}`;

/** Every authoring self-doc, relative to {@link AUTHORING_ROOT}, in reading order. */
export const AUTHORING_SELF_DOCS = [
  'integration/integration.doc.mjs',
  'config/config.doc.mjs',
  'debug/debug.doc.mjs',
  'gap-report/gap-report.doc.mjs',
  'discover/discover.doc.mjs',
  'codemod/codemod.doc.mjs',
  'identity/identity.doc.mjs',
  'doctypes/base/graph-fields.doc.mjs',
  'doctypes/component/component.doc.mjs',
  'doctypes/hook/hook.doc.mjs',
  'doctypes/function/function.doc.mjs',
  'doctypes/command/command.doc.mjs',
  'doctypes/enum/enum.doc.mjs',
  'doctypes/namespace/namespace.doc.mjs',
  'doctypes/reference/reference.doc.mjs',
  'doctypes/schema/schema.doc.mjs',
  'doctypes/template/template.doc.mjs',
  'doctypes/template/integration-template.doc.mjs',
  'doctypes/theme/theme.doc.mjs',
  'doctypes/icon-set/icon-set.doc.mjs',
  'doctypes/icon-set/icon-set-data.doc.mjs',
  'doctypes/icon-definition/icon-definition.doc.mjs',
];

/** Blocks a self-doc note may carry that a topic section can render. */
const TOPIC_BLOCKS = new Set(['prose', 'list', 'code', 'heading', 'table']);

/**
 * Every `*.doc.mjs` under `root`, relative and sorted.
 * @param {string} [root]
 * @returns {string[]}
 */
export function discoverAuthoringSelfDocSources(root = AUTHORING_ROOT) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name.startsWith('__'))
        continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.doc.mjs')) {
        found.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
}

/**
 * Import each self-doc. One that fails is reported, never thrown, so one bad
 * file cannot take the rest of the topic down with it.
 * @param {string[]} [sources]
 * @param {string} [root]
 * @returns {Promise<{loaded: {source: string, doc: any}[], failed: {source: string, error: string}[]}>}
 */
export async function loadAuthoringSelfDocs(
  sources = AUTHORING_SELF_DOCS,
  root = AUTHORING_ROOT,
) {
  const loaded = [];
  const failed = [];
  for (const source of sources) {
    try {
      const doc = await readDocView(path.join(root, source), {
        root: 'self-docs',
        loader: 'native',
      });
      if (
        typeof doc?.name !== 'string' ||
        typeof doc?.description !== 'string'
      ) {
        throw new Error('exports no doc with a name and a description');
      }
      loaded.push({source, doc});
    } catch (error) {
      failed.push({
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {loaded, failed};
}

/**
 * @param {any[]} fields
 * @returns {string[][]}
 */
function fieldRows(fields) {
  // An experimental field is documented on its feature's experimental route,
  // never in the stable schema's table (spec:AST-017 FR27).
  return fields.flatMap(field =>
    field.stability === 'experimental'
      ? []
      : [
          [
            String(field.name),
            String(field.type ?? ''),
            field.required ? 'yes' : 'no',
            [
              field.description,
              field.default != null ? `Default: ${field.default}.` : null,
              field.example != null ? `Example: ${field.example}.` : null,
            ]
              .filter(Boolean)
              .join(' '),
          ],
          ...fieldRows(field.fields ?? []),
        ],
  );
}

/**
 * A schema's fields as the table its section prints, each nested field on the
 * row after its parent; null when there are none. A reference block that
 * names some of a schema's fields includes this table of just those.
 * @param {any[]} fields
 * @returns {{type: 'table', headers: string[], rows: string[][]} | null}
 */
export function schemaFieldTable(fields) {
  const rows = fieldRows(fields);
  return rows.length > 0
    ? {
        type: 'table',
        headers: ['Field', 'Type', 'Required', 'Description'],
        rows,
      }
    : null;
}

/**
 * One self-doc as a topic section, keyed by the doc's own name.
 * @param {any} doc
 * @returns {import('../../authoring/doctypes/reference/type').ReferenceSection}
 */
export function selfDocSection(doc) {
  /** @type {any[]} */
  const content = [{type: 'prose', text: doc.description}];
  if (doc.appliesTo) {
    content.push({type: 'prose', text: `Applies to: ${doc.appliesTo}`});
  }
  const table = schemaFieldTable(doc.fields ?? []);
  if (table) content.push(table);
  for (const example of doc.examples ?? []) {
    if (typeof example?.code !== 'string' || example.code.trim() === '')
      continue;
    content.push({
      type: 'code',
      lang: example.lang ?? 'js',
      ...(example.label ? {label: example.label} : {}),
      code: example.code,
    });
  }
  for (const note of doc.notes ?? []) {
    if (TOPIC_BLOCKS.has(note?.type)) content.push(note);
  }
  return {id: doc.name, title: doc.displayName ?? doc.name, content};
}

/**
 * Whether a self-doc documents an experimental surface (spec:AST-017 FR27).
 * @param {any} doc
 */
export function isExperimentalSelfDoc(doc) {
  return doc?.stability === 'experimental';
}

/**
 * The route that serves the experimental self-docs, one section each:
 * stable `astryx docs authoring/field-reference` never lists them
 * (spec:AST-084 FR0).
 */
export const EXPERIMENTAL_AUTHORING_ROUTE = 'cli/experimental/icon-set-files';

/**
 * The `authoring` topic: one section per stable self-doc, in the order
 * given. An experimental self-doc is a section of
 * {@link EXPERIMENTAL_AUTHORING_ROUTE} instead.
 * @param {any[]} docs
 * @returns {import('../../authoring/doctypes/reference/type').ReferenceDoc}
 */
export function buildAuthoringReferenceDoc(docs) {
  return /** @type {any} */ ({
    type: 'generic',
    name: AUTHORING_REFERENCE_NAME,
    placement: {parent: 'namespace:authoring', slot: 'reference', order: 10},
    title: 'Field reference',
    category: 'guide',
    keywords: ['authoring reference', 'field reference', 'every field'],
    description:
      'Every file an integration author writes, field by field: the integration manifest, astryx.config, codemods, identity, and each doc type. The guides that use them are the rest of {@link namespace:authoring}.',
    sections: docs
      .filter(doc => !isExperimentalSelfDoc(doc))
      .map(selfDocSection),
  });
}

/**
 * The sections of {@link EXPERIMENTAL_AUTHORING_ROUTE}: one per experimental
 * self-doc that loads, in reading order.
 * @returns {Promise<any[]>}
 */
export async function buildExperimentalAuthoringSections() {
  const {loaded} = await loadAuthoringSelfDocs();
  return loaded
    .map(entry => entry.doc)
    .filter(isExperimentalSelfDoc)
    .map(selfDocSection);
}

/**
 * The `authoring` topic from every self-doc that loads. One that fails is left
 * out here and reported by {@link auditAuthoringSelfDocs}.
 * @returns {Promise<import('../../authoring/doctypes/reference/type').ReferenceDoc>}
 */
export async function buildAuthoringTopic() {
  const {loaded} = await loadAuthoringSelfDocs();
  return buildAuthoringReferenceDoc(loaded.map(entry => entry.doc));
}

/**
 * What stands between a self-doc and a reader of `astryx docs authoring`.
 * @param {{root?: string, sources?: string[], budget?: number}} [options]
 * @returns {Promise<{
 *   sections: number,
 *   experimental: number,
 *   unreachable: string[],
 *   failed: {source: string, error: string}[],
 *   oversized: {key: string, title: string, bytes: number}[],
 * }>}
 */
export async function auditAuthoringSelfDocs({
  root = AUTHORING_ROOT,
  sources = AUTHORING_SELF_DOCS,
  budget = DOC_OUTPUT_BUDGET_BYTES,
} = {}) {
  const listed = new Set(sources);
  const unreachable = discoverAuthoringSelfDocSources(root).filter(
    source => !listed.has(source),
  );
  const {loaded, failed} = await loadAuthoringSelfDocs(sources, root);
  const docs = loaded.map(entry => entry.doc);
  const topic = buildAuthoringReferenceDoc(docs);
  const experimental = docs.filter(isExperimentalSelfDoc).map(selfDocSection);
  return {
    sections: topic.sections.length,
    // Experimental schemas (spec:AST-017 FR27), counted apart: they are
    // sections of the experimental route, not of `astryx docs authoring`.
    experimental: experimental.length,
    unreachable,
    failed,
    oversized: oversizedDocSections(
      [...topic.sections, ...experimental],
      budget,
    ),
  };
}
