// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `template` subject's adapter for icon mapping (AST-084 FR9),
 * which reads the project's icon sets through the `Project` seam, for the
 * project's component list, and for the not-found hint that names another
 * lookup command.
 *
 * @position api/template — adapter read by the template dispatcher
 */

import {Project} from '../../foundation/config/project.mjs';
import {NO_ICON_SETS} from '../../foundation/discovery/template-icons.mjs';

/**
 * The installed icon sets and the project's choice. A project the CLI cannot
 * read has no icon set, so templates are written unchanged.
 * @param {string} cwd
 * @returns {Promise<{sets: import('../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet[], choice: import('../../foundation/discovery/icon-set-discovery.mjs').IconSetChoice}>}
 */
export async function loadTemplateIconSets(cwd) {
  try {
    const project = await Project.load(cwd);
    const {sets, choice} = await project.iconSets();
    // Icon sets are experimental (spec:AST-017 FR27): a copied template
    // follows one only when the project opts in with `experimental.iconSet`.
    if (!choice.configured) return NO_ICON_SETS;
    return {sets, choice};
  } catch (error) {
    return {
      sets: [],
      choice: {
        status: 'none',
        reason: `The project could not be read, so no icon set applies: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

/**
 * How `astryx component` reads the project's components. `ownersOf` names
 * the packages whose doc `astryx component <name>` reads for a name, Core's
 * and each configured integration's, or none when it answers no such
 * component. In a project with no integration, a name `astryx component
 * --list` lists answers from the same kept list that command reads; any other
 * name, such as a part a family doc documents, and every name in a project
 * with an integration, is looked up as `astryx component <name>` looks it
 * up, once. `qualified` is true in a project with an integration: there a
 * bare name may read another package's component (a replacement, or a second
 * package with that name), so each name is read as `<package>/<Name>`. A
 * project whose components cannot be read answers no name, so no component
 * is named. `documents` answers whether a package documents a name, as
 * `ownersOf` does: yes when the list holds the name under Core or a
 * configured integration, which a lookup of the name finds as an owner; no
 * for a package that cannot own a component; else by `ownersOf`.
 * @param {string} cwd
 * @returns {Promise<{ownersOf: (name: string) => readonly string[], qualified: boolean, documents: (pkg: string, name: string) => boolean}>}
 */
export async function loadComponentLookup(cwd) {
  const none = {ownersOf: () => [], qualified: false, documents: () => false};
  try {
    const [adapter, {componentList}, {discoverExternalPackages}] =
      await Promise.all([
        import('../component/_adapter.mjs'),
        import('../component/list/list.mjs'),
        import('../../foundation/fs/paths.mjs'),
      ]);
    const coreDir = adapter.coreContentDir(cwd);
    const [list, integrations] = await Promise.all([
      componentList(coreDir, {
        cwd,
        detail: 'brief',
        zh: false,
        dense: false,
        lang: null,
      }),
      adapter.loadIntegrationsSafely(cwd),
    ]);
    /** @type {Map<string, string[]>} */
    const owners = new Map();
    /** @type {Map<string, Set<string>>} */
    const listedBy = new Map();
    for (const entries of Object.values(list.data.components)) {
      for (const entry of /** @type {Array<{name: string, package: string}>} */ (
        entries
      )) {
        const known = owners.get(entry.name);
        if (!known) owners.set(entry.name, [entry.package]);
        else if (!known.includes(entry.package)) known.push(entry.package);
        const names = listedBy.get(entry.package) ?? new Set();
        names.add(entry.name);
        listedBy.set(entry.package, names);
      }
    }
    /** @type {ReturnType<typeof discoverExternalPackages> | undefined} */
    let externals;
    // With an integration, a name the list holds once may still have a
    // second owner the list hides behind a replacement, so every name is
    // looked up whole.
    const listed = integrations.length === 0;
    /** @type {Map<string, string[]>} */
    const looked = new Map();
    /** @param {string} name */
    const ownersOf = name => {
      const known = (listed ? owners : looked).get(name);
      if (known) return known;
      /** @type {string[]} */
      let found;
      try {
        found = adapter
          .resolveOwners(coreDir, name, integrations)
          .map(owner => owner.package);
        if (found.length === 0) {
          externals ??= discoverExternalPackages(cwd);
          found = externals
            .filter(ext => adapter.resolveLegacyExternalDoc(ext, name) != null)
            .map(ext => ext.name);
        }
      } catch {
        found = [];
      }
      (listed ? owners : looked).set(name, found);
      return found;
    };
    /**
     * @param {string} pkg
     * @param {string} name
     */
    const documents = (pkg, name) => {
      // Core and the configured integrations are the owners a lookup finds
      // first, so the list naming one of them for a name answers yes. A
      // package with component docs of the older kind is an owner only when
      // neither Core nor an integration documents the name, so it is looked
      // up.
      const owner =
        pkg === adapter.CORE_PACKAGE ||
        integrations.some(integration => integration.name === pkg);
      if (owner && listedBy.get(pkg)?.has(name)) return true;
      if (!owner) {
        // Only those packages can own a name, so a package that is none of
        // them (a chart library) documents none, and no lookup is needed.
        let canOwn = true;
        try {
          externals ??= discoverExternalPackages(cwd);
          canOwn = externals.some(ext => ext.name === pkg);
        } catch {
          // Looked up as before.
        }
        if (!canOwn) return false;
      }
      return ownersOf(name).includes(pkg);
    };
    return {ownersOf, qualified: !listed, documents};
  } catch {
    return none;
  }
}

/**
 * The unknown-template suggestions with the command that reads a component,
 * hook or docs topic matching that name (exact, folded or last segment) in
 * them, the list keeping its length, in the place
 * foundation/suggest/other-command.mjs gives it. The suggestions stay as they
 * are when no such entry exists or the check fails. The hint's modules load
 * only on this path.
 * @param {string} name
 * @param {import('../../foundation/response/base').Suggestion[]} suggestions
 * @param {string} cwd
 * @param {(suggestion: import('../../foundation/response/base').Suggestion) => Array<string | undefined>} namesOf
 *   the names the template matcher ranked a suggestion by: its id and its
 *   human name
 * @returns {Promise<import('../../foundation/response/base').Suggestion[] | undefined>}
 */
export async function withOtherCommandHint(name, suggestions, cwd, namesOf) {
  try {
    const [{findOtherCommand, withOtherCommand}, {docsRoutesLazily}] =
      await Promise.all([
        import('../../foundation/suggest/other-command.mjs'),
        import('../docs/_entry-names-lazily.mjs'),
      ]);
    const hint = await findOtherCommand(name, {
      from: 'template',
      cwd,
      docsRoutes: docsRoutesLazily,
    });
    return withOtherCommand(suggestions, hint, name, {
      from: 'template',
      namesOf,
    });
  } catch {
    return suggestions;
  }
}
