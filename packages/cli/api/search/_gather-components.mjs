// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's component candidates: Core's components and the ones
 * integrations contribute, read from their docs. Imported only by the adapter.
 */

import fs from 'node:fs';
import path from 'node:path';
import {discoverExternalPackages} from '../../foundation/fs/paths.mjs';
import {
  discoverComponents,
  discoverValidIntegrationComponents,
  docStem,
  familyMember,
  findComponentReadme,
  forEachIntegrationDoc,
  integrationMemberEntry,
  integrationRecordHold,
  isIntegrationMember,
  resolveImportPath,
  resolveIntegrationImportPath,
  CORE_PACKAGE,
} from '../../foundation/discovery/component-discovery.mjs';
import {
  loadComponentReplacements,
  loadIntegrationsSafely,
  resolveLegacyExternalDoc,
} from '../component/_adapter.mjs';
import {loadModuleDoc, guidanceFrom} from './_module-doc.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * The members a family doc names, each with the family and its place among
 * the members (the family's own entry left out). A query naming the family
 * lists its first members (see scoreCandidate).
 * @param {any} docs
 * @returns {Map<string, {_family: string, _familyIndex: number}>}
 */
function familyPlaces(docs) {
  /** @type {Map<string, {_family: string, _familyIndex: number}>} */
  const out = new Map();
  if (!docs || typeof docs.name !== 'string') return out;
  (Array.isArray(docs.components) ? docs.components : [])
    .map((/** @type {any} */ m) => (typeof m === 'string' ? m : m?.name))
    .filter(
      (/** @type {unknown} */ n) => typeof n === 'string' && n !== docs.name,
    )
    .forEach((/** @type {string} */ n, /** @type {number} */ i) =>
      out.set(n, {_family: docs.name, _familyIndex: i}),
    );
  return out;
}

/**
 * Build component candidates from core's own tree: name + keywords +
 * usage/description from the component's .doc.mjs.
 * @param {string} coreDir
 * @returns {Promise<Candidate[]>}
 */
async function gatherCoreComponents(coreDir) {
  const grouped = discoverComponents(coreDir);
  const names = Object.values(grouped).flat();
  /** @type {Candidate[]} */
  const candidates = [];
  /** @type {Map<string, {_family: string, _familyIndex: number}>} */
  const places = new Map();
  for (const comp of names) {
    const readme = findComponentReadme(coreDir, comp);
    /** @type {string[]} */
    let keywords = [];
    let description = '';
    /** @type {string[]} */
    let guidance = [];
    if (readme && readme.endsWith('.doc.mjs')) {
      const loaded = await loadModuleDoc(readme);
      // A member documented in its family's doc (VStack in Stack's doc) is
      // indexed from its own entry: the family's keywords and guidance
      // describe the family, not the member.
      const doc = familyMember(loaded, comp) ?? loaded;
      if (doc) {
        keywords = Array.isArray(doc.keywords) ? doc.keywords : [];
        description = doc.usage?.description || doc.description || '';
        guidance = guidanceFrom(doc);
      }
      for (const [n, place] of familyPlaces(loaded)) places.set(n, place);
    }
    candidates.push({
      domain: 'component',
      name: comp,
      keywords,
      description,
      guidance,
      _package: CORE_PACKAGE,
      _import: resolveImportPath(coreDir, comp),
    });
  }
  // A family doc with no component of its own name (Chat) names members too.
  const srcDir = path.join(coreDir, 'src');
  const listed = new Set(names);
  for (const dir of fs.existsSync(srcDir) ? fs.readdirSync(srcDir) : []) {
    const doc = path.join(srcDir, dir, `${dir}.doc.mjs`);
    if (listed.has(dir) || !fs.existsSync(doc)) continue;
    for (const [n, place] of familyPlaces(await loadModuleDoc(doc)))
      places.set(n, place);
  }
  // A family doc names its members, whose own docs may sit elsewhere.
  return candidates.map(c => ({...c, ...places.get(c.name)}));
}

/**
 * Build component candidates contributed by the project's configured
 * integrations (astryx.config's `integrations`): name + keywords +
 * usage/description from each component's .doc.mjs, same as core. Without
 * this, an integration component is invisible to `search`/`build` even
 * though `component --list`/`component <Name>` already resolve it — the two
 * discovery paths silently disagreed. Also returns, per name, the docs that
 * hold it by their file name and the loadable docs that only record it.
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @returns {Promise<{candidates: Candidate[], fileNamed: Map<string, Set<string>>, documented: Map<string, Set<string>>}>}
 */
async function gatherIntegrationComponents(loadedIntegrations) {
  /** @type {Candidate[]} */
  const candidates = [];
  // What the owner rule reads: the docs that hold a name by their file name,
  // loadable or not and hidden ones too, and the loadable docs that only
  // record it.
  /** @type {Map<string, Set<string>>} */
  const fileNamed = new Map();
  /** @type {Map<string, Set<string>>} */
  const documented = new Map();
  /** @param {Map<string, Set<string>>} map @param {string} name @param {string} docPath */
  const hold = (map, name, docPath) =>
    map.set(name, (map.get(name) ?? new Set()).add(docPath));
  for (const integration of loadedIntegrations) {
    const {components, discovered} =
      await discoverValidIntegrationComponents(integration);
    const renamed = new Set(
      discovered
        .filter(rec => integrationRecordHold(rec) === 'doc')
        .filter(rec => !isIntegrationMember(rec))
        .map(rec => rec.docPath),
    );
    /** @type {string[]} */
    const docPaths = [];
    forEachIntegrationDoc(integration.components, (docPath, stem) => {
      if (!renamed.has(docPath)) hold(fileNamed, stem, docPath);
      docPaths.push(docPath);
    });
    // A family doc names its members, whose own docs may sit beside it.
    /** @type {Map<string, {_family: string, _familyIndex: number}>} */
    const places = new Map();
    for (const docPath of docPaths)
      for (const [n, place] of familyPlaces(await loadModuleDoc(docPath)))
        places.set(n, place);
    for (const rec of components) {
      const loaded = await loadModuleDoc(rec.docPath);
      // A family member is indexed from its own entry: the family's keywords
      // and guidance describe the family.
      const member = isIntegrationMember(rec);
      const doc = member ? integrationMemberEntry(loaded, rec) : loaded;
      // A doc that names another export of its file still answers to the
      // file's name, as `component <file name>` does.
      const fileName = docStem(rec.docPath);
      if (integrationRecordHold(rec) === 'doc') {
        hold(documented, rec.name, rec.docPath);
      }
      if (renamed.has(rec.docPath) && !member) {
        hold(documented, fileName, rec.docPath);
      }
      candidates.push({
        domain: 'component',
        name: rec.name,
        aliases: !member && fileName !== rec.name ? [fileName] : [],
        _hold: integrationRecordHold(rec),
        _docPath: rec.docPath,
        keywords: doc && Array.isArray(doc.keywords) ? doc.keywords : [],
        description: doc ? doc.usage?.description || doc.description || '' : '',
        guidance: guidanceFrom(doc),
        ...places.get(rec.name),
        _package: rec.package ?? integration.name,
        // Exactly what `component` reports: a doc may state its own specifier
        // (one entry point exporting several components), and only when it
        // does not do we resolve the subpath against the owning package's
        // exports — read off the integration, which the loader already parsed.
        // Reporting the bare package name here handed out a path that does not
        // resolve, and disagreed with what `component <Name>` said about the
        // very same component.
        _import: resolveIntegrationImportPath(
          {
            exportsMap: integration.__packageExports,
            packageDir: integration.__packageDir,
            docPath: rec.docPath,
            packageName: rec.package,
          },
          rec.name,
          loaded?.import,
        ),
      });
    }
  }
  return {candidates, fileNamed, documented};
}

/**
 * Build component candidates: core's own tree plus every configured
 * integration's components.
 * @param {string} coreDir
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
export async function gatherComponents(coreDir, cwd) {
  const loadedIntegrations = await loadIntegrationsSafely(cwd);
  const [core, gathered, replacements] = await Promise.all([
    gatherCoreComponents(coreDir),
    gatherIntegrationComponents(loadedIntegrations),
    loadComponentReplacements(coreDir, loadedIntegrations),
  ]);
  const {candidates: integrations, fileNamed, documented} = gathered;
  // An active replacement answers to the Core name it replaces, so a search
  // for that name finds the replacement and not the Core original
  // (spec:AST-035 FR11).
  /** @type {Map<string, string>} */
  const targetOf = new Map(
    replacements.active.map(active => [
      `${active.package}\0${active.name}`,
      active.target,
    ]),
  );
  // The owner rule, as component detail applies it: a candidate `component
  // <name>` does not open names its package and follows the owner, and a
  // file-name alias that opens another owner is dropped.
  const coreNames = new Set(core.map(candidate => candidate.name));
  /** @param {string} name @param {Candidate} candidate */
  const opens = (name, candidate) =>
    !coreNames.has(name) &&
    findComponentReadme(coreDir, name) == null &&
    [...(fileNamed.get(name) ?? [])].every(doc => doc === candidate._docPath) &&
    [...(documented.get(name) ?? [])].every(doc => doc === candidate._docPath);
  // A legacy docs package keeps an exact name over an export name a doc records.
  /** @type {ReturnType<typeof discoverExternalPackages> | undefined} */
  let externals;
  /** @param {string} name */
  const legacyDocuments = name =>
    (externals ??= discoverExternalPackages(cwd)).some(
      ext => resolveLegacyExternalDoc(ext, name) != null,
    );
  const ruled = integrations.map(candidate => {
    const aliases = (candidate.aliases ?? []).filter(alias =>
      opens(alias, candidate),
    );
    return candidate._hold === 'doc' &&
      (!opens(candidate.name, candidate) || legacyDocuments(candidate.name))
      ? {
          ...candidate,
          aliases,
          _command: `astryx component ${candidate.name} --package ${candidate._package}`,
        }
      : {...candidate, aliases};
  });
  return [
    ...core.filter(candidate => !replacements.forTarget(candidate.name)),
    ...[
      ...ruled.filter(candidate => !candidate._command),
      ...ruled.filter(candidate => candidate._command),
    ].map(candidate => {
      const target = targetOf.get(`${candidate._package}\0${candidate.name}`);
      if (target != null) {
        return {...candidate, aliases: [...(candidate.aliases ?? []), target]};
      }
      // Another package's component named after a replaced Core component is
      // shadowed for the bare name (FR14): its command names its package.
      const shadowedBy = replacements.forTarget(candidate.name);
      return shadowedBy && shadowedBy.package !== candidate._package
        ? {
            ...candidate,
            _command: `astryx component ${candidate.name} --package ${candidate._package}`,
          }
        : candidate;
    }),
  ];
}

/**
 * Every component the project can use, Core's and its integrations', with the
 * keywords its own doc declares: the discovery and doc reads search's own
 * candidates use, without the import paths and prose a result carries. `build`
 * reads it to tell a part of a page from a page when its search was narrowed
 * away from components.
 * @param {string} coreDir
 * @param {string} cwd
 * @returns {Promise<{name: string, keywords: string[]}[]>}
 */
export async function componentKeywords(coreDir, cwd) {
  /** @param {any} doc */
  const keywordsOf = doc => (Array.isArray(doc?.keywords) ? doc.keywords : []);
  const core = Object.values(discoverComponents(coreDir))
    .flat()
    .map(async name => {
      const readme = findComponentReadme(coreDir, name);
      const loaded =
        readme && readme.endsWith('.doc.mjs')
          ? await loadModuleDoc(readme)
          : null;
      return {name, keywords: keywordsOf(familyMember(loaded, name) ?? loaded)};
    });
  const loadedIntegrations = await loadIntegrationsSafely(cwd);
  const replacements = await loadComponentReplacements(
    coreDir,
    loadedIntegrations,
  );
  const integrations = loadedIntegrations.map(async integration => {
    const {components} = await discoverValidIntegrationComponents(integration);
    return Promise.all(
      components.map(async rec => {
        const loaded = await loadModuleDoc(rec.docPath);
        return {
          name: rec.name,
          keywords: keywordsOf(integrationMemberEntry(loaded, rec) ?? loaded),
        };
      }),
    );
  });
  return [
    ...(await Promise.all(core)).filter(
      component => !replacements.forTarget(component.name),
    ),
    ...(await Promise.all(integrations)).flat(),
  ];
}
