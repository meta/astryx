// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reference-doc (topic) discovery — the CLI's own topics plus the ones
 * configured integrations contribute, resolved into one catalog.
 *
 * @input packages/cli/assets/docs/{topic}.doc.mjs (built in), and each loaded
 *   integration's resolved `docs` root ({topic}.doc.{ts,mjs,js}).
 * @output A {@link DocsCatalog}: every topic the project can read, keyed by
 *   name, carrying its owner package, its file, and any extension overlays —
 *   plus the alias a renamed replacement leaves behind.
 * @position foundation/discovery — the single seam every docs surface reads
 *   (api/docs, api/search, and the agent-docs block), so a topic contributed
 *   once shows up in all of them.
 *
 * An integration contributes a topic the way it contributes a component: a
 * root in its manifest, a file per artifact. What a doc says about its
 * relationship to an existing topic is authored on the doc itself, not in a
 * second registry that has to be kept in step with it:
 *
 *   (neither)         add a topic under its own name
 *   replaces: 'x'     take over topic x — core's, or another integration's
 *   extends:  'x'     merge onto topic x, section by section
 *
 * A topic whose name collides with an existing one and declares neither is an
 * `invalid_doc` issue rather than silent shadowing. Shadowing by name would
 * make a core rename swallow an integration's guide (or the reverse) with no
 * diagnostic anywhere, which is the failure mode integration discovery already
 * refuses for components provided by two packages.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT} from '../fs/paths.mjs';
import {importDocModule} from '../doc-compiler/import.mjs';
import {CLI_PROVIDER_ID} from '../identity/providers.mjs';
import {parseReadableDoc} from '../doc-compiler/parse-readable.mjs';
import {
  sectionKey,
  sectionKeyErrors,
  sourceTitle,
  withSourceTitle,
} from './docs-section-key.mjs';

export {withSourceTitle};

/** Where the CLI's own topics live. */
const BUILTIN_DOCS_DIR = path.join(CLI_ROOT, 'assets', 'docs');

/**
 * Owner package recorded for the built-in topics. They ship inside the CLI
 * (assets/docs), not in @astryxdesign/core, so this is the CLI's own name —
 * unlike component discovery, whose built-ins belong to core.
 */
export const BUILTIN_DOCS_PACKAGE = CLI_PROVIDER_ID;

/**
 * A built-in topic file: `{topic}.doc.mjs`. Anchored at both ends so a
 * localization overlay (`{topic}.doc.zh.mjs`) is not read as a topic of its
 * own — it is loaded by the topic it overlays.
 */
const BUILTIN_TOPIC_FILE_RE = /^([\w-]+)\.doc\.mjs$/;

/** Conventional doc-file suffixes for an integration's topics. */
const INTEGRATION_DOC_SUFFIXES = ['.doc.ts', '.doc.mjs', '.doc.js'];

/** A topic name is a CLI argument and a URL segment; keep it to both. */
const TOPIC_NAME_RE = /^[\w-]+$/;

/**
 * Whether a `replaces` or `extends` names a route of the docs tree rather than
 * a flat topic: a topic name never holds a `/`, and a guide the tree places is
 * always read by a route that does.
 * @param {unknown} target
 * @returns {target is string}
 */
export function isGuideRoute(target) {
  return typeof target === 'string' && target.includes('/');
}

/**
 * What the integrations do to one guide the docs tree places, in configured
 * order: a replacement, and the extensions merged onto whatever is there.
 * @typedef {object} GuideOverlay
 * @property {DocsTopicRecord | null} replacement the doc readers get at the
 *   route instead of the guide; the last package configured wins
 * @property {Array<{package: string, path: string, providerId?: string}>} extensions
 *   extensions authored after the replacement, if any, in configured order
 * @property {string} [replacedPackage] the package of the replacement this one
 *   took over from, when the guide was replaced twice
 */

/**
 * @typedef {object} DocsTopicRecord A doc file discovered under a docs root.
 * @property {string} name
 * @property {string} package owner package
 * @property {string} [providerId] the owner's ProviderId, when it differs from
 *   the package name
 * @property {string} path absolute path to the doc file
 * @property {string} [title]
 * @property {string} [description]
 * @property {string|null} [category]
 * @property {string} [replaces] topic this doc takes the place of
 * @property {string} [extendsTopic] topic this doc merges onto (`extends`)
 */

/**
 * @typedef {object} DocsTopicEntry A resolved topic in the catalog.
 * @property {string} name
 * @property {string} package owner package
 * @property {string} [providerId] the owner's ProviderId; the package name when
 *   absent. Links in the topic resolve against it.
 * @property {string} path absolute path to the doc file
 * @property {string} [title]
 * @property {string} [description]
 * @property {string|null} [category]
 * @property {string} [replaces] the topic this one took the place of
 * @property {string} [replacedPackage] the package whose topic or guide this
 *   one took the place of
 * @property {Array<{package: string, path: string, providerId?: string}>} extensions
 *   overlays to merge onto the base doc, in the order their integrations were
 *   configured; each section an extension adds resolves its links against the
 *   extension's provider id (its package name when absent)
 * @property {string} [parent] the route of the namespace a tree guide sits in
 * @property {string} [route] a tree guide's route
 * @property {boolean} [tree] a guide that only the docs tree reads, by its
 *   route; never a flat topic
 */

/**
 * Discover the CLI's own topics.
 * @returns {Record<string, string>} topic name → absolute doc path
 */
export function discoverBuiltinTopics() {
  /** @type {Record<string, string>} */
  const topics = Object.create(null);
  if (!fs.existsSync(BUILTIN_DOCS_DIR)) return topics;
  for (const file of fs.readdirSync(BUILTIN_DOCS_DIR)) {
    const match = file.match(BUILTIN_TOPIC_FILE_RE);
    if (match) topics[match[1]] = path.join(BUILTIN_DOCS_DIR, file);
  }
  return topics;
}

/**
 * The CLI's own guide files: every flat topic and every doc in its docs tree,
 * without the dense, translated, and draft variants.
 *
 * @returns {string[]}
 */
export function builtinGuideFiles() {
  const files = Object.values(discoverBuiltinTopics());
  const tree = path.join(BUILTIN_DOCS_DIR, 'tree');
  if (fs.existsSync(tree)) {
    for (const file of fs.readdirSync(tree).sort()) {
      if (BUILTIN_TOPIC_FILE_RE.test(file)) files.push(path.join(tree, file));
    }
  }
  return files;
}

/**
 * Load a topic doc from disk. A `.ts` doc is loaded through jiti, the rest
 * natively; both the historical `export const docs` and the stamped
 * `export default` forms are accepted, because core authors the first and the
 * integration guide documents the second.
 *
 * @param {string} file absolute path to a doc file
 * @returns {Promise<unknown>} the authored doc value
 */
export async function loadTopicModule(file) {
  const mod = await importDocModule(file);
  const doc = mod?.docs ?? mod?.default;
  if (doc == null) {
    throw new Error(
      `${path.basename(file)} exports no doc. A topic exports \`docs\` (or a default export).`,
    );
  }
  return doc;
}

/** Every block kind a section may hold, with the fields each one requires. */
const BLOCK_FIELDS = {
  prose: ['text'],
  heading: ['level', 'text'],
  code: ['lang', 'code'],
  table: ['headers', 'rows'],
  list: ['style', 'items'],
  'token-ref': ['topic', 'section'],
  // A read inlines it as the doc it names includes (spec:AST-047 FR9).
  reference: ['target'],
};

/**
 * Blocks that are valid authoring but require the compiled graph renderer: a
 * namespace doc's `blocks` hold them, a topic section does not.
 */
export const GRAPH_BLOCK_TYPES = new Set(['workflow', 'collection']);

/**
 * Doc fields only the docs tree reads. A flat topic that sets one fails to
 * load; a guide the tree places may set `placement` (spec:AST-046).
 */
export const GRAPH_ONLY_FIELDS = ['placement', 'aliases', 'audience'];

/**
 * Fields a block kind may carry but does not need. Kept per kind rather than
 * globally: only a code block renders a `label`, so allowing it everywhere
 * would wave through the misspellings this check exists to catch.
 */
/** @type {Record<string, string[]>} */
const OPTIONAL_BLOCK_FIELDS = {
  code: ['label'],
  reference: ['projection', 'presentation'],
};

/**
 * Fields whose value has to be one of a set, because the renderer indexes on
 * it. An unlisted heading level renders at the wrong depth and an unlisted
 * list style resolves to undefined, so the value is checked, not just its
 * presence.
 */
const BLOCK_FIELD_VALUES = {
  heading: {level: [3, 4, 5, 6]},
  list: {style: ['ordered', 'unordered', 'do', 'dont']},
  reference: {presentation: ['summary', 'compact', 'full']},
};

/** The parts of a doc a reference block's `projection` may select. */
const PROJECTION_FIELDS = ['fields', 'sections'];

/** Keys a section may carry. */
const SECTION_FIELDS = [
  'id',
  'title',
  'category',
  'content',
  'previewType',
  'before',
  'after',
];

/**
 * The fields an extension section places itself with: the key of the base
 * section it goes before or after. Read only by a merge, never by a reader.
 */
export const SECTION_POSITION_FIELDS = ['before', 'after'];

/**
 * Check the fields the docs surfaces actually read. `parseDoc` is the outer
 * gate, but the reference-doc schema is a passthrough over `{name, type}` —
 * a doc with no `sections`, or a prose block whose `text` is misspelled,
 * passes it and reaches a reader as a missing section or a blank gap. Those
 * are hard to trace back from the rendered output, so they are caught here,
 * where the file that needs fixing can be named.
 *
 * @param {any} doc a parsed doc
 * @param {{placement?: boolean}} [options] `placement`: the doc is a guide the
 *   docs tree places, so its `placement` field is read, not rejected
 * @returns {string[]} problems, each already pointed at a place in the doc
 */
export function problemsInTopic(doc, {placement = false} = {}) {
  // A namespace doc is valid authoring that only the docs tree reads. Said
  // plainly, instead of as the topic fields it does not have.
  if (doc?.type === 'namespace') {
    return [
      `"${doc.name}" is a namespace doc, which the docs tree reads, not the topic list. The CLI keeps its own in assets/docs/tree; an integration ships its namespace docs in its docs directory.`,
    ];
  }
  /** @type {string[]} */
  const problems = [];
  for (const field of ['name', 'title', 'description']) {
    if (typeof doc?.[field] !== 'string' || doc[field] === '') {
      problems.push(`${field}: expected a non-empty string`);
    }
  }
  if (typeof doc?.name === 'string' && !TOPIC_NAME_RE.test(doc.name)) {
    problems.push(
      `name: "${doc.name}" is not URL-safe. A topic name is its CLI argument and its docsite path, so it may hold only letters, digits, "_" and "-".`,
    );
  }
  for (const field of GRAPH_ONLY_FIELDS) {
    // A guide the docs tree places carries `placement`; the tree reads it.
    if (field === 'placement' && placement) continue;
    if (doc?.[field] != null) {
      problems.push(
        `${field}: requires the compiled graph reader and is not supported by legacy topic readers`,
      );
    }
  }
  if (!Array.isArray(doc?.sections) || doc.sections.length === 0) {
    problems.push('sections: expected at least one section');
    return problems;
  }

  doc.sections.forEach(
    (/** @type {any} */ section, /** @type {number} */ s) => {
      const at = `sections[${s}]`;
      if (typeof section?.title !== 'string' || section.title === '') {
        problems.push(`${at}.title: expected a non-empty string`);
      }
      for (const key of Object.keys(section ?? {})) {
        if (!SECTION_FIELDS.includes(key)) {
          problems.push(`${at}.${key}: not a field of a section`);
        }
      }
      for (const field of SECTION_POSITION_FIELDS) {
        const value = section?.[field];
        if (value != null && (typeof value !== 'string' || value === '')) {
          problems.push(
            `${at}.${field}: expected the key of a section, as \`--index\` shows it`,
          );
        }
      }
      if (section?.before != null && section?.after != null) {
        problems.push(
          `${at}: sets both \`before\` and \`after\`; a section goes in one place`,
        );
      }
      if (!Array.isArray(section?.content)) {
        problems.push(`${at}.content: expected an array of blocks`);
        return;
      }
      section.content.forEach(
        (/** @type {any} */ block, /** @type {number} */ b) => {
          const blockAt = `${at}.content[${b}]`;
          const fields = /** @type {Record<string, string[]>} */ (BLOCK_FIELDS)[
            block?.type
          ];
          if (fields == null) {
            if (GRAPH_BLOCK_TYPES.has(block?.type)) {
              problems.push(
                `${blockAt}.type: ${JSON.stringify(block.type)} requires the compiled graph renderer and is not supported by legacy topic readers`,
              );
            } else {
              problems.push(
                `${blockAt}.type: ${JSON.stringify(block?.type)} is not one of ${Object.keys(BLOCK_FIELDS).join(', ')}`,
              );
            }
            return;
          }
          for (const field of fields) {
            const value = block[field];
            // Empty counts as missing, the way it does for the doc's own title: a
            // block whose text is '' passes every other check and renders as a gap.
            if (value == null) {
              problems.push(
                `${blockAt}.${field}: required for a ${block.type} block`,
              );
            } else if (typeof value === 'string' && value.trim() === '') {
              problems.push(`${blockAt}.${field}: expected a non-empty string`);
            } else if (Array.isArray(value) && value.length === 0) {
              problems.push(`${blockAt}.${field}: expected a non-empty array`);
            }
          }
          const allowedValues =
            /** @type {Record<string, Record<string, unknown[]>>} */ (
              BLOCK_FIELD_VALUES
            )[block.type] ?? {};
          for (const [field, values] of Object.entries(allowedValues)) {
            const value = block[field];
            if (value != null && !values.includes(value)) {
              problems.push(
                `${blockAt}.${field}: ${JSON.stringify(value)} is not one of ${values.join(', ')}`,
              );
            }
          }
          // A table's cells are read by column index, so a short row renders blank
          // cells and a long one drops its tail — both silently.
          if (
            block.type === 'table' &&
            Array.isArray(block.headers) &&
            Array.isArray(block.rows)
          ) {
            block.rows.forEach(
              (/** @type {any} */ row, /** @type {number} */ r) => {
                if (!Array.isArray(row)) {
                  problems.push(
                    `${blockAt}.rows[${r}]: expected an array of cells`,
                  );
                } else if (row.length !== block.headers.length) {
                  problems.push(
                    `${blockAt}.rows[${r}]: has ${row.length} cells but the table has ${block.headers.length} headers`,
                  );
                }
              },
            );
          }
          // An unknown key is almost always a misspelled required one, and it
          // would otherwise reach a reader as a block that renders nothing.
          const allowed = [
            'type',
            ...fields,
            ...(OPTIONAL_BLOCK_FIELDS[block.type] ?? []),
          ];
          for (const key of Object.keys(block)) {
            if (!allowed.includes(key)) {
              problems.push(
                `${blockAt}.${key}: not a field of a ${block.type} block`,
              );
            }
          }
          // A projection names the parts of the doc to include, so each part
          // it names is a non-empty list of names.
          if (block.type === 'reference' && block.projection != null) {
            const projection = block.projection;
            if (typeof projection !== 'object' || Array.isArray(projection)) {
              problems.push(
                `${blockAt}.projection: expected {fields?, sections?}, naming the parts of the doc to include`,
              );
            } else {
              for (const [key, names] of Object.entries(projection)) {
                if (!PROJECTION_FIELDS.includes(key)) {
                  problems.push(
                    `${blockAt}.projection.${key}: not a field of a projection`,
                  );
                } else if (
                  !Array.isArray(names) ||
                  names.length === 0 ||
                  names.some(
                    name => typeof name !== 'string' || name.trim() === '',
                  )
                ) {
                  problems.push(
                    `${blockAt}.projection.${key}: expected a non-empty array of names`,
                  );
                }
              }
            }
          }
        },
      );
    },
  );
  // Explicit authored IDs are a new opt-in contract and remain strict. Topics
  // that relied on 0.6.x title-only sections keep loading; the compiler assigns
  // deterministic fallback/suffixed keys for the additive index API.
  problems.push(...sectionKeyErrors(doc.sections));
  return problems;
}

/**
 * The fields the docs tree reads from a namespace doc an integration ships.
 * @param {any} doc
 * @returns {string[]}
 */
export function problemsInNamespace(doc) {
  /** @type {string[]} */
  const problems = [];
  for (const field of ['name', 'title', 'summary']) {
    if (typeof doc?.[field] !== 'string' || doc[field] === '') {
      problems.push(`${field}: expected a non-empty string`);
    }
  }
  const slots = doc?.slots;
  if (
    slots == null ||
    typeof slots !== 'object' ||
    Object.keys(slots).length === 0
  ) {
    problems.push('slots: expected at least one slot');
    return problems;
  }
  for (const [name, slot] of Object.entries(slots)) {
    if (typeof slot?.title !== 'string' || slot.title === '') {
      problems.push(`slots.${name}.title: expected a non-empty string`);
    }
    if (
      !Array.isArray(slot?.accepts?.kinds) ||
      slot.accepts.kinds.length === 0
    ) {
      problems.push(`slots.${name}.accepts.kinds: expected at least one kind`);
    }
  }
  return problems;
}

/**
 * Whether `dir` is a folder to list. A declared root that is a file is
 * reported by the root check; discovery finds nothing in it.
 * @param {string} dir
 */
function isFolder(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Discover the topics contributed by a single loaded integration. Mirrors
 * `discoverIntegrationComponents`: walk the resolved root, take every
 * conventional doc file, and record what it declares. Unlike component
 * discovery this loads each doc, because a topic's name and its relationship
 * to an existing topic are fields inside the file.
 *
 * A namespace doc and a guide with `placement` go to the docs tree instead of
 * the topic list (spec:AST-046): they come back in `namespaces` and `guides`,
 * named by the integration's provider id.
 *
 * Errors are returned, not thrown: one unusable doc is reported as an issue
 * against its package while the rest of the CLI keeps working.
 *
 * @param {{name: string, docs?: string, providerId?: string}} integration a loaded integration
 * @returns {Promise<{records: DocsTopicRecord[], errors: Error[], namespaces: import('../doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../doc-compiler/tree.mjs').TreeDocInput[]}>}
 */
export async function discoverIntegrationDocs(integration) {
  const docsDir = integration?.docs;
  /** @type {DocsTopicRecord[]} */
  const records = [];
  /** @type {Error[]} */
  const errors = [];
  /** @type {import('../doc-compiler/tree.mjs').TreeNamespaceInput[]} */
  const namespaces = [];
  /** @type {import('../doc-compiler/tree.mjs').TreeDocInput[]} */
  const guides = [];
  if (!docsDir || !isFolder(docsDir)) {
    return {records, errors, namespaces, guides};
  }
  const providerId = integration.providerId ?? integration.name;

  /** @type {string[]} */
  const files = [];
  /** @param {string} dirPath */
  function scanDir(dirPath) {
    for (const entry of fs.readdirSync(dirPath, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDir(full);
      } else if (
        INTEGRATION_DOC_SUFFIXES.some(suffix => entry.name.endsWith(suffix))
      ) {
        files.push(full);
      }
    }
  }
  scanDir(docsDir);
  files.sort();

  /** @type {Map<string, string>} */
  const seen = new Map();
  for (const file of files) {
    let doc;
    try {
      doc = parseReadableDoc(await loadTopicModule(file), path.basename(file));
    } catch (err) {
      errors.push(
        new Error(
          `${path.relative(docsDir, file)}: ${/** @type {any} */ (err).message}`,
        ),
      );
      continue;
    }
    const relative = path.relative(docsDir, file);
    const source = `${integration.name}/${relative.split(path.sep).join('/')}`;
    if (/** @type {any} */ (doc)?.type === 'namespace') {
      const problems = problemsInNamespace(doc);
      if (problems.length > 0) {
        errors.push(
          new Error(
            `${relative} is not a usable namespace doc:\n${problems
              .map(problem => `  ${problem}`)
              .join('\n')}`,
          ),
        );
        continue;
      }
      namespaces.push({
        provider: integration.name,
        providerId,
        source,
        doc: /** @type {any} */ (doc),
      });
      continue;
    }
    const placed = /** @type {any} */ (doc)?.placement != null;
    const problems = problemsInTopic(doc, {placement: placed});
    if (problems.length > 0) {
      errors.push(
        new Error(
          `${relative} is not a usable topic:\n${problems
            .map(problem => `  ${problem}`)
            .join('\n')}`,
        ),
      );
      continue;
    }
    const parsed = /** @type {any} */ (doc);
    // Two files claiming one name would collapse into a single entry, and the
    // one that lost would never be reachable. Named here, where both files are.
    const topicKey = parsed.name.toLowerCase();
    const previous = seen.get(topicKey);
    if (previous) {
      errors.push(
        new Error(
          `${path.relative(docsDir, file)} and ${previous} both define the topic "${parsed.name}". Each topic name is a URL and a CLI argument, so they have to be unique.`,
        ),
      );
      continue;
    }
    seen.set(topicKey, path.relative(docsDir, file));
    if (placed) {
      if (parsed.replaces != null || parsed.extends != null) {
        errors.push(
          new Error(
            `${relative} is placed in the docs tree and also declares \`${parsed.replaces != null ? 'replaces' : 'extends'}\`. A placed guide has its own route; only a flat topic takes over or extends another.`,
          ),
        );
        continue;
      }
      guides.push({
        provider: integration.name,
        providerId,
        source,
        kind: 'generic',
        name: parsed.name,
        title: parsed.title,
        // Rendered once, where the tree is built (api/docs/_adapter.mjs).
        summary: parsed.description,
        group: null,
        placement: parsed.placement,
        ref: {topicFile: file},
      });
      continue;
    }
    if (parsed.replaces != null && parsed.extends != null) {
      errors.push(
        new Error(
          `${path.relative(docsDir, file)} declares both \`replaces\` and \`extends\`. A topic either takes another's place or merges onto it.`,
        ),
      );
      continue;
    }
    records.push({
      name: parsed.name,
      package: integration.name,
      path: file,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category ?? null,
      replaces: parsed.replaces,
      extendsTopic: parsed.extends,
      ...(providerId === integration.name ? {} : {providerId}),
    });
  }

  return {records, errors, namespaces, guides};
}

/**
 * Merge an extension onto a base topic: a section with a stable `id` replaces
 * the base section with the same `id`; legacy sections without IDs fall back to
 * title matching. A section with no match is added: before or after the
 * section whose key its `before` or `after` names, else at the end. The title
 * and description stay the base topic's: an extension adds to a topic, it never
 * renames it. A topic that `replaces` another is the one that renames.
 *
 * Keyed by section TITLE rather than by position, the way the localization
 * overlays are — position keying grafts an overlay onto whichever section
 * happens to share its index, so a partial or reordered overlay corrupts
 * everything after it (#2182).
 *
 * @param {any} base
 * @param {any} overlay
 * @returns {any} a new doc; neither input is mutated
 */
export function mergeTopic(base, overlay) {
  return mergeTopicReport(base, overlay).doc;
}

/**
 * {@link mergeTopic}, also naming each `before` or `after` that found no
 * section: that section was added at the end instead.
 *
 * @param {any} base
 * @param {any} overlay
 * @returns {{doc: any, unplaced: Array<{section: string, field: 'before' | 'after', key: string}>}}
 */
export function mergeTopicReport(base, overlay) {
  const sections = [...(base.sections ?? [])];
  /** @type {Array<{section: string, field: 'before' | 'after', key: string}>} */
  const unplaced = [];

  for (const authored of overlay.sections ?? []) {
    const section = withoutPosition(authored);
    const at = findMergeTarget(sections, section);
    if (at === -1) {
      const field = authored.before != null ? 'before' : 'after';
      const key = authored[field];
      if (typeof key !== 'string') {
        sections.push(section);
        continue;
      }
      const anchor = sections.findIndex(
        candidate => sectionKey(candidate) === key || candidate.id === key,
      );
      if (anchor === -1) {
        unplaced.push({section: sectionKey(section), field, key});
        sections.push(section);
      } else if (field === 'before') {
        // Placed just before a section another was placed `after`, it joins
        // that section's group, so later sections placed there follow both.
        if (sections[anchor][PLACED_AFTER] != null) {
          Object.defineProperty(section, PLACED_AFTER, {
            value: sections[anchor][PLACED_AFTER],
            configurable: true,
          });
        }
        sections.splice(anchor, 0, section);
      } else {
        // Sections placed after one key keep their order, across every
        // extension merged onto the topic: each goes after every section
        // placed there before it, and after the sections placed after those.
        const group = new Set([key]);
        let at = anchor + 1;
        while (at < sections.length && group.has(sections[at][PLACED_AFTER])) {
          group.add(sectionKey(sections[at]));
          at += 1;
        }
        Object.defineProperty(section, PLACED_AFTER, {
          value: key,
          configurable: true,
        });
        sections.splice(at, 0, section);
      }
    } else {
      // A legacy extension that replaces a section which has since gained a
      // stable ID keeps that ID, so readers addressing it keep working. A
      // replacing section keeps the place of the one it replaces.
      const replaced = sections[at];
      const replacing =
        section.id == null && replaced.id != null
          ? withSourceTitle({...section, id: replaced.id}, sourceTitle(section))
          : section;
      // It also keeps the place an earlier `after` gave the one it replaces,
      // so sections placed after that key later still follow it.
      if (replaced[PLACED_AFTER] != null) {
        const placed = replacing === section ? withoutPosition({...section}) : replacing;
        for (const symbol of Object.getOwnPropertySymbols(section)) {
          if (!(symbol in placed)) {
            Object.defineProperty(
              placed,
              symbol,
              /** @type {PropertyDescriptor} */ (
                Object.getOwnPropertyDescriptor(section, symbol)
              ),
            );
          }
        }
        Object.defineProperty(placed, PLACED_AFTER, {
          value: replaced[PLACED_AFTER],
          configurable: true,
        });
        sections[at] = placed;
      } else {
        sections[at] = replacing;
      }
    }
  }
  return {doc: {...base, sections}, unplaced};
}

/** The key a merged section was placed `after`, so later ones follow it. */
const PLACED_AFTER = Symbol('astryx.docs.placedAfter');

/**
 * A section without the fields that place it; readers never see them.
 * @param {any} section
 * @returns {any}
 */
export function withoutPosition(section) {
  if (section?.before == null && section?.after == null) return section;
  const {before: _before, after: _after, ...rest} = section;
  // Copy every own symbol (the provider and authored-title marks) too.
  for (const symbol of Object.getOwnPropertySymbols(section)) {
    Object.defineProperty(
      rest,
      symbol,
      /** @type {PropertyDescriptor} */ (
        Object.getOwnPropertyDescriptor(section, symbol)
      ),
    );
  }
  return rest;
}

/**
 * The base section an extension section replaces. A stable ID matches first.
 * Otherwise the exact title matches when at least one side has no ID: the
 * migration window in which the base or the extension adopts stable IDs
 * before the other does. Two different authored IDs stay distinct even under
 * one title.
 *
 * @param {any[]} sections
 * @param {any} section
 * @returns {number}
 */
function findMergeTarget(sections, section) {
  const title = sourceTitle(section);
  const key = sectionKey(section);
  // A section is addressed by its key: an authored id, or the key its title
  // derives, which is the key the topic's index shows. Matching on it means an
  // extension never appends a second section under a key already in use.
  const byKey = () =>
    sections.findIndex(candidate => sectionKey(candidate) === key);
  const legacyTitleMatch = () =>
    sections.findIndex(
      candidate => candidate.id == null && sourceTitle(candidate) === title,
    );
  if (section.id != null) {
    const byId = byKey();
    return byId === -1 ? legacyTitleMatch() : byId;
  }
  const legacy = legacyTitleMatch();
  if (legacy !== -1) return legacy;
  const sameTitle = sections.findIndex(
    candidate => sourceTitle(candidate) === title,
  );
  if (sameTitle !== -1) return sameTitle;
  // A base section retitled later keeps its old key as its `id`, so an
  // extension that still names it by the old title finds it by that id. A
  // title variant of a section with no id stays a separate section.
  return sections.findIndex(candidate => candidate.id === key);
}

/**
 * A component a link can name: its owner's provider id, package, and name,
 * and the doc file that describes it.
 * @typedef {object} LinkableComponent
 * @property {string} providerId
 * @property {string} package
 * @property {string} name
 * @property {string | null} docPath
 * @property {string} [replaces] the Core component whose name it answers to
 *   in unqualified lookups (spec:AST-035 FR11)
 */

/**
 * A page or block template a link can name, by the id `astryx template` takes.
 * @typedef {object} LinkableTemplate
 * @property {string} providerId
 * @property {string} package
 * @property {'page' | 'block'} type
 * @property {string} id
 * @property {string} name
 * @property {string} [displayName]
 * @property {string} [description]
 * @property {string} [replaces] the Core template id it answers to in
 *   unqualified lookups
 */

/**
 * The component and template docs links can name (spec:AST-047 FR9). No docs
 * tree holds them, so a catalog carries the records the project reads.
 * @typedef {{components: LinkableComponent[], templates: LinkableTemplate[]}} LinkableContributions
 */

/**
 * Every topic a project can read, and the relationships between them.
 *
 * Insertion order is the read order: the built-in topics in discovery order,
 * then whatever the configured integrations add, in the order they are
 * configured. A replacement keeps the position of the topic it replaced, so
 * "the first topic" stays stable for a reader that opens it by default.
 */
export class DocsCatalog {
  /** @type {Map<string, DocsTopicEntry>} */
  #topics = new Map();
  /** @type {(() => Promise<LinkableContributions>) | null} */
  #contributions = null;
  /** @type {Promise<LinkableContributions> | null} */
  #contributionsLoaded = null;
  /** @type {Map<string, string>} old topic name → the name that replaced it */
  #aliases = new Map();
  /** @type {Array<{namespaces: import('../doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../doc-compiler/tree.mjs').TreeDocInput[]}>} */
  #treeInputs = [];
  /** @type {Array<{package: string, message: string}>} */
  #issues = [];
  /** @type {Map<string, GuideOverlay>} lowercased route → what applies there */
  #guideOverlays = new Map();
  /** @type {DocsTopicRecord[]} every doc that targets a route, in order */
  #guideTargeters = [];

  /**
   * Record a doc that replaces or extends a guide the docs tree places, by
   * its route. Whether the route holds such a guide is known only once the
   * tree is built: {@link guideOverlay} applies the record there, and a route
   * that holds none applies nothing.
   * @param {DocsTopicRecord} record
   * @returns {import('../integrations/issue').AstryxIntegrationIssue | null}
   */
  #targetGuide(record) {
    const route = /** @type {string} */ (
      record.replaces ?? record.extendsTopic
    );
    const key = route.toLowerCase();
    const overlay = this.#guideOverlays.get(key) ?? {
      replacement: null,
      extensions: [],
    };
    if (record.replaces != null) {
      const earlier = overlay.replacement;
      if (earlier) {
        // As with a flat topic, the later-configured doc wins, and reads name
        // the replacement it took over from. Unlike a flat topic's, this is
        // no warning: a new failing finding joins only in a minor release
        // (architecture:cli-surface INV35); `integration validate` lists one
        // package's two replacements of a guide as a note.
        overlay.replacedPackage = earlier.package;
      }
      // Extensions were authored against the content that just went away.
      overlay.replacement = record;
      overlay.extensions = [];
    } else {
      overlay.extensions.push({
        package: record.package,
        path: record.path,
        ...(record.providerId ? {providerId: record.providerId} : {}),
      });
    }
    this.#guideOverlays.set(key, overlay);
    this.#guideTargeters.push(record);
    return null;
  }

  /**
   * What the integrations do to the guide the docs tree places at `route`, or
   * null when they leave it as it is.
   * @param {string} route
   * @returns {GuideOverlay | null}
   */
  guideOverlay(route) {
    return this.#guideOverlays.get(route.toLowerCase()) ?? null;
  }

  /**
   * Every doc that replaces or extends a guide by its route, in configured
   * order, so a check can name a route that holds no guide.
   * @returns {ReadonlyArray<DocsTopicRecord>}
   */
  get guideTargeters() {
    return this.#guideTargeters;
  }

  /**
   * Record a doc file a package ships that did not load. Its package's docs
   * are withdrawn; readers name the package so an author knows where to look.
   * @param {{package: string, message: string}} issue
   */
  addIssue(issue) {
    this.#issues.push(issue);
  }

  /**
   * The doc files that did not load, by package.
   * @returns {ReadonlyArray<{package: string, message: string}>}
   */
  get issues() {
    return this.#issues;
  }

  /**
   * Add the namespace docs and placed guides one integration ships to the
   * docs tree (spec:AST-046).
   * @param {{namespaces: import('../doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../doc-compiler/tree.mjs').TreeDocInput[]}} inputs
   */
  addTreeInputs(inputs) {
    if (inputs.namespaces.length > 0 || inputs.guides.length > 0) {
      this.#treeInputs.push(inputs);
    }
  }

  /**
   * What the integrations add to the docs tree, in configured order.
   * @returns {ReadonlyArray<{namespaces: import('../doc-compiler/tree.mjs').TreeNamespaceInput[], guides: import('../doc-compiler/tree.mjs').TreeDocInput[]}>}
   */
  get treeInputs() {
    return this.#treeInputs;
  }

  /**
   * Say where links find component, page, and block docs: the records
   * `astryx component` and `astryx template` read, loaded on first use.
   * @param {() => Promise<LinkableContributions>} load
   */
  setContributions(load) {
    this.#contributions = load;
    this.#contributionsLoaded = null;
  }

  /**
   * The component and template docs links can name, or null when nothing set
   * them, so no link to one resolves.
   * @returns {Promise<LinkableContributions | null>}
   */
  contributions() {
    if (!this.#contributions) return Promise.resolve(null);
    this.#contributionsLoaded ??= this.#contributions();
    return this.#contributionsLoaded;
  }

  /**
   * Seed a catalog with the CLI's own topics.
   * @param {Record<string, string>} [builtins] topic name → absolute path
   * @returns {DocsCatalog}
   */
  static fromBuiltins(builtins = discoverBuiltinTopics()) {
    const catalog = new DocsCatalog();
    for (const [name, file] of Object.entries(builtins)) {
      catalog.#topics.set(name.toLowerCase(), {
        name,
        package: BUILTIN_DOCS_PACKAGE,
        path: file,
        extensions: [],
      });
    }
    return catalog;
  }

  /**
   * Add one integration-contributed doc, honoring what it declares. Returns
   * the issue it caused, or null when it applied cleanly — the caller owns
   * routing (an `error` skips the contribution, a `warning` keeps it).
   *
   * @param {DocsTopicRecord} record
   * @returns {import('../integrations/issue').AstryxIntegrationIssue | null}
   */
  add(record) {
    if (record.extendsTopic != null) {
      const target = this.resolve(record.extendsTopic);
      if (!target && isGuideRoute(record.extendsTopic)) {
        return this.#targetGuide(record);
      }
      if (!target) {
        return {
          code: 'invalid_doc',
          severity: 'error',
          message: `"${record.name}" extends "${record.extendsTopic}", which is not a topic in this project.`,
        };
      }
      target.extensions.push({
        package: record.package,
        path: record.path,
        ...(record.providerId ? {providerId: record.providerId} : {}),
      });
      return null;
    }

    if (record.replaces != null) {
      const target = this.resolve(record.replaces);
      if (!target && isGuideRoute(record.replaces)) {
        return this.#targetGuide(record);
      }
      if (!target) {
        return {
          code: 'invalid_doc',
          severity: 'error',
          message: `"${record.name}" replaces "${record.replaces}", which is not a topic in this project.`,
        };
      }
      /** @type {import('../integrations/issue').AstryxIntegrationIssue | null} */
      let warning = null;
      if (target.package !== BUILTIN_DOCS_PACKAGE) {
        // Two integrations replacing one topic is a real configuration, not a
        // broken one: the later-configured package wins, the way the last
        // writer does everywhere else. Both are named so the loser is visible.
        warning = {
          code: 'duplicate_doc',
          severity: 'warning',
          message: `Topic "${record.replaces}" is replaced by both ${target.package} and ${record.package}. ${record.package} is configured later, so it wins.`,
        };
      }
      // The replacement takes the base topic's slot, so a reader that opens
      // the first topic (or the nth) sees the same one it did before.
      const replaced = target.name;
      const replacedKey = replaced.toLowerCase();
      const replacementKey = record.name.toLowerCase();
      this.#replaceAt(replacedKey, {
        name: record.name,
        package: record.package,
        path: record.path,
        title: record.title,
        description: record.description,
        category: record.category,
        replaces: replaced,
        // The package whose topic it took over: an earlier replacement's, when
        // the topic was already replaced.
        replacedPackage: target.package,
        ...(record.providerId ? {providerId: record.providerId} : {}),
        // Extensions were authored against the content that just went away.
        extensions: [],
      });
      if (replacementKey !== replacedKey) {
        this.#aliases.set(replacedKey, replacementKey);
        // A topic renamed twice keeps every name it has ever answered to.
        for (const [from, to] of this.#aliases) {
          if (to === replacedKey) this.#aliases.set(from, replacementKey);
        }
      }
      return warning;
    }

    const topicKey = record.name.toLowerCase();
    const existing = this.#topics.get(topicKey);
    if (existing) {
      return {
        code: 'invalid_doc',
        severity: 'error',
        message: `Topic "${record.name}" is already provided by ${existing.package}. Give it another name, or declare \`replaces: '${record.name}'\` to take its place.`,
      };
    }
    this.#topics.set(topicKey, {
      name: record.name,
      package: record.package,
      path: record.path,
      title: record.title,
      description: record.description,
      category: record.category,
      ...(record.providerId ? {providerId: record.providerId} : {}),
      extensions: [],
    });
    return null;
  }

  /**
   * Every other name a topic answers to, lowercased: the names of the topics
   * it replaced, directly or through a chain of replacements. `resolve` finds
   * the topic by each of them.
   * @param {DocsTopicEntry} entry
   * @returns {string[]}
   */
  aliasesOf(entry) {
    const key = entry.name.toLowerCase();
    return [...this.#aliases]
      .filter(([, to]) => to === key)
      .map(([from]) => from);
  }

  /**
   * Look a topic up by name, case-insensitively, following the alias a renamed
   * replacement left behind.
   * @param {unknown} name
   * @returns {DocsTopicEntry | undefined}
   */
  resolve(name) {
    if (typeof name !== 'string') return undefined;
    let key = name.toLowerCase();
    // An alias chain is at most as long as the number of replacements, and a
    // cycle can only come from a bug here; bound the walk either way.
    for (let hops = 0; hops <= this.#aliases.size; hops++) {
      const entry = this.#topics.get(key);
      if (entry) return entry;
      const next = this.#aliases.get(key);
      if (next == null) return undefined;
      key = next;
    }
    return undefined;
  }

  /** @returns {string[]} every topic name, in read order */
  names() {
    return [...this.#topics.values()].map(entry => entry.name);
  }

  /** @returns {DocsTopicEntry[]} every topic, in read order */
  entries() {
    return [...this.#topics.values()];
  }

  /**
   * Swap an entry in place, preserving its position in the read order.
   * @param {string} name
   * @param {DocsTopicEntry} entry
   */
  #replaceAt(name, entry) {
    /** @type {Map<string, DocsTopicEntry>} */
    const next = new Map();
    for (const [key, value] of this.#topics) {
      if (key === name.toLowerCase()) next.set(entry.name.toLowerCase(), entry);
      else next.set(key, value);
    }
    this.#topics = next;
  }
}
