// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compiled docs bundle — every descriptor a project reads, compiled at
 *   once.
 *
 * @input A loaded Project and a reading language.
 * @output A plain-JSON bundle: the schema version, the language, one compiled
 *   node per descriptor (a doc topic with its extensions is one linked node),
 *   and every compiler diagnostic, in one deterministic order.
 * @position The whole-project view of the compiler, for checks that need every
 *   node at once; today only tests call it. Single reads stay lazy:
 *   ./read.mjs and api/docs/_adapter.mjs compile only what a read touches.
 *   Internal to the CLI.
 */

import * as path from 'node:path';
import {
  readStaticDescriptorValue,
  readThemeDescriptorValue,
  themeDescriptorLabel,
} from '../discovery/theme-discovery.mjs';
import {
  COMPILED_DOC_SCHEMA_VERSION,
  linkReferenceTopic,
  lowerReferenceTopic,
} from './compile.mjs';
import {diagnostic as rawDiagnostic, sortDiagnostics} from './diagnostics.mjs';
import {collectDocInputs} from './inputs.mjs';
import {compileDocFile, loadTopicInput, readDocView} from './read.mjs';
import {packageSource, scrubPaths} from './source.mjs';

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

/**
 * @typedef {import('./compile.mjs').CompiledDocNode} CompiledDocNode
 * @typedef {import('./compile.mjs').CompiledReferenceNode} CompiledReferenceNode
 * @typedef {import('./diagnostics.mjs').CompilerDiagnostic} CompilerDiagnostic
 */

/**
 * @typedef {object} CompiledDocsBundle
 * @property {number} schemaVersion
 * @property {string | null} lang
 * @property {Array<CompiledDocNode | CompiledReferenceNode>} nodes in the order
 *   the project reads its roots
 * @property {CompilerDiagnostic[]} diagnostics sorted
 */

/**
 * Compile every descriptor the project reads.
 *
 * A problem with one descriptor withdraws that node and is reported; it never
 * stops the rest, so every node in the bundle reads back through the sealed
 * parser. A token reference that finds nothing is a warning: readers
 * print a placeholder for it, as they always have.
 *
 * @param {import('../config/project.mjs').Project} project
 * @param {{lang?: string | null}} [options]
 * @returns {Promise<CompiledDocsBundle>}
 */
export async function compileDocs(project, {lang = null} = {}) {
  const {inputs, problems} = await collectDocInputs(project);
  /** @type {CompilerDiagnostic[]} */
  const diagnostics = problems.map(problem =>
    diagnostic(problem.code, {
      provider: problem.provider,
      source: problem.source,
      message: problem.message,
    }),
  );
  const catalog = await project.docs();

  /** @type {Map<string, CompiledReferenceNode>} lowered topics by name */
  const topics = new Map();
  for (const entry of catalog.entries()) {
    const input = await loadTopicInput(entry, lang);
    const failed = [input.base, ...input.extensions].filter(
      file => 'error' in file || 'overlayError' in file,
    );
    if (failed.length > 0) {
      for (const file of failed) {
        const fromExtension = input.extensions.find(ext => ext === file);
        const path = fromExtension
          ? entry.extensions[input.extensions.indexOf(fromExtension)].path
          : entry.path;
        diagnostics.push(
          diagnostic('error' in file ? 'load_failed' : 'overlay_failed', {
            provider: fromExtension ? fromExtension.provider : entry.package,
            source: packageSource(path),
            message: `${file.file}: ${messageOf('error' in file ? file.error : file.overlayError)}`,
          }),
        );
      }
      continue;
    }
    try {
      topics.set(entry.name.toLowerCase(), lowerReferenceTopic(input));
    } catch (error) {
      diagnostics.push(
        diagnostic(
          errorCode(error) === 'not_json' ? 'not_json' : 'invalid_topic',
          {
            provider: entry.package,
            source: packageSource(entry.path),
            message: messageOf(error),
          },
        ),
      );
    }
  }
  // Guides placed in a namespace, lowered, so a token reference to the
  // namespace (a flat topic split into guides, such as `tokens`) reads them
  // in placement order as one topic, as the docs API does.
  /** @type {Map<string, Array<{order: number, node: CompiledReferenceNode}>>} */
  const placedGuides = new Map();
  for (const input of inputs) {
    if (
      input.root !== 'tree' ||
      (await treeDocType(input.file)) !== 'generic'
    ) {
      continue;
    }
    const topic = await loadTopicInput(
      {
        name: input.name,
        package: input.owner,
        path: input.file,
        extensions: [],
        tree: true,
      },
      lang,
    );
    if ('error' in topic.base || 'overlayError' in topic.base) continue;
    const parent = /^namespace:(.+)$/u.exec(
      topic.base.doc?.placement?.parent ?? '',
    )?.[1];
    if (!parent) continue;
    try {
      const node = lowerReferenceTopic(topic);
      const list = placedGuides.get(parent.toLowerCase()) ?? [];
      list.push({order: topic.base.doc.placement.order ?? 0, node});
      placedGuides.set(parent.toLowerCase(), list);
    } catch {
      // Reported where the guide itself is compiled below.
    }
  }
  /** @param {string} name */
  const lowerTarget = async name => {
    const target = catalog.resolve(name);
    if (target) return topics.get(target.name.toLowerCase()) ?? null;
    const guides = placedGuides.get(name.toLowerCase());
    if (!guides) return null;
    const ordered = [...guides].sort((a, b) => a.order - b.order);
    /** @type {Record<string, string>} */
    const sourceTitles = {};
    for (const {node} of ordered) {
      for (const [key, title] of Object.entries(node.sourceTitles)) {
        sourceTitles[key] ??= title;
      }
    }
    return /** @type {any} */ ({
      id: name,
      doc: {sections: ordered.flatMap(({node}) => node.doc.sections)},
      sourceTitles,
    });
  };

  /** @type {Array<CompiledDocNode | CompiledReferenceNode>} */
  const nodes = [];
  for (const input of inputs) {
    // A guide the docs tree places is a reference topic, lowered and linked
    // like one; a namespace doc lowers like any typed descriptor below.
    if (
      input.root === 'tree' &&
      (await treeDocType(input.file)) === 'generic'
    ) {
      const entry = {
        name: input.name,
        package: input.owner,
        path: input.file,
        extensions: [],
        tree: true,
      };
      const topic = await loadTopicInput(entry, lang);
      if ('error' in topic.base || 'overlayError' in topic.base) {
        const failure =
          'error' in topic.base ? topic.base.error : topic.base.overlayError;
        diagnostics.push(
          diagnostic('error' in topic.base ? 'load_failed' : 'overlay_failed', {
            provider: input.owner,
            source: input.source,
            message: `${topic.base.file}: ${messageOf(failure)}`,
          }),
        );
        continue;
      }
      try {
        const linked = await linkReferenceTopic(
          lowerReferenceTopic(topic),
          lowerTarget,
        );
        diagnostics.push(...unresolvedReferences(linked, input));
        nodes.push(linked);
      } catch (error) {
        diagnostics.push(
          diagnostic('invalid_topic', {
            provider: input.owner,
            source: input.source,
            message: messageOf(error),
          }),
        );
      }
      continue;
    }
    if (input.root === 'docs') {
      if (input.role !== 'base') continue;
      const lowered = topics.get(input.name.toLowerCase());
      if (!lowered) continue;
      const linked = await linkReferenceTopic(lowered, lowerTarget);
      diagnostics.push(...unresolvedReferences(linked, input));
      nodes.push(linked);
      continue;
    }
    const result = await compileDocFile(
      input.file,
      {
        root: input.root,
        provider: input.owner,
        id: input.id,
        lang:
          input.root === 'components' || input.root === 'hooks' ? lang : null,
        check: true,
        ...(input.root === 'templates' ? {loader: 'template'} : {}),
        ...(input.root === 'tree' ? {loader: 'native'} : {}),
        ...(input.root === 'icon-definitions'
          ? {
              label: `Icon definition ${path.basename(input.file)} in ${input.owner}`,
              readStatic: () =>
                readStaticDescriptorValue(
                  input.file,
                  `Icon definition ${path.basename(input.file)} in ${input.owner}`,
                  'IconDefinitionDoc',
                  {data: true},
                ),
            }
          : {}),
        ...(input.root === 'themes'
          ? {
              label: themeDescriptorLabel(input.file, input.owner),
              readStatic: () =>
                readThemeDescriptorValue(
                  input.file,
                  themeDescriptorLabel(input.file, input.owner),
                ),
            }
          : {}),
      },
      {node: true},
    );
    diagnostics.push(...result.diagnostics);
    // A descriptor with a problem of its own withdraws its node.
    if (result.node && !result.diagnostics.some(d => d.severity === 'error')) {
      nodes.push(result.node);
    }
  }

  return {
    schemaVersion: COMPILED_DOC_SCHEMA_VERSION,
    lang,
    nodes,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

/**
 * The stamped type of a docs-tree file, or null when it cannot be read; the
 * compile that follows reports why.
 * @param {string} file
 * @returns {Promise<string | null>}
 */
async function treeDocType(file) {
  try {
    const doc = await readDocView(file, {root: 'tree', loader: 'native'});
    return typeof doc?.type === 'string' ? doc.type : null;
  } catch {
    return null;
  }
}

/**
 * A warning for each token reference in a linked topic that finds no topic or
 * no section.
 * @param {CompiledReferenceNode} node
 * @param {import('./inputs.mjs').DocInput} input
 * @returns {CompilerDiagnostic[]}
 */
function unresolvedReferences(node, input) {
  /** @type {CompilerDiagnostic[]} */
  const found = [];
  for (const section of node.doc.sections) {
    for (const block of section.content) {
      if (block?.type !== 'token-ref') continue;
      const status = block.resolved?.status;
      if (status === 'resolved') continue;
      found.push(
        diagnostic('unresolved_reference', {
          provider: input.owner,
          source: input.source,
          field: `sections.${section.id}`,
          message:
            status === 'unknown-topic'
              ? `"${node.id}" section "${section.id}" refers to topic "${block.topic}", which this project does not have.`
              : `"${node.id}" section "${section.id}" refers to section "${block.section}" of "${block.topic}", which that topic does not have.`,
        }),
      );
    }
  }
  return found;
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {unknown} error */
function errorCode(error) {
  return error && typeof error === 'object' && 'compilerCode' in error
    ? error.compilerCode
    : undefined;
}
