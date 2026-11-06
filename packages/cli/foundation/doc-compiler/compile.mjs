// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doc compiler — authored docs in, compiled nodes out.
 *
 * @input A {@link ReferenceTopicInput}: one topic's own file and the files of
 *   the extensions merged onto it, each already through the authored-doc parser
 *   and each carrying the overlay for the language being read. Discovery
 *   assembles it, and records a file that failed to load instead of throwing,
 *   so problems surface here in the order a reader meets them.
 * @output A compiled reference node: plain JSON carrying a schema version, the
 *   topic after overlay, extension merge and key stamping, and the authored
 *   title of every section. Linking then resolves each token reference against
 *   its target. Nothing in a node is a function, a symbol, or a file path: an
 *   authored value JSON cannot hold (a function, a Date, `undefined`) takes its
 *   JSON form, the one `--json` output has always shown.
 * @position The one step between authored docs and every docs reader. The docs
 *   API, doctor and search read compiled nodes, and ./lenses.mjs turns them into
 *   response shapes. Every other doc kind (components, hooks, templates, themes,
 *   and the CLI's self-docs) lowers through {@link lowerDoc}, which ./read.mjs
 *   feeds. Internal to the CLI: the public way in is the docs API.
 */

import {parseTemplate} from '../../authoring/doctypes/template/parse.mjs';
import {parseTheme} from '../../authoring/doctypes/theme/parse.mjs';
import {parseIconDefinition} from '../../authoring/doctypes/icon-definition/parse.mjs';
import {
  mergeTopic,
  problemsInTopic,
  withoutPosition,
} from '../discovery/docs-discovery.mjs';
import {
  sectionKey,
  sectionKeyErrors,
  sourceTitle,
  withSectionKeys,
  withSourceTitle,
} from '../discovery/docs-section-key.mjs';
import {diagnostic as rawDiagnostic} from './diagnostics.mjs';
import {scrubPaths} from './source.mjs';
import {overlayAuthoredDoc} from './overlays.mjs';
import {parseReadableDoc} from './parse-readable.mjs';

/**
 * A compiler diagnostic whose message names files by package, never by their
 * location on this machine.
 * @param {string} code
 * @param {Parameters<typeof rawDiagnostic>[1]} at
 */
function diagnostic(code, at) {
  return rawDiagnostic(code, {
    ...at,
    message: scrubPaths(at.message) || '(the error had no message)',
  });
}

/** Bumped whenever the shape of a compiled node changes. */
export const COMPILED_DOC_SCHEMA_VERSION = 1;

/** Every kind a compiled node has: one per authored doc kind a root reads. */
export const COMPILED_DOC_KINDS = /** @type {const} */ ([
  'component',
  'function',
  'reference',
  'page',
  'block',
  'schema',
  'command',
  'enum',
  'theme',
  'namespace',
  'icon-definition',
]);

/**
 * The roots that read docs, and the kinds each may hold. A doc without a
 * stamped `type` (the legacy form) takes its root's first kind.
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const ROOT_KINDS = Object.freeze({
  components: ['component'],
  hooks: ['function'],
  templates: ['page', 'block'],
  themes: ['theme'],
  'icon-definitions': ['icon-definition'],
  'self-docs': ['command', 'function', 'schema', 'enum'],
  tree: ['namespace', 'generic'],
});

/**
 * One authored file, as discovery loaded it.
 * @typedef {object} AuthoredFile
 * @property {string} file the file's name, for messages only
 * @property {any} [doc] the parsed doc, when it loaded
 * @property {unknown} [error] why it did not load or parse
 * @property {any} [overlay] the language overlay's export, when one applies
 * @property {unknown} [overlayError] why the overlay did not load
 */

/**
 * @typedef {object} ReferenceTopicInput
 * @property {string} id the topic's name in the catalog
 * @property {string} provider the package that owns the topic
 * @property {string | null} replaces the topic it took the place of
 * @property {string | null} lang the overlay language, or null for authored text
 * @property {string} [providerId] the owner's provider id; the package name
 *   when absent. The base file's sections resolve their links against it.
 * @property {AuthoredFile} base
 * @property {Array<AuthoredFile & {provider: string, providerId?: string}>} extensions
 *   in merge order; each extension's sections resolve their links against its
 *   own provider id
 * @property {boolean} [tree] a guide the docs tree places: its `placement` is
 *   read by the tree, so the topic reader accepts it
 */

/**
 * A token reference after linking: the target section's content, or why it
 * has none.
 * @typedef {{status: 'resolved', topic: string, section: string, previewType?: string, content: any[]}
 *   | {status: 'unknown-topic'}
 *   | {status: 'unknown-section'}} TokenRefResolution
 */

/**
 * @typedef {object} CompiledReferenceNode
 * @property {number} schemaVersion
 * @property {'reference'} kind
 * @property {'lowered' | 'linked'} stage `linked` once every token reference
 *   carries its resolution; a lowered node carries none
 * @property {string} id the topic's name in the catalog
 * @property {string | null} lang
 * @property {{provider: string, replaces: string | null, extensions: string[]}} provenance
 * @property {Record<string, string>} sourceTitles section key -> authored title
 * @property {Record<string, string>} sectionProviders section key -> the
 *   provider id that wrote the section: a topic merges sections from its base
 *   and its extensions, and each section's links resolve against its own
 *   provider (spec:AST-047 FR9)
 * @property {any} doc the topic: authored fields in authored order, every
 *   section keyed; a linked node's token references carry `resolved`
 */

/** Which provider wrote a section, until lowering records it by key. */
const SECTION_PROVIDER = Symbol('astryx.docs.sectionProvider');

/**
 * Mark each section of one authored file with the provider that wrote it. The
 * overlay, the merge, and the key stamp copy the mark with the section.
 * @param {any} doc
 * @param {string} provider
 * @returns {any}
 */
function markProvider(doc, provider) {
  return {
    ...doc,
    sections: doc.sections.map((/** @type {any} */ section) =>
      withSourceTitle({...section, [SECTION_PROVIDER]: provider}, sourceTitle(section)),
    ),
  };
}

/**
 * Lower one topic: overlay each file, merge the extensions in order, and stamp
 * every section with its key.
 * @param {ReferenceTopicInput} input
 * @returns {CompiledReferenceNode}
 */
export function lowerReferenceTopic(input) {
  let doc = markProvider(
    readAuthoredFile(input.base, {placement: input.tree === true}),
    input.providerId ?? input.provider,
  );
  for (const extension of input.extensions) {
    doc = mergeTopic(
      doc,
      markProvider(
        readAuthoredFile(extension),
        extension.providerId ?? extension.provider,
      ),
    );
    // Explicit authored IDs remain strict. Legacy title-derived collisions are
    // assigned deterministic compatibility keys after every extension merges.
    const problems = sectionKeyErrors(doc.sections);
    if (problems.length > 0) {
      throw new Error(
        `${extension.file}, extending ${input.id}, leaves duplicate authored section IDs: ${problems.join('; ')}`,
      );
    }
  }
  // `before` and `after` place an extension's sections while it merges; no
  // read carries them, whether or not the doc extends anything.
  doc = {...doc, sections: doc.sections.map(withoutPosition)};
  // Derived keys are stamped only now, so they never take part in merging.
  const keyed = withSectionKeys(doc);
  /** @type {Record<string, string>} */
  const sourceTitles = {};
  /** @type {Record<string, string>} */
  const sectionProviders = {};
  for (const section of keyed.sections) {
    sourceTitles[section.id] = sourceTitle(section);
    sectionProviders[section.id] =
      section[SECTION_PROVIDER] ?? input.providerId ?? input.provider;
  }
  return {
    schemaVersion: COMPILED_DOC_SCHEMA_VERSION,
    kind: 'reference',
    stage: 'lowered',
    id: input.id,
    lang: input.lang,
    provenance: {
      provider: input.provider,
      replaces: input.replaces,
      extensions: input.extensions.map(extension => extension.provider),
    },
    sourceTitles,
    sectionProviders,
    // The authored title and provider travel in sourceTitles and
    // sectionProviders; JSON drops the symbols.
    doc: asJson(keyed, input.id),
  };
}

/**
 * Link every section of a lowered node.
 * @param {CompiledReferenceNode} node
 * @param {(topic: string) => Promise<CompiledReferenceNode | null>} lowerTarget
 *   the lowered node a reference names, or null when no topic has that name
 * @returns {Promise<CompiledReferenceNode>}
 */
export async function linkReferenceTopic(node, lowerTarget) {
  const sections = [];
  for (const section of node.doc.sections) {
    sections.push(await linkReferenceSection(section, lowerTarget));
  }
  return {...node, stage: 'linked', doc: {...node.doc, sections}};
}

/**
 * Resolve the token references in one section. A section with none comes back
 * as it went in.
 * @template {{content: any[]}} S
 * @param {S} section
 * @param {(topic: string) => Promise<CompiledReferenceNode | null>} lowerTarget
 * @returns {Promise<S>}
 */
export async function linkReferenceSection(section, lowerTarget) {
  if (!section.content.some(block => block?.type === 'token-ref')) {
    return section;
  }
  const content = [];
  for (const block of section.content) {
    content.push(
      block?.type === 'token-ref'
        ? {...block, resolved: await resolveTokenRef(block, lowerTarget)}
        : block,
    );
  }
  return {...section, content};
}

/**
 * The section a token reference names — by key, or by authored title in any
 * letter case — in the target topic lowered for the same language.
 * @param {any} block
 * @param {(topic: string) => Promise<CompiledReferenceNode | null>} lowerTarget
 * @returns {Promise<TokenRefResolution>}
 */
async function resolveTokenRef(block, lowerTarget) {
  const target = await lowerTarget(block.topic);
  if (!target) return {status: 'unknown-topic'};
  const wanted = block.section.toLowerCase();
  const found = target.doc.sections.find(
    (/** @type {any} */ section) =>
      sectionKey(section) === block.section ||
      (target.sourceTitles[section.id] ?? section.title).toLowerCase() ===
        wanted,
  );
  if (!found) return {status: 'unknown-section'};
  return {
    status: 'resolved',
    topic: target.id,
    section: found.id,
    ...(found.previewType ? {previewType: found.previewType} : {}),
    content: found.content,
  };
}

/**
 * A value as JSON carries it: functions, symbols and `undefined` dropped,
 * Dates as ISO strings.
 * @param {any} value
 * @param {string} topic for the message when the value cannot be serialized
 * @returns {any}
 */
function asJson(value, topic) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (err) {
    throw Object.assign(
      new Error(
        `${topic} cannot be compiled: ${err instanceof Error ? err.message : String(err)}`,
        {cause: err},
      ),
      {compilerCode: 'not_json'},
    );
  }
}

/**
 * One file's doc, checked and in the reading language. Problems throw in the
 * order a reader meets them: the file itself, then its overlay.
 * @param {AuthoredFile} file
 * @returns {any}
 */
function readAuthoredFile(file, {placement = false} = {}) {
  if ('error' in file) throw file.error;
  const parsed = file.doc;
  if (!('sections' in parsed)) {
    throw new Error(`${file.file} is not a reference document.`);
  }
  const problems = problemsInTopic(parsed, {placement});
  if (problems.length > 0) {
    throw new Error(`${file.file} is invalid: ${problems.join('; ')}`);
  }
  if ('overlayError' in file) throw file.overlayError;
  return file.overlay ? applyOverlay(parsed, file.overlay) : parsed;
}

/**
 * Lay a translation over a doc. Overlays are keyed to a base section by title
 * (`section`), not by array position: position keying grafted each overlay
 * title onto whatever base section shared its index, so an overlay that omitted
 * or reordered a section corrupted every section after it (#2182). An overlay
 * may cover any subset of sections, in any order; the rest keep their base
 * content.
 * @param {any} docs
 * @param {any} translation
 * @returns {any}
 */
function applyOverlay(docs, translation) {
  /** @type {Map<string, any>} */
  const bySection = new Map();
  for (const ts of translation.sections ?? []) {
    if (ts?.section != null) bySection.set(ts.section, ts);
  }
  return {
    ...docs,
    description: translation.description || docs.description,
    sections: docs.sections.map((/** @type {any} */ section) => {
      const ts = bySection.get(section.title);
      if (!ts) return section;
      const localized = {
        ...section,
        title: ts.title || section.title,
        content: section.content.map(
          (/** @type {any} */ block, /** @type {number} */ bi) => {
            const tb = ts.content?.[bi];
            if (!tb) return block;
            if (tb.type === 'prose' && block.type === 'prose')
              return {...block, text: tb.text};
            if (tb.type === 'list' && block.type === 'list')
              return {...block, items: tb.items};
            return block;
          },
        ),
      };
      return withSourceTitle(localized, section.title);
    }),
  };
}

/**
 * @typedef {import('./diagnostics.mjs').CompilerDiagnostic} CompilerDiagnostic
 */

/**
 * One authored doc of any kind but a reference topic, as its root loaded it.
 * @typedef {object} DocFileInput
 * @property {string} id the input's id: provider, root, and name
 * @property {keyof typeof ROOT_KINDS} root
 * @property {string} provider the package that contributes it
 * @property {string} source `<package>/<path>` of the file
 * @property {string | null} lang the overlay language, or null
 * @property {AuthoredFile} file `doc` is the authored export, not a parse
 *   result; `overlay` is the translation the module exports for `lang`
 * @property {string} [label] how a parse error names the file (default: its
 *   file name)
 * @property {boolean} [useParsed] carry the parser's result instead of the
 *   authored export, for a reader that has always read the checked value
 */

/**
 * The parser that checks a root's docs. Templates and themes have their own;
 * every other root dispatches on the stamped type.
 * @param {string} root
 * @returns {(input: unknown, label?: string) => any}
 */
export function parserFor(root) {
  if (root === 'themes') return parseTheme;
  if (root === 'icon-definitions') return parseIconDefinition;
  if (root === 'templates') return parseTemplate;
  return parseReadableDoc;
}

/**
 * A compiled node for any kind but a reference topic.
 * @typedef {object} CompiledDocNode
 * @property {number} schemaVersion
 * @property {Exclude<typeof COMPILED_DOC_KINDS[number], 'reference'>} kind
 * @property {'lowered'} stage
 * @property {string} id
 * @property {string | null} lang
 * @property {{provider: string, source: string}} provenance
 * @property {any} doc the authored doc, overlaid for `lang`, as JSON carries
 *   it: key order kept, `undefined` and functions dropped
 */

/**
 * The result of lowering one doc.
 *
 * `view` is the doc as readers have always read it: the authored export (or,
 * where a reader has always read it, the parser's result), with its
 * translation laid over it, not copied and not converted. Readers print from
 * the view, so nothing they print depends on JSON. `node` is the sealed,
 * JSON-only form a whole-project compile collects.
 *
 * @typedef {object} LoweredDoc
 * @property {any} [view] absent when the file could not be read
 * @property {CompiledDocNode | null} node null when not asked for, or when a
 *   problem is fatal to the node
 * @property {CompilerDiagnostic[]} diagnostics
 * @property {boolean} [loadFailed] importing the file threw
 * @property {unknown} [loadFailure] what importing the file threw (any value,
 *   `undefined` included)
 * @property {boolean} [missing] the file exports no doc
 * @property {null | undefined} [missingValue] the empty export, as the reader
 *   picked it
 * @property {boolean} [failed] the kind's parser threw
 * @property {unknown} [failure] what the kind's parser threw
 * @property {boolean} [overlayFailed] laying the translation over threw
 * @property {unknown} [overlayFailure] what laying the translation over threw
 */

/**
 * Lower one doc of any kind but a reference topic.
 *
 * With `check`, the doc is held to its kind's parser, and a failure is
 * recorded, not fatal: readers that never checked docs keep reading it, and a
 * checked reader turns it into the error it has always thrown. A doc stamped
 * with a kind its root does not read keeps its root's kind and carries a
 * `wrong_kind` diagnostic. With `node`, the view is also carried as JSON; a
 * value JSON cannot hold withdraws the node, never the view.
 *
 * @param {DocFileInput} input
 * @param {{check?: boolean, node?: boolean}} [options]
 * @returns {LoweredDoc}
 */
export function lowerDoc(input, {check = true, node: wantNode = true} = {}) {
  const {file} = input;
  const at = {provider: input.provider, source: input.source};
  /** @type {CompilerDiagnostic[]} */
  const diagnostics = [];
  if ('error' in file) {
    diagnostics.push(
      diagnostic('load_failed', {
        ...at,
        message: `${file.file} could not be loaded: ${messageOf(file.error)}`,
      }),
    );
    return {node: null, diagnostics, loadFailed: true, loadFailure: file.error};
  }
  if (file.doc == null) {
    diagnostics.push(
      diagnostic('missing_export', {
        ...at,
        message: `${file.file} exports no doc.`,
      }),
    );
    return {node: null, diagnostics, missing: true, missingValue: file.doc};
  }
  const allowed = ROOT_KINDS[input.root];
  if (!allowed) throw new Error(`No doc root is named "${input.root}".`);
  const stamped =
    typeof file.doc === 'object' && 'type' in file.doc
      ? file.doc.type
      : undefined;
  const kindFits = stamped === undefined || allowed.includes(stamped);
  if (!kindFits) {
    diagnostics.push(
      diagnostic('wrong_kind', {
        ...at,
        message: `${file.file} is stamped type ${JSON.stringify(stamped)}, which the ${input.root} root does not read (it reads ${allowed.join(', ')}).`,
      }),
    );
  }
  /** @type {LoweredDoc} */
  const result = {node: null, diagnostics};
  let view = file.doc;
  // A theme descriptor is read statically; its parse result is the doc.
  // A theme descriptor and an icon definition are read statically; the parse
  // result is the doc.
  const staticRoot =
    input.root === 'themes' || input.root === 'icon-definitions';
  if (check || staticRoot) {
    try {
      const parsed = parserFor(input.root)(file.doc, input.label ?? file.file);
      if (input.useParsed || staticRoot) view = parsed;
    } catch (error) {
      result.failed = true;
      result.failure = error;
      diagnostics.push(
        diagnostic('invalid_doc', {...at, message: messageOf(error)}),
      );
    }
  }
  if ('overlayError' in file) {
    result.overlayFailed = true;
    result.overlayFailure = file.overlayError;
  } else if (file.overlay) {
    try {
      view = overlayAuthoredDoc(view, file.overlay);
    } catch (error) {
      result.overlayFailed = true;
      result.overlayFailure = error;
    }
  }
  if (result.overlayFailed) {
    diagnostics.push(
      diagnostic('overlay_failed', {
        ...at,
        message: `${file.file}'s translation could not be applied: ${messageOf(result.overlayFailure)}`,
      }),
    );
    return result;
  }
  result.view = view;
  if (!wantNode) return result;
  let json;
  try {
    const text = JSON.stringify(view);
    if (text === undefined) throw new TypeError('the doc is not a JSON value');
    json = JSON.parse(text);
  } catch (error) {
    diagnostics.push(
      diagnostic('not_json', {
        ...at,
        message: `${file.file} cannot be compiled: ${messageOf(error)}`,
      }),
    );
    return result;
  }
  result.node = {
    schemaVersion: COMPILED_DOC_SCHEMA_VERSION,
    kind: /** @type {CompiledDocNode['kind']} */ (
      kindFits && stamped !== undefined ? stamped : allowed[0]
    ),
    stage: 'lowered',
    id: input.id,
    lang: input.lang,
    provenance: {provider: input.provider, source: input.source},
    doc: json,
  };
  return result;
}

/** @param {unknown} error */
function messageOf(error) {
  // Any value can be thrown; describing one must never throw in its place.
  try {
    return error instanceof Error ? String(error.message) : String(error);
  } catch {
    return Object.prototype.toString.call(error);
  }
}
