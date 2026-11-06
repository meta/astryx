// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `component.list` leaf — the grouped component listing.
 *
 * @input  coreDir + list options (category filter, detail level, doc language)
 * @output ONE `component.list` envelope whose `data.detail`
 *         ('names' | 'compact' | 'full') tags the payload depth and
 *         `data.components` holds the grouped map (core + integrations +
 *         back-compat externals).
 * @position api/component/list (projection leaf; routed by component.mjs)
 */

import {
  CORE_PACKAGE,
  discoverComponents,
  discoverExternalComponentsGrouped,
  discoverValidIntegrationComponents,
  familyMember,
  findComponentReadme,
  findExternalComponentDoc,
  resolveImportPath,
  resolveIntegrationImportPath,
} from '../../../foundation/discovery/component-discovery.mjs';
import {discoverExternalPackages} from '../../../foundation/fs/paths.mjs';
import {ERROR_CODES} from '../../../foundation/response/error-codes.mjs';
import {AstryxError} from '../../error.mjs';
import {
  loadComponentDoc,
  loadComponentReplacements,
  loadIntegrationsSafely,
  withOwnership,
} from '../_adapter.mjs';

/**
 * @typedef {import('../component.type.mjs').ComponentListResponse} ComponentListResponse
 * @typedef {import('../component.type.mjs').ComponentListEntry} ComponentListEntry
 * @typedef {import('../component.type.mjs').ComponentBriefEntry} ComponentBriefEntry
 */

/**
 * The import a legacy `pkg.astryx.docs` component's detail reports, derived the
 * same way (`withOwnership`) so list and detail agree.
 * @param {{name: string, docsDir: string}} ext
 * @param {string} name
 * @param {string} coreDir
 * @param {{zh: boolean, lang: string|null}} docOpts
 * @returns {Promise<string>}
 */
async function legacyImport(ext, name, coreDir, docOpts) {
  const docPath = findExternalComponentDoc(ext.docsDir, name);
  /** @type {import('../_adapter.mjs').LoadedComponentDoc} */
  let docs = {};
  if (docPath && docPath.endsWith('.doc.mjs')) {
    try {
      docs = await loadComponentDoc(docPath, docOpts);
    } catch {
      // Keep list resilient; validation owns malformed docs.
    }
  }
  return withOwnership(docs, {package: ext.name, sourcePath: null}, name, coreDir).import;
}

/**
 * A full Core ComponentDoc list entry, naming the package that owns it.
 * @param {any} doc
 */
const coreEntry = doc => ({name: doc.name, package: CORE_PACKAGE, ...doc});

/**
 * The full-level entry for a component documented as a member of its family's
 * doc (VStack in Stack's doc): a component doc built from the member's own
 * entry, under its own name, display name and import, shaped like every other
 * full entry. Null when the doc is the component's own.
 * @param {any} docs
 * @param {string} name
 * @param {string} coreDir
 * @returns {any}
 */
function memberEntry(docs, name, coreDir) {
  const member = familyMember(docs, name);
  if (!member) return null;
  return {
    name,
    package: CORE_PACKAGE,
    displayName: member.displayName ?? name,
    ...(docs.group ? {group: docs.group} : {}),
    ...(docs.category ? {category: docs.category} : {}),
    usage: member.usage ?? {description: member.description ?? ''},
    props: member.props ?? [],
    ...(member.examples ? {examples: member.examples} : {}),
    ...(docs.theming ? {theming: docs.theming} : {}),
    import: resolveImportPath(coreDir, name),
  };
}

/**
 * The entry for a Core slot an integration component replaces
 * (spec:AST-035 FR11), at the list's detail level: the replacement's own name,
 * its package, and the import `component <Name>` reports for it.
 * @param {import('../../../foundation/discovery/component-replacement.mjs').ActiveComponentReplacement} replacement
 * @param {'names'|'compact'|'full'} detail
 * @param {{zh: boolean, dense: boolean, lang: string|null}} docOpts
 * @returns {Promise<any>}
 */
async function replacementEntry(replacement, detail, {zh, dense, lang}) {
  const {integration} = replacement;
  /** @type {any} */
  let docs = null;
  try {
    docs = await loadComponentDoc(
      replacement.docPath,
      detail === 'full' ? {zh, lang, dense} : {zh, lang},
    );
  } catch {
    // Keep list resilient; validation owns malformed integration docs.
  }
  const importPath = resolveIntegrationImportPath(
    {
      exportsMap: integration.__packageExports,
      packageDir: integration.__packageDir,
      docPath: replacement.docPath,
      packageName: replacement.package,
    },
    replacement.name,
    docs?.import,
  );
  if (detail === 'names') {
    return {name: replacement.name, package: replacement.package, import: importPath};
  }
  if (detail === 'compact') {
    return {
      name: replacement.name,
      package: replacement.package,
      description: docs?.usage?.description || docs?.description || '',
      import: importPath,
    };
  }
  if (docs == null) {
    return {name: replacement.name, package: replacement.package, description: ''};
  }
  const {package: _owner, ...doc} = docs;
  return {
    name: doc.name ?? replacement.name,
    package: replacement.package,
    ...doc,
    import: importPath,
  };
}

/**
 * Build the `component.list` envelope. The list taxonomy is collapsed: all
 * three detail levels emit ONE `component.list` type; the depth rides in
 * `data.detail` and the grouped map in `data.components`.
 * @param {string} coreDir
 * @param {object} opts
 * @param {string} opts.cwd
 * @param {string} [opts.category] - Filter to a single category (group key).
 * @param {'full'|'compact'|'brief'} opts.detail
 * @param {boolean} opts.zh
 * @param {boolean} opts.dense
 * @param {string|null} opts.lang
 * @returns {Promise<ComponentListResponse>}
 */
export async function componentList(
  coreDir,
  {cwd, category, detail, zh, dense, lang},
) {
  const components = discoverComponents(coreDir);
  // An active integration replacement takes its Core component's slot in
  // every list view (spec:AST-035 FR11); the Core original stays reachable
  // with `component <Name> --package @astryxdesign/core`.
  const loadedIntegrations = await loadIntegrationsSafely(cwd);
  const replacements = await loadComponentReplacements(
    coreDir,
    loadedIntegrations,
  );
  const docOpts = {zh, dense, lang};

  if (category) {
    const match = Object.entries(components).find(
      ([key]) => key.toLowerCase() === category.toLowerCase(),
    );
    if (!match) {
      throw new AstryxError(
        `Unknown category "${category}"`,
        Object.keys(components).map(k => ({name: k, reason: 'valid category'})),
        ERROR_CODES.ERR_UNKNOWN_CATEGORY,
      );
    }

    if (detail === 'compact') {
      /** @type {ComponentBriefEntry[]} */
      const entries = [];
      for (const comp of match[1]) {
        const replacement = replacements.forTarget(comp);
        if (replacement) {
          entries.push(await replacementEntry(replacement, 'compact', docOpts));
          continue;
        }
        const readme = findComponentReadme(coreDir, comp);
        if (readme && readme.endsWith('.doc.mjs')) {
          try {
            const docs = await loadComponentDoc(readme, {zh, lang});
            entries.push({
              name: comp,
              package: CORE_PACKAGE,
              description:
                familyMember(docs, comp)?.description ||
                docs.usage?.description ||
                docs.description ||
                '',
              import: resolveImportPath(coreDir, comp),
            });
          } catch {
            entries.push({
              name: comp,
              package: CORE_PACKAGE,
              description: '',
              import: resolveImportPath(coreDir, comp),
            });
          }
        } else {
          entries.push({
            name: comp,
            package: CORE_PACKAGE,
            description: '',
            import: resolveImportPath(coreDir, comp),
          });
        }
      }
      return {
        type: 'component.list',
        data: {detail: 'compact', components: {[match[0]]: entries}},
      };
    }

    if (detail === 'full') {
      /** @type {any[]} */
      const entries = [];
      for (const comp of match[1]) {
        const replacement = replacements.forTarget(comp);
        if (replacement) {
          entries.push(await replacementEntry(replacement, 'full', docOpts));
          continue;
        }
        const readme = findComponentReadme(coreDir, comp);
        if (readme && readme.endsWith('.doc.mjs')) {
          try {
            const docs = await loadComponentDoc(readme, {zh, lang, dense});
            entries.push(memberEntry(docs, comp, coreDir) ?? coreEntry(docs));
          } catch {
            entries.push({name: `XDS${comp}`, package: CORE_PACKAGE, description: ''});
          }
        } else {
          entries.push({name: `XDS${comp}`, package: CORE_PACKAGE, description: ''});
        }
      }
      return {
        type: 'component.list',
        data: {detail: 'full', components: {[match[0]]: entries}},
      };
    }

    // Default: brief — package-qualified object list for the category.
    // Pre-1.0 JSON contract: members are {name, package} objects, not bare
    // strings, so consumers can disambiguate ownership.
    return {
      type: 'component.list',
      data: {
        detail: 'names',
        components: {
          [match[0]]: await Promise.all(
            match[1].map(n => {
              const replacement = replacements.forTarget(n);
              return replacement
                ? replacementEntry(replacement, 'names', docOpts)
                : {name: n, package: CORE_PACKAGE};
            }),
          ),
        },
      },
    };
  }

  // All components — merge core + external packages with grouped subcategories
  if (detail === 'compact') {
    /** @type {Record<string, ComponentBriefEntry[]>} */
    const result = {};
    for (const [cat, comps] of Object.entries(components)) {
      result[cat] = [];
      for (const comp of comps) {
        const replacement = replacements.forTarget(comp);
        if (replacement) {
          result[cat].push(await replacementEntry(replacement, 'compact', docOpts));
          continue;
        }
        const readme = findComponentReadme(coreDir, comp);
        if (readme && readme.endsWith('.doc.mjs')) {
          try {
            const docs = await loadComponentDoc(readme, {zh, lang});
            result[cat].push({
              name: comp,
              package: CORE_PACKAGE,
              description:
                familyMember(docs, comp)?.description ||
                docs.usage?.description ||
                docs.description ||
                '',
              import: resolveImportPath(coreDir, comp),
            });
          } catch {
            result[cat].push({
              name: comp,
              package: CORE_PACKAGE,
              description: '',
              import: resolveImportPath(coreDir, comp),
            });
          }
        } else {
          result[cat].push({
            name: comp,
            package: CORE_PACKAGE,
            description: '',
            import: resolveImportPath(coreDir, comp),
          });
        }
      }
    }
    return {
      type: 'component.list',
      data: {detail: 'compact', components: result},
    };
  }

  if (detail === 'full') {
    /** @type {Record<string, any[]>} */
    const result = {};
    for (const [cat, comps] of Object.entries(components)) {
      result[cat] = [];
      for (const comp of comps) {
        const replacement = replacements.forTarget(comp);
        if (replacement) {
          result[cat].push(await replacementEntry(replacement, 'full', docOpts));
          continue;
        }
        const readme = findComponentReadme(coreDir, comp);
        if (readme && readme.endsWith('.doc.mjs')) {
          try {
            const docs = await loadComponentDoc(readme, {zh, lang, dense});
            result[cat].push(memberEntry(docs, comp, coreDir) ?? coreEntry(docs));
          } catch {
            result[cat].push({name: `XDS${comp}`, package: CORE_PACKAGE, description: ''});
          }
        } else {
          result[cat].push({name: `XDS${comp}`, package: CORE_PACKAGE, description: ''});
        }
      }
    }
    return {type: 'component.list', data: {detail: 'full', components: result}};
  }

  // Default: brief — package-qualified object list (core + integrations).
  // Pre-1.0 JSON contract: each group's members are {name, package} objects.
  /** @type {Record<string, ComponentListEntry[]>} */
  const listData = {};
  for (const [cat, comps] of Object.entries(components)) {
    listData[cat] = await Promise.all(
      comps.map(n => {
        const replacement = replacements.forTarget(n);
        return replacement
          ? replacementEntry(replacement, 'names', docOpts)
          : {name: n, package: CORE_PACKAGE};
      }),
    );
  }
  // A replacement is listed once, in the Core slot it took.
  const listedReplacements = new Set(
    replacements.active.map(active => `${active.package}\0${active.name}`),
  );

  // Integration components (authoritative source: loadedIntegrations).
  const seenIntegration = new Set();
  for (const integration of loadedIntegrations) {
    seenIntegration.add(integration.name);
    const {components: owned} =
      await discoverValidIntegrationComponents(integration);
    // Group integration components by their doc `group`, falling back to the
    // package name. Keys are package-qualified so they never collide with
    // core groups or each other.
    /** @type {Map<string, Array<{name: string, package: string, import?: string}>>} */
    const byGroup = new Map();
    for (const rec of owned) {
      if (listedReplacements.has(`${integration.name}\0${rec.name}`)) continue;
      const groupLabel = rec.group ?? integration.name;
      const key = `${groupLabel} (${integration.name})`;
      if (!byGroup.has(key)) byGroup.set(key, []);
      // Use the doc-authored import when present; otherwise resolve the package
      // export so list, detail, search, JSON, and human output all agree.
      const fallbackImport = resolveIntegrationImportPath(
        {
          exportsMap: integration.__packageExports,
          packageDir: integration.__packageDir,
          docPath: rec.docPath,
          packageName: integration.name,
        },
        rec.name,
      );
      let importPath = fallbackImport;
      try {
        const docs = await loadComponentDoc(rec.docPath, {zh, lang});
        importPath = resolveIntegrationImportPath(
          {
            exportsMap: integration.__packageExports,
            packageDir: integration.__packageDir,
            docPath: rec.docPath,
            packageName: integration.name,
          },
          rec.name,
          docs.import,
        );
      } catch {
        // Keep list resilient; validation owns malformed integration docs.
      }
      byGroup.get(key)?.push({
        name: rec.name,
        package: integration.name,
        import: importPath,
      });
    }
    for (const [key, members] of byGroup) {
      members.sort((a, b) => a.name.localeCompare(b.name));
      listData[key] = members;
    }
  }

  // Back-compat: node_modules-scanned external packages (pkg.astryx.docs)
  // that are NOT configured integrations. Preserves existing discovery for
  // consumers that haven't adopted the config-integration flow.
  const externals = discoverExternalPackages(cwd);
  for (const ext of externals) {
    if (seenIntegration.has(ext.name)) continue;
    const grouped = discoverExternalComponentsGrouped(ext.docsDir);
    const groupKeys = Object.keys(grouped);
    if (groupKeys.length === 0) continue;

    const hasGroups = groupKeys.some(
      k => grouped[k].length > 1 || grouped[k][0] !== k,
    );

    /** @param {string[]} names */
    const entriesFor = names =>
      Promise.all(
        names.map(async n => ({
          name: n,
          package: ext.name,
          import: await legacyImport(ext, n, coreDir, {zh, lang}),
        })),
      );

    if (hasGroups) {
      for (const [group, members] of Object.entries(grouped)) {
        listData[`${group} (${ext.name})`] = await entriesFor(members);
      }
    } else {
      const allComps = Object.values(grouped).flat().sort();
      if (allComps.length > 0) {
        listData[`${ext.category} (${ext.name})`] = await entriesFor(allComps);
      }
    }
  }
  return {
    type: 'component.list',
    data: {detail: 'names', components: listData},
  };
}
