// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The compiled-doc contract and its sealed parsers.
 *
 * @input Any value that claims to be a compiled node or a compiled docs bundle
 *   — typically one read back from JSON.
 * @output The same value once it validates; a thrown Error naming the problems
 *   otherwise, carrying a compiler diagnostic (`unsupported_schema` or
 *   `invalid_bundle`). An unsupported schema version fails with its own message
 *   before anything else is checked.
 * @position The load boundary for compiled nodes that did not come straight
 *   from ./compile.mjs in this process. The value is returned as given, not
 *   rebuilt, so key order (which response JSON follows) survives. A node is
 *   plain JSON throughout, so nothing it holds can surprise a reader.
 */

import {SECTION_KEY_RE} from '../discovery/docs-section-key.mjs';
import {COMPILED_DOC_KINDS, COMPILED_DOC_SCHEMA_VERSION} from './compile.mjs';
import {diagnostic, diagnosticProblem} from './diagnostics.mjs';

const NODE_FIELDS = new Set([
  'schemaVersion',
  'kind',
  'stage',
  'id',
  'lang',
  'provenance',
  'sourceTitles',
  'sectionProviders',
  'doc',
]);
const RESOLVED_FIELDS = new Set([
  'status',
  'topic',
  'section',
  'previewType',
  'content',
]);

/** How many problems one message lists before it stops. */
const MAX_PROBLEMS = 10;

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = value =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/** @param {unknown} value @returns {value is string} */
const isText = value => typeof value === 'string' && value !== '';

/**
 * A package name, never a location: provenance must not leak a path.
 * @param {unknown} value
 * @returns {boolean}
 */
const isPackageName = value =>
  isText(value) &&
  !value.startsWith('/') &&
  !value.startsWith('.') &&
  !value.startsWith('\\') &&
  !value.startsWith('file:') &&
  !/^[A-Za-z]:[\\/]/.test(value);

/**
 * Validate a compiled reference node.
 * @param {unknown} value
 * @returns {import('./compile.mjs').CompiledReferenceNode}
 */
export function parseCompiledReferenceNode(value) {
  const node = /** @type {any} */ (value);
  const skew = schemaVersionProblem(node);
  if (skew) throw compiledDocError('unsupported_schema', skew);
  const problems = jsonProblems(node, 'node');
  if (problems.length === 0) problems.push(...structureProblems(node));
  if (problems.length > 0) {
    throw compiledDocError(
      'invalid_bundle',
      `Invalid compiled doc node: ${problems.slice(0, MAX_PROBLEMS).join('; ')}`,
    );
  }
  return node;
}

/**
 * Where a value stops being plain JSON: anything but null, booleans, finite
 * numbers, strings, arrays and plain objects; a symbol key; or a cycle.
 * @param {unknown} value
 * @param {string} at
 * @param {Set<object>} [ancestors]
 * @param {string[]} [out]
 * @returns {string[]}
 */
function jsonProblems(value, at, ancestors = new Set(), out = []) {
  if (out.length >= MAX_PROBLEMS) return out;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return out;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      out.push(`${at}: ${value} is not a JSON number`);
    return out;
  }
  if (value === undefined) {
    out.push(`${at}: undefined is not JSON`);
    return out;
  }
  if (typeof value !== 'object') {
    out.push(`${at}: a ${typeof value} is not JSON`);
    return out;
  }
  if (ancestors.has(value)) {
    out.push(`${at}: refers back to itself`);
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    out.push(
      `${at}: a ${proto?.constructor?.name ?? 'non-plain object'} is not JSON`,
    );
    return out;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    out.push(`${at}: has symbol keys`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      jsonProblems(item, `${at}[${index}]`, ancestors, out),
    );
  } else {
    for (const [key, item] of Object.entries(value)) {
      jsonProblems(item, `${at}.${key}`, ancestors, out);
    }
  }
  ancestors.delete(value);
  return out;
}

/**
 * The node's own shape, once it is known to be JSON.
 * @param {Record<string, any>} node
 * @returns {string[]}
 */
function structureProblems(node) {
  /** @type {string[]} */
  const problems = [];
  const unknown = Object.keys(node).filter(key => !NODE_FIELDS.has(key));
  if (unknown.length > 0)
    problems.push(`unknown fields: ${unknown.join(', ')}`);
  if (node.kind !== 'reference') problems.push('kind: expected "reference"');
  if (node.stage !== 'lowered' && node.stage !== 'linked') {
    problems.push('stage: expected "lowered" or "linked"');
  }
  if (!isText(node.id)) problems.push('id: expected a topic name');
  if (node.lang !== null && !isText(node.lang)) {
    problems.push('lang: expected a language or null');
  }
  const provenance = node.provenance;
  if (
    !isRecord(provenance) ||
    !isPackageName(provenance.provider) ||
    (provenance.replaces !== null && !isText(provenance.replaces)) ||
    !Array.isArray(provenance.extensions) ||
    !provenance.extensions.every(isPackageName)
  ) {
    problems.push(
      'provenance: expected {provider, replaces, extensions} naming packages, not paths',
    );
  }
  const providers = isRecord(node.sectionProviders)
    ? node.sectionProviders
    : null;
  if (!providers || !Object.values(providers).every(isText)) {
    problems.push('sectionProviders: expected section key -> provider id');
  }
  const titles = isRecord(node.sourceTitles) ? node.sourceTitles : null;
  if (!titles || !Object.values(titles).every(isText)) {
    problems.push('sourceTitles: expected section key -> authored title');
  }
  const doc = node.doc;
  if (
    !isRecord(doc) ||
    !isText(doc.name) ||
    !isText(doc.title) ||
    typeof doc.description !== 'string' ||
    !Array.isArray(doc.sections) ||
    doc.sections.length === 0
  ) {
    problems.push('doc: expected {name, title, description, sections}');
  } else {
    problems.push(...sectionProblems(doc.sections, titles, node.stage));
  }
  return problems;
}

/**
 * @param {any[]} sections
 * @param {Record<string, any> | null} titles
 * @param {unknown} stage
 * @returns {string[]}
 */
function sectionProblems(sections, titles, stage) {
  /** @type {string[]} */
  const problems = [];
  const seen = new Set();
  sections.forEach((section, index) => {
    const at = `doc.sections[${index}]`;
    if (
      !isRecord(section) ||
      typeof section.id !== 'string' ||
      !SECTION_KEY_RE.test(section.id)
    ) {
      problems.push(`${at}.id: expected a section key`);
      return;
    }
    if (seen.has(section.id)) {
      problems.push(`${at}.id: two sections have the key "${section.id}"`);
    }
    seen.add(section.id);
    if (!isText(section.title)) problems.push(`${at}.title: expected a title`);
    if (titles && !Object.hasOwn(titles, section.id)) {
      problems.push(
        `sourceTitles: no authored title for section "${section.id}"`,
      );
    }
    if (!Array.isArray(section.content)) {
      problems.push(`${at}.content: expected an array of blocks`);
      return;
    }
    section.content.forEach((/** @type {unknown} */ block, blockIndex) => {
      const where = `${at}.content[${blockIndex}]`;
      if (!isRecord(block) || !isText(block.type)) {
        problems.push(`${where}: expected a block with a type`);
        return;
      }
      if (block.type !== 'token-ref') return;
      const ref = `${where}: token reference to "${block.topic}"`;
      if (stage === 'lowered') {
        if ('resolved' in block) {
          problems.push(`${ref}: a lowered node carries no resolution`);
        }
        return;
      }
      if (!('resolved' in block)) {
        problems.push(`${ref}: a linked node resolves every reference`);
        return;
      }
      const problem = resolutionProblem(block.resolved);
      if (problem) problems.push(`${ref}: ${problem}`);
    });
  });
  return problems;
}

/**
 * @param {unknown} resolved
 * @returns {string | null}
 */
function resolutionProblem(resolved) {
  if (!isRecord(resolved)) return 'expected a resolution';
  switch (resolved.status) {
    case 'unknown-topic':
    case 'unknown-section':
      return Object.keys(resolved).length === 1 ? null : 'unexpected fields';
    case 'resolved': {
      if (!isText(resolved.topic)) return 'topic: expected a topic name';
      if (
        typeof resolved.section !== 'string' ||
        !SECTION_KEY_RE.test(resolved.section)
      ) {
        return 'section: expected a section key';
      }
      if ('previewType' in resolved && !isText(resolved.previewType)) {
        return 'previewType: expected a preview type';
      }
      if (
        !Array.isArray(resolved.content) ||
        !resolved.content.every(block => isRecord(block) && isText(block.type))
      ) {
        return 'content: expected blocks with a type';
      }
      const extra = Object.keys(resolved).filter(
        key => !RESOLVED_FIELDS.has(key),
      );
      return extra.length > 0 ? `unexpected fields: ${extra.join(', ')}` : null;
    }
    default:
      return `status: expected resolved, unknown-topic or unknown-section, got ${JSON.stringify(resolved.status)}`;
  }
}

const DOC_NODE_FIELDS = new Set([
  'schemaVersion',
  'kind',
  'stage',
  'id',
  'lang',
  'provenance',
  'doc',
]);
const BUNDLE_FIELDS = new Set([
  'schemaVersion',
  'lang',
  'nodes',
  'diagnostics',
]);

/**
 * A package-relative source, never a location on one machine.
 * @param {unknown} value
 * @returns {boolean}
 */
const isPackageSource = value =>
  isPackageName(value) &&
  !/(^|\/)\.\.(\/|$)/.test(/** @type {string} */ (value));

/**
 * An Error for a value that is not a compiled doc, carrying the diagnostic a
 * reader reports.
 * @param {'unsupported_schema' | 'invalid_bundle'} code
 * @param {string} message
 * @returns {Error & {diagnostic: import('./diagnostics.mjs').CompilerDiagnostic}}
 */
function compiledDocError(code, message) {
  const error = /** @type {Error & {diagnostic: any}} */ (new Error(message));
  error.diagnostic = diagnostic(code, {message});
  return error;
}

/**
 * @param {unknown} value
 */
function schemaVersionProblem(value) {
  const version = /** @type {any} */ (value)?.schemaVersion;
  return version === COMPILED_DOC_SCHEMA_VERSION
    ? null
    : `Compiled doc schema version ${JSON.stringify(version)} is not supported; this CLI reads version ${COMPILED_DOC_SCHEMA_VERSION}. Compile the docs again with this CLI.`;
}

/**
 * Validate a compiled node of any kind.
 * @param {unknown} value
 * @returns {import('./compile.mjs').CompiledDocNode | import('./compile.mjs').CompiledReferenceNode}
 */
export function parseCompiledDocNode(value) {
  const skew = schemaVersionProblem(value);
  if (skew) throw compiledDocError('unsupported_schema', skew);
  const problems = nodeProblems(value, 'node');
  if (problems.length > 0) {
    throw compiledDocError(
      'invalid_bundle',
      `Invalid compiled doc node: ${problems.slice(0, MAX_PROBLEMS).join('; ')}`,
    );
  }
  return /** @type {any} */ (value);
}

/**
 * Validate a compiled docs bundle: every node, every diagnostic, and one node
 * per id.
 * @param {unknown} value
 * @returns {import('./bundle.mjs').CompiledDocsBundle}
 */
export function parseCompiledDocsBundle(value) {
  const skew = schemaVersionProblem(value);
  if (skew) throw compiledDocError('unsupported_schema', skew);
  const bundle = /** @type {any} */ (value);
  /** @type {string[]} */
  const problems = jsonProblems(bundle, 'bundle');
  if (problems.length === 0) {
    const unknown = Object.keys(bundle).filter(key => !BUNDLE_FIELDS.has(key));
    if (unknown.length > 0)
      problems.push(`unknown fields: ${unknown.join(', ')}`);
    if (bundle.lang !== null && !isText(bundle.lang)) {
      problems.push('lang: expected a language or null');
    }
    if (!Array.isArray(bundle.nodes)) {
      problems.push('nodes: expected an array');
    } else {
      const ids = new Set();
      bundle.nodes.forEach(
        (/** @type {unknown} */ node, /** @type {number} */ index) => {
          for (const problem of nodeProblems(node, `nodes[${index}]`)) {
            problems.push(problem);
          }
          const id = /** @type {any} */ (node)?.id;
          if (ids.has(id))
            problems.push(`nodes[${index}].id: "${id}" appears twice`);
          ids.add(id);
        },
      );
    }
    if (!Array.isArray(bundle.diagnostics)) {
      problems.push('diagnostics: expected an array');
    } else {
      bundle.diagnostics.forEach(
        (/** @type {unknown} */ d, /** @type {number} */ index) => {
          const problem = diagnosticProblem(d);
          if (problem) problems.push(`diagnostics[${index}]: ${problem}`);
        },
      );
    }
  }
  if (problems.length > 0) {
    throw compiledDocError(
      'invalid_bundle',
      `Invalid compiled docs bundle: ${problems.slice(0, MAX_PROBLEMS).join('; ')}`,
    );
  }
  return bundle;
}

/**
 * Problems with one node of any kind, each prefixed with where it is.
 * @param {unknown} value
 * @param {string} at
 * @returns {string[]}
 */
function nodeProblems(value, at) {
  const node = /** @type {any} */ (value);
  if (node?.schemaVersion !== COMPILED_DOC_SCHEMA_VERSION) {
    return [`${at}.schemaVersion: expected ${COMPILED_DOC_SCHEMA_VERSION}`];
  }
  const json = jsonProblems(node, at);
  if (json.length > 0) return json;
  if (node.kind === 'reference') {
    return structureProblems(node).map(problem => `${at}: ${problem}`);
  }
  /** @type {string[]} */
  const problems = [];
  const unknown = Object.keys(node).filter(key => !DOC_NODE_FIELDS.has(key));
  if (unknown.length > 0)
    problems.push(`${at}: unknown fields: ${unknown.join(', ')}`);
  if (!COMPILED_DOC_KINDS.includes(node.kind)) {
    problems.push(
      `${at}.kind: ${JSON.stringify(node.kind)} is not a compiled doc kind`,
    );
  }
  if (node.stage !== 'lowered')
    problems.push(`${at}.stage: expected "lowered"`);
  if (!isText(node.id)) problems.push(`${at}.id: expected an id`);
  if (node.lang !== null && !isText(node.lang)) {
    problems.push(`${at}.lang: expected a language or null`);
  }
  const provenance = node.provenance;
  if (
    !isRecord(provenance) ||
    Object.keys(provenance).length !== 2 ||
    !isPackageName(provenance.provider) ||
    !isPackageSource(provenance.source)
  ) {
    problems.push(
      `${at}.provenance: expected {provider, source} naming a package and a path inside it, not a machine path`,
    );
  }
  if (!isRecord(node.doc) || !isText(node.doc.name)) {
    problems.push(`${at}.doc: expected a doc with a name`);
  } else if (
    (node.kind === 'page' || node.kind === 'block' || node.kind === 'theme') &&
    node.doc.type !== node.kind
  ) {
    problems.push(
      `${at}.doc.type: a ${node.kind} node holds a ${node.kind} doc`,
    );
  }
  return problems;
}
