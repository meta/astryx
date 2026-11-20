// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon imports that do not match the project's icon sets (AST-084):
 * what Doctor reads in the project's own code after the project changes its
 * list of sets or uninstalls a set.
 *
 * An import of an icon from an installed set, or from the library a set wraps
 * (its data's `source`), draws the definitions that set's `map` names for it.
 * Such an import does not match the project's list when the set is not in the
 * list, or when a set earlier in the list draws one of those definitions too:
 * a template copied now imports that set's icon instead, by the same rule as
 * template icon mapping. A named re-export (`export {TrashIcon} from '…'`)
 * reads like an import. An import of an npm package that does not resolve
 * from the file, that no path alias maps, and that the project's package.json
 * does not declare, breaks the build; it counts as an icon import only when
 * every name it imports follows the icon export contract (`<Name>Icon`). That
 * rule needs no main set, so it holds when the set the list names is the one
 * uninstalled. The CLI knows no icon library: it reads only the installed
 * sets' data and the code's imports.
 *
 * @input One source file, the project's icon sets, and how a module resolves
 * @output Each import that does not match, with the icon that replaces it
 * @position packages/cli/foundation/discovery — read by Doctor's
 *   `icon-imports` check
 */

import {parseTemplateSource as parseSource} from './template-source-tree.mjs';
import {
  importedName,
  indexSets,
  isAstryxModule,
  isPackageModule,
  matchIcon,
  wrappedIcon,
  wrapsModule,
} from './template-icons.mjs';
import {astryxDefinitionsByName} from './icon-definition-discovery.mjs';
import {isPackageName} from '../identity/provider-identity.mjs';
import {
  ICON_EXPORT_NAME_RE,
  definitionsByIcon,
  iconLookExport,
  splitSpecifier,
} from './icon-set-discovery.mjs';

/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */
/** @typedef {import('./icon-set-discovery.mjs').IconSetChoice} IconSetChoice */

/**
 * One icon import that does not match the project's icon sets.
 * @typedef {object} IconImportFinding
 * @property {number} line the import's line in the file
 * @property {string} module the module it imports from
 * @property {string} export the name it imports (`default` for a default
 *   import)
 * @property {'unlisted' | 'earlier' | 'unresolved'} why `unlisted`: the set
 *   it comes from is not in the project's list; `earlier`: a set earlier in
 *   the list draws the same definition; `unresolved`: its package does not
 *   resolve and the project does not declare it
 * @property {string | null} set the set it comes from, as `<package>/<set>`;
 *   null when its package does not resolve
 * @property {string[]} definitions the Astryx definitions it draws
 * @property {{set: string, module: string, export: string} | null} replacement
 *   the icon a set in the list draws for one of those definitions, the first
 *   set in the list that has one; null when no set in the list has one
 */

/**
 * Each statement that reads names from a package: an import, or a named
 * re-export (`export {TrashIcon} from '…'`), with the names it reads. Type-only
 * statements and names, namespace imports, and `export *` read no icon.
 * @param {any} ast
 * @returns {Array<{line: number, module: string, names: Array<{name: string, named: boolean}>}>}
 */
function packageReads(ast) {
  /** @type {Array<{line: number, module: string, names: Array<{name: string, named: boolean}>}>} */
  const reads = [];
  for (const node of ast.program.body) {
    const isImport = node.type === 'ImportDeclaration';
    const isReExport = node.type === 'ExportNamedDeclaration' && node.source;
    if (!isImport && !isReExport) continue;
    if (node.importKind === 'type' || node.exportKind === 'type') continue;
    const module = String(node.source.value);
    if (!isPackageModule(module) || isAstryxModule(module)) continue;
    const names = node.specifiers
      .filter(
        (/** @type {any} */ each) =>
          each.type !== 'ImportNamespaceSpecifier' &&
          each.type !== 'ExportNamespaceSpecifier' &&
          each.importKind !== 'type' &&
          each.exportKind !== 'type',
      )
      .map((/** @type {any} */ each) =>
        isImport
          ? {name: importedName(each), named: each.type === 'ImportSpecifier'}
          : {name: each.local.name ?? each.local.value, named: true},
      );
    if (names.length > 0) {
      reads.push({line: node.loc?.start.line ?? 0, module, names});
    }
  }
  return reads;
}

/**
 * The imports and re-exports in one file that do not match the project's
 * icon sets; null when the file does not parse. With no main set resolved
 * (none decided, or the one the list names is not installed), only the
 * imports that break the build are read.
 * @param {string} source
 * @param {{sets: DiscoveredIconSet[], choice: IconSetChoice}} iconSets
 * @param {(module: string) => boolean} broken whether an import of a package
 *   breaks the build: it does not resolve from the file, no path alias maps
 *   it, and the project does not declare the package
 * @param {Map<DiscoveredIconSet, Map<string, string>>} [wrappedRead] each
 *   set's exports by the library export they re-export, shared between files
 * @returns {IconImportFinding[] | null}
 */
export function iconImportFindings(
  source,
  {sets, choice},
  broken,
  wrappedRead = new Map(),
) {
  const main = choice.set ?? null;
  /** @type {DiscoveredIconSet[]} */
  const order = main ? (choice.order ?? [main]) : [];
  /** @type {any} */
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return null;
  }
  const index = indexSets(sets);
  const astryx = astryxDefinitionsByName();
  /** @type {IconImportFinding[]} */
  const findings = [];
  for (const {line, module, names} of packageReads(ast)) {
    const wrapper = sets.find(set => wrapsModule(set, module));
    const fromSet = names.some(each => index.has(`${module}\0${each.name}`));
    if (!fromSet && !wrapper) {
      if (
        names.every(
          each => each.named && ICON_EXPORT_NAME_RE.test(each.name),
        ) &&
        isPackageName(splitSpecifier(module).name) &&
        broken(module)
      ) {
        for (const each of names) {
          findings.push({
            line,
            module,
            export: each.name,
            why: 'unresolved',
            set: null,
            definitions: [],
            replacement: null,
          });
        }
      }
      continue;
    }
    // Which set an icon should come from is decided only by a main set.
    if (!main) continue;
    for (const {name: imported} of names) {
      const indexed = index.get(`${module}\0${imported}`);
      /** @type {DiscoveredIconSet | undefined} */
      let set = indexed?.set;
      let record = indexed;
      if (!record && wrapper) {
        // The main set's own library is the icon the project chose.
        if (wrapper === main) continue;
        set = wrapper;
        const icon = wrappedIcon(wrapper, module, imported, wrappedRead);
        record = icon
          ? {
              setName: wrapper.name,
              export: icon.export,
              id: icon.id,
              definitions: (
                definitionsByIcon(wrapper.data).get(icon.id) ?? []
              ).filter(name => astryx.has(name)),
              set: wrapper,
            }
          : undefined;
      }
      if (!set || set === main) continue;
      const listed = order.indexOf(set);
      // A set later in the list supplies only what the sets before it lack.
      const earlier = listed === -1 ? order : order.slice(0, listed);
      /** @type {IconImportFinding['replacement']} */
      let replacement = null;
      if (record) {
        for (const target of earlier) {
          const match = matchIcon(record, target);
          if (match) {
            const chosen = iconLookExport(
              match.icon,
              target,
              choice.variant ?? record.variant,
            );
            replacement = {
              set: `${target.package}/${target.name}`,
              ...chosen,
            };
            break;
          }
        }
      }
      if (listed !== -1 && !replacement) continue;
      findings.push({
        line,
        module,
        export: imported,
        why: listed === -1 ? 'unlisted' : 'earlier',
        set: `${set.package}/${set.name}`,
        definitions: record?.definitions ?? [],
        replacement,
      });
    }
  }
  return findings;
}
