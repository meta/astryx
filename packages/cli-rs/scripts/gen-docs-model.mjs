// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Compile the CLI's own docs (packages/cli/assets/docs and the CLI's typed
 * self-docs) into the JSON model the Rust `docs` command embeds.
 *
 * The model holds, for each package manager a doc's `{@pm}` steps render for,
 * the docs tree, the topic list, and every topic read (whole doc, section
 * index, sections) in each language. Strings are interned in one table, so
 * the five variants share their text.
 *
 * Usage: node scripts/gen-docs-model.mjs [--check]
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, '../../cli');
const out = path.resolve(here, '../src/commands/docs/docs-model.json');

const imp = rel => import(path.join(cliRoot, rel));

const adapter = await imp('api/docs/_adapter.mjs');
const {DocsCatalog} = await imp('foundation/discovery/docs-discovery.mjs');
const {runWithDocPackageManager} = await imp('foundation/env/package-manager.mjs');
const {linkReferenceTopic, linkReferenceSection} = await imp(
  'foundation/doc-compiler/compile.mjs',
);
const {detailView, indexView, readerSections, sectionView} = await imp(
  'foundation/doc-compiler/lenses.mjs',
);
const {sectionKey, sourceTitle} = await imp(
  'foundation/discovery/docs-section-key.mjs',
);
const {isExperimentalTreeNode} = await imp('foundation/doc-compiler/tree.mjs');
const {typedEdges} = await imp('api/docs/node/node.mjs');

const PMS = ['npm', 'pnpm', 'yarn', 'yarn-classic', 'bun'];
const LANGS = [null, 'dense', 'zh'];

// No project around the generator: the builtin catalog only.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-docs-gen-')));

const plain = value => JSON.parse(JSON.stringify(value));

async function topicRead(catalog, entry, lang) {
  const {node} = await adapter.resolveTopicDocs(
    entry.tree ? entry.route : entry.name,
    {lang},
    catalog,
  );
  const sectionPackage = adapter.sectionPackageOf(entry, node);
  const links = await adapter.topicLinks(catalog, entry);
  const linked = await linkReferenceTopic(
    node,
    adapter.referenceTargets(catalog, lang),
  );
  const view = detailView(linked);
  const detail = {
    ...view,
    sections: view.sections.map(section => {
      const {id, title, ...rest} = section;
      return {id, title, package: sectionPackage(id), ...rest};
    }),
    ...(entry.tree ? {name: entry.name} : {}),
    ...(entry.replaces != null ? {replaces: entry.replaces} : {}),
    links,
  };
  const iv = indexView(node);
  const index = {
    ...iv,
    name: entry.tree ? entry.name : iv.name,
    sections: iv.sections.map(s => ({
      id: s.id,
      title: s.title,
      package: sectionPackage(s.id),
      summary: s.summary,
    })),
    links,
  };
  const sections = readerSections(node);
  const reader = [];
  for (const section of sections) {
    const linkedSection = await linkReferenceSection(
      section,
      adapter.referenceTargets(catalog, lang),
    );
    const sv = plain(sectionView(node, linkedSection));
    const at = view.sections.findIndex(s => s.id === section.id);
    const same =
      at !== -1 && JSON.stringify(plain(view.sections[at])) === JSON.stringify(sv);
    reader.push({
      key: sectionKey(section),
      title: section.title,
      sourceTitle: sourceTitle(section),
      package: sectionPackage(section.id),
      ...(same ? {detailAt: at} : {view: sv}),
    });
  }
  // The section reads of the CLI's own docs never carry childText detail;
  // depth reads use detailView's sections without the package key.
  return plain({
    package: entry.package,
    detail,
    index,
    reader,
    childSections: view.sections,
  });
}

async function variant(pm) {
  return runWithDocPackageManager(pm, async () => {
    const catalog = DocsCatalog.fromBuiltins();
    const tree = await adapter.projectTree(catalog);
    const nodes = [];
    for (const node of tree.nodes.values()) {
      const content = node.ref?.selfDoc
        ? (await adapter.nodeContent(catalog, tree, node)).content
        : null;
      nodes.push({
        route: node.route,
        name: node.name,
        id: node.id ?? null,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        parent: node.parent ?? null,
        provider: node.provider,
        providerId: node.providerId ?? null,
        generated: Boolean(node.generated),
        flatTopic: node.ref?.flatTopic ?? null,
        topicFile: Boolean(node.ref?.topicFile),
        selfDoc: Boolean(node.ref?.selfDoc),
        experimental: isExperimentalTreeNode(tree, node),
        slots: node.slots.map(slot => ({
          name: slot.name,
          title: slot.title,
          children: slot.children,
        })),
        related: typedEdges(tree, node).routes,
        content,
      });
    }
    const topics = [];
    for (const entry of catalog.entries()) {
      const listed = await adapter.linkDocText(
        catalog,
        entry.providerId ?? entry.package,
        entry.description ??
          (await adapter.lowerTopic(catalog, entry)).doc.description ??
          '',
      );
      topics.push({
        name: entry.name,
        package: entry.package,
        providerId: entry.providerId ?? null,
        description: listed,
      });
    }
    const reads = {};
    for (const entry of catalog.entries()) {
      for (const lang of LANGS) {
        reads[`topic:${entry.name}:${lang ?? 'en'}`] = await topicRead(
          catalog,
          entry,
          lang,
        );
      }
    }
    for (const node of tree.nodes.values()) {
      if (node.kind !== 'generic' || !node.ref?.topicFile) continue;
      const entry = adapter.guideEntry(node);
      for (const lang of LANGS) {
        reads[`guide:${node.route}:${lang ?? 'en'}`] = await topicRead(
          catalog,
          entry,
          lang,
        );
      }
    }
    // What links and reference blocks in an integration's docs can name of
    // the CLI's own typed docs: each authoring self-doc (a section of
    // `astryx docs authoring`), and each schema's fields, row by row.
    const {linkBlocks, renderTokens} = await imp('foundation/doc-compiler/links.mjs');
    const authoringMod = await imp('foundation/discovery/authoring-self-docs.mjs');
    const cliResolve = await adapter.linkResolver(catalog, '@astryxdesign/cli');
    const fieldRows = async fields => {
      const out = {};
      for (const field of fields ?? []) {
        const table = authoringMod.schemaFieldTable([field]);
        out[field.name] = table
          ? (await linkBlocks([table], cliResolve)).content[0].rows
          : [];
      }
      return out;
    };
    const authoring = [];
    for (const {doc} of (await authoringMod.loadAuthoringSelfDocs()).loaded) {
      authoring.push({
        type: doc.type,
        name: doc.name,
        displayName: doc.displayName ?? null,
        description: renderTokens(doc.description ?? ''),
        experimental: authoringMod.isExperimentalSelfDoc(doc),
        content: (await linkBlocks(authoringMod.selfDocSection(doc).content, cliResolve)).content,
        fieldOrder: (doc.fields ?? []).map(f => f.name),
        fields: await fieldRows(doc.fields),
      });
    }
    const schemaFields = {};
    for (const node of tree.nodes.values()) {
      const doc = node.ref?.selfDoc;
      if (doc?.type !== 'schema') continue;
      schemaFields[node.route] = {
        fieldOrder: (doc.fields ?? []).map(f => f.name),
        fields: await fieldRows(doc.fields),
      };
    }
    return {nodes, topics, reads, authoring, schemaFields};
  });
}

// ─── Interned encoding ──────────────────────────────────────────────────────
// A string is its index in `strings`; a number is {"#": n}; the rest is JSON.

const strings = [];
const ids = new Map();
function intern(s) {
  let id = ids.get(s);
  if (id == null) {
    id = strings.length;
    strings.push(s);
    ids.set(s, id);
  }
  return id;
}
function encode(value) {
  if (typeof value === 'string') return intern(value);
  if (typeof value === 'number') return {'#': value};
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(value)) o[k] = encode(v);
    return o;
  }
  return value;
}

// The CLI's own tree inputs, so a project with integration docs can build
// the tree again with theirs.
const {loadTreeInputs} = await imp('foundation/doc-compiler/tree.mjs');
const treeInputs = await loadTreeInputs();
const cliTree = plain({
  namespaces: treeInputs.namespaces.map(n => ({
    provider: n.provider,
    providerId: n.providerId,
    source: n.source,
    doc: n.doc,
  })),
  docs: treeInputs.docs.map(d => ({
    provider: d.provider,
    providerId: d.providerId,
    source: d.source,
    kind: d.kind,
    name: d.name,
    title: d.title,
    summary: d.summary,
    group: d.group,
    placement: d.placement ?? null,
    topicFile: d.ref?.topicFile ? path.basename(d.ref.topicFile) : null,
    stability: d.ref?.selfDoc?.stability ?? null,
  })),
});

const variants = {};
for (const pm of PMS) variants[pm] = encode(await variant(pm));
const text = `${JSON.stringify({strings, cliTree: encode(cliTree), variants})}\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (current !== text) {
    console.error(`${path.relative(process.cwd(), out)} is stale: run node scripts/gen-docs-model.mjs`);
    process.exit(1);
  }
  console.log('docs model is current');
} else {
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, text);
  console.log(`wrote ${out} (${text.length} bytes, ${strings.length} strings)`);
}
