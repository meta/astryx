// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The lookup commands' not-found hint reads one name index per
 * project: what Core's file and folder names, the CLI's page and block
 * templates, the integrations' templates, components and docs folders, and
 * the CLI's own docs say each catalog can hold. It is made from file names,
 * doc text and the name each integration doc declares, and kept in the kept
 * gathers' store under one stamp set: every folder it listed and every file
 * it read. While all of them keep their stamps, a miss reads the index and
 * stats those paths, and nothing else.
 *
 * @input Core's folder, the integrations the project loads, the CLI's own
 *   folders
 * @output {@link hintNameIndex}: the index
 * @position foundation/suggest: read by ./other-command.mjs. A miss loads
 *   only this module and the folders it reads (../discovery/name-roots.mjs);
 *   the modules that make the index load only when no kept one answers.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hasNameLine, keptTreeSummaryAsync} from '../fs/kept-tree.mjs';
import {makeGatherCacheDir} from '../fs/gather-cache.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {
  BLOCKS_DIR,
  BUILTIN_DOCS_DIR,
  BUILTIN_TOPIC_FILE_RE,
  CLI_SELF_DOC_DIRS,
  PAGES_DIR,
  skipCliSelfDocFolder,
  skipComponentsFolder,
  skipCoreFolder,
  skipDocsFolder,
  templateRoots,
} from '../discovery/name-roots.mjs';

/** The modules whose code decides the index's shape and content. */
const INDEX_CODE = [
  fileURLToPath(import.meta.url),
  ...[
    '../discovery/name-roots.mjs',
    '../discovery/entry-name-files.mjs',
    '../discovery/template-ids.mjs',
    '../discovery/cli-self-doc-names.mjs',
    '../discovery/docs-section-key.mjs',
    '../discovery/docs-discovery.mjs',
    '../doc-compiler/generated-levels.mjs',
  ].map(rel => fileURLToPath(new URL(rel, import.meta.url))),
];

/**
 * One integration doc in the index: its path from its docs folder, and the
 * name it declares with whether it is placed, as docs discovery loads it
 * (docs-discovery.mjs integrationDocDeclaration); null when it does not load.
 * `segment` is the name as a route segment, folded.
 * @typedef {{rel: string, declared: {name: string, placed: boolean, segment: string} | null}} DocEntry
 */

/**
 * The project's name index.
 * @typedef {{
 *   core: string | string[] | null,
 *   templates: {pages: string | string[], blocks: string | string[], listed: Array<string | string[]>},
 *   components: Array<{stems: string | string[], words: string | string[], unreadable: boolean}>,
 *   docs: DocEntry[][],
 *   topics: string[],
 *   treeStems: string[],
 *   segments: string | string[],
 *   selfDocs: string | string[],
 * }} NameIndex
 *   `core`: Core's names (entry-name-files.mjs coreNameLines), null without
 *   Core; `templates`: Core's page folders, folded, and the block ids and
 *   each integration templates folder's ids (template-ids.mjs
 *   templateIdLines); `components`, `docs`: one index for each integration
 *   components or docs folder that is set, in project order; `topics`: the
 *   CLI's flat topics, as docs discovery lists them; `treeStems`: the stem of
 *   each CLI docs tree file, in listing order; `segments`: the folded route
 *   segment of each of those, of each level the docs tree generates
 *   (generated-levels.mjs), as lines; `selfDocs`: the route segments the
 *   CLI's typed docs can carry (cli-self-doc-names.mjs)
 */

/**
 * The name index of a project with Core at `coreDir` and these
 * integrations: the kept one while every folder it listed and every file it
 * read is unchanged, else made now and kept. Making it loads each integration
 * doc once, to keep the name it declares; what those loads read is checked
 * too. The kept gathers' folder is made first where none exists
 * (gather-cache.mjs makeGatherCacheDir), so the first miss keeps it for the
 * next.
 * @param {string | null} coreDir
 * @param {Array<{components?: string, templates?: string, docs?: unknown} | null | undefined>} integrations
 * @returns {Promise<NameIndex>}
 */
export function hintNameIndex(coreDir, integrations) {
  makeGatherCacheDir();
  const templates = templateRoots(
    integrations.flatMap(each => (each ? [each] : [])),
  );
  const components = integrations.flatMap(each =>
    each?.components ? [each.components] : [],
  );
  const docs = integrations.flatMap(each =>
    each?.docs ? [/** @type {string} */ (each.docs)] : [],
  );
  const selfDocs = CLI_SELF_DOC_DIRS.map(dir => path.join(CLI_ROOT, dir));
  return keptTreeSummaryAsync(
    {
      kind: 'hint-names',
      roots: [
        ...(coreDir
          ? [{root: path.join(coreDir, 'src'), skip: skipCoreFolder}]
          : []),
        {root: PAGES_DIR, skip: () => true},
        BLOCKS_DIR,
        ...templates,
        ...components.map(root => ({root, skip: skipComponentsFolder})),
        ...docs.map(root => ({root, skip: skipDocsFolder})),
        BUILTIN_DOCS_DIR,
        ...selfDocs.map(root => ({root, skip: skipCliSelfDocFolder})),
      ],
      code: INDEX_CODE,
      recorded: true,
    },
    async trees => {
      const [names, ids, self, levels, sections] = await Promise.all([
        import('../discovery/entry-name-files.mjs'),
        import('../discovery/template-ids.mjs'),
        import('../discovery/cli-self-doc-names.mjs'),
        import('../doc-compiler/generated-levels.mjs'),
        import('../discovery/docs-section-key.mjs'),
      ]);
      let at = 0;
      const next = (/** @type {number} */ count) =>
        trees.slice(at, (at += count));
      const [core] = coreDir ? next(1) : [null];
      const [pages, blocks, ...listed] = next(2 + templates.length);
      const componentTrees = next(components.length);
      const docsTrees = next(docs.length);
      const [builtin] = next(1);
      const selfDocTrees = next(selfDocs.length);
      const {topics, treeStems} = builtinDocNames(builtin.folders);
      /** @type {DocEntry[][]} */
      const docEntries = [];
      for (const [i, tree] of docsTrees.entries()) {
        docEntries.push(
          await declaredDocs(
            docs[i],
            names.integrationDocFiles(tree.folders),
            name => names.foldEntryName(sections.routeSegment(name)),
          ),
        );
      }
      return {
        core: core ? names.coreNameLines(core.folders) : null,
        templates: {
          pages: pageLines(pages.folders, names),
          blocks: ids.templateIdLines(blocks.folders, true),
          listed: listed.map(tree => ids.templateIdLines(tree.folders, false)),
        },
        components: componentTrees.map(names.componentNameIndex),
        docs: docEntries,
        topics,
        treeStems,
        segments: names.foldedLines(
          [
            ...Object.values(levels.TOPIC_LEVELS).map(level => level.route),
            ...Object.values(levels.KIND_GROUPS).map(group => group.segment),
            ...topics,
            ...treeStems,
          ].map(name => sections.routeSegment(name)),
        ),
        selfDocs: self.cliSelfDocNameLines(selfDocTrees),
      };
    },
  );
}

/**
 * Which template files can give an id that folds to `wanted`: `pages` false
 * means Core's page folders give no page id that folds to it, `blocks` false
 * that its block templates give no block id that does, and `listed` says
 * whether any of the integrations ships a template doc whose id, or the id's
 * last segment, folds to it.
 * @param {NameIndex['templates']} templates
 * @param {string} wanted a folded name
 * @returns {{pages: boolean, blocks: boolean, listed: boolean}}
 */
export function templateFilesNaming(templates, wanted) {
  return {
    pages: hasNameLine(templates.pages, wanted),
    blocks: hasNameLine(templates.blocks, wanted),
    listed: templates.listed.some(lines => hasNameLine(lines, wanted)),
  };
}

/**
 * Core's page template ids, folded, as lines: its page folders' names.
 * @param {import('../fs/kept-tree.mjs').TreeFolder[]} folders the pages
 *   folder's own listing
 * @param {typeof import('../discovery/entry-name-files.mjs')} names
 * @returns {string | string[]}
 */
function pageLines(folders, names) {
  return names.foldedLines(
    (folders.find(folder => folder.rel === '')?.entries ?? []).flatMap(
      ({name, isDir}) => (isDir ? [name] : []),
    ),
  );
}

/**
 * Each doc under an integration's docs folder with the name it declares.
 * @param {string} docsDir
 * @param {string[]} docs its docs, by path from it, in walk order
 * @param {(name: string) => string} segmentOf a name's folded route segment
 * @returns {Promise<DocEntry[]>}
 */
async function declaredDocs(docsDir, docs, segmentOf) {
  if (docs.length === 0) return [];
  const {integrationDocDeclaration} =
    await import('../discovery/docs-discovery.mjs');
  /** @type {DocEntry[]} */
  const entries = [];
  for (const rel of docs) {
    const declared = await integrationDocDeclaration(path.join(docsDir, rel));
    entries.push({
      rel,
      declared: declared && {...declared, segment: segmentOf(declared.name)},
    });
  }
  return entries;
}

/**
 * The CLI's flat topics, in the order docs discovery lists them
 * (discoverBuiltinTopics), and the stem of each docs tree file, in listing
 * order, from the tree of its docs folder.
 * @param {import('../fs/kept-tree.mjs').TreeFolder[]} folders
 * @returns {{topics: string[], treeStems: string[]}}
 */
function builtinDocNames(folders) {
  /** @param {string} rel */
  const names = rel =>
    folders.find(folder => folder.rel === rel)?.entries.map(e => e.name) ?? [];
  /** @type {Record<string, true>} */
  const topics = Object.create(null);
  for (const file of names('')) {
    const match = file.match(BUILTIN_TOPIC_FILE_RE);
    if (match) topics[match[1]] = true;
  }
  return {
    topics: Object.keys(topics),
    treeStems: names('tree').flatMap(file => {
      const stem = BUILTIN_TOPIC_FILE_RE.exec(file)?.[1];
      return stem == null ? [] : [stem];
    }),
  };
}
